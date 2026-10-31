// 设定工作台：设定卡列表 + 新建/编辑入口（删除移至编辑界面顶部）
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw } from 'lucide-react';
import { fetchSheets } from '@/lib/db';
import type { Sheet } from '@/lib/types';
import { GENDER_LABELS, RACE_LABELS } from '@/lib/types';
import { EmptyState, Seal } from '@/components/common';
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
        ) : items.length === 0 ? (
          <EmptyState
            title="还没有设定卡"
            desc="为生成的命名建立人物设定，记录职业、官职、籍贯、绰号与人物关系"
            testId="sheets-empty"
            actions={
              <button type="button" className="primary-btn" data-testid="sheets-empty-new" onClick={() => onOpenEditor()}>
                新建设定
              </button>
            }
          />
        ) : (
          <div className="sheet-list">
            <p className="list-count" data-testid="sheets-count">
              共 {items.length} 张设定卡
            </p>
            {items.map((s) => (
              <div key={s.id} className="sheet-card" data-testid={`sheet-${s.id}`}>
                <div className="sheet-card-top">
                  <Seal race={s.race} size={24} />
                  <div className="sheet-main">
                    <p className="sheet-name">{s.characterName || '未命名人物'}</p>
                    <p className="sheet-meta">
                      {RACE_LABELS[s.race]}
                      {s.gender ? ` · ${GENDER_LABELS[s.gender]}` : ''} · 关系 {s.relationCount}
                    </p>
                  </div>
                  <div className="sheet-actions">
                    <button type="button" className="icon-btn" title="编辑" data-testid={`sheet-edit-${s.id}`} onClick={() => onOpenEditor(undefined, s.id)}>
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
                {s.occupation || s.office || s.hometown || s.nickname || s.contractTitle ? (
                  <div className="sheet-tags">
                    {s.occupation ? <span className="sheet-tag">职 · {s.occupation}</span> : null}
                    {s.office ? <span className="sheet-tag">官 · {s.office}</span> : null}
                    {s.hometown ? <span className="sheet-tag">籍 · {s.hometown}</span> : null}
                    {s.nickname ? <span className="sheet-tag">号 · {s.nickname}</span> : null}
                    {s.contractTitle ? <span className="sheet-tag">契 · {s.contractTitle}</span> : null}
                  </div>
                ) : null}
                {s.note ? <p className="sheet-note">{s.note}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
