// 导出边界适配层：JSON/TXT/PNG/Markdown 统一经 Electron 保存对话框落盘

import { fetchAllData, type ExportBundle } from '@/lib/db';
import { RACE_LABELS, TYPE_LABELS, type Candidate, type Sheet, type Relation } from '@/lib/types';
import { buildGraphData, type GraphEdge, type GraphNode, type Position } from '@/lib/graph';

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

async function saveBase64(dataBase64: string, fileName: string): Promise<{ ok: boolean; fileName: string; message?: string }> {
  try {
    const result = await window.workshop.files.save({ fileName, dataBase64 });
    if (result.success) return { ok: true, fileName };
    return { ok: false, fileName: '', message: result.canceled ? '已取消保存' : result.message || '导出失败，请重试' };
  } catch (err) {
    return { ok: false, fileName: '', message: (err as Error)?.message || '导出失败，请重试' };
  }
}

export async function exportAllDataJson(): Promise<{ ok: boolean; fileName: string; message?: string }> {
  const bundle = await fetchAllData();
  if (bundle.candidates.length === 0 && bundle.sheets.length === 0 && bundle.relations.length === 0) {
    return { ok: false, fileName: '', message: '暂无可导出的数据' };
  }
  const payload = JSON.stringify(
    {
      app: '创作工坊',
      exportedAt: bundle.exportedAt,
      candidates: bundle.candidates,
      sheets: bundle.sheets,
      relations: bundle.relations,
    },
    null,
    2,
  );
  const fileName = `创作工坊-全量数据-${stamp()}.json`;
  return saveBase64(utf8ToBase64(payload), fileName);
}

export async function exportNameListTxt(items: Candidate[]): Promise<{ ok: boolean; fileName: string; message?: string }> {
  if (!items || items.length === 0) {
    return { ok: false, fileName: '', message: '暂无可导出的名称' };
  }
  const lines: string[] = ['创作工坊 · 名称清单', `导出时间：${new Date().toLocaleString('zh-CN')}`, `条目数：${items.length}`, ''];
  items.forEach((c, idx) => {
    const structureText = (c.structure ?? []).map((p) => `${p.label}·${p.word}`).join('，');
    lines.push(
      `${idx + 1}. [${RACE_LABELS[c.race]}][${TYPE_LABELS[c.nameType]}] ${c.nameText}（${c.charCount}字）${structureText ? `｜${structureText}` : ''}`,
    );
  });
  const fileName = `创作工坊-名称清单-${stamp()}.txt`;
  return saveBase64(utf8ToBase64(lines.join('\n')), fileName);
}

/* ---------------- Markdown 导出（已保存设定 + 全局图谱） ---------------- */

