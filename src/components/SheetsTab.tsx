// 设定工作台：紧凑表格 + 平铺筛选（族群与搜索）+ 新建/编辑入口（删除移至编辑界面顶部）
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
import { fetchSheets } from '@/lib/db';
import type { RaceKey, Sheet } from '@/lib/types';
import { GENDER_LABELS, RACE_KEYS, RACE_LABELS } from '@/lib/types';
import { Chip, EmptyState, Seal } from '@/components/common';
import { cn } from '@/lib/utils';
import type { EditorPrefill } from '@/components/GenerateTab';

interface SheetsTabProps {
  refreshKey: number;
  onOpenEditor: (prefill?: EditorPrefill, sheetId?: string) => void;
}

export function SheetsTab({ refreshKey, onOpenEditor }: SheetsTabProps) {
  const [items, setItems] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [race, setRace] = useState<RaceKey | 'all'>('all');
  const [keyword, setKeyword] = useState('');

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await fetchSheets();
      setItems(list);
      setError('');
    } catch (err) {
      setError((err as Error)?.message || '加载失败，请重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLocaleLowerCase('zh-CN');
    return items.filter((sheet) => {
      if (race !== 'all' && sheet.race !== race) return false;
      if (!kw) return true;
      return [sheet.characterName, sheet.occupation, sheet.hometown, sheet.note]
        .join(' ')
        .toLocaleLowerCase('zh-CN')
        .includes(kw);
    });
  }, [items, race, keyword]);

  return (
    <div className="page-shell sheets-page">
      <div className="app-scroll">
        <div className="sheets-header">
          <p className="sheets-title">设定卡</p>
          <div className="sheets-actions">
            <button type="button" className="secondary-btn sheets-new" data-testid="sheets-new" onClick={() => onOpenEditor()}>
              <Plus size={15} />
              新增
            </button>
            <button type="button" className="icon-btn" title="刷新" data-testid="sheets-refresh" onClick={() => void reload({ silent: true })}>
              <RefreshCw size={16} className={cn(refreshing && 'spin')} />
            </button>
          </div>
        </div>

        {/* 平铺筛选：只保留族群与搜索 */}
        <div className="sheets-filter-row" data-testid="sheets-filters">
          <div className="filter-chips">
            {(['all', ...RACE_KEYS] as Array<RaceKey | 'all'>).map((r) => (
              <Chip key={r} selected={race === r} tone={r === 'all' ? 'neutral' : r} onClick={() => setRace(r)} dataTestId={`sheets-race-${r}`}>
                {r === 'all' ? '全部' : RACE_LABELS[r]}
              </Chip>
            ))}
          </div>
          <div className="keyword-row sheets-search">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="keyword-input"
              placeholder="搜索人物名、职业、籍贯、备注"
              value={keyword}
              data-testid="sheets-search"
              onChange={(e) => setKeyword(e.target.value)}
            />
            {keyword ? (
              <button type="button" className="keyword-clear" data-testid="sheets-search-clear" onClick={() => setKeyword('')}>
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="error-bar" data-testid="sheets-error">
            {error}
            <button type="button" className="retry-link" onClick={() => void reload()}>
              重试
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="list-loading">正在翻阅设定…</div>
        ) : filtered.length === 0 ? (
          items.length === 0 ? (
            <EmptyState
              title="还没有设定卡"
              desc="为生成的命名建立人物设定，记录职业、籍贯与人物关系"
              testId="sheets-empty"
              actions={
                <button type="button" className="primary-btn" data-testid="sheets-empty-new" onClick={() => onOpenEditor()}>
                  新建设定
                </button>
              }
            />
          ) : (
            <EmptyState title="没有符合筛选的设定卡" desc="试试切换族群或清空搜索关键词" testId="sheets-filter-empty" />
          )
        ) : (
          <div className="data-table-wrap">
            <p className="list-count" data-testid="sheets-count">
              共 {filtered.length} 张设定卡
            </p>
            <table className="data-table sheets-table">
              <thead>
                <tr>
                  <th>人物名</th>
                  <th>族群</th>
                  <th>性别</th>
                  <th>职业</th>
                  <th>籍贯</th>
                  <th>关系</th>
                  <th>备注</th>
                  <th className="data-table-actions-head">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} data-testid={`sheet-${s.id}`}>
                    <td>
                      <div className="data-table-name">
                        <Seal race={s.race} size={18} />
                        <span>{s.characterName || '未命名人物'}</span>
                      </div>
                    </td>
                    <td>{RACE_LABELS[s.race]}</td>
                    <td>{s.gender ? GENDER_LABELS[s.gender] : '—'}</td>
                    <td className="data-table-ellipsis" title={s.occupation || undefined}>
                      {s.occupation || '—'}
                    </td>
                    <td className="data-table-ellipsis" title={s.hometown || undefined}>
                      {s.hometown || '—'}
                    </td>
                    <td>{s.relationCount}</td>
                    <td className="data-table-ellipsis data-table-note" title={s.note || undefined}>
                      {s.note || '—'}
                    </td>
                    <td>
                      <button type="button" className="icon-btn" title="编辑" data-testid={`sheet-edit-${s.id}`} onClick={() => onOpenEditor(undefined, s.id)}>
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
