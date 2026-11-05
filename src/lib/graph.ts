// 图谱数据构建：由 DB 中的设定卡与关系记录派生节点与边

import type { Candidate, NameTypeKey, RaceKey, Relation, Sheet } from '@/lib/types';

export type GraphKind = 'person' | 'place';

export interface GraphNode {
  id: string; // 's:<sheetId>' 或 'p:<candidateId>'
  kind: GraphKind;
  label: string;
  race: RaceKey;
  sheet?: Sheet;
  candidate?: Candidate;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
  note: string;
  fromName: string;
  toName: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type GraphViewMode = 'relation' | 'panorama';
export type NodeTypeFilter = 'all' | 'person' | 'place';

function sheetNodeId(sheetId: string): string {
  return `s:${sheetId}`;
}

function placeNodeId(candidateId: string): string {
  return `p:${candidateId}`;
}

export function buildGraphData(
  sheets: Sheet[],
  relations: Relation[],
  placeCandidates: Candidate[],
  viewMode: GraphViewMode,
  typeFilter: NodeTypeFilter,
  raceFilter: RaceKey | 'all',
): GraphData {
  const personNodes = new Map<string, GraphNode>();
  sheets.forEach((s) => {
    personNodes.set(sheetNodeId(s.id), {
      id: sheetNodeId(s.id),
      kind: 'person',
      label: s.characterName || '未命名人物',
      race: s.race,
      sheet: s,
    });
  });

  const placeById = new Map<string, Candidate>();
  placeCandidates.forEach((c) => {
    if (c.nameType === 'place') placeById.set(c.id, c);
  });

  // 关联自身同样进入图谱：人物节点上用自环表示（如男主/女主标记）
  const graphRelations = relations;

  const placeNodeIds = new Set<string>();
  graphRelations.forEach((r) => {
    if (r.fromType === 'place') placeNodeIds.add(r.fromId);
    if (r.toType === 'place') placeNodeIds.add(r.toId);
  });
  sheets.forEach((s) => {
    if (s.hometownCandidateId && placeById.has(s.hometownCandidateId)) placeNodeIds.add(s.hometownCandidateId);
  });

  const placeNodes = new Map<string, GraphNode>();
  placeNodeIds.forEach((cid) => {
    const c = placeById.get(cid);
    if (c) {
      placeNodes.set(placeNodeId(cid), { id: placeNodeId(cid), kind: 'place', label: c.nameText, race: c.race, candidate: c });
    }
  });

  const nodes = new Map<string, GraphNode>();
  personNodes.forEach((n) => nodes.set(n.id, n));
  placeNodes.forEach((n) => nodes.set(n.id, n));

  const edges: GraphEdge[] = [];
  graphRelations.forEach((r) => {
    const source = r.fromType === 'sheet' ? sheetNodeId(r.fromId) : placeNodeId(r.fromId);
    const target = r.toType === 'sheet' ? sheetNodeId(r.toId) : placeNodeId(r.toId);
    if (!nodes.has(source) || !nodes.has(target)) return;
    edges.push({
      id: r.id,
      source,
      target,
      relationType: r.relationType,
      note: r.note,
      fromName: r.fromName,
      toName: r.toName,
    });
  });

  // 过滤：视图模式
  let filteredEdges = edges;
  if (viewMode === 'relation') {
    filteredEdges = edges.filter((e) => {
      const s = nodes.get(e.source);
      const t = nodes.get(e.target);
      return s?.kind === 'person' && t?.kind === 'person';
    });
  }

  // 过滤：类型与族群
  let filteredNodes = Array.from(nodes.values());
  if (typeFilter !== 'all') {
    filteredNodes = filteredNodes.filter((n) => n.kind === typeFilter);
  }
  if (raceFilter !== 'all') {
    filteredNodes = filteredNodes.filter((n) => n.race === raceFilter);
  }
  const keptIds = new Set(filteredNodes.map((n) => n.id));
  filteredEdges = filteredEdges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));

  return { nodes: filteredNodes, edges: filteredEdges };
}

export interface Position {
  x: number;
  y: number;
}

// 轻量力导向布局：圆形初始化 + 斥力/引力迭代，输出世界坐标
export function computeLayout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number): Map<string, Position> {
  const pos = new Map<string, Position>();
  const n = nodes.length;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.36;

  nodes.forEach((node, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2;
    pos.set(node.id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  });

  const edgeMap = new Map<string, Set<string>>();
  edges.forEach((e) => {
    if (!edgeMap.has(e.source)) edgeMap.set(e.source, new Set());
    if (!edgeMap.has(e.target)) edgeMap.set(e.target, new Set());
    edgeMap.get(e.source)?.add(e.target);
    edgeMap.get(e.target)?.add(e.source);
  });

  const iterations = n > 0 ? Math.min(220, 80 + n * 4) : 0;
  for (let iter = 0; iter < iterations; iter += 1) {
    const forces = new Map<string, { fx: number; fy: number }>();
    nodes.forEach((node) => forces.set(node.id, { fx: 0, fy: 0 }));

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = pos.get(nodes[i].id);
        const b = pos.get(nodes[j].id);
        if (!a || !b) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = 90;
        if (dist < minDist) {
          const force = (minDist - dist) / minDist;
          dx /= dist;
          dy /= dist;
          const fa = forces.get(nodes[i].id);
          const fb = forces.get(nodes[j].id);
          if (fa) {
            fa.fx -= dx * force * 14;
            fa.fy -= dy * force * 14;
          }
          if (fb) {
            fb.fx += dx * force * 14;
            fb.fy += dy * force * 14;
          }
        }
      }
    }

    edges.forEach((e) => {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (a && b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 150;
        const force = (dist - target) * 0.02;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fa = forces.get(e.source);
        const fb = forces.get(e.target);
        if (fa) {
          fa.fx += fx;
          fa.fy += fy;
        }
        if (fb) {
          fb.fx -= fx;
          fb.fy -= fy;
        }
      }
    });

    // 中心引力，避免漂移
    nodes.forEach((node) => {
      const p = pos.get(node.id);
      const f = forces.get(node.id);
      if (!p || !f) return;
      f.fx += (cx - p.x) * 0.006;
      f.fy += (cy - p.y) * 0.006;
    });

    nodes.forEach((node) => {
      const p = pos.get(node.id);
      const f = forces.get(node.id);
      if (!p || !f) return;
      p.x += Math.max(-6, Math.min(6, f.fx));
      p.y += Math.max(-6, Math.min(6, f.fy));
    });
  }

  return pos;
}

export function graphNodeTypeLabel(kind: GraphKind): string {
  return kind === 'person' ? '人物' : '地名';
}

export function raceOfTypeLabel(): Record<RaceKey, string> {
  return { human: '人族', elf: '精灵族', yaogui: '妖鬼', mixed: '混血' };
}

export type { NameTypeKey };
