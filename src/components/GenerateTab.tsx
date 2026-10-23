// 生成页：族群/类型/规则选择 + 批量生成引擎 + 名称笺结果区 + 单条保存/收藏/复制/换一批

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Badge,
  ChevronDown,
  Copy,
  Info,
  MapPin,
  Minus,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  SlidersHorizontal,
  Star,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react';
import { DEFAULT_GEN_PARAMS, generateBatch, rerollCombo, rerollOne, type GenParams, type PersonSuffix, type ShortMode } from '@/lib/generator';
import { computeCombinationTotals, formatCombination, LEXICON } from '@/data/lexicon';
import { insertCandidate } from '@/lib/db';
import type { Candidate, NameTypeKey, RaceKey } from '@/lib/types';
import { RACE_LABELS, TYPE_LABELS, candidateToSheetFields, raceLabel } from '@/lib/types';
import { Chip, EmptyState, Seal, SectionTitle, StructureTags, copyText, useAppToast } from '@/components/common';
import { cn } from '@/lib/utils';

export interface EditorPrefill {
  characterName: string;
  race: RaceKey;
  candidateId: string;
  occupation?: string;
  office?: string;
  hometown?: string;
  nickname?: string;
  contractTitle?: string;
  note?: string;
}

interface GenerateTabProps {
  onOpenEditor: (prefill: EditorPrefill) => void;
}

interface GenPrefs {
  race: RaceKey;
  types: NameTypeKey[];
  params: GenParams;
}

function normalizePrefs(raw: unknown): GenPrefs {
  const fallback: GenPrefs = { race: 'human', types: ['person'], params: { ...DEFAULT_GEN_PARAMS } };
  try {
    if (!raw || typeof raw !== 'object') return fallback;
    const parsed = raw as Partial<GenPrefs>;
    const params = { ...DEFAULT_GEN_PARAMS, ...(parsed.params ?? {}) };
    params.professions = Array.isArray(params.professions) ? params.professions.filter((s) => typeof s === 'string') : [];
    params.abilities = Array.isArray(params.abilities) ? params.abilities.filter((s) => typeof s === 'string') : [];
    params.nicknameSources = Array.isArray(params.nicknameSources) ? params.nicknameSources.filter((s) => typeof s === 'string') : [];
    params.nicknameChars =
      typeof params.nicknameChars === 'number' ? Math.max(2, Math.min(8, Math.round(params.nicknameChars))) : DEFAULT_GEN_PARAMS.nicknameChars;
    params.minChars = typeof params.minChars === 'number' ? Math.max(2, Math.min(8, Math.round(params.minChars))) : DEFAULT_GEN_PARAMS.minChars;
    params.maxChars = typeof params.maxChars === 'number' ? Math.max(2, Math.min(8, Math.round(params.maxChars))) : DEFAULT_GEN_PARAMS.maxChars;
    return {
      race: parsed.race === 'demon' ? 'demon' : 'human',
      types:
        Array.isArray(parsed.types) && parsed.types.some((t) => ['person', 'place', 'office', 'nickname'].includes(t))
          ? parsed.types.filter((t) => ['person', 'place', 'office', 'nickname'].includes(t))
          : ['person'],
      params,
    };
  } catch {
    return fallback;
  }
}

const TYPE_ICONS: Record<NameTypeKey, ReactNode> = {
  person: <UserRound size={15} />,
  place: <MapPin size={15} />,
  office: <ScrollText size={15} />,
  nickname: <Badge size={15} />,
};

const NICK_SOURCE_OPTIONS: Array<[string, string]> = [
  ['profession', '职业'],
  ['appearance', '外貌'],
  ['deed', '事迹'],
  ['terrain', '地形'],
  ['contract', '契约'],
];

