// 生成页：族群/类型/规则选择 + 批量生成引擎 + 名称笺结果区 + 单条保存/收藏/复制/换一批

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge, Check, ChevronDown, Copy, MapPin, Minus, PenLine, Plus, Save, ScrollText, SlidersHorizontal, UserPlus, UserRound } from 'lucide-react';
import { DEFAULT_GEN_PARAMS, generateBatch, type GenParams, type PersonSuffix, rerollCombo, rerollOne, type ShortMode } from '@/lib/generator';
import { computeCombinationTotals, LEXICON, SURNAME_BALANCED_BIAS, SURNAME_MAX_BIAS, SURNAME_NATURAL_BIAS } from '@/data/lexicon';
import { SURNAME_BIAS_STEP } from '@/lib/generator-rules';
import { insertCandidate } from '@/lib/db';
import type { Candidate, NameTypeKey, RaceKey } from '@/lib/types';
import { candidateToSheetFields, GENDER_KEYS, GENDER_LABELS, normalizeRaceKey, RACE_LABELS, TYPE_LABELS } from '@/lib/types';
import { Chip, copyText, Seal, SectionTitle, StructureTags, useAppToast } from '@/components/common';
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
    const legacyParams = parsed.params as Partial<GenParams> | undefined;
    const isLegacy = !legacyParams || !('gender' in legacyParams) || !('surnameBias' in legacyParams);
    const params = { ...DEFAULT_GEN_PARAMS, ...(parsed.params ?? {}) };
    params.professions = Array.isArray(params.professions) ? params.professions.filter((s) => typeof s === 'string') : [];
    params.abilities = Array.isArray(params.abilities) ? params.abilities.filter((s) => typeof s === 'string') : [];
    params.nicknameSources = Array.isArray(params.nicknameSources) ? params.nicknameSources.filter((s) => typeof s === 'string') : [];
    params.nicknameChars =
      typeof params.nicknameChars === 'number' ? Math.max(2, Math.min(8, Math.round(params.nicknameChars))) : DEFAULT_GEN_PARAMS.nicknameChars;
    params.minChars = typeof params.minChars === 'number' ? Math.max(2, Math.min(8, Math.round(params.minChars))) : DEFAULT_GEN_PARAMS.minChars;
    params.maxChars = typeof params.maxChars === 'number' ? Math.max(2, Math.min(8, Math.round(params.maxChars))) : DEFAULT_GEN_PARAMS.maxChars;
    params.gender = GENDER_KEYS.includes(params.gender) ? params.gender : DEFAULT_GEN_PARAMS.gender;
    params.surnameBias =
      typeof params.surnameBias === 'number'
        ? Math.max(SURNAME_NATURAL_BIAS, Math.min(SURNAME_MAX_BIAS, Math.round(params.surnameBias)))
        : DEFAULT_GEN_PARAMS.surnameBias;
    if (isLegacy && params.minChars === 4 && params.maxChars === 6) params.maxChars = DEFAULT_GEN_PARAMS.maxChars;
    return {
      race: normalizeRaceKey(parsed.race),
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

  const batchKey = (c: Candidate) => (c.combo ? `${c.race}|combo|${c.nameText}` : `${c.race}|${c.nameType}|${c.nameText}`);

  const comboMode = types.length > 1;

  const validate = (): string => {
    if (types.length === 0) return '请至少选择一种名称类型';
    if (params.count < 5 || params.count > 100) return '生成数量需在 5 到 100 之间';
    if (!comboMode) {
      if (params.minChars > params.maxChars) return '全名字数范围冲突：最少字数不能大于最多字数';
      if (params.nicknamePrefix && types.includes('person') && params.nicknameChars + 3 > params.maxChars) {
        return '绰号前置时，绰号加至少 1 字姓氏和 2 字短名已超出全名字数上限，请调低绰号字数或放宽上限';
      }
    }
    if (params.surnameBias < SURNAME_NATURAL_BIAS || params.surnameBias > SURNAME_MAX_BIAS) return '姓氏权重需在 0 到 100 之间';
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
    const anchor = c.combo ? (c.structure.find((part) => part.label.endsWith('人名'))?.word ?? c.structure[1]?.word ?? c.nameText) : c.nameText;
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
  const usesPerson = hasPerson || comboMode;
  const showNickRules = types.includes('nickname') || (hasPerson && params.nicknamePrefix);
  const genderLabel = GENDER_LABELS[params.gender];
  const surnameBiasLabel =
    params.surnameBias === SURNAME_NATURAL_BIAS
      ? '按人口'
      : params.surnameBias < SURNAME_BALANCED_BIAS
        ? '偏常见'
        : params.surnameBias === SURNAME_BALANCED_BIAS
          ? '均衡'
          : params.surnameBias < SURNAME_MAX_BIAS
            ? '偏稀有'
            : '极稀有';

  return (
    <div className="page-shell generate-page">
      <div className="app-scroll">
        <div style={{ marginTop: '-16px' }}>
          <SectionTitle>族群</SectionTitle>
        </div>
        <div className="race-chip-row">
          {(Object.keys(RACE_LABELS) as RaceKey[]).map((r) => (
            <Chip key={r} selected={race === r} tone={r} dataTestId={`race-select-${r}`} onClick={() => setRace(r)}>
              <Seal race={r} size={18} />
              {RACE_LABELS[r]}
            </Chip>
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
        {/* 规则设置 */}
        <div className="rules-panel">
          <button type="button" className="rules-toggle" onClick={() => setRulesOpen((v) => !v)} data-testid="rules-toggle">
            <SlidersHorizontal size={15} />
            <span>规则设置</span>
            <span className="rules-summary">
              {params.count}条 · {genderLabel} · {surnameBiasLabel}姓氏 · 职业{params.professions.length} · 能力{params.abilities.length}
            </span>
            <ChevronDown size={15} className={cn('rules-chevron', rulesOpen && 'rules-chevron-open')} />
          </button>
          {rulesOpen ? (
            <div className="rules-body">
              {/* 职业与特殊能力 */}
              <div className="param-panel">
                <div className="param-columns">
                  <div className="param-group param-column">
                    <div className="param-group-head">
                      <span className="param-group-label">职业</span>
                      <span className="param-group-count">{params.professions.length > 0 ? `已选 ${params.professions.length}` : '不勾选时会随机抽取'}</span>
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
                  <div className="param-group param-column">
                    <div className="param-group-head">
                      <span className="param-group-label">特殊能力</span>
                      <span className="param-group-count">{params.abilities.length > 0 ? `已选 ${params.abilities.length}` : '不勾选时会随机抽取'}</span>
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
                </div>
              </div>

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

              {usesPerson ? (
                <>
                  <div className="rule-row">
                    <span className="rule-label">性别倾向</span>
                    <div className="segmented">
                      {GENDER_KEYS.map((gender) => (
                        <button
                          key={gender}
                          type="button"
                          className={cn('seg-btn', params.gender === gender && 'seg-btn-active')}
                          data-testid={`gender-${gender}`}
                          onClick={() => setParams({ gender })}
                        >
                          {GENDER_LABELS[gender]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rule-row rule-row-vertical">
                    <div className="weight-row-head">
                      <span className="rule-label">姓氏人口权重</span>
                      <span className="weight-value" data-testid="surname-bias-value">
                        {params.surnameBias} · {surnameBiasLabel}
                      </span>
                    </div>
                    <input
                      type="range"
                      className="weight-slider"
                      min={SURNAME_NATURAL_BIAS}
                      max={SURNAME_MAX_BIAS}
                      step={SURNAME_BIAS_STEP}
                      value={params.surnameBias}
                      data-testid="surname-bias"
                      onChange={(event) => setParams({ surnameBias: Number(event.target.value) })}
                    />
                    <div className="weight-scale">
                      <span>按人口</span>
                      <span>均衡</span>
                      <span>极稀有</span>
                    </div>
                    <p className="weight-hint">稀有姓氏占姓氏池 10%，最低人口占比 0.01%。例如：女性 + 贵族封号 + 调高稀有倾向，可生成低人口姓氏的贵族姓名。</p>
                  </div>
                </>
              ) : null}

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
                          ['title', '贵族封号'],
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

        {/* 结果区 */}
        <div className="result-section">
          {results.length > 0 ? (
            <>
              <div className="batch-bar">
                <span data-testid="batch-stats">
                  本批 {batchStats?.total ?? results.length} 条
                  {typeof batchStats?.deduped === 'number' && batchStats.deduped > 0 ? `（去重 ${batchStats.deduped} 条）` : ''}
                </span>
              </div>
              <div className="result-table-wrap">
                <table className="result-table">
                  <thead>
                    <tr>
                      <th>名称</th>
                      <th>类型</th>
                      <th>字数</th>
                      <th>结构</th>
                      <th className="result-actions-head">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((c, idx) => {
                      const key = batchKey(c);
                      const isSaved = savedKeys.has(key);
                      const isSaving = savingKeys.has(key);
                      return (
                        <tr key={`${c.id}-${c.nameText}`} data-testid={`name-row-${idx}`}>
                          <td>
                            <div className="result-name-cell">
                              <Seal race={c.race} size={20} />
                              <span className="result-name-text">{c.nameText}</span>
                            </div>
                          </td>
                          <td>{c.combo ? '组合设定' : TYPE_LABELS[c.nameType]}</td>
                          <td>{c.combo ? `${c.structure.length}项` : `${c.charCount}字`}</td>
                          <td>
                            <StructureTags parts={c.structure} race={c.race} />
                          </td>
                          <td>
                            <div className="result-actions">
                              <button
                                type="button"
                                className={cn('icon-btn', isSaved && 'result-saved-btn')}
                                title={isSaved ? '已入谱' : '保存入谱'}
                                aria-label={isSaved ? '已入谱' : '保存入谱'}
                                data-testid={`save-${idx}`}
                                disabled={isSaving || isSaved}
                                onClick={() => void saveOne(c, false)}
                              >
                                {isSaved ? <Check size={16} /> : <Save size={16} />}
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                title="复制"
                                aria-label="复制"
                                data-testid={`copy-${idx}`}
                                onClick={() => void copyItem(c)}
                              >
                                <Copy size={15} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                title="加入设定"
                                aria-label="加入设定"
                                data-testid={`tosheet-${idx}`}
                                onClick={() => addToSheet(c)}
                              >
                                <UserPlus size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <></>
          )}
        </div>
      </div>
    </div>
  );
}
