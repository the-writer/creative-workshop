// 候选库：筛选面板 + 谱页列表 + 详情抽屉 + 增删改查与备注

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, FilterX, RefreshCw, Search, Sparkles, Star, Trash2, UserPlus } from 'lucide-react';
import Markdown from 'react-markdown';
import { deleteCandidate, fetchCandidates, updateCandidate } from '@/lib/db';
import type { Candidate, CandidateFilters, NameTypeKey, RaceKey, SortKey, StatusFilterKey } from '@/lib/types';
import { DEFAULT_FILTERS, FILTER_MAX_CHARS, RACE_LABELS, TYPE_LABELS, candidateToSheetFields, raceLabel } from '@/lib/types';
import { Chip, ConfirmDialog, EmptyState, Seal, StructureTags, copyText, formatTime, useAppToast } from '@/components/common';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { exportNameListTxt } from '@/lib/export';
import type { EditorPrefill } from '@/components/GenerateTab';

interface LibraryTabProps {
  refreshKey: number;
  onOpenEditor: (prefill: EditorPrefill) => void;
  onGoGenerate: () => void;
}

const FILTERS_KEY = 'mingpu_library_filters_v1';

// AI 详细设定：系统提示词（世界观命名规则）与单条候选的参数组装
const AI_SYSTEM_PROMPT = [
  '你是一位严谨的世界观设定写手，擅长为虚构族群撰写鲜活、自洽的人物详细设定。',
  '必须遵循以下世界观命名规则：',
  '1. 书写：全部禁用间隔点，正式全名连写或身份词前置。',
  '2. 音系：同一族群只用同一套短音节，不混现实国家姓名。',
  '3. 地名：用地形、方位、自然词加后缀，不用国、王国、帝国等称呼。',
  '4. 官职：用地点或部落加职权加层级后缀构成。',
  '5. 绰号：来自职业、外貌、事迹、地形、契约，控制在 2 到 8 字。',
  '6. 场景：正式文书用全名，口头用短名，行会用绰号，任职用官职加短名。',
  '输出要求：用中文与 markdown 结构（小节标题用 ##），总篇幅约 350 字，',
  '分「身份背景」「外貌气质」「职业专长」「特殊能力表现与代价」「性格与传闻」「名号由来」等小节。',
  '不要编造与给定名称构成相冲突的内容，不要使用现实国名、现代词汇或现实人名。',
].join('\n');

function buildLibraryAiPrompt(c: Candidate): string {
  const parts = (c.structure ?? []).map((p) => `${p.label}：${p.word}`).join('；') || '（无）';
  const prof = (c.structure ?? []).find((p) => p.label === '营生' || p.label === '职业')?.word;
  const ability = (c.structure ?? []).find((p) => p.label === '特殊能力')?.word;
  return [
    '请为以下角色撰写详细文字设定：',
    `族群：${raceLabel(c.race)}`,
    `名称：${c.nameText}`,
    `名称构成：${parts}`,
    `类型：${TYPE_LABELS[c.nameType] ?? '组合设定'}`,
    `职业：${prof ?? '未指定'}`,
    `特殊能力：${ability ?? '未指定'}`,
  ].join('\n');
}

function loadFilters(): CandidateFilters {
  const fallback = { ...DEFAULT_FILTERS };
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<CandidateFilters>;
    const result: CandidateFilters = {
      race: p.race === 'human' || p.race === 'demon' ? p.race : 'all',
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
    // 旧版本默认筛选（1-12 字）会漏掉长名与组合设定句，等同未设置，升级为新默认
    if (
      result.race === 'all' &&
      result.nameType === 'all' &&
      result.minChars === 1 &&
      result.maxChars === 12 &&
      result.status === 'all' &&
      result.keyword === '' &&
      result.sort === 'latest'
    ) {
      return { ...DEFAULT_FILTERS };
    }
    return result;
  } catch {
    return fallback;
  }
}