function mdEscape(text: string): string {
  return String(text ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function mdQuote(text: string): string {
  return String(text ?? '')
    .replace(/"/g, '#quot;')
    .replace(/\r?\n/g, ' ');
}

function relationLines(sheetId: string, relations: Relation[]): string[] {
  return relations
    .filter((r) => r.fromId === sheetId || r.toId === sheetId)
    .map((r) => {
      const other = r.fromId === sheetId ? r.toName : r.fromName;
      const direction = r.fromId === sheetId ? '→' : '←';
      const note = r.note ? `（${r.note}）` : '';
      return `- ${r.fromName} ${direction} ${r.toName}（${r.relationType}）${note}`;
    });
}

function mermaidGraph(bundle: ExportBundle): string {
  const placeCandidates = bundle.candidates.filter((c) => c.nameType === 'place');
  const graph = buildGraphData(bundle.sheets, bundle.relations, placeCandidates, 'panorama', 'all', 'all');
  if (graph.nodes.length === 0) {
    return '（暂无图谱节点）';
  }
  const shortId = new Map<string, string>();
  graph.nodes.forEach((n, i) => shortId.set(n.id, `n${i + 1}`));
  const lines: string[] = ['```mermaid', 'flowchart LR'];
  graph.nodes.forEach((n) => {
    const kind = n.kind === 'person' ? '人物' : '地名';
    lines.push(`  ${shortId.get(n.id)}["${mdQuote(n.label)} · ${kind} · ${RACE_LABELS[n.race]}"]`);
  });
  graph.edges.forEach((e) => {
    const s = shortId.get(e.source);
    const t = shortId.get(e.target);
    if (!s || !t) return;
    lines.push(`  ${s} -->|${mdQuote(e.relationType)}| ${t}`);
  });
  lines.push('```');
  return lines.join('\n');
}

export function buildSettingsMarkdown(bundle: ExportBundle): string {
  const sheets = bundle.sheets ?? [];
  const candidates = bundle.candidates ?? [];
  const relations = bundle.relations ?? [];
  const favCount = candidates.filter((c) => c.favorite).length;
  const graph = buildGraphData(
    sheets,
    relations,
    candidates.filter((c) => c.nameType === 'place'),
    'panorama',
    'all',
    'all',
  );

  const out: string[] = [];
  out.push('# 创作工坊 · 已保存设定导出');
  out.push('');
  out.push(`- 导出时间：${new Date().toLocaleString('zh-CN')}`);
  out.push(`- 设定卡：${sheets.length} 张`);
  out.push(`- 名称候选：${candidates.length} 条（收藏 ${favCount} 条）`);
  out.push(`- 图谱节点：${graph.nodes.length} 个 · 连线：${graph.edges.length} 条`);
  out.push('');

  // 设定卡
  out.push('## 一、设定卡');
  out.push('');
  if (sheets.length === 0) {
    out.push('（暂无设定卡）');
    out.push('');
  } else {
    sheets.forEach((s: Sheet, i: number) => {
      out.push(`### ${i + 1}. ${s.characterName || '未命名人物'}（${RACE_LABELS[s.race]}）`);
      out.push('');
      out.push(`- 职业：${s.occupation || '—'}`);
      out.push(`- 官职：${s.office || '—'}`);
      out.push(`- 籍贯：${s.hometown || '—'}`);
      out.push(`- 绰号：${s.nickname || '—'}`);
      out.push(`- 契约：${s.contractTitle || '—'}`);
      out.push(`- 备注：${s.note || '—'}`);
      const rels = relationLines(s.id, relations);
      if (rels.length > 0) {
        out.push('- 相关关系：');
        rels.forEach((l) => out.push(`  ${l}`));
      }
      out.push('');
    });
  }

  // 名称候选
  out.push('## 二、名称候选');
  out.push('');
  if (candidates.length === 0) {
    out.push('（暂无名称候选）');
    out.push('');
  } else {
    out.push('| # | 族群 | 类型 | 名称 | 字数 | 结构 | 收藏 | 备注 |');
    out.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    candidates.forEach((c: Candidate, i: number) => {
      const structure = (c.structure ?? []).map((p) => `${p.label}·${p.word}`).join('，');
      out.push(
        `| ${i + 1} | ${RACE_LABELS[c.race]} | ${TYPE_LABELS[c.nameType]} | ${mdEscape(c.nameText)} | ${c.charCount} | ${mdEscape(structure)} | ${c.favorite ? '✓' : ''} | ${mdEscape(c.note)} |`,
      );
    });
    out.push('');
  }

  // 全局图谱
  out.push('## 三、全局图谱');
  out.push('');
  out.push(`节点 ${graph.nodes.length} 个 · 连线 ${graph.edges.length} 条`);
  out.push('');
  if (graph.nodes.length === 0) {
    out.push('（暂无图谱节点，先为人物建立设定与关系后再导出）');
    out.push('');
  } else {
    out.push('### 节点');
    out.push('');
    graph.nodes.forEach((n: GraphNode) => {
      out.push(`- ${n.kind === 'person' ? '人物' : '地名'}：${n.label}（${RACE_LABELS[n.race]}）`);
    });
    out.push('');
    out.push('### 连线');
    out.push('');
    if (graph.edges.length === 0) {
      out.push('（暂无连线）');
      out.push('');
    } else {
      graph.edges.forEach((e: GraphEdge) => {
        out.push(`- ${e.fromName} — ${e.relationType} → ${e.toName}${e.note ? `（${e.note}）` : ''}`);
      });
      out.push('');
    }
    out.push('### 流程图（支持 Mermaid 的 Markdown 阅读器可直接渲染）');
    out.push('');
    out.push(mermaidGraph(bundle));
    out.push('');
  }

  out.push('---');
  out.push('由「创作工坊」生成');
  return out.join('\n');
}

export async function exportSettingsMarkdown(): Promise<{ ok: boolean; fileName: string; message?: string }> {
  const bundle = await fetchAllData();
  if (bundle.candidates.length === 0 && bundle.sheets.length === 0 && bundle.relations.length === 0) {
    return { ok: false, fileName: '', message: '暂无可导出的设定' };
  }
  const md = buildSettingsMarkdown(bundle);
  const fileName = `创作工坊-已保存设定-${stamp()}.md`;
  return saveBase64(utf8ToBase64(md), fileName);
}

export function drawGraphToCanvas(nodes: GraphNode[], edges: GraphEdge[], positions: Map<string, Position>, title: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 背景：深墨纸面
  ctx.fillStyle = '#222A31';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, 0, canvas.width, 8);
  ctx.fillRect(0, canvas.height - 8, canvas.width, 8);

  ctx.fillStyle = '#E8E0CE';
  ctx.font = '600 34px "Kaiti SC", "STKaiti", serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`创作工坊 · ${title}`, 44, 36);

  if (nodes.length === 0) {
    ctx.fillStyle = '#9A9184';
    ctx.font = '24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无关联数据', canvas.width / 2, canvas.height / 2);
    return canvas;
  }

  // 归一化坐标到画布
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((n) => {
    const p = positions.get(n.id);
    if (!p) return;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  if (!isFinite(minX)) return canvas;
  const padX = 90;
  const padY = 110;
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((canvas.width - padX * 2) / spanX, (canvas.height - padY * 2) / spanY);
  const offX = (canvas.width - spanX * scale) / 2 - minX * scale;
  const offY = (canvas.height - spanY * scale) / 2 - minY * scale;
  const px = (p: Position) => ({ x: p.x * scale + offX, y: p.y * scale + offY });

  // 边
  edges.forEach((e) => {
    const a = positions.get(e.source);
    const b = positions.get(e.target);
    if (!a || !b) return;
    const pa = px(a);
    const pb = px(b);
    ctx.strokeStyle = 'rgba(232,224,206,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
    const midX = (pa.x + pb.x) / 2;
    const midY = (pa.y + pb.y) / 2;
    ctx.fillStyle = 'rgba(232,224,206,0.75)';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(e.relationType, midX, midY - 8);
  });

  // 节点
  nodes.forEach((n) => {
    const p = positions.get(n.id);
    if (!p) return;
    const pt = px(p);
    const r = n.kind === 'person' ? 24 : 20;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.kind === 'person' ? '#B23A2E' : '#4A7C59';
    ctx.fill();
    ctx.strokeStyle = '#F5EFE2';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#F5EFE2';
    ctx.font = '600 20px "Kaiti SC", "STKaiti", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(n.label, pt.x, pt.y + r + 8);
  });

  return canvas;
}

export async function exportGraphPng(
  nodes: GraphNode[],
  edges: GraphEdge[],
  positions: Map<string, Position>,
  title: string,
): Promise<{ ok: boolean; fileName: string; message?: string }> {
  if (nodes.length === 0) {
    return { ok: false, fileName: '', message: '暂无可导出的图谱' };
  }
  try {
    const canvas = drawGraphToCanvas(nodes, edges, positions, title);
    const dataUrl = canvas.toDataURL('image/png');
    const b64 = dataUrl.split(',')[1] ?? '';
    if (!b64) return { ok: false, fileName: '', message: '图谱生成失败，请重试' };
    const fileName = `创作工坊-${title}-${stamp()}.png`;
    return saveBase64(b64, fileName);
  } catch (err) {
    return { ok: false, fileName: '', message: (err as Error)?.message || '导出失败，请重试' };
  }
}
