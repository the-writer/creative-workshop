// 图谱页：关系/全景视图、力导向布局、拖拽与缩放平移、节点/连线详情、布局持久化
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, Minus, Plus, RefreshCw, X } from 'lucide-react';
import { fetchCandidates, fetchGraphLayout, fetchRelations, fetchSheets, saveGraphLayout } from '@/lib/db';
import { buildGraphData, computeLayout, type GraphEdge, type GraphNode, type GraphViewMode, type NodeTypeFilter, type Position } from '@/lib/graph';
import type { Candidate, RaceKey, Relation, Sheet } from '@/lib/types';
import { FILTER_MAX_CHARS, normalizeRaceFilter, RACE_LABELS } from '@/lib/types';
import { Chip, EmptyState, Seal, useAppToast } from '@/components/common';
import { cn } from '@/lib/utils';

interface GraphTabProps {
  refreshKey: number;
  onGoSheets: () => void;
}

const NODE_R = { person: 22, place: 18 };

const DRAG_SAVE_THRESHOLD_PX = 3;

// 过滤掉历史/损坏的坐标，只保留有限数值，避免整张图谱被脏数据拉飞
function sanitizeLayout(raw: Record<string, Position> | null | undefined): Record<string, Position> {
  const result: Record<string, Position> = {};
  if (!raw || typeof raw !== 'object') return result;
  Object.entries(raw).forEach(([id, point]) => {
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      result[id] = { x: point.x, y: point.y };
    }
  });
  return result;
}

