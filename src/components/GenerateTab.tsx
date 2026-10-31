// 生成页：族群/类型/规则选择 + 批量生成引擎 + 名称笺结果区 + 单条保存/收藏/复制/换一批

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge, Check, Copy, MapPin, PenLine, Save, ScrollText, SlidersHorizontal, UserPlus, UserRound } from 'lucide-react';
import {
  DEFAULT_GEN_PARAMS,
  GEN_PREFS_SCHEMA_VERSION,
  generateBatch,
  nameCharCount,
  normalizeGenPrefs,
  type GenParams,
  type GenPrefs,
  rerollCombo,
  rerollOne,
} from '@/lib/generator';
import { computeCombinationTotals, LEXICON, SURNAME_MAX_BIAS, SURNAME_NATURAL_BIAS } from '@/data/lexicon';
import { insertCandidate, onRulesChanged, openRulesWindow } from '@/lib/db';
import type { Candidate, NameGender, NameTypeKey, RaceKey } from '@/lib/types';
import { candidateToSheetFields, GENDER_KEYS, GENDER_LABELS, RACE_LABELS, TYPE_LABELS } from '@/lib/types';
import { Chip, copyText, Seal, SectionTitle, StructureTags, useAppToast, visibleStructureParts } from '@/components/common';
import { cn } from '@/lib/utils';

export interface EditorPrefill {
  characterName: string;
  race: RaceKey;
  gender?: NameGender;
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

function defaultPrefs(): GenPrefs {
  return { schemaVersion: GEN_PREFS_SCHEMA_VERSION, race: 'human', types: ['person'], params: { ...DEFAULT_GEN_PARAMS } };
}

const TYPE_ICONS: Record<NameTypeKey, ReactNode> = {
  person: <UserRound size={15} />,
  place: <MapPin size={15} />,
  office: <ScrollText size={15} />,
  nickname: <Badge size={15} />,
};

export function GenerateTab({ onOpenEditor }: GenerateTabProps) {
  const toast = useAppToast();
  const [prefs, setPrefs] = useState<GenPrefs>(defaultPrefs);
  const [prefsReady, setPrefsReady] = useState(false);
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
      .then((raw) => setPrefs(normalizeGenPrefs(raw)))
      .catch(() => undefined)
      .finally(() => setPrefsReady(true));
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    void window.workshop.preferences.set('generator', prefs).catch(() => undefined);
  }, [prefs, prefsReady]);

  useEffect(() => onRulesChanged((raw) => setPrefs(normalizeGenPrefs(raw))), []);

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
      gender: c.gender,
      rarity: c.rarity,
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
      next[index] = {
        ...item,
        nameText: got.name,
        charCount: nameCharCount(got.name),
        structure: got.structure,
        gender: item.combo || item.nameType === 'person' ? got.gender : item.gender,
        rarity: item.combo || item.nameType === 'person' ? got.rarity : item.rarity,
        note: '',
        id: `tmp_${Date.now()}_${index}`,
      };
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
      gender: c.gender && c.gender !== 'any' ? c.gender : undefined,
      candidateId: c.id.startsWith('tmp_') ? '' : c.id,
      occupation: f.occupation,
      office: f.office,
      hometown: f.hometown,
      nickname: f.nickname,
      contractTitle: f.contractTitle,
      note: f.note,
    });
  };

  const usesPerson = types.includes('person') || comboMode;

  const openRules = async () => {
    try {
      await openRulesWindow();
    } catch (err) {
      toast.show((err as Error)?.message || '无法打开规则设置', 'error');
    }
  };

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
        {/* 性别倾向：标题与名称类型使用同一 SectionTitle，选项与族群 / 类型使用同一 Chip 组件 */}
        {usesPerson ? (
          <>
            <SectionTitle>性别倾向</SectionTitle>
            <div className="choice-chip-row" data-testid="gender-row">
              {GENDER_KEYS.map((gender) => (
                <Chip key={gender} selected={params.gender === gender} tone={race} dataTestId={`gender-${gender}`} onClick={() => setParams({ gender })}>
                  {GENDER_LABELS[gender]}
                </Chip>
              ))}
            </div>
          </>
        ) : null}

        {validateError ? (
          <div className="error-bar" data-testid="generate-error">
            {validateError}
          </div>
        ) : null}

        <div className="generate-action-row">
          <button type="button" className="rules-open-btn" data-testid="rules-open" onClick={() => void openRules()}>
            <SlidersHorizontal size={16} />
            规则设置
          </button>
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
        </div>

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
                          <td>{c.combo ? `${visibleStructureParts(c.structure).length}项` : `${c.charCount}字`}</td>
                          <td>
                            <StructureTags parts={c.structure} race={c.race} gender={c.gender} rarity={c.rarity} />
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
