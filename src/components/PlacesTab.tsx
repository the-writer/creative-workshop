// 地名管理：独立于人物候选库的地名表格 + 平铺筛选（族群与搜索）+ 新增/编辑/删除
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { deletePlace, fetchPlaces, savePlace } from '@/lib/db';
import type { Place, RaceKey } from '@/lib/types';
import { RACE_KEYS, RACE_LABELS } from '@/lib/types';
import { Chip, ConfirmDialog, EmptyState, Seal, useAppToast } from '@/components/common';
import { cn } from '@/lib/utils';

interface PlaceDraft {
  id?: string;
  name: string;
  race: RaceKey;
  note: string;
  structure?: Place['structure'];
}

const EMPTY_DRAFT: PlaceDraft = { name: '', race: 'human', note: '' };

function placeCharCount(name: string): number {
  return Array.from(name.replace(/·/g, '')).length;
}

export function PlacesTab({ refreshKey }: { refreshKey: number }) {
  const toast = useAppToast();
  const [items, setItems] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [race, setRace] = useState<RaceKey | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Place | null>(null);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    try {
      setItems(await fetchPlaces());
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
    return items.filter((place) => {
      if (race !== 'all' && place.race !== race) return false;
      if (!kw) return true;
      return `${place.name} ${place.note}`.toLocaleLowerCase('zh-CN').includes(kw);
    });
  }, [items, race, keyword]);

  const handleSave = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      toast.show('请填写地名', 'error');
      return;
    }
    setSaving(true);
    const res = await savePlace({ id: draft.id, name, race: draft.race, structure: draft.structure, note: draft.note });
    setSaving(false);
    if (res.ok) {
      toast.show(draft.id ? '地名已更新' : '地名已添加', 'success');
      setDraft(null);
      void reload({ silent: true });
    } else {
      toast.show(res.message || '保存失败，请重试', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await deletePlace(deleteTarget.id);
    setDeleteTarget(null);
    if (res.ok) {
      toast.show('地名已删除', 'success');
      void reload({ silent: true });
    } else {
      toast.show(res.message || '删除失败，请重试', 'error');
    }
  };

  return (
    <div className="page-shell places-page">
      <div className="app-scroll">
        <div className="sheets-header">
          <p className="sheets-title">地名</p>
          <div className="sheets-actions">
            <button type="button" className="secondary-btn sheets-new" data-testid="places-new" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              <Plus size={15} />
              新增
            </button>
            <button type="button" className="icon-btn" title="刷新" data-testid="places-refresh" onClick={() => void reload({ silent: true })}>
              <RefreshCw size={16} className={cn(refreshing && 'spin')} />
            </button>
          </div>
        </div>

        <div className="sheets-filter-row" data-testid="places-filters">
          <div className="filter-chips">
            {(['all', ...RACE_KEYS] as Array<RaceKey | 'all'>).map((r) => (
              <Chip key={r} selected={race === r} tone={r === 'all' ? 'neutral' : r} onClick={() => setRace(r)} dataTestId={`places-race-${r}`}>
                {r === 'all' ? '全部' : RACE_LABELS[r]}
              </Chip>
            ))}
          </div>
          <div className="keyword-row sheets-search">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="keyword-input"
              placeholder="搜索地名或备注"
              value={keyword}
              data-testid="places-search"
              onChange={(e) => setKeyword(e.target.value)}
            />
            {keyword ? (
              <button type="button" className="keyword-clear" data-testid="places-search-clear" onClick={() => setKeyword('')}>
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="error-bar" data-testid="places-error">
            {error}
            <button type="button" className="retry-link" onClick={() => void reload()}>
              重试
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="list-loading">正在翻阅地名…</div>
        ) : filtered.length === 0 ? (
          items.length === 0 ? (
            <EmptyState
              title="还没有地名"
              desc="在生成页选择“地名”生成后加入，或直接在此新增"
              testId="places-empty"
              actions={
                <button type="button" className="primary-btn" data-testid="places-empty-new" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
                  新增地名
                </button>
              }
            />
          ) : (
            <EmptyState title="没有符合筛选的地名" desc="试试切换族群或清空搜索关键词" testId="places-filter-empty" />
          )
        ) : (
          <div className="data-table-wrap">
            <p className="list-count" data-testid="places-count">
              共 {filtered.length} 个地名
            </p>
            <table className="data-table places-table">
              <thead>
                <tr>
                  <th>地名</th>
                  <th>族群</th>
                  <th>字数</th>
                  <th>备注</th>
                  <th className="data-table-actions-head">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((place) => (
                  <tr key={place.id} data-testid={`place-${place.id}`}>
                    <td>
                      <div className="data-table-name">
                        <Seal race={place.race} size={18} />
                        <span>{place.name}</span>
                      </div>
                    </td>
                    <td>{RACE_LABELS[place.race]}</td>
                    <td>{placeCharCount(place.name)}字</td>
                    <td className="data-table-ellipsis data-table-note" title={place.note || undefined}>
                      {place.note || '—'}
                    </td>
                    <td>
                      <div className="data-table-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="编辑"
                          data-testid={`place-edit-${place.id}`}
                          onClick={() => setDraft({ id: place.id, name: place.name, race: place.race, note: place.note, structure: place.structure })}
                        >
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="icon-btn" title="删除" data-testid={`place-delete-${place.id}`} onClick={() => setDeleteTarget(place)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {draft ? (
        <div
          className="modal-layer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDraft(null);
          }}
        >
          <section className="confirm-dialog place-dialog" role="dialog" aria-modal="true" data-testid="place-dialog">
            <h2 className="dialog-title">{draft.id ? '编辑地名' : '新增地名'}</h2>
            <div className="form-row">
              <span className="form-label">地名</span>
              <input
                type="text"
                className="form-input"
                value={draft.name}
                placeholder="手动填写地名"
                data-testid="place-name"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="form-row">
              <span className="form-label">族群</span>
              <div className="filter-chips">
                {RACE_KEYS.map((r) => (
                  <Chip key={r} selected={draft.race === r} tone={r} onClick={() => setDraft({ ...draft, race: r })} dataTestId={`place-race-opt-${r}`}>
                    {RACE_LABELS[r]}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="form-row">
              <span className="form-label">备注</span>
              <textarea
                className="form-textarea"
                rows={3}
                value={draft.note}
                placeholder="地名背景、地貌或用途"
                data-testid="place-note"
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>
            <div className="dialog-actions">
              <button type="button" className="secondary-btn" onClick={() => setDraft(null)}>
                取消
              </button>
              <button type="button" className="primary-btn" disabled={saving} data-testid="place-save" onClick={() => void handleSave()}>
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除这个地名？"
        description={`删除「${deleteTarget?.name ?? ''}」后，人物设定中的籍贯引用会一并移除，此操作不可撤销。`}
        confirmText="删除"
        destructive
        testId="place-delete-confirm"
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