export function GraphTab({ refreshKey, onGoSheets }: GraphTabProps) {
  const toast = useAppToast();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [places, setPlaces] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<GraphViewMode>('relation');
  const [typeFilter, setTypeFilter] = useState<NodeTypeFilter>('all');
  const [raceFilter, setRaceFilter] = useState<RaceKey | 'all'>('all');

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 360, h: 480 });
  const [positions, setPositions] = useState<Map<string, Position>>(new Map());
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  // 已持久化的节点坐标（加载自 .workshop/graph.md，拖拽结束后更新），用于覆盖自动布局
  const savedLayoutRef = useRef<Record<string, Position>>({});
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; origTx: number; origTy: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, p, layout] = await Promise.all([
        fetchSheets(),
        fetchRelations(),
        fetchCandidates({ race: 'all', nameType: 'place', minChars: 1, maxChars: FILTER_MAX_CHARS, status: 'all', keyword: '', sort: 'latest' }),
        // 布局读取失败不影响图谱主体展示，回退为自动布局
        fetchGraphLayout().catch(() => null),
      ]);
      setSheets(s);
      setRelations(r);
      setPlaces(p);
      savedLayoutRef.current = sanitizeLayout(layout);
      setError('');
    } catch (err) {
      setError((err as Error)?.message || '加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  // 容器尺寸
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth || 360, h: el.clientHeight || 480 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(
    () => buildGraphData(sheets, relations, places, viewMode, typeFilter, raceFilter),
    [sheets, relations, places, viewMode, typeFilter, raceFilter],
  );

  // 数据/尺寸变化时重算布局，再用已保存坐标覆盖当前存在的节点
  useEffect(() => {
    const layout = computeLayout(graphData.nodes, graphData.edges, size.w, size.h);
    graphData.nodes.forEach((node) => {
      const saved = savedLayoutRef.current[node.id];
      if (saved) layout.set(node.id, { x: saved.x, y: saved.y });
    });
    setPositions(layout);
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [graphData, size]);

  // 重排布局：只刷新本次会话的坐标，不强制写盘
  const rerunLayout = () => {
    const layout = computeLayout(graphData.nodes, graphData.edges, size.w, size.h);
    savedLayoutRef.current = Object.fromEntries(layout);
    setPositions(layout);
  };

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    setView((v) => {
      const nextScale = Math.max(0.4, Math.min(3, v.scale * factor));
      const k = nextScale / v.scale;
      return { scale: nextScale, tx: px - (px - v.tx) * k, ty: py - (py - v.ty) * k };
    });
  }, []);

  // 滚轮缩放（非被动）
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 0.89);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if (target.closest('[data-node]') || target.closest('[data-edge]')) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, origTx: viewRef.current.tx, origTy: viewRef.current.ty };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  };

  const onSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      const d = dragRef.current;
      const scale = viewRef.current.scale;
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(d.id, { x: d.origX + (e.clientX - d.startX) / scale, y: d.origY + (e.clientY - d.startY) / scale });
        return next;
      });
      return;
    }
    if (panRef.current) {
      const p = panRef.current;
      setView({ tx: p.origTx + (e.clientX - p.startX), ty: p.origTy + (e.clientY - p.startY), scale: viewRef.current.scale });
    }
  };

  const onSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    panRef.current = null;
    if (!drag) return;
    // 仅有实际拖拽（非点选）时持久化全部节点坐标，保存失败不阻塞交互
    const moved = Math.abs(e.clientX - drag.startX) > DRAG_SAVE_THRESHOLD_PX || Math.abs(e.clientY - drag.startY) > DRAG_SAVE_THRESHOLD_PX;
    if (!moved) return;
    const snapshot: Record<string, Position> = { ...savedLayoutRef.current };
    positionsRef.current.forEach((point, id) => {
      snapshot[id] = { x: point.x, y: point.y };
    });
    savedLayoutRef.current = snapshot;
    void saveGraphLayout(snapshot)
      .then((res) => {
        if (!res.ok) toast.show('图谱布局保存失败，下次打开将沿用自动布局', 'error');
      })
      .catch(() => toast.show('图谱布局保存失败，下次打开将沿用自动布局', 'error'));
  };

  const onNodeDown = (e: React.PointerEvent, node: GraphNode) => {
    e.stopPropagation();
    const p = positions.get(node.id);
    if (!p) return;
    dragRef.current = { id: node.id, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const hasAnyData = sheets.length > 0 || relations.length > 0 || places.length > 0;
  // 同一节点上的多条自关联依次外扩
  const selfLoopIndex = new Map<string, number>();

  return (
    <div className="page-shell graph-page">
      <div className="graph-toolbar">
        <div className="graph-toolbar-row">
          <div className="segmented graph-view-toggle">
            {(
              [
                ['relation', '关系图谱'],
                ['panorama', '全景图谱'],
              ] as Array<[GraphViewMode, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={cn('seg-btn', viewMode === k && 'seg-btn-active')}
                data-testid={`graph-view-${k}`}
                onClick={() => setViewMode(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="graph-toolbar-row graph-filter-row">
          <div className="filter-chips">
            {(
              [
                ['all', '全部'],
                ['person', '人物'],
                ['place', '地名'],
              ] as Array<[NodeTypeFilter, string]>
            ).map(([k, label]) => (
              <Chip key={k} selected={typeFilter === k} tone="neutral" onClick={() => setTypeFilter(k)} dataTestId={`graph-type-${k}`}>
                {label}
              </Chip>
            ))}
          </div>
          <div className="filter-chips">
            {(
              [
                ['all', '全族'],
                ['human', '人族'],
                ['elf', '精灵族'],
                ['mixed', '混血'],
              ] as Array<[RaceKey | 'all', string]>
            ).map(([k, label]) => (
              <Chip key={k} selected={raceFilter === k} tone="neutral" onClick={() => setRaceFilter(k)} dataTestId={`graph-race-${k}`}>
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="graph-toolbar-row graph-toolbar-meta">
          <div className="graph-legend">
            <span className="legend-item">
              <i className="legend-dot legend-dot-person" />
              人物
            </span>
            <span className="legend-item">
              <i className="legend-dot legend-dot-place" />
              地名
            </span>
            <span className="graph-count" data-testid="graph-count">
              节点 {graphData.nodes.length} · 连线 {graphData.edges.length}
            </span>
          </div>
          <div className="graph-actions">
            <button type="button" className="icon-btn" title="重排布局" data-testid="graph-relayout" onClick={rerunLayout}>
              <RefreshCw size={15} />
            </button>
            <button type="button" className="icon-btn" title="缩小" data-testid="graph-zoom-out" onClick={() => zoomAt(size.w / 2, size.h / 2, 0.85)}>
              <Minus size={15} />
            </button>
            <button type="button" className="icon-btn" title="放大" data-testid="graph-zoom-in" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.18)}>
              <Plus size={15} />
            </button>
            <button type="button" className="icon-btn" title="重置视图" data-testid="graph-reset" onClick={() => setView({ tx: 0, ty: 0, scale: 1 })}>
              <Home size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="graph-canvas-wrap" ref={wrapRef} data-testid="graph-canvas">
        {error ? (
          <div className="error-bar graph-error">
            {error}
            <button type="button" className="retry-link" onClick={() => void reload()}>
              重试
            </button>
          </div>
        ) : loading ? (
          <div className="list-loading">正在铺陈图谱…</div>
        ) : !hasAnyData ? (
          <EmptyState
            title="图谱尚未铺开"
            desc="先去设定页为人物建立设定与关系，再回来查看图谱"
            testId="graph-empty"
            actions={
              <button type="button" className="primary-btn" data-testid="graph-empty-gosheets" onClick={onGoSheets}>
                去设定页
              </button>
            }
          />
        ) : graphData.nodes.length === 0 ? (
          <EmptyState title="当前筛选下没有节点" desc="试试切换视图或放宽类型、族群筛选" testId="graph-filter-empty" />
        ) : (
          <>
            {viewMode === 'relation' && relations.length === 0 ? (
              <div className="graph-hint">
                暂无人物关系，去设定页为人物添加关系后即可呈现
                <button type="button" className="link-btn" onClick={onGoSheets}>
                  去设定页
                </button>
              </div>
            ) : null}
            <svg
              className="graph-svg"
              data-testid="graph-svg"
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerCancel={onSvgPointerUp}
              onClick={() => {
                setSelectedNode(null);
                setSelectedEdge(null);
              }}
            >
              <rect x={-4000} y={-4000} width={8000} height={8000} fill="transparent" />
              <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
                {graphData.edges.map((e) => {
                  const a = positions.get(e.source);
                  const b = positions.get(e.target);
                  if (!a || !b) return null;
                  const sel = selectedEdge?.id === e.id;
                  if (e.source === e.target) {
                    // 自关联画成节点上方的自环，多条时逐层外扩避免重叠
                    const index = selfLoopIndex.get(e.source) ?? 0;
                    selfLoopIndex.set(e.source, index + 1);
                    const loopRadius = 16 + index * 9;
                    const centerY = a.y - NODE_R.person - loopRadius - 6 - index * 4;
                    return (
                      <g key={e.id}>
                        <circle
                          cx={a.x}
                          cy={centerY}
                          r={loopRadius}
                          fill="none"
                          className="graph-edge-hit"
                          data-edge={e.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelectedEdge(e);
                            setSelectedNode(null);
                          }}
                        />
                        <circle
                          cx={a.x}
                          cy={centerY}
                          r={loopRadius}
                          fill="none"
                          pointerEvents="none"
                          className={cn('graph-edge', sel && 'graph-edge-selected')}
                        />
                        <text x={a.x} y={centerY - loopRadius - 6} className="graph-edge-label" textAnchor="middle">
                          {e.relationType}
                        </text>
                      </g>
                    );
                  }
                  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                  return (
                    <g key={e.id}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        className="graph-edge-hit"
                        data-edge={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelectedEdge(e);
                          setSelectedNode(null);
                        }}
                      />
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} pointerEvents="none" className={cn('graph-edge', sel && 'graph-edge-selected')} />
                      <text x={mid.x} y={mid.y - 6} className="graph-edge-label" textAnchor="middle" pointerEvents="none">
                        {e.relationType}
                      </text>
                    </g>
                  );
                })}
                {graphData.nodes.map((n) => {
                  const p = positions.get(n.id);
                  if (!p) return null;
                  const r = NODE_R[n.kind];
                  const fill = n.kind === 'person' ? '#B23A2E' : '#4A7C59';
                  const selected = selectedNode?.id === n.id;
                  return (
                    <g
                      key={n.id}
                      data-node={n.id}
                      transform={`translate(${p.x},${p.y})`}
                      className="graph-node"
                      onPointerDown={(e) => onNodeDown(e, n)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNode(n);
                        setSelectedEdge(null);
                      }}
                    >
                      {selected ? <circle r={r + 6} fill="none" stroke="#B98A3A" strokeWidth={2} strokeDasharray="4 3" /> : null}
                      <circle r={r} fill={fill} stroke="#FBF6EA" strokeWidth={2} />
                      <text textAnchor="middle" dy={r + 15} className="graph-node-label">
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {selectedNode ? (
              <div className="graph-detail-card" data-testid="graph-node-card">
                <div className="graph-detail-head">
                  <Seal race={selectedNode.race} size={20} />
                  <span className="graph-detail-name">{selectedNode.label}</span>
                  <button type="button" className="icon-btn" title="关闭" data-testid="graph-detail-close" onClick={() => setSelectedNode(null)}>
                    <X size={15} />
                  </button>
                </div>
                <div className="graph-detail-meta">
                  <span className="graph-detail-kind">{selectedNode.kind === 'person' ? '人物' : '地名'}</span>
                  <span>{RACE_LABELS[selectedNode.race]}</span>
                </div>
                {selectedNode.kind === 'person' && selectedNode.sheet ? (
                  <div className="graph-detail-fields">
                    {selectedNode.sheet.occupation ? <p>职业：{selectedNode.sheet.occupation}</p> : null}
                    {selectedNode.sheet.office ? <p>官职：{selectedNode.sheet.office}</p> : null}
                    {selectedNode.sheet.hometown ? <p>籍贯：{selectedNode.sheet.hometown}</p> : null}
                    {selectedNode.sheet.nickname ? <p>绰号：{selectedNode.sheet.nickname}</p> : null}
                    {selectedNode.sheet.contractTitle ? <p>契约：{selectedNode.sheet.contractTitle}</p> : null}
                    {selectedNode.sheet.note ? <p className="graph-detail-note">{selectedNode.sheet.note}</p> : null}
                  </div>
                ) : null}
                {selectedNode.kind === 'place' && selectedNode.candidate ? (
                  <div className="graph-detail-fields">
                    <p>{selectedNode.candidate.charCount}字</p>
                    {selectedNode.candidate.note ? <p className="graph-detail-note">{selectedNode.candidate.note}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {selectedEdge ? (
              <div className="graph-detail-card" data-testid="graph-edge-card">
                <div className="graph-detail-head">
                  <span className="graph-detail-name">
                    {selectedEdge.fromName} — {selectedEdge.toName}
                  </span>
                  <button type="button" className="icon-btn" title="关闭" data-testid="graph-edge-close" onClick={() => setSelectedEdge(null)}>
                    <X size={15} />
                  </button>
                </div>
                <div className="graph-detail-meta">
                  <span className="graph-detail-kind">{selectedEdge.relationType}</span>
                </div>
                {selectedEdge.note ? <p className="graph-detail-note">{selectedEdge.note}</p> : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
