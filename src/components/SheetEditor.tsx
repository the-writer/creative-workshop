// 设定卡编辑器（全屏子页）：手动填写人物名、绑定项与关系管理（保存后可用）
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { addRelation, deleteSheet, fetchPlaces, fetchRelations, fetchSheets, removeRelation, saveSheet } from '@/lib/db';
import { LEXICON } from '@/data/lexicon';
import type { NameGender, Place, RaceKey, Relation } from '@/lib/types';
import {
  GENDER_LABELS,
  RACE_KEYS,
  RACE_LABELS,
  RELATION_TYPES,
  SELF_RELATION_TARGET_ID,
  SHEET_GENDER_KEYS,
} from '@/lib/types';
import { Chip, ConfirmDialog, Seal, SectionTitle, useAppToast } from '@/components/common';
import { cn } from '@/lib/utils';
import type { EditorPrefill } from '@/components/GenerateTab';

interface SheetEditorProps {
  sheetId: string | null;
  prefill: EditorPrefill | null;
  onBack: () => void;
  onSaved: () => void;
}

interface RelTarget {
  id: string;
  name: string;
  race: RaceKey;
  self?: boolean;
}

export function SheetEditor({ sheetId, prefill, onBack, onSaved }: SheetEditorProps) {
  const toast = useAppToast();
  const [loaded, setLoaded] = useState(!sheetId);
  const [savedId, setSavedId] = useState<string | null>(sheetId);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [characterName, setCharacterName] = useState(prefill?.characterName ?? '');
  const [race, setRace] = useState<RaceKey>(prefill?.race ?? 'human');
  // 新建设定默认选中人权男性
  const [gender, setGender] = useState<NameGender | ''>(prefill?.gender ?? 'male');
  const [candidateId, setCandidateId] = useState(prefill?.candidateId ?? '');
  const [occupation, setOccupation] = useState(prefill?.occupation ?? '');
  const [hometownIds, setHometownIds] = useState<string[]>([]);
  const [note, setNote] = useState(prefill?.note ?? '');
  const [places, setPlaces] = useState<Place[]>([]);

  // 关系
  const [relations, setRelations] = useState<Relation[]>([]);
  const [removeTarget, setRemoveTarget] = useState<Relation | null>(null);
  const [relTargets, setRelTargets] = useState<RelTarget[]>([]);
  const [relTargetId, setRelTargetId] = useState<string | null>(null);
  const [relType, setRelType] = useState<string>('师徒');
  const [relCustom, setRelCustom] = useState('');
  const [addingRel, setAddingRel] = useState(false);
  // 新建模式下尚未保存的关系，保存设定卡后一并写入
  const [pendingRelations, setPendingRelations] = useState<Array<{ key: string; target: RelTarget; relationType: string; note: string }>>([]);

  // 初始加载：编辑模式回填；新建模式应用预填
  useEffect(() => {
    void (async () => {
      try {
        const [placeList, sheets, rels] = await Promise.all([fetchPlaces(), fetchSheets(), fetchRelations()]);
        setPlaces(placeList);
        if (sheetId) {
          const s = sheets.find((x) => x.id === sheetId);
          if (!s) {
            setLoadError('未找到该设定卡');
            return;
          }
          setCharacterName(s.characterName);
          setRace(s.race);
          setGender(s.gender ?? '');
          setCandidateId(s.candidateId);
          setOccupation(s.occupation);
          setHometownIds(s.hometownIds);
          setNote(s.note);
          setRelations(rels.filter((r) => r.fromId === sheetId || r.toId === sheetId));
        }
        const selfTarget: RelTarget = {
          id: sheetId ?? SELF_RELATION_TARGET_ID,
          name: prefill?.characterName?.trim() || '未命名人物',
          race: prefill?.race ?? 'human',
          self: true,
        };
        setRelTargets([selfTarget, ...sheets.filter((s) => s.id !== sheetId).map((s) => ({ id: s.id, name: s.characterName || '未命名人物', race: s.race }))]);
      } catch (err) {
        setLoadError((err as Error)?.message || '加载失败，请重试');
      } finally {
        setLoaded(true);
      }
    })();
    // App 通过 key 保证每个 sheetId 单独挂载，仅需执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPlaces = useMemo(() => {
    const byId = new Map(places.map((place) => [place.id, place]));
    return hometownIds.map((id) => byId.get(id)).filter((place): place is Place => Boolean(place));
  }, [hometownIds, places]);

  const relTargetList = useMemo(() => {
    const self: RelTarget = {
      id: savedId ?? SELF_RELATION_TARGET_ID,
      name: characterName.trim() || '未命名人物',
      race,
      self: true,
    };
    return [self, ...relTargets.filter((target) => !target.self)];
  }, [relTargets, savedId, characterName, race]);

  const resolveRelationType = () => (relType === '其他' ? relCustom.trim() || '其他' : relType);

  const handleAddRelation = async () => {
    if (!relTargetId) {
      toast.show('请先选择关联人物', 'info');
      return;
    }
    const target = relTargetList.find((t) => t.id === relTargetId);
    if (!target) {
      toast.show('关联对象已失效，请重新选择', 'info');
      return;
    }
    const targetName = target.self ? characterName.trim() || '未命名人物' : target.name;
    const relationType = resolveRelationType();
    if (!savedId) {
      if (pendingRelations.some((p) => p.target.id === target.id && p.relationType === relationType)) {
        toast.show('该关系已在待保存列表', 'info');
        return;
      }
      setPendingRelations((prev) => [
        ...prev,
        { key: `pending-${Date.now()}-${prev.length}`, target: { ...target, name: targetName }, relationType, note: '' },
      ]);
      setRelTargetId(null);
      setRelCustom('');
      toast.show('关系将在保存设定后一并添加', 'success');
      return;
    }
    setAddingRel(true);
    try {
      const res = await addRelation({
        fromType: 'sheet',
        fromId: savedId,
        fromName: characterName.trim() || '未命名人物',
        toType: 'sheet',
        toId: target.self ? savedId : target.id,
        toName: targetName,
        relationType,
        note: '',
      });
      if (res.ok) {
        toast.show('关系已添加', 'success');
        setRelTargetId(null);
        setRelCustom('');
        try {
          const rels = await fetchRelations();
          setRelations(rels.filter((r) => r.fromId === savedId || r.toId === savedId));
        } catch {
          // 忽略刷新失败
        }
      } else {
        toast.show(res.message || '添加失败，请重试', 'error');
      }
    } catch (err) {
      toast.show((err as Error)?.message || '添加失败，请重试', 'error');
    } finally {
      setAddingRel(false);
    }
  };

  const handleRemoveRelation = async () => {
    if (!removeTarget) return;
    const res = await removeRelation(removeTarget.id);
    const target = removeTarget;
    setRemoveTarget(null);
    if (res.ok) {
      setRelations((prev) => prev.filter((r) => r.id !== target.id));
      toast.show('关系已解除', 'success');
    } else {
      toast.show(res.message || '解除失败，请重试', 'error');
    }
  };

  const handleDelete = async () => {
    if (!savedId) return;
    setDeleting(true);
    const res = await deleteSheet(savedId);
    setDeleting(false);
    setConfirmDelete(false);
    if (res.ok) {
      toast.show('已删除设定并解除全部关系', 'success');
      onSaved();
    } else {
      toast.show(res.message || '删除失败，请重试', 'error');
    }
  };

  const handleSave = async () => {
    const name = characterName.trim();
    if (!name) {
      toast.show('请填写人物名', 'error');
      return;
    }
    setSaving(true);
    try {
      const hometown = selectedPlaces.map((place) => place.name).join('、');
      const res = await saveSheet({
        id: savedId ?? undefined,
        characterName: name,
        race,
        gender: gender || undefined,
        candidateId,
        occupation: occupation.trim(),
        hometown,
        hometownIds,
        note: note.trim(),
      });
      if (!res.ok) {
        toast.show(res.message || '保存失败，请重试', 'error');
        return;
      }
      // 已选好目标但还没点「添加关系」时，保存一并写入，避免「关联自己」看起来没生效
      const queued = [...pendingRelations];
      const selected = relTargetId ? relTargetList.find((t) => t.id === relTargetId) : undefined;
      if (selected) {
        const relationType = resolveRelationType();
        const toId = selected.self ? res.id : selected.id;
        const addedAlready =
          relations.some((r) => r.fromId === res.id && r.toId === toId && r.relationType === relationType) ||
          queued.some((p) => p.target.self === selected.self && (selected.self || p.target.id === selected.id) && p.relationType === relationType);
        if (!addedAlready) {
          queued.push({
            key: `selected-${Date.now()}`,
            target: { ...selected, name: selected.self ? name : selected.name },
            relationType,
            note: '',
          });
        }
      }
      let failed = 0;
      for (const pending of queued) {
        try {
          const relRes = await addRelation({
            fromType: 'sheet',
            fromId: res.id,
            fromName: name,
            toType: 'sheet',
            toId: pending.target.self ? res.id : pending.target.id,
            toName: pending.target.self ? name : pending.target.name,
            relationType: pending.relationType,
            note: pending.note,
          });
          if (!relRes.ok) failed += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) toast.show(`设定已保存，${failed} 条关系添加失败`, 'error');
      else toast.show('设定已保存', 'success');
      onSaved();
    } catch (err) {
      toast.show((err as Error)?.message || '保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  const requestBack = () => {
    if (dirty || pendingRelations.length > 0) setConfirmLeave(true);
    else onBack();
  };

  const setRaceByClick = (r: RaceKey) => {
    setRace(r);
    setDirty(true);
    if (candidateId) setCandidateId('');
  };

  const toggleHometown = (id: string) => {
    setHometownIds((prev) => (prev.includes(id) ? prev.filter((placeId) => placeId !== id) : [...prev, id]));
    setDirty(true);
  };


  return (
    <div className="editor-page" data-testid="sheet-editor">
      <div className="editor-topbar">
        <button type="button" className="icon-btn" data-testid="editor-back" onClick={requestBack}>
          <ArrowLeft size={20} />
        </button>
        <p className="editor-title">{sheetId ? '编辑设定卡' : '新建设定卡'}</p>
        {savedId ? (
          <button type="button" className="editor-save-btn" data-testid="editor-delete" onClick={() => setConfirmDelete(true)}>
            删除
          </button>
        ) : null}
      </div>

      {loadError ? (
        <div className="error-bar" data-testid="editor-error">
          {loadError}
        </div>
      ) : null}

      <div className="editor-scroll">
        {/* 人物 */}
        <div className="editor-section">
          <SectionTitle>人物</SectionTitle>
          <div className="form-row">
            <span className="form-label">族群</span>
            <div className="filter-chips">
              {RACE_KEYS.map((r) => (
                <Chip key={r} selected={race === r} tone={r} onClick={() => setRaceByClick(r)} dataTestId={`editor-race-${r}`}>
                  {RACE_LABELS[r]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="form-row">
            <span className="form-label">性别</span>
            <div className="filter-chips">
              {SHEET_GENDER_KEYS.map((g) => (
                <Chip
                  key={g}
                  selected={gender === g}
                  tone="neutral"
                  dataTestId={`editor-gender-${g}`}
                  onClick={() => {
                    setGender((prev) => (prev === g ? '' : g));
                    setDirty(true);
                  }}
                >
                  {GENDER_LABELS[g]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="form-row">
            <span className="form-label">人物名</span>
            <input
              type="text"
              className="form-input"
              value={characterName}
              placeholder="手动填写人物名"
              data-testid="editor-name"
              onChange={(e) => {
                setCharacterName(e.target.value);
                setCandidateId('');
                setDirty(true);
              }}
            />
          </div>
        </div>

        {/* 绑定项 */}
        <div className="editor-section">
          <SectionTitle>绑定项</SectionTitle>
          <div className="form-row">
            <span className="form-label">职业</span>
            <input
              type="text"
              list="editor-occupation-list"
              className="form-input"
              value={occupation}
              placeholder="如 剑修、药师"
              data-testid="editor-occupation"
              onChange={(e) => {
                setOccupation(e.target.value);
                setDirty(true);
              }}
            />
            <datalist id="editor-occupation-list">
              {LEXICON[race].professions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="form-row form-row-top">
            <span className="form-label">籍贯</span>
            <div className="hometown-picker" data-testid="editor-hometown">
              {places.length === 0 ? (
                <p className="source-hint">暂无地名，可先到“地名”页添加</p>
              ) : (
                <div className="filter-chips">
                  {places.map((place) => (
                    <Chip
                      key={place.id}
                      selected={hometownIds.includes(place.id)}
                      tone={race}
                      dataTestId={`editor-hometown-${place.id}`}
                      onClick={() => toggleHometown(place.id)}
                    >
                      {place.name}
                    </Chip>
                  ))}
                </div>
              )}
              {selectedPlaces.length > 0 ? <p className="source-hint">已选：{selectedPlaces.map((place) => place.name).join('、')}</p> : null}
            </div>
          </div>
          <div className="form-row">
            <span className="form-label">备注</span>
            <textarea
              className="form-textarea"
              rows={3}
              value={note}
              placeholder="人物背景、经历或用途"
              data-testid="editor-note"
              onChange={(e) => {
                setNote(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </div>

        {/* 关系 */}
        <div className="editor-section">
          <SectionTitle right={<span className="section-sub">关系 {relations.length + pendingRelations.length}</span>}>关系</SectionTitle>
          {relations.length + pendingRelations.length > 0 ? (
            <div className="relation-list">
              {relations.map((r) => {
                const isSelf = r.fromId === savedId && r.toId === savedId;
                const otherName = isSelf ? '自己' : r.fromId === savedId ? r.toName : r.fromName;
                return (
                  <div key={r.id} className="relation-item">
                    <div className="relation-item-main">
                      <p className="relation-item-line">
                        {otherName} <span className="relation-type-badge">{r.relationType}</span>
                      </p>
                      {r.note ? <p className="relation-item-note">{r.note}</p> : null}
                    </div>
                    <button type="button" className="icon-btn" title="解除关系" data-testid={`relation-del-${r.id}`} onClick={() => setRemoveTarget(r)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              {pendingRelations.map((p) => (
                <div key={p.key} className="relation-item" data-testid={`relation-pending-${p.key}`}>
                  <div className="relation-item-main">
                    <p className="relation-item-line">
                      {p.target.self ? '自己' : p.target.name} <span className="relation-type-badge">{p.relationType}</span>
                      <span className="section-sub">待保存</span>
                    </p>
                    {p.note ? <p className="relation-item-note">{p.note}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    title="移除待保存关系"
                    data-testid={`relation-pending-del-${p.key}`}
                    onClick={() => setPendingRelations((prev) => prev.filter((item) => item.key !== p.key))}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="source-hint">暂无关系，可在下方添加{savedId ? '' : '（保存设定后一并写入）'}</p>
          )}
          <div className="relation-add">
            {relTargetList.length > 0 ? (
              <div className="relation-target-list">
                {relTargetList.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={cn('relation-target', relTargetId === t.id && 'relation-target-selected')}
                    data-testid={`rel-target-${t.id}`}
                    onClick={() => setRelTargetId(t.id)}
                  >
                    <Seal race={t.self ? race : t.race} size={16} />
                    {t.self ? `自己（${characterName.trim() || '未命名人物'}）` : t.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="source-hint">暂无其他人物设定</p>
            )}
            <div className="filter-chips">
              {RELATION_TYPES.map((t) => (
                <Chip key={t} selected={relType === t} tone="neutral" onClick={() => setRelType(t)} dataTestId={`rel-type-${t}`}>
                  {t}
                </Chip>
              ))}
            </div>
            {relType === '其他' ? (
              <input
                type="text"
                className="form-input"
                value={relCustom}
                placeholder="自定义关系（可选，留空则为「其他」）"
                data-testid="rel-custom"
                onChange={(e) => setRelCustom(e.target.value)}
              />
            ) : null}
            <button
              type="button"
              className="secondary-btn relation-add-btn"
              data-testid="rel-add"
              disabled={addingRel}
              onClick={() => void handleAddRelation()}
            >
              {addingRel ? '添加中…' : '添加关系'}
            </button>
          </div>
        </div>
      </div>

      <div className="editor-footer">
        <button
          type="button"
          className="generate-btn"
          data-testid="editor-save-bottom"
          disabled={saving || !!loadError || !loaded}
          onClick={() => void handleSave()}
        >
          {saving ? '正在保存…' : '保存设定'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(false)}
        title="删除这张设定卡？"
        description={`删除「${characterName.trim() || '未命名人物'}」将同时解除其全部关系连线，此操作不可撤销。`}
        confirmText={deleting ? '删除中…' : '删除'}
        destructive
        testId="editor-delete-confirm"
        onConfirm={() => void handleDelete()}
      />

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={(open) => !open && setConfirmLeave(false)}
        title="离开编辑？"
        description="当前修改尚未保存，离开后将丢失。"
        confirmText="离开"
        destructive
        testId="editor-leave-confirm"
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
      />

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="解除这条关系？"
        description={`解除与「${removeTarget ? (removeTarget.fromId === removeTarget.toId ? '自己' : removeTarget.fromId === savedId ? removeTarget.toName : removeTarget.fromName) : ''}」的${removeTarget?.relationType ?? ''}关系，图谱连线将移除。`}
        confirmText="解除"
        destructive
        testId="relation-remove-confirm"
        onConfirm={() => void handleRemoveRelation()}
      />
    </div>
  );
}