export function LibraryTab({ refreshKey, onOpenEditor, onGoGenerate }: LibraryTabProps) {
  const toast = useAppToast();
  const [filters, setFilters] = useState<CandidateFilters>(loadFilters);
  const [kwDraft, setKwDraft] = useState(loadFilters().keyword);
  const [panelOpen, setPanelOpen] = useState(false);
  const [items, setItems] = useState<Candidate[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [drawerNote, setDrawerNote] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const aiControllerRef = useRef<AbortController | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Candidate | null>(null);
  const [blockedRefs, setBlockedRefs] = useState<{ asCharacter: boolean; asHometown: boolean; asPlace: boolean } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportingTxt, setExportingTxt] = useState(false);
  const loadSeq = useRef(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      // 忽略
    }
  }, [filters]);

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
    setAiText('');
    setAiError('');
    setAiLoading(false);
  };

  const closeDetail = () => {
    aiControllerRef.current?.abort();
    aiControllerRef.current = null;
    setSelected(null);
    setAiText('');
    setAiError('');
    setAiLoading(false);
  };

  // AI 详细设定：流式生成，自动写入备注并保存到候选库
  const runAi = async () => {
    const c = selected;
    if (!c) return;
    aiControllerRef.current?.abort();
    const controller = new AbortController();
    aiControllerRef.current = controller;
    setAiLoading(true);
    setAiError('');
    setAiText('');
    try {
      const api = window.lingguang?.ai?.streamChat;
      if (!api) throw new Error('当前环境暂不支持 AI 生成，请稍后重试');
      const result = await api({
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: buildLibraryAiPrompt(c) },
        ],
        responseFormat: { type: 'text' },
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'text_delta') {
            setAiText(event.text);
            setDrawerNote(event.text);
          }
          if (event.type === 'error') setAiError(event.message || 'AI 生成失败，请重试');
        },
      });
      const finalText = result && typeof result.content === 'string' && result.content ? result.content : '';
      if (finalText) {
        setAiText(finalText);
        setDrawerNote(finalText);
        const res = await updateCandidate(c.id, { note: finalText });
        if (res.ok) {
          setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, note: finalText } : x)));
          toast.show('AI 设定已写入备注并保存', 'success');
        } else {
          toast.show(res.message || 'AI 设定已生成，但备注保存失败，请手动保存', 'error');
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setAiError(err instanceof Error ? err.message : 'AI 生成失败，请重试');
    } finally {
      if (!controller.signal.aborted) setAiLoading(false);
    }
  };

  const retryAi = () => {
    if (!selected) return;
    void runAi();
  };

  const copyAiText = async () => {
    if (!aiText) return;
    const ok = await copyText(aiText);
    toast.show(ok ? 'AI 设定已复制' : '复制失败，请长按文本手动复制', ok ? 'success' : 'error');
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
    setDeleteTarget(c);
    setBlockedRefs(null);
    const res = await deleteCandidate(c.id, false);
    if (res.ok) {
      setDeleteTarget(null);
      toast.show('已删除', 'success');
      void reload({ silent: true });
    } else if (res.refs) {
      setBlockedRefs(res.refs);
    } else {
      setDeleteTarget(null);
      toast.show(res.message || '删除失败，请重试', 'error');
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

  const handleExportTxt = async () => {
    setExportingTxt(true);
    const res = await exportNameListTxt(items);
    setExportingTxt(false);
    if (res.ok) toast.show(`已导出 ${res.fileName}`, 'success');
    else toast.show(res.message || '导出失败', 'error');
  };

  return (
    <div className="page-shell library-page">
      <div className="app-scroll">
        {/* 筛选入口条 */}
        <div className="filter-bar">
          <button type="button" className="filter-toggle" onClick={() => setPanelOpen((v) => !v)} data-testid="filter-toggle">
            <span className="material-icons">filter_list</span>
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
            <button type="button" className="icon-btn" title="导出当前清单" data-testid="library-export" disabled={exportingTxt || items.length === 0} onClick={() => void handleExportTxt()}>
              <Download size={16} />
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
                    ['demon', '妖族'],
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
                <span className="material-icons search-icon">search</span>
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
                    <span className="material-icons">close</span>
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
          <div className="library-list">
            <p className="list-count" data-testid="library-count">
              共 {items.length} 条
            </p>
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
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={cn('icon-btn', c.favorite && 'faved')}
                    title={c.favorite ? '取消收藏' : '收藏'}
                    data-testid={`row-fav-${c.id}`}
                    onClick={() => void toggleFavorite(c)}
                  >
                    <Star size={16} fill={c.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button type="button" className="icon-btn" title="删除" data-testid={`row-del-${c.id}`} onClick={() => void startDelete(c)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 详情抽屉 */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && closeDetail()}>
        <SheetContent side="bottom" className="detail-sheet" data-testid="detail-sheet">
          <SheetHeader>
            <SheetTitle className="detail-sheet-title">命名详情</SheetTitle>
          </SheetHeader>
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
              <StructureTags parts={selected.structure} race={selected.race} />
              <div className="detail-note">
                <label className="detail-label" htmlFor="detail-note-input">
                  备注（AI 设定生成后自动写入此处）
                </label>
                <textarea id="detail-note-input" className="detail-textarea" value={drawerNote} onChange={(e) => setDrawerNote(e.target.value)} data-testid="detail-note" placeholder="写下这个命名的用途或灵感，或点击下方 AI 设定自动生成" rows={3} />
                <button type="button" className="secondary-btn detail-note-save" onClick={() => void saveNote()} data-testid="detail-note-save">
                  保存备注
                </button>
              </div>
              <div className="detail-ai">
                <button type="button" className="ai-card-btn" data-testid="detail-ai-gen" disabled={aiLoading} onClick={() => void runAi()}>
                  <Sparkles size={15} />
                  {aiLoading ? '正在撰写…' : aiText ? '重新生成 AI 设定' : 'AI 详细设定'}
                </button>
                <p className="ai-panel-sub">整合世界观命名规则撰写详细设定，生成内容自动写入备注并保存。</p>
                <div className="ai-panel-body">
                  {aiLoading && !aiText ? <div className="ai-loading">正在起笔撰写…</div> : null}
                  {aiError && !aiText ? <div className="ai-error">{aiError}</div> : null}
                  {aiText ? (
                    <div className="ai-content">
                      <Markdown>{aiText}</Markdown>
                    </div>
                  ) : null}
                  {aiLoading && aiText ? <div className="ai-cursor" /> : null}
                </div>
                {aiText ? (
                  <div className="detail-ai-actions">
                    <button type="button" className="secondary-btn" onClick={retryAi} disabled={aiLoading} data-testid="detail-ai-retry">
                      <RefreshCw size={14} />
                      重新生成
                    </button>
                    <button type="button" className="secondary-btn" onClick={() => void copyAiText()} disabled={!aiText} data-testid="detail-ai-copy">
                      <Copy size={14} />
                      复制设定
                    </button>
                  </div>
                ) : null}
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
        </SheetContent>
      </Sheet>

      {/* 删除确认（被引用时提示） */}
      <ConfirmDialog
        open={!!deleteTarget && !blockedRefs}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
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
    </div>
  );
}