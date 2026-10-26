// 统计页：概览卡、多维分布柱状图、词库规模
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchStats, type StatsData } from '@/lib/db';
import { computeCombinationTotals, formatCombination } from '@/data/lexicon';
import { RELATION_TYPES, RACE_LABELS, TYPE_LABELS, TYPE_KEYS } from '@/lib/types';
import { EmptyState, SectionTitle } from '@/components/common';
import { cn } from '@/lib/utils';

interface StatsTabProps {
  refreshKey: number;
}

function BarChart({
  data,
  order,
  labels,
  color,
  colorMap,
}: {
  data: Record<string, number>;
  order: string[];
  labels: Record<string, string>;
  color: string;
  colorMap?: Record<string, string>;
}) {
  const entries = order.map((k) => ({ key: k, label: labels[k] ?? k, value: data[k] ?? 0 }));
  const max = Math.max(1, ...entries.map((e) => e.value));
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total === 0) return <p className="chart-empty-note">暂无记录</p>;
  return (
    <div className="bar-chart">
      {entries.map((e) => (
        <div key={e.key} className="bar-col">
          <span className="bar-value">{e.value > 0 ? e.value : ''}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ height: `${e.value > 0 ? Math.max(10, (e.value / max) * 100) : 0}%`, background: colorMap?.[e.key] ?? color }} />
          </div>
          <span className="bar-label">{e.label}</span>
        </div>
      ))}
    </div>
  );
}

const OVERVIEW_COLORS = ['#B23A2E', '#B98A3A', '#3E4A5A', '#4A7C59'];

export function StatsTab({ refreshKey }: StatsTabProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const combo = useMemo(() => computeCombinationTotals(), []);

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const s = await fetchStats();
      setStats(s);
      setError('');
    } catch (err) {
      setError((err as Error)?.message || '统计失败，请重试');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const overviews = [
    { label: '候选命名', value: stats?.totalCandidates ?? 0 },
    { label: '已收藏', value: stats?.totalFavorites ?? 0 },
    { label: '设定卡', value: stats?.totalSheets ?? 0 },
    { label: '关系', value: stats?.totalRelations ?? 0 },
  ];

  return (
    <div className="page-shell stats-page">
      <div className="app-scroll">
        <div className="stats-header">
          <p className="sheets-title">统计</p>
          <button type="button" className="icon-btn" title="刷新" data-testid="stats-refresh" onClick={() => void reload({ silent: true })}>
            <RefreshCw size={16} className={cn(refreshing && 'spin')} />
          </button>
        </div>

        {error ? (
          <div className="error-bar" data-testid="stats-error">
            {error}
            <button type="button" className="retry-link" onClick={() => void reload()}>
              重试
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="list-loading">正在清点谱系…</div>
        ) : stats ? (
          <>
            {/* 概览卡 */}
            <div className="stat-cards">
              {overviews.map((o, i) => (
                <div key={o.label} className="stat-card" data-testid={`stat-card-${o.label}`}>
                  <p className="stat-card-value" style={{ color: OVERVIEW_COLORS[i] }}>
                    {o.value}
                  </p>
                  <p className="stat-card-label">{o.label}</p>
                </div>
              ))}
            </div>

            {/* 分布 */}
            <div className="stat-chart-card">
              <SectionTitle>族群分布</SectionTitle>
              <BarChart data={stats.raceDist} order={['human', 'elf']} labels={RACE_LABELS} color="#B23A2E" colorMap={{ human: '#B23A2E', elf: '#3E4A5A' }} />
            </div>
            <div className="stat-chart-card">
              <SectionTitle>类型分布</SectionTitle>
              <BarChart data={stats.typeDist} order={TYPE_KEYS} labels={TYPE_LABELS} color="#4A7C59" />
            </div>
            <div className="stat-chart-card">
              <SectionTitle>字数分布</SectionTitle>
              <BarChart
                data={stats.charDist}
                order={Object.keys(stats.charDist)
                  .map(Number)
                  .sort((a, b) => a - b)
                  .slice(0, 14)
                  .map(String)}
                labels={{}}
                color="#B98A3A"
              />
            </div>
            <div className="stat-chart-card">
              <SectionTitle>关系类型分布</SectionTitle>
              <BarChart data={stats.relationTypeDist} order={Array.from(RELATION_TYPES)} labels={{}} color="#3E4A5A" />
            </div>

            {/* 词库规模 */}
            <div className="stat-chart-card lexicon-card">
              <SectionTitle>词库规模</SectionTitle>
              <div className="lexicon-row">
                <span>人族组合量</span>
                <strong>{formatCombination(combo.perRace.human.total)}</strong>
              </div>
              <div className="lexicon-row">
                <span>精灵族组合量</span>
                <strong>{formatCombination(combo.perRace.elf.total)}</strong>
              </div>
              <div className="lexicon-row lexicon-row-total">
                <span>理论组合总量</span>
                <strong>{formatCombination(combo.grandTotal)}</strong>
              </div>
              <p className="lexicon-badge">按本地资料库实时估算，理论组合已超过安全整数，采用精确大整数计数</p>
              <p className="lexicon-detail">
                人名 {formatCombination(combo.detail.person)} · 地名 {formatCombination(combo.detail.place)} · 官职 {formatCombination(combo.detail.office)} ·
                绰号 {formatCombination(combo.detail.nickname)}
              </p>
            </div>
          </>
        ) : (
          <EmptyState title="暂无统计数据" desc="先去生成一批命名，统计会自动铺开" testId="stats-empty" />
        )}
      </div>
    </div>
  );
}
