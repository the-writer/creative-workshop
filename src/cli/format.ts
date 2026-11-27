// 终端输出：颜色、显示宽度与表格渲染。
// 颜色只在输出到终端时生效（--color / --no-color 可强制），管道与重定向时保持纯文本。

import { writeSync } from 'node:fs';

export type ColorMode = 'auto' | 'always' | 'never';

export interface Palette {
  reset: string;
  bold: string;
  dim: string;
  cyan: string;
  green: string;
  red: string;
  yellow: string;
}

const EMPTY_PALETTE: Palette = { reset: '', bold: '', dim: '', cyan: '', green: '', red: '', yellow: '' };

export function createPalette(mode: ColorMode): Palette {
  const colored = mode === 'always' || (mode === 'auto' && Boolean(process.stdout.isTTY));
  if (!colored) return EMPTY_PALETTE;
  return {
    reset: '\u001b[0m',
    bold: '\u001b[1m',
    dim: '\u001b[2m',
    cyan: '\u001b[36m',
    green: '\u001b[32m',
    red: '\u001b[31m',
    yellow: '\u001b[33m',
  };
}

/** 判断码点是否为东亚宽字符（中文、日文、韩文与部分符号占两列） */
function isWideCode(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

/** 组合记号不占列 */
function isZeroWidthCode(code: number): boolean {
  return (code >= 0x0300 && code <= 0x036f) || (code >= 0x200b && code <= 0x200f) || code === 0xfeff;
}

/** 字符串在终端中的显示宽度（中文按两列计算） */
export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (isZeroWidthCode(code)) continue;
    width += isWideCode(code) ? 2 : 1;
  }
  return width;
}

/** 按显示宽度右侧补空格 */
export function padText(text: string, width: number): string {
  const pad = width - displayWidth(text);
  return pad > 0 ? text + ' '.repeat(pad) : text;
}

/** 单元格内容：空值统一显示为占位符 */
export function cell(value: string, placeholder = '-'): string {
  const text = value.trim();
  return text === '' ? placeholder : text;
}

/**
 * 渲染表格：表头 + 分隔线 + 数据行，列宽按显示宽度自适应。
 */
export function renderTable(headers: string[], rows: string[][], palette: Palette): string {
  const widths = headers.map((header, index) => {
    const cells = rows.map((row) => displayWidth(row[index] ?? ''));
    return Math.max(displayWidth(header), ...(cells.length > 0 ? cells : [0]));
  });
  const line = (values: string[]): string =>
    values
      .map((value, index) => padText(value, widths[index] ?? displayWidth(value)))
      .join('  ')
      .trimEnd();

  const out: string[] = [];
  out.push(`${palette.bold}${palette.cyan}${line(headers)}${palette.reset}`);
  out.push(`${palette.dim}${widths.map((width) => '-'.repeat(width)).join('  ')}${palette.reset}`);
  rows.forEach((row) => out.push(line(row)));
  return out.join('\n');
}

/** 标准输出：同步写入，保证进程立即退出时内容不丢失 */
export function writeOut(text: string): void {
  try {
    writeSync(1, text.endsWith('\n') ? text : `${text}\n`);
  } catch {
    // 输出管道已关闭时忽略
  }
}

/** 错误输出：统一前缀与红色 */
export function writeErr(text: string, palette: Palette, name: string): void {
  try {
    writeSync(2, `${palette.red}${name}: ${text}${palette.reset}\n`);
  } catch {
    // 输出管道已关闭时忽略
  }
}
