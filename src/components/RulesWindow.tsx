// 规则设置模态子窗口：与主界面共享生成偏好，修改后持久化并实时通知主窗口。

import { useEffect, useState } from 'react';
import { Minus, Plus, SlidersHorizontal, X } from 'lucide-react';
import {
  DEFAULT_GEN_PARAMS,
  GEN_PREFS_SCHEMA_VERSION,
  normalizeGenPrefs,
  type GenParams,
  type GenPrefs,
  type PersonSuffix,
  type ShortMode,
} from '@/lib/generator';
import { LEXICON, SURNAME_MAX_BIAS, SURNAME_NATURAL_BIAS } from '@/data/lexicon';
import { SURNAME_BIAS_STEP } from '@/lib/generator-rules';
import { Chip, SectionTitle } from '@/components/common';
import { cn } from '@/lib/utils';

const PERSON_SUFFIX_OPTIONS: Array<[PersonSuffix, string]> = [
  ['father', '父名'],
  ['place', '地名'],
  ['profession', '职业'],
  ['blood', '血统'],
  ['title', '贵族封号'],
];

const SHORT_MODE_OPTIONS: Array<[ShortMode, string]> = [
  ['two', '2字'],
  ['three', '3字'],
  ['mix', '2-3字'],
];

function defaultPrefs(): GenPrefs {
  return { schemaVersion: GEN_PREFS_SCHEMA_VERSION, race: 'human', types: ['person'], params: { ...DEFAULT_GEN_PARAMS } };
}

function surnameBiasLabel(value: number): string {
  if (value === SURNAME_NATURAL_BIAS) return '按人口';
  if (value < 50) return '偏常见';
  if (value === 50) return '均衡';
  return value < SURNAME_MAX_BIAS ? '偏稀有' : '极稀有';
}

export function RulesWindow() {
  const [prefs, setPrefs] = useState<GenPrefs>(defaultPrefs);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void window.workshop.preferences
      .get('generator')
      .then((raw) => setPrefs(normalizeGenPrefs(raw)))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    void window.workshop.preferences.set('generator', prefs).catch(() => undefined);
    void window.workshop.rules.notifyChanged(prefs).catch(() => undefined);
  }, [prefs, ready]);

  const { race, types, params } = prefs;
  const usesPerson = types.includes('person');
  const hasPerson = types.includes('person');
  const setParams = (patch: Partial<GenParams>) => setPrefs((current) => ({ ...current, params: { ...current.params, ...patch } }));

  const toggleProfession = (word: string) =>
    setPrefs((current) => ({
      ...current,
      params: {
        ...current.params,
        professions: current.params.professions.includes(word)
          ? current.params.professions.filter((value) => value !== word)
          : [...current.params.professions, word],
      },
    }));

  const toggleAbility = (word: string) =>
    setPrefs((current) => ({
      ...current,
      params: {
        ...current.params,
        abilities: current.params.abilities.includes(word) ? current.params.abilities.filter((value) => value !== word) : [...current.params.abilities, word],
      },
    }));

  return (
    <div className="rules-window-root" data-testid="rules-window">
      <header className="rules-window-titlebar">
        <span className="rules-window-title">
          <SlidersHorizontal size={15} />
          规则设置
        </span>
        <button type="button" className="rules-window-close" aria-label="关闭规则设置" onClick={() => void window.workshop.rules.close()}>
          <X size={16} />
        </button>
      </header>

      <div className="rules-window-scroll">
        <SectionTitle>基础规则</SectionTitle>
        <div className="rules-window-card">
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
                  const value = Number(e.target.value);
                  if (!Number.isNaN(value)) setParams({ count: Math.max(5, Math.min(100, Math.round(value))) });
                }}
              />
              <button type="button" className="stepper-btn" data-testid="count-plus" onClick={() => setParams({ count: Math.min(100, params.count + 5) })}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="rule-row">
            <span className="rule-label">短名块数</span>
            <div className="segmented">
              {SHORT_MODE_OPTIONS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={cn('seg-btn', params.shortMode === key && 'seg-btn-active')}
                  data-testid={`shortmode-${key}`}
                  onClick={() => setParams({ shortMode: key })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {usesPerson ? (
            <div className="rule-row rule-row-vertical">
              <div className="weight-row-head">
                <span className="rule-label">姓氏人口权重</span>
                <span className="weight-value" data-testid="surname-bias-value">
                  {params.surnameBias} · {surnameBiasLabel(params.surnameBias)}
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
          ) : null}

          {hasPerson ? (
            <>
              <div className="rule-row">
                <span className="rule-label">人名后缀</span>
                <div className="segmented">
                  {PERSON_SUFFIX_OPTIONS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={cn('seg-btn', params.personSuffix === key && 'seg-btn-active')}
                      data-testid={`personsuffix-${key}`}
                      onClick={() => setParams({ personSuffix: key })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}



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
                  const value = Number(e.target.value);
                  if (!Number.isNaN(value)) setParams({ minChars: Math.max(2, Math.min(8, Math.round(value))) });
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
                  const value = Number(e.target.value);
                  if (!Number.isNaN(value)) setParams({ maxChars: Math.max(2, Math.min(8, Math.round(value))) });
                }}
              />
              <span className="range-note">字（名字最大 8 字）</span>
            </div>
          </div>

          <button type="button" className="reset-rules" onClick={() => setParams({ ...DEFAULT_GEN_PARAMS, count: params.count })} data-testid="reset-rules">
            恢复默认规则
          </button>
        </div>

        <SectionTitle>职业与特殊能力</SectionTitle>
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
      </div>
    </div>
  );
}
