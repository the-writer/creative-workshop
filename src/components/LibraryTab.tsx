// 候选库：筛选面板 + 谱页列表 + 详情抽屉 + 增删改查与备注

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Filter, FilterX, RefreshCw, Search, Sparkles, Trash2, UserPlus, X } from 'lucide-react';
import { deleteCandidate, fetchCandidates, getCandidateReferences, updateCandidate } from '@/lib/db';
import type { Candidate, CandidateFilters, NameTypeKey, RaceKey, SortKey, StatusFilterKey } from '@/lib/types';
import { candidateToSheetFields, DEFAULT_FILTERS, FILTER_MAX_CHARS, normalizeRaceFilter, RACE_LABELS, TYPE_LABELS } from '@/lib/types';
import { BottomSheet, Chip, ConfirmDialog, copyText, EmptyState, formatTime, Seal, StructureTags, useAppToast } from '@/components/common';
import { cn } from '@/lib/utils';
import type { EditorPrefill } from '@/components/GenerateTab';

interface LibraryTabProps {
  refreshKey: number;
  onOpenEditor: (prefill: EditorPrefill) => void;
  onGoGenerate: () => void;
}

function normalizeFilters(parsed: Partial<CandidateFilters> | null | undefined): CandidateFilters {
  const fallback = { ...DEFAULT_FILTERS };
  try {
    const p = parsed ?? {};
    const result: CandidateFilters = {
      race: normalizeRaceFilter(p.race),
      nameType: ['person', 'place', 'office', 'nickname'].includes(p.nameType ?? '') ? (p.nameType as NameTypeKey) : 'all',
      minChars: typeof p.minChars === 'number' ? Math.max(1, Math.min(FILTER_MAX_CHARS, Math.round(p.minChars))) : 1,
      maxChars: typeof p.maxChars === 'number' ? Math.max(1, Math.min(FILTER_MAX_CHARS, Math.round(p.maxChars))) : FILTER_MAX_CHARS,
      status: p.status === 'favorite' || p.status === 'referenced' ? p.status : 'all',
      keyword: typeof p.keyword === 'string' ? p.keyword : '',
      sort: p.sort === 'charCount' || p.sort === 'nameText' ? p.sort : 'latest',
    };
    // 兜底：历史脏数据可能造成最小字数大于最大字数，直接导致列表为空
    if (result.minChars > result.maxChars) {
      result.minChars = 1;
      result.maxChars = FILTER_MAX_CHARS;
    }
    return result;
  } catch {
    return fallback;
  }
}

