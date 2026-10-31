// 设定卡编辑器（全屏子页）：人物来源三选、绑定项、关系管理（保存后可用）
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, Trash2, X } from 'lucide-react';
import { addRelation, deleteSheet, fetchCandidates, fetchRelations, fetchSheets, removeRelation, saveSheet } from '@/lib/db';
import { LEXICON } from '@/data/lexicon';
import { DEFAULT_GEN_PARAMS, genOffice, genPerson } from '@/lib/generator';
import type { Candidate, NameGender, RaceKey, Relation } from '@/lib/types';
import {
  FILTER_MAX_CHARS,
  GENDER_LABELS,
  RACE_KEYS,
  RACE_LABELS,
  RELATION_TYPES,
  SELF_RELATION_TARGET_ID,
  SHEET_GENDER_KEYS,
  TYPE_LABELS,
  candidateToSheetFields,
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

type SourceMode = 'manual' | 'pick' | 'quick';
type PickKind = 'person' | 'place';

interface RelTarget {
  id: string;
  name: string;
  type: 'sheet' | 'place';
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
  const [gender, setGender] = useState<NameGender | ''>(prefill?.gender ?? '');
  const [candidateId, setCandidateId] = useState(prefill?.candidateId ?? '');
  const [sourceMode, setSourceMode] = useState<SourceMode>('manual');
  const [occupation, setOccupation] = useState(prefill?.occupation ?? '');
  const [office, setOffice] = useState(prefill?.office ?? '');
  const [hometown, setHometown] = useState(prefill?.hometown ?? '');
  const [hometownCandidateId, setHometownCandidateId] = useState('');
  const [nickname, setNickname] = useState(prefill?.nickname ?? '');
  const [contractTitle, setContractTitle] = useState(prefill?.contractTitle ?? '');
  const [note, setNote] = useState(prefill?.note ?? '');

  // 人物来源
  const [picker, setPicker] = useState<PickKind | null>(null);
  const [pickItems, setPickItems] = useState<Candidate[]>([]);
  const [picking, setPicking] = useState(false);
  const [quickOptions, setQuickOptions] = useState<Array<{ name: string; race: RaceKey }>>([]);

  // 关系
  const [relations, setRelations] = useState<Relation[]>([]);
  const [removeTarget, setRemoveTarget] = useState<Relation | null>(null);
  const [relTab, setRelTab] = useState<'sheet' | 'place'>('sheet');
  const [relTargets, setRelTargets] = useState<RelTarget[]>([]);
  const [relTargetId, setRelTargetId] = useState<string | null>(null);
  const [relType, setRelType] = useState<string>('师徒');
  const [relCustom, setRelCustom] = useState('');
  const [addingRel, setAddingRel] = useState(false);
  // 新建模式下尚未保存的关系，保存设定卡后一并写入
  const [pendingRelations, setPendingRelations] = useState<Array<{ key: string; target: RelTarget; relationType: string; note: string }>>([]);

  // 初始加载：编辑模式回填；新建模式应用预填
  useEffect(() => {
    if (sheetId) {
      void (async () => {
        try {
          const [sheets, rels] = await Promise.all([fetchSheets(), fetchRelations()]);
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
          setOffice(s.office);
          setHometown(s.hometown);
          setHometownCandidateId(s.hometownCandidateId);
          setNickname(s.nickname);
          setContractTitle(s.contractTitle);
          setNote(s.note);
          setRelations(rels.filter((r) => r.fromId === sheetId || r.toId === sheetId));
        } catch (err) {
          setLoadError((err as Error)?.message || '加载失败，请重试');
        } finally {
          setLoaded(true);
        }
      })();
    }
    // App 通过 key 保证每个 sheetId 单独挂载，仅需执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 现场生成选项（族群变化时换一批）
  useEffect(() => {
    const opts: Array<{ name: string; race: RaceKey }> = [];
    const seen = new Set<string>();
    let guard = 0;
    while (opts.length < 3 && guard < 60) {
      guard += 1;
      const g = genPerson(race, DEFAULT_GEN_PARAMS);
      if (g && !seen.has(g.name)) {
        seen.add(g.name);
        opts.push({ name: g.name, race });
      }
    }
    setQuickOptions(opts);
  }, [race]);

  const refreshQuick = () => {
    const opts: Array<{ name: string; race: RaceKey }> = [];
    const seen = new Set<string>();
    let guard = 0;
    while (opts.length < 3 && guard < 60) {
      guard += 1;
      const g = genPerson(race, DEFAULT_GEN_PARAMS);
      if (g && !seen.has(g.name)) {
        seen.add(g.name);
        opts.push({ name: g.name, race });
      }
    }
    setQuickOptions(opts);
  };

  const openPicker = async (kind: PickKind) => {
    setPicker(kind);
    setPicking(true);
    try {
      const list = await fetchCandidates({ race: 'all', nameType: kind, minChars: 1, maxChars: FILTER_MAX_CHARS, status: 'all', keyword: '', sort: 'latest' });
      setPickItems(list.slice(0, 200));
    } catch (err) {
      toast.show((err as Error)?.message || '加载候选失败', 'error');
      setPickItems([]);
    } finally {
      setPicking(false);
    }
  };

  const pickFromCandidate = (c: Candidate) => {
    if (c.nameType === 'place') {
      setHometown(c.nameText);
      setHometownCandidateId(c.id);
    } else {
      setCharacterName(c.nameText);
      setRace(c.race);
      if (c.gender && c.gender !== 'any') setGender(c.gender);
      setCandidateId(c.id);
      setSourceMode('pick');
      // 候选库中除名字外的设定项（职业/官职/绰号/契约/能力等）一并带入，不覆盖已填内容
      const f = candidateToSheetFields(c);
      if (f.occupation && !occupation) setOccupation(f.occupation);
      if (f.office && !office) setOffice(f.office);
      if (f.hometown && !hometown) setHometown(f.hometown);
      if (f.nickname && !nickname) setNickname(f.nickname);
      if (f.contractTitle && !contractTitle) setContractTitle(f.contractTitle);
      if (f.note && !note) setNote(f.note);
    }
    setDirty(true);
    setPicker(null);
  };

  const nickPool = useMemo(() => {
    const roots = LEXICON[race];
    const arr = [...roots.nickProfession, ...roots.nickAppearance, ...roots.nickDeed, ...roots.nickTerrain, ...roots.nickContract];
    return Array.from(new Set(arr)).slice(0, 40);
  }, [race]);

  const officeSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = 0; i < 24 && out.length < 8; i += 1) {
      const g = genOffice(race);
      if (!seen.has(g.name)) {
        seen.add(g.name);
        out.push(g.name);
      }
    }
    return out;
  }, [race]);

  const loadRelTargets = async (tab: 'sheet' | 'place') => {
    const selfTarget: RelTarget = {
      id: savedId ?? SELF_RELATION_TARGET_ID,
      name: characterName.trim() || '未命名人物',
      type: 'sheet',
      race,
      self: true,
    };
    try {
      if (tab === 'sheet') {
        const sheets = await fetchSheets();
        setRelTargets([
          selfTarget,
          ...sheets.filter((s) => s.id !== savedId).map((s) => ({ id: s.id, name: s.characterName || '未命名人物', type: 'sheet' as const, race: s.race })),
        ]);
      } else {
        const list = await fetchCandidates({
          race: 'all',
          nameType: 'place',
          minChars: 1,
          maxChars: FILTER_MAX_CHARS,
          status: 'all',
          keyword: '',
          sort: 'latest',
        });
        setRelTargets(list.slice(0, 200).map((c) => ({ id: c.id, name: c.nameText, type: 'place' as const, race: c.race })));
      }
    } catch {
      // 读取其他设定失败时仍保留「自己」，确保关联自身可用
      setRelTargets(tab === 'sheet' ? [selfTarget] : []);
    }
  };

  // 初始加载人物目标，让「自己」与已有设定在进入编辑器时即可选择
  useEffect(() => {
    void loadRelTargets('sheet');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchRelTab = (tab: 'sheet' | 'place') => {
    setRelTab(tab);
    setRelTargetId(null);
    void loadRelTargets(tab);
  };

  const resolveRelationType = () => (relType === '其他' ? relCustom.trim() || '其他' : relType);

  const handleAddRelation = async () => {
    if (!relTargetId) {
      toast.show('请先选择关联对象', 'info');
      return;
    }
    const target = relTargets.find((t) => t.id === relTargetId);
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
        toType: target.type,
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
        void loadRelTargets(relTab);
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
      const res = await saveSheet({
        id: savedId ?? undefined,
        characterName: name,
        race,
        gender: gender || undefined,
        candidateId,
        occupation: occupation.trim(),
        office: office.trim(),
        hometown: hometown.trim(),
        hometownCandidateId,
        nickname: nickname.trim(),
        contractTitle: contractTitle.trim(),
        note: note.trim(),
      });
      if (!res.ok) {
        toast.show(res.message || '保存失败，请重试', 'error');
        return;
      }
      // 已选好目标但还没点「添加关系」时，保存一并写入，避免「关联自己」看起来没生效
      const queued = [...pendingRelations];
      const selected = relTargetId ? relTargets.find((t) => t.id === relTargetId) : undefined;
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
            toType: pending.target.type,
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
    if (candidateId) {
      setCandidateId('');
      setSourceMode('manual');
    }
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
              placeholder="手动填写，或从下方来源选择"
              data-testid="editor-name"
              onChange={(e) => {
                setCharacterName(e.target.value);
                setCandidateId('');
                setSourceMode('manual');
                setDirty(true);
              }}
            />
          </div>
          <div className="segmented source-seg">
            {(
              [
                ['manual', '手动填写'],
                ['pick', '候选库选择'],
                ['quick', '现场生成'],
              ] as Array<[SourceMode, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={cn('seg-btn', sourceMode === k && 'seg-btn-active')}
                data-testid={`editor-source-${k}`}
                onClick={() => setSourceMode(k)}
              >
                {label}
              </button>
            ))}
          </div>

          {sourceMode === 'pick' ? (
            <div className="source-block">
              <button type="button" className="secondary-btn" data-testid="editor-open-person-picker" onClick={() => void openPicker('person')}>
                从候选库选择人物
              </button>
              {candidateId ? (
                <p className="source-selected">
                  已选：{characterName}
                  <button
                    type="button"
                    className="link-btn"
                    data-testid="editor-pick-clear"
                    onClick={() => {
                      setCandidateId('');
                      setSourceMode('manual');
                      setDirty(true);
                    }}
                  >
                    清除
                  </button>
                </p>
              ) : null}
            </div>
          ) : null}

          {sourceMode === 'quick' ? (
            <div className="source-block">
              <div className="quick-gen-row">
                {quickOptions.map((o) => (
                  <button
                    key={o.name}
                    type="button"
                    className="quick-gen-option"
                    data-testid={`editor-quick-${o.name}`}
                    onClick={() => {
                      setCharacterName(o.name);
                      setRace(o.race);
                      setCandidateId('');
                      setSourceMode('quick');
                      setDirty(true);
                    }}
                  >
                    {o.name}
                  </button>
                ))}
                <button type="button" className="icon-btn" title="换一批" data-testid="editor-quick-reroll" onClick={refreshQuick}>
                  <RefreshCw size={15} />
                </button>
              </div>
              <p className="source-hint">按当前规则现场成稿，选中后仍可手动修改</p>
            </div>
          ) : null}

          {picker ? (
            <div className="picker-panel" data-testid={`picker-${picker}`}>
              <div className="picker-head">
                <span>{picker === 'person' ? '候选库 · 人物' : '候选库 · 地名'}</span>
                <button type="button" className="icon-btn" data-testid="picker-close" onClick={() => setPicker(null)}>
                  <X size={15} />
                </button>
              </div>
              {picking ? (
                <p className="list-loading">正在翻谱…</p>
              ) : pickItems.length === 0 ? (
                <p className="source-hint">暂无候选，可先到生成页产出</p>
              ) : (
                <div className="picker-list">
                  {pickItems.map((c) => (
                    <button key={c.id} type="button" className="picker-row" data-testid={`picker-item-${c.id}`} onClick={() => pickFromCandidate(c)}>
                      <Seal race={c.race} size={18} />
                      <span className="picker-name">{c.nameText}</span>
                      <span className="picker-meta">
                        {TYPE_LABELS[c.nameType]} · {c.charCount}字
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
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
          <div className="form-row">
            <span className="form-label">官职</span>
            <input
              type="text"
              list="editor-office-list"
              className="form-input"
              value={office}
              placeholder="如 山岚执事"
              data-testid="editor-office"
              onChange={(e) => {
                setOffice(e.target.value);
                setDirty(true);
              }}
            />
            <datalist id="editor-office-list">
              {officeSuggestions.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </div>
          <div className="form-row">
            <span className="form-label">籍贯</span>
            <div className="form-inline">
              <input
                type="text"
                className="form-input"
                value={hometown}
                placeholder="手动填写或从候选库选择地名"
                data-testid="editor-hometown"
                onChange={(e) => {
                  setHometown(e.target.value);
                  setHometownCandidateId('');
                  setDirty(true);
                }}
              />
              <button type="button" className="secondary-btn form-inline-btn" data-testid="editor-open-place-picker" onClick={() => void openPicker('place')}>
                选地名
              </button>
            </div>
          </div>
          <div className="form-row">
            <span className="form-label">绰号</span>
            <input
              type="text"
              list="editor-nick-list"
              className="form-input"
              value={nickname}
              placeholder="如 白发、破军"
              data-testid="editor-nickname"
              onChange={(e) => {
                setNickname(e.target.value);
                setDirty(true);
              }}
            />
            <datalist id="editor-nick-list">
              {nickPool.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div className="form-row">
            <span className="form-label">契约称号</span>
            <input
              type="text"
              list="editor-contract-list"
              className="form-input"
              value={contractTitle}
              placeholder="如 血契、誓约"
              data-testid="editor-contract"
              onChange={(e) => {
                setContractTitle(e.target.value);
                setDirty(true);
              }}
            />
            <datalist id="editor-contract-list">
              {LEXICON[race].contractTitles.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
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
            <div className="segmented">
              {(
                [
                  ['sheet', '关联人物'],
                  ['place', '关联地名'],
                ] as Array<['sheet' | 'place', string]>
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={cn('seg-btn', relTab === k && 'seg-btn-active')}
                  data-testid={`rel-tab-${k}`}
                  onClick={() => switchRelTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            {relTargets.length > 0 ? (
              <div className="relation-target-list">
                {relTargets.map((t) => (
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
              <p className="source-hint">{relTab === 'sheet' ? '暂无其他人物设定' : '暂无地名候选，可先到生成页产出地名'}</p>
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