export function GenerateTab({ onOpenEditor }: GenerateTabProps) {
  const toast = useAppToast();
  const [prefs, setPrefs] = useState<GenPrefs>({ race: 'human', types: ['person'], params: { ...DEFAULT_GEN_PARAMS } });
  const [prefsReady, setPrefsReady] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [results, setResults] = useState<Candidate[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchStats, setBatchStats] = useState<{ total: number; deduped: number } | null>(null);
  const [validateError, setValidateError] = useState('');
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);

  const { race, types, params } = prefs;

  useEffect(() => {
    void window.workshop.preferences
      .get('generator')
      .then((raw) => setPrefs(normalizePrefs(raw)))
      .catch(() => undefined)
      .finally(() => setPrefsReady(true));
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    void window.workshop.preferences.set('generator', prefs).catch(() => undefined);
  }, [prefs, prefsReady]);

  const combination = useMemo(() => computeCombinationTotals(), []);
  const comboFoot = useMemo(() => {
    const raceInfo = combination.perRace[race];
    const typeCount =
      types.length > 0
        ? types.reduce(
            (sum, t) => sum + (t === 'person' ? raceInfo.person : t === 'place' ? raceInfo.place : t === 'office' ? raceInfo.office : raceInfo.nickname),
            0n,
          )
        : 0n;
    return typeCount;
  }, [combination, race, types]);

  const setRace = (r: RaceKey) =>
    setPrefs((p) => ({
      ...p,
      race: r,
      params: {
        ...p.params,
        professions: p.params.professions.filter((value) => LEXICON[r].professions.includes(value)),
        abilities: p.params.abilities.filter((value) => LEXICON[r].abilities.includes(value)),
      },
    }));
  const toggleType = (t: NameTypeKey) =>
    setPrefs((p) => {
      const has = p.types.includes(t);
      const next = has ? p.types.filter((x) => x !== t) : [...p.types, t];
      return { ...p, types: next.length > 0 ? next : p.types };
    });
  const setParams = (patch: Partial<GenParams>) => setPrefs((p) => ({ ...p, params: { ...p.params, ...patch } }));

  const toggleProfession = (p: string) =>
    setPrefs((s) => ({
      ...s,
      params: {
        ...s.params,
        professions: s.params.professions.includes(p) ? s.params.professions.filter((x) => x !== p) : [...s.params.professions, p],
      },
    }));

  const toggleAbility = (a: string) =>
    setPrefs((s) => ({
      ...s,
      params: {
        ...s.params,
        abilities: s.params.abilities.includes(a) ? s.params.abilities.filter((x) => x !== a) : [...s.params.abilities, a],
      },
    }));

  const toggleNickSource = (k: string) =>
    setPrefs((s) => ({
      ...s,
      params: {
        ...s.params,
        nicknameSources: s.params.nicknameSources.includes(k) ? s.params.nicknameSources.filter((x) => x !== k) : [...s.params.nicknameSources, k],
      },
    }));

  // ---- 候选详情 ----
  const closeDetail = () => {
    setDetailIdx(null);
  };

  // 更新指定候选的备注（保存入谱时带入候选库）
  const patchNote = (index: number, note: string) => {
    setResults((prev) => {
      const next = [...prev];
      const item = next[index];
      if (!item) return prev;
      next[index] = { ...item, note };
      return next;
    });
  };

  const openDetail = (index: number) => {
    const c = results[index];
    if (!c) return;
    setDetailIdx(index);
  };

  const batchKey = (c: Candidate) => (c.combo ? `${c.race}|combo|${c.nameText}` : `${c.race}|${c.nameType}|${c.nameText}`);

  const comboMode = types.length > 1;

  const validate = (): string => {
    if (types.length === 0) return '请至少选择一种名称类型';
    if (params.count < 5 || params.count > 100) return '生成数量需在 5 到 100 之间';
    if (!comboMode) {
      if (params.minChars > params.maxChars) return '全名字数范围冲突：最少字数不能大于最多字数';
      if (params.nicknamePrefix && types.includes('person') && params.nicknameChars + 2 > params.maxChars) {
        return '绰号前置时绰号加至少 2 字短名已超出全名字数上限，请调低绰号字数或放宽上限';
      }
    }
    return '';
  };

  const handleGenerate = () => {
    const err = validate();
    if (err) {
      setValidateError(err);
      return;
    }
    setValidateError('');
    setIsGenerating(true);
    window.setTimeout(() => {
      const res = generateBatch(race, types, params);
      setResults(res.candidates);
      if (res.candidates.length === 0) {
        setValidateError('当前规则下没有符合条件的名称，请调整规则（如放宽人名全名字数）');
        setIsGenerating(false);
        return;
      }
      setBatchStats({ total: res.total, deduped: res.deduped });
      setSavedKeys(new Set());
      setDetailIdx(null);
      setIsGenerating(false);
    }, 420);
  };

  const saveOne = async (c: Candidate, favorite: boolean) => {
    const key = batchKey(c);
    if (savedKeys.has(key)) {
      toast.show('该名称已在库中', 'info');
      return;
    }
    setSavingKeys((prev) => new Set(prev).add(key));
    const res = await insertCandidate({
      race: c.race,
      nameType: c.nameType,
      nameText: c.nameText,
      structure: c.structure,
      source: 'generated',
      favorite,
      note: c.note,
    });
    setSavingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (res.ok) {
      setSavedKeys((prev) => new Set(prev).add(key));
      toast.show(favorite ? '已收藏入候选库' : '已藏入候选库', 'success');
    } else if (res.duplicate) {
      setSavedKeys((prev) => new Set(prev).add(key));
      toast.show(res.message || '该名称已在库中', 'info');
    } else {
      toast.show(res.message || '保存失败，请重试', 'error');
    }
  };

  const saveAll = async () => {
    const unsaved = results.filter((c) => !savedKeys.has(batchKey(c)));
    if (unsaved.length === 0) {
      toast.show('本批均已入谱', 'info');
      return;
    }
    setSavingAll(true);
    let okCount = 0;
    for (const c of unsaved) {
      const res = await insertCandidate({
        race: c.race,
        nameType: c.nameType,
        nameText: c.nameText,
        structure: c.structure,
        source: 'generated',
        favorite: false,
        note: c.note,
      });
      if (res.ok || res.duplicate) {
        setSavedKeys((prev) => new Set(prev).add(batchKey(c)));
        okCount += 1;
      }
    }
    setSavingAll(false);
    toast.show(
      `本批已入谱 ${okCount} 条${okCount < unsaved.length ? `，${unsaved.length - okCount} 条失败` : ''}`,
      okCount === unsaved.length ? 'success' : 'error',
    );
  };

  const rerollItem = (index: number) => {
    setResults((prev) => {
      const next = [...prev];
      const item = next[index];
      if (!item) return prev;
      const excludes = new Set(prev.map(batchKey));
      const got = item.combo ? rerollCombo(item.race, types, params, excludes) : rerollOne(item.race, item.nameType, params, excludes);
      if (!got) {
        toast.show('已穷尽组合，请调整规则', 'info');
        return prev;
      }
      const key = batchKey(item);
      setSavedKeys((prevKeys) => {
        const nextKeys = new Set(prevKeys);
        nextKeys.delete(key);
        return nextKeys;
      });
      next[index] = { ...item, nameText: got.name, charCount: got.name.length, structure: got.structure, note: '', id: `tmp_${Date.now()}_${index}` };
      return next;
    });
  };

  const copyItem = async (c: Candidate) => {
    const ok = await copyText(c.nameText);
    toast.show(ok ? `已复制「${c.nameText}」` : `复制失败，请长按名称手动复制：${c.nameText}`, ok ? 'success' : 'error');
  };

  const addToSheet = (c: Candidate) => {
    const anchor = c.combo ? (c.structure[0]?.word ?? c.nameText) : c.nameText;
    const f = candidateToSheetFields(c);
    onOpenEditor({
      characterName: anchor,
      race: c.race,
      candidateId: c.id.startsWith('tmp_') ? '' : c.id,
      occupation: f.occupation,
      office: f.office,
      hometown: f.hometown,
      nickname: f.nickname,
      contractTitle: f.contractTitle,
      note: f.note,
    });
  };

  const restoreDefaults = () => {
    setParams({ ...DEFAULT_GEN_PARAMS, count: params.count });
  };

  const hasPerson = types.includes('person');
  const showNickRules = types.includes('nickname') || (hasPerson && params.nicknamePrefix);

  return (
    <div className="page-shell generate-page">
      <div className="app-scroll">
        {/* 族群印章 */}
        <div className="race-seal-row">
          {(Object.keys(RACE_LABELS) as RaceKey[]).map((r) => (
            <button
              key={r}
              type="button"
              data-testid={`race-select-${r}`}
              className={cn('race-seal-card', race === r && `race-seal-selected seal-card-${r}`)}
              onClick={() => setRace(r)}
            >
              <Seal race={r} size={46} />
              <span className="race-seal-name">{RACE_LABELS[r]}</span>
            </button>
          ))}
        </div>

        {/* 类型选择 */}
        <SectionTitle>名称类型</SectionTitle>
        <div className="type-chip-row">
          {(Object.keys(TYPE_LABELS) as NameTypeKey[]).map((t) => (
            <Chip key={t} selected={types.includes(t)} tone={race} onClick={() => toggleType(t)} dataTestId={`type-select-${t}`}>
              {TYPE_ICONS[t]}
              {TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
        {comboMode ? (
          <p className="combo-hint" data-testid="combo-hint">
            已选多种类型：将组合成一句设定，如「人名，任官职，居某地，以营生为业，擅特殊能力，绰号…」
          </p>
        ) : null}

        {/* 职业与特殊能力 */}
        <SectionTitle>职业与特殊能力</SectionTitle>
        <div className="param-panel">
          <div className="param-group">
            <div className="param-group-head">
              <span className="param-group-label">职业</span>
              <span className="param-group-count">{params.professions.length > 0 ? `已选 ${params.professions.length}` : '未设定'}</span>
              {params.professions.length > 0 ? (
                <button type="button" className="param-clear-btn" data-testid="clear-professions" onClick={() => setParams({ professions: [] })}>
                  清空
                </button>
              ) : null}
            </div>
            <div className="param-chip-wrap">
              {LEXICON[race].professions.map((p) => (
                <Chip
                  key={p}
                  selected={params.professions.includes(p)}
                  tone={race}
                  className="param-chip"
                  dataTestId={`prof-${p}`}
                  onClick={() => toggleProfession(p)}
                >
                  {p}
                </Chip>
              ))}
            </div>
          </div>
          <div className="param-group">
            <div className="param-group-head">
              <span className="param-group-label">特殊能力</span>
              <span className="param-group-count">{params.abilities.length > 0 ? `已选 ${params.abilities.length}` : '未设定'}</span>
              {params.abilities.length > 0 ? (
                <button type="button" className="param-clear-btn" data-testid="clear-abilities" onClick={() => setParams({ abilities: [] })}>
                  清空
                </button>
              ) : null}
            </div>
            <div className="param-chip-wrap">
              {LEXICON[race].abilities.map((a) => (
                <Chip
                  key={a}
                  selected={params.abilities.includes(a)}
                  tone={race}
                  className="param-chip"
                  dataTestId={`ability-${a}`}
                  onClick={() => toggleAbility(a)}
                >
                  {a}
                </Chip>
              ))}
            </div>
          </div>
          <p className="param-hint">不勾选时生成会随机抽取；所选职业与能力会融入组合设定。</p>
        </div>

        {/* 规则设置 */}
        <div className="rules-panel">
          <button type="button" className="rules-toggle" onClick={() => setRulesOpen((v) => !v)} data-testid="rules-toggle">
            <SlidersHorizontal size={15} />
            <span>规则设置</span>
            <span className="rules-summary">
              {params.count}条 · 短名{params.shortMode === 'two' ? '2字' : params.shortMode === 'three' ? '3字' : '2-3字'}
            </span>
            <ChevronDown size={15} className={cn('rules-chevron', rulesOpen && 'rules-chevron-open')} />
          </button>
          {rulesOpen ? (
            <div className="rules-body">
              {/* 数量 */}
              <div className="rule-row">
                <span className="rule-label">生成数量</span>
                <div className="stepper">
                  <button type="button" className="stepper-btn" data-testid="count-minus" onClick={() => setParams({ count: Math.max(5, params.count - 5) })}>
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    className="stepper-input"
                    value={params.count}
                    min={5}
                    max={100}
                    data-testid="count-input"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v)) setParams({ count: Math.max(5, Math.min(100, Math.round(v))) });
                    }}
                  />
                  <button type="button" className="stepper-btn" data-testid="count-plus" onClick={() => setParams({ count: Math.min(100, params.count + 5) })}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* 短名块数 */}
              <div className="rule-row">
                <span className="rule-label">短名块数</span>
                <div className="segmented">
                  {(
                    [
                      ['two', '2字'],
                      ['three', '3字'],
                      ['mix', '2-3字'],
                    ] as Array<[ShortMode, string]>
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      className={cn('seg-btn', params.shortMode === k && 'seg-btn-active')}
                      data-testid={`shortmode-${k}`}
                      onClick={() => setParams({ shortMode: k })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {hasPerson && !comboMode ? (
                <>
                  {/* 人名后缀 */}
                  <div className="rule-row">
                    <span className="rule-label">人名后缀</span>
                    <div className="segmented">
                      {(
                        [
                          ['father', '父名'],
                          ['place', '地名'],
                          ['profession', '职业'],
                          ['contract', '契约称号'],
                          ['blood', '血统'],
                          ['title', '封号'],
                        ] as Array<[PersonSuffix, string]>
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          className={cn('seg-btn', params.personSuffix === k && 'seg-btn-active')}
                          data-testid={`personsuffix-${k}`}
                          onClick={() => setParams({ personSuffix: k })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 绰号前置 */}
                  <div className="rule-row">
                    <span className="rule-label">绰号前置</span>
                    <button
                      type="button"
                      className={cn('switch-btn', params.nicknamePrefix && 'switch-btn-on')}
                      data-testid="nickname-prefix"
                      onClick={() => setParams({ nicknamePrefix: !params.nicknamePrefix })}
                    >
                      <span className="switch-knob" />
                    </button>
                  </div>
                </>
              ) : null}

              {showNickRules ? (
                <div className="rule-row">
                  <span className="rule-label">绰号字数</span>
                  <div className="segmented">
                    {([2, 3, 4, 5, 6, 7, 8] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={cn('seg-btn', params.nicknameChars === k && 'seg-btn-active')}
                        data-testid={`nickchars-${k}`}
                        onClick={() => setParams({ nicknameChars: k })}
                      >
                        {k}字
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {showNickRules ? (
                <div className="rule-row">
                  <span className="rule-label">绰号来源</span>
                  <div className="segmented">
                    {NICK_SOURCE_OPTIONS.map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        className={cn('seg-btn', params.nicknameSources.includes(k) && 'seg-btn-active')}
                        data-testid={`nicksrc-${k}`}
                        onClick={() => toggleNickSource(k)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 全名字数范围（组合模式不限制，仅单类型人名时生效） */}
              {!comboMode ? (
                <div className="rule-row">
                  <span className="rule-label">人名全名字数</span>
                  <div className="range-inputs">
                    <input
                      type="number"
                      className="range-input"
                      value={params.minChars}
                      min={2}
                      max={8}
                      data-testid="chars-min"
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v)) setParams({ minChars: Math.max(2, Math.min(8, Math.round(v))) });
                      }}
                    />
                    <span className="range-sep">至</span>
                    <input
                      type="number"
                      className="range-input"
                      value={params.maxChars}
                      min={2}
                      max={8}
                      data-testid="chars-max"
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (!Number.isNaN(v)) setParams({ maxChars: Math.max(2, Math.min(8, Math.round(v))) });
                      }}
                    />
                    <span className="range-note">字（名字与外号最大均 8 字）</span>
                  </div>
                </div>
              ) : null}

              <button type="button" className="reset-rules" onClick={restoreDefaults} data-testid="reset-rules">
                恢复默认规则
              </button>
            </div>
          ) : null}
        </div>

        {validateError ? (
          <div className="error-bar" data-testid="generate-error">
            {validateError}
          </div>
        ) : null}

        {/* 生成主按钮 */}
        <button type="button" className="generate-btn" data-testid="generate-btn" onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? (
            <>
              <PenLine size={17} className="ink-icon" />
              正在落笔…
            </>
          ) : (
            <>
              <PenLine size={17} className="ink-icon" />
              落笔生成
            </>
          )}
        </button>
        <p className="combo-foot" data-testid="combo-foot">
          当前词库理论组合量 <strong>{formatCombination(combination.grandTotal)}</strong>
          {comboFoot > 0n ? `；所选类型理论组合 ${formatCombination(comboFoot)}` : ''}
        </p>

        {/* 结果区 */}
        <div className="result-section">
          {results.length > 0 ? (
            <>
              <div className="batch-bar">
                <span data-testid="batch-stats">
                  本批 {batchStats?.total ?? results.length} 条
                  {typeof batchStats?.deduped === 'number' && batchStats.deduped > 0 ? `（去重 ${batchStats.deduped} 条）` : ''}
                </span>
                <button type="button" className="batch-save-btn" onClick={saveAll} disabled={savingAll} data-testid="save-all">
                  <Save size={15} />
                  {savingAll ? '入谱中…' : '本批全部入谱'}
                </button>
              </div>
              <div className="name-card-list">
                {results.map((c, idx) => {
                  const key = batchKey(c);
                  const isSaved = savedKeys.has(key);
                  const isSaving = savingKeys.has(key);
                  return (
                    <div key={`${c.id}-${c.nameText}`} className={cn('name-card', `name-card-race-${c.race}`)} data-testid={`name-card-${idx}`}>
                      <div className="name-card-top">
                        <Seal race={c.race} size={22} />
                        <div className="name-main">
                          <p className="name-text">{c.nameText}</p>
                          <div className="name-meta">
                            <span className="name-type">{c.combo ? '组合设定' : TYPE_LABELS[c.nameType]}</span>
                            <span className="name-chars">{c.combo ? `${c.structure.length}项` : `${c.charCount}字`}</span>
                          </div>
                        </div>
                        <div className="name-actions">
                          {isSaved ? (
                            <span className="saved-stamp" data-testid={`saved-stamp-${idx}`}>
                              已藏
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="icon-btn"
                              title="保存"
                              data-testid={`save-${idx}`}
                              disabled={isSaving}
                              onClick={() => saveOne(c, false)}
                            >
                              <Save size={17} />
                            </button>
                          )}
                          <button type="button" className="icon-btn" title="收藏" data-testid={`fav-${idx}`} onClick={() => saveOne(c, true)}>
                            <Star size={17} />
                          </button>
                          <button type="button" className="icon-btn" title="复制" data-testid={`copy-${idx}`} onClick={() => copyItem(c)}>
                            <Copy size={16} />
                          </button>
                          <button type="button" className="icon-btn" title="换一批" data-testid={`reroll-${idx}`} onClick={() => rerollItem(idx)}>
                            <RefreshCw size={16} />
                          </button>
                          <button type="button" className="icon-btn" title="加入设定" data-testid={`tosheet-${idx}`} onClick={() => addToSheet(c)}>
                            <UserPlus size={17} />
                          </button>
                        </div>
                      </div>
                      <StructureTags parts={c.structure} race={c.race} />
                      <button type="button" className="ai-card-btn" data-testid={`detail-${idx}`} onClick={() => openDetail(idx)}>
                        <Info size={14} />
                        查看详情
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="result-empty">
              <EmptyState title="等待落笔" desc={`选择${raceLabel(race)}与名称类型，点击「落笔生成」开始成稿`} testId="generate-empty" />
            </div>
          )}
        </div>
        {/* 候选详情面板：结构 + 备注编辑 + 保存入谱（AI 设定请到候选库详情页） */}
        {detailIdx !== null && results[detailIdx] ? (
          <div
            className="ai-panel-overlay"
            data-testid="detail-panel"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDetail();
            }}
          >
            <div className="ai-panel detail-panel">
              <div className="ai-panel-header">
                <div className="ai-panel-title">
                  <Seal race={results[detailIdx].race} size={20} />
                  <span className="ai-panel-name">{results[detailIdx].nameText}</span>
                  <span className="ai-panel-badge">{results[detailIdx].combo ? '组合设定' : TYPE_LABELS[results[detailIdx].nameType]}</span>
                </div>
                <button type="button" className="icon-btn" title="关闭" data-testid="detail-close" onClick={closeDetail}>
                  <X size={18} />
                </button>
              </div>
              <StructureTags parts={results[detailIdx].structure} race={results[detailIdx].race} />
              <div className="detail-note">
                <label className="detail-label" htmlFor="candidate-note">
                  备注
                </label>
                <textarea
                  id="candidate-note"
                  className="detail-textarea"
                  rows={5}
                  value={results[detailIdx].note}
                  data-testid="detail-note-input"
                  onChange={(e) => patchNote(detailIdx, e.target.value)}
                  placeholder="可手动记录用途或灵感，保存入谱后带入候选库"
                />
              </div>
              <div className="ai-panel-footer">
                <button
                  type="button"
                  className="primary-btn"
                  data-testid="detail-save"
                  disabled={savingKeys.has(batchKey(results[detailIdx])) || savedKeys.has(batchKey(results[detailIdx]))}
                  onClick={() => {
                    const c = results[detailIdx];
                    if (c) void saveOne(c, false);
                  }}
                >
                  <Save size={14} />
                  {savedKeys.has(batchKey(results[detailIdx])) ? '已入谱' : '保存入谱'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