export function LibraryTab({ refreshKey, onOpenEditor, onGoGenerate }: LibraryTabProps) {
  const toast = useAppToast();
  const [filters, setFilters] = useState<CandidateFilters>({ ...DEFAULT_FILTERS });
  const [filtersReady, setFiltersReady] = useState(false);
  const [kwDraft, setKwDraft] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [items, setItems] = useState<Candidate[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [drawerNote, setDrawerNote] = useState('');
  const [aiUnavailableOpen, setAiUnavailableOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Candidate | null>(null);
  const [blockedRefs, setBlockedRefs] = useState<{ asCharacter: boolean; asHometown: boolean; asPlace: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const loadSeq = useRef(0);

  useEffect(() => {
    void window.workshop.preferences
      .get('libraryFilters')
      .then((raw) => {
        if (!raw || typeof raw !== 'object') return;
        const restored = normalizeFilters(raw as Partial<CandidateFilters>);
        setFilters(restored);
        setKwDraft(restored.keyword);
      })
      .catch(() => undefined)
      .finally(() => setFiltersReady(true));
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    void window.workshop.preferences.set('libraryFilters', filters).catch(() => undefined);
  }, [filters, filtersReady]);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      const seq = ++loadSeq.current;
      if (opts?.silent) {
        setIsRefreshing(true);
      } else {
        setIsInitialLoading(true);
      }
      try {
        const list = await fetchCandidates(filters);
        if (seq !== loadSeq.current) return;
        setItems(list);
        setError('');
        setLastSyncedAt(Date.now());
      } catch (err) {
        if (seq !== loadSeq.current) return;
        setError((err as Error)?.message || '查询失败，请重试');
      } finally {
        if (seq === loadSeq.current) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [filters],
  );

  // 关键词防抖 600ms
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((f) => (f.keyword === kwDraft ? f : { ...f, keyword: kwDraft }));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [kwDraft]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  // 静默自动刷新：3 分钟
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void reload({ silent: true });
      }
    }, 180000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const setFilter = (patch: Partial<CandidateFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.race !== 'all') parts.push(RACE_LABELS[filters.race]);
    if (filters.nameType !== 'all') parts.push(TYPE_LABELS[filters.nameType]);
    if (filters.minChars > 1 || filters.maxChars < FILTER_MAX_CHARS) parts.push(`${filters.minChars}-${filters.maxChars}字`);
    if (filters.status === 'favorite') parts.push('已收藏');
    if (filters.status === 'referenced') parts.push('已关联设定');
    return parts;
  }, [filters]);

  const hasActiveFilter = filterSummary.length > 0 || filters.keyword.trim().length > 0;

  const clearFilters = () => {
    setKwDraft('');
    setFilters({ ...DEFAULT_FILTERS });
  };

  const toggleFavorite = async (c: Candidate) => {
    const res = await updateCandidate(c.id, { favorite: !c.favorite });
    if (!res.ok) {
      toast.show(res.message || '操作失败，请重试', 'error');
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, favorite: !x.favorite } : x)));
    toast.show(c.favorite ? '已取消收藏' : '已收藏', 'success');
  };

  const openDetail = (c: Candidate) => {
    setSelected(c);
    setDrawerNote(c.note);
  };

  const closeDetail = () => {
    setSelected(null);
  };

  const saveNote = async () => {
    if (!selected) return;
    const res = await updateCandidate(selected.id, { note: drawerNote });
    if (!res.ok) {
      toast.show(res.message || '备注保存失败', 'error');
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === selected.id ? { ...x, note: drawerNote } : x)));
    toast.show('备注已保存', 'success');
  };

  const startDelete = async (c: Candidate) => {
    try {
      const refs = await getCandidateReferences(c.id);
      setDeleteTarget(c);
      setBlockedRefs(refs.asCharacter || refs.asHometown || refs.asPlace ? refs : null);
    } catch (err) {
      toast.show((err as Error)?.message || '检查名称引用失败，请重试', 'error');
    }
  };

  const forceDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteCandidate(deleteTarget.id, true);
    setDeleting(false);
    setDeleteTarget(null);
    setBlockedRefs(null);
    if (res.ok) {
      toast.show('已解除引用并删除', 'success');
      closeDetail();
      void reload({ silent: true });
    } else {
      toast.show(res.message || '删除失败，请重试', 'error');
    }
  };

  const copyItem = async (c: Candidate) => {
    const ok = await copyText(c.nameText);
    toast.show(ok ? `已复制「${c.nameText}」` : '复制失败，请长按名称手动复制', ok ? 'success' : 'error');
  };

  return (
    <div className="page-shell library-page">
      <div className="app-scroll">
        {/* 筛选入口条 */}
        <div className="filter-bar">
          <button type="button" className="filter-toggle" onClick={() => setPanelOpen((v) => !v)} data-testid="filter-toggle">
            <Filter size={14} />
            筛选
            {filterSummary.length > 0 ? <span className="filter-count">{filterSummary.length}</span> : null}
          </button>
          {filterSummary.length > 0 ? (
            <div className="filter-summary-chips">
              {filterSummary.map((s) => (
                <span key={s} className="filter-summary-chip">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
          <div className="filter-actions">
            <button type="button" className="icon-btn" title="刷新" data-testid="library-refresh" onClick={() => void reload({ silent: true })}>
              <RefreshCw size={16} className={cn(isRefreshing && 'spin')} />
            </button>
          </div>
        </div>

        {lastSyncedAt ? (
          <p className="sync-note">
            更新于 {formatTime(lastSyncedAt)}
            {isRefreshing ? ' · 刷新中…' : ''}
          </p>
        ) : null}

        {/* 筛选面板 */}
        {panelOpen ? (
          <div className="filter-panel" data-testid="filter-panel">
            <div className="filter-group">
              <span className="filter-group-label">族群</span>
              <div className="filter-chips">
                {(
                  [
                    ['all', '全部'],
                    ['human', '人族'],
                    ['elf', '精灵族'],
                    ['yaogui', '妖鬼'],
                    ['mixed', '混血'],
                  ] as Array<[RaceKey | 'all', string]>
                ).map(([k, label]) => (
                  <Chip key={k} selected={filters.race === k} tone="neutral" onClick={() => setFilter({ race: k })} dataTestId={`filter-race-${k}`}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-group-label">类型</span>
              <div className="filter-chips">
                {(
                  [
                    ['all', '全部'],
                    ['person', '人名'],
                    ['place', '地名'],
                    ['office', '官职'],
                    ['nickname', '绰号'],
                  ] as Array<[NameTypeKey | 'all', string]>
                ).map(([k, label]) => (
                  <Chip key={k} selected={filters.nameType === k} tone="neutral" onClick={() => setFilter({ nameType: k })} dataTestId={`filter-type-${k}`}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-group-label">字数范围</span>
              <div className="range-inputs">
                <input
                  type="number"
                  className="range-input"
                  value={filters.minChars}
                  min={1}
                  max={FILTER_MAX_CHARS}
                  data-testid="filter-chars-min"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) setFilter({ minChars: Math.max(1, Math.min(FILTER_MAX_CHARS, Math.round(v))) });
                  }}
                />
                <span className="range-sep">至</span>
                <input
                  type="number"
                  className="range-input"
                  value={filters.maxChars}
                  min={1}
                  max={FILTER_MAX_CHARS}
                  data-testid="filter-chars-max"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) setFilter({ maxChars: Math.max(1, Math.min(FILTER_MAX_CHARS, Math.round(v))) });
                  }}
                />
                <span className="range-note">字</span>
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-group-label">状态</span>
              <div className="filter-chips">
                {(
                  [
                    ['all', '全部'],
                    ['favorite', '已收藏'],
                    ['referenced', '已关联设定'],
                  ] as Array<[StatusFilterKey, string]>
                ).map(([k, label]) => (
                  <Chip key={k} selected={filters.status === k} tone="neutral" onClick={() => setFilter({ status: k })} dataTestId={`filter-status-${k}`}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-group-label">名称搜索</span>
              <div className="keyword-row">
                <Search size={15} className="search-icon" />
                <input
                  type="text"
                  className="keyword-input"
                  placeholder="输入关键词"
                  value={kwDraft}
                  data-testid="filter-keyword"
                  onChange={(e) => setKwDraft(e.target.value)}
                />
                {kwDraft ? (
                  <button type="button" className="keyword-clear" data-testid="filter-keyword-clear" onClick={() => setKwDraft('')}>
                    <X size={15} />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-group-label">排序</span>
              <div className="filter-chips">
                {(
                  [
                    ['latest', '最新保存'],
                    ['charCount', '字数'],
                    ['nameText', '名称'],
                  ] as Array<[SortKey, string]>
                ).map(([k, label]) => (
                  <Chip key={k} selected={filters.sort === k} tone="neutral" onClick={() => setFilter({ sort: k })} dataTestId={`filter-sort-${k}`}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
            {hasActiveFilter ? (
              <button type="button" className="clear-filter-btn" onClick={clearFilters} data-testid="clear-filters">
                <FilterX size={15} />
                清空筛选
              </button>
            ) : null}
          </div>
        ) : null}

        {/* 列表 */}
        {error ? (
          <div className="error-bar" data-testid="library-error">
            {error}
            <button type="button" className="retry-link" onClick={() => void reload()}>
              重试
            </button>
          </div>
        ) : null}

        {isInitialLoading ? (
          <div className="list-loading">正在翻谱…</div>
        ) : items.length === 0 ? (
          hasActiveFilter ? (
            <EmptyState
              title="没有符合筛选的名称"
              desc="试试清空筛选条件，或去生成一批新命名"
              testId="library-filter-empty"
              actions={
                <button type="button" className="secondary-btn" onClick={clearFilters} data-testid="library-empty-clear">
                  清空筛选
                </button>
              }
            />
          ) : (
            <EmptyState
              title="候选库还是空的"
              desc="去生成一批命名，把满意的落印入谱"
              testId="library-empty"
              actions={
                <button type="button" className="primary-btn" onClick={onGoGenerate} data-testid="library-empty-generate">
                  去生成一批
                </button>
              }
            />
          )
        ) : (
          <div>
            <div className="list-count" data-testid="library-count">
              共 {items.length} 条
            </div>
            <div className="library-list">
              {items.map((c) => (
                <button key={c.id} type="button" className="library-row" onClick={() => openDetail(c)} data-testid={`row-${c.id}`}>
                  <Seal race={c.race} size={20} />
                  <div className="row-main">
                    <p className="row-name">
                      {c.nameText}
                      {c.referenced ? <span className="row-referenced">已关联</span> : null}
                    </p>
                    <div className="row-meta">
                      <span className="row-type">{TYPE_LABELS[c.nameType]}</span>
                      <span>{c.charCount}字</span>
                      <span>{formatTime(c.createdAt)}</span>
                    </div>
                    {c.note ? <p className="row-note">{c.note}</p> : null}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <BottomSheet open={!!selected} onClose={closeDetail} className="detail-sheet" testId="detail-sheet">
        <h2 className="detail-sheet-title">命名详情</h2>
        {selected ? (
          <div className="detail-body">
            <div className="detail-top">
              <Seal race={selected.race} size={30} />
              <div className="detail-name-wrap">
                <p className="detail-name">{selected.nameText}</p>
                <p className="detail-meta">
                  {RACE_LABELS[selected.race]} · {TYPE_LABELS[selected.nameType]} · {selected.charCount}字 · {formatTime(selected.createdAt)}
                </p>
              </div>
            </div>
            <StructureTags parts={selected.structure} race={selected.race} gender={selected.gender} rarity={selected.rarity} />
            <div className="detail-note">
              <label className="detail-label" htmlFor="detail-note-input">
                备注
              </label>
              <textarea
                id="detail-note-input"
                className="detail-textarea"
                value={drawerNote}
                onChange={(e) => setDrawerNote(e.target.value)}
                data-testid="detail-note"
                placeholder="写下这个命名的用途或灵感"
                rows={3}
              />
              <button type="button" className="secondary-btn detail-note-save" onClick={() => void saveNote()} data-testid="detail-note-save">
                保存备注
              </button>
            </div>
            <div className="detail-ai">
              <button type="button" className="ai-card-btn" data-testid="detail-ai-gen" onClick={() => setAiUnavailableOpen(true)}>
                <Sparkles size={15} />
                AI 详细设定
              </button>
              <p className="ai-panel-sub">当前桌面版暂不提供 AI 在线生成，入口会保留以便后续恢复。</p>
            </div>
            <div className="detail-actions">
              <button type="button" className="secondary-btn" data-testid="detail-copy" onClick={() => void copyItem(selected)}>
                <Copy size={15} />
                复制
              </button>
              <button
                type="button"
                className="secondary-btn"
                data-testid="detail-tosheet"
                onClick={() => {
                  const c = selected;
                  if (!c) return;
                  const f = candidateToSheetFields(c);
                  closeDetail();
                  onOpenEditor({
                    characterName: c.nameText,
                    race: c.race,
                    candidateId: c.id,
                    occupation: f.occupation,
                    office: f.office,
                    hometown: f.hometown,
                    nickname: f.nickname,
                    contractTitle: f.contractTitle,
                    note: f.note,
                  });
                }}
              >
                <UserPlus size={15} />
                加入设定
              </button>
              <button type="button" className="danger-btn" data-testid="detail-delete" onClick={() => void startDelete(selected)}>
                <Trash2 size={15} />
                删除
              </button>
            </div>
          </div>
        ) : null}
      </BottomSheet>

      {/* 删除确认（被引用时提示） */}
      <ConfirmDialog
        open={!!deleteTarget && !blockedRefs}
        onOpenChange={(open) => !open && (setDeleteTarget(null), setBlockedRefs(null))}
        title="删除这条命名？"
        description={`删除后将从候选库移除「${deleteTarget?.nameText ?? ''}」，此操作不可撤销。`}
        confirmText="删除"
        destructive
        testId="delete-confirm"
        onConfirm={() => void forceDelete()}
      />
      <ConfirmDialog
        open={!!deleteTarget && !!blockedRefs}
        onOpenChange={(open) => !open && (setDeleteTarget(null), setBlockedRefs(null))}
        title="该名称已被设定引用"
        description={
          <span>
            「{deleteTarget?.nameText ?? ''}」正被用于：
            <ul className="ref-list">
              {blockedRefs?.asCharacter ? <li>人物设定（角色名）</li> : null}
              {blockedRefs?.asHometown ? <li>人物设定（籍贯）</li> : null}
              {blockedRefs?.asPlace ? <li>关系图谱（地名节点）</li> : null}
            </ul>
            解除引用后删除，将同时清除设定中的对应引用与相关图谱关系。
          </span>
        }
        confirmText={deleting ? '删除中…' : '解除引用后删除'}
        destructive
        testId="delete-blocked-confirm"
        onConfirm={() => void forceDelete()}
      />
      <ConfirmDialog
        open={aiUnavailableOpen}
        onOpenChange={setAiUnavailableOpen}
        title="AI 详细设定暂不可用"
        description="当前桌面版不接入 AI 服务。入口已保留，你可以继续手动填写备注与设定卡。"
        confirmText="知道了"
        showCancel={false}
        testId="ai-unavailable"
        onConfirm={() => setAiUnavailableOpen(false)}
      />
    </div>
  );
}
