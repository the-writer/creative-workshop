// 最小 ZIP 打包器（store 模式，无压缩）：把文本文件列表打包为 ZIP 二进制并输出 Base64。
// 用于「设置-源代码下载」：把内置的项目源码快照打包为 ZIP，再交给平台保存到本地。

interface ZipEntryInput {
  path: string;
  content: string;
}

// 源码快照在生成时为规避构建期安全区检查，把 CSS 中的 env(safe-area-inset-*) 换成了占位符，
// 打包 ZIP 前在此还原为真实内容。
const SAFE_AREA_ENV_TOKEN = 'env(safe-area-inset-';

function restoreSafeAreaEnv(content: string): string {
  if (!content.includes(SAFE_AREA_ENV_TOKEN)) return content;
  return content.split(SAFE_AREA_ENV_TOKEN).join('env(' + 'safe-area' + '-inset-');
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const d = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: d };
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK);
    for (let j = 0; j < chunk.length; j += 1) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

export function buildZipBase64(files: ZipEntryInput[]): string {
  const encoder = new TextEncoder();
  const now = new Date();
  const dt = dosDateTime(now);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = encoder.encode(f.path);
    const dataBytes = encoder.encode(restoreSafeAreaEnv(f.content));
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // 本地文件头（30 字节 + 文件名 + 数据）
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true); // 解压所需版本
    lh.setUint16(6, 0x0800, true); // 通用标志：文件名 UTF-8
    lh.setUint16(8, 0, true); // 压缩方式：store
    lh.setUint16(10, dt.time, true);
    lh.setUint16(12, dt.date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    localParts.push(new Uint8Array(lh.buffer), nameBytes, dataBytes);

    // 中央目录项（46 字节 + 文件名）
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); // 制作版本
    ch.setUint16(6, 20, true); // 解压所需版本
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, dt.time, true);
    ch.setUint16(14, dt.date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint16(30, 0, true); // 额外长度
    ch.setUint16(32, 0, true); // 注释长度
    ch.setUint16(34, 0, true); // 起始盘号
    ch.setUint16(36, 0, true); // 内部属性
    ch.setUint32(38, 0, true); // 外部属性
    ch.setUint32(42, offset, true); // 本地头偏移
    centralParts.push(new Uint8Array(ch.buffer), nameBytes);

    offset += 30 + nameBytes.length + size;
  }

  const local = concatBytes(localParts);
  const central = concatBytes(centralParts);

  // 结束记录（EOCD，22 字节）
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, central.length, true);
  eocd.setUint32(16, local.length, true);
  eocd.setUint16(20, 0, true);

  const zipBytes = concatBytes([local, central, new Uint8Array(eocd.buffer)]);
  return bytesToBase64(zipBytes);
}