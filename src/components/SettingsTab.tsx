// 设置页：项目切换、VS Code / CLion / Finder 打开项目目录、overview.md 总览只读展示与应用信息

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Code2, CodeXml, FolderOpen, FolderSearch, Loader2, RefreshCw } from 'lucide-react';
import { fetchProjectOverview, openProjectInCLion, openProjectInFinder, openProjectInVSCode, type ProjectSummary } from '@/lib/db';
import { computeCombinationTotals, formatCombination } from '@/data/lexicon';
import { cn } from '@/lib/utils';
import { SectionTitle, useAppToast } from '@/components/common';
import { MarkdownView } from '@/components/MarkdownView';
import { StatsTab } from '@/components/StatsTab';

interface SettingsTabProps {
  project: ProjectSummary;
  onSwitchProject: () => void;
  refreshKey: number;
}

export function SettingsTab({ project, onSwitchProject, refreshKey }: SettingsTabProps) {
  const toast = useAppToast();
  const [opening, setOpening] = useState<'vscode' | 'clion' | 'finder' | null>(null);
  const [overview, setOverview] = useState('');
  const [overviewLoading, setOverviewLoading] = useState(true);
  const lexiconScale = useMemo(() => computeCombinationTotals(), []);

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      setOverview(await fetchProjectOverview());
    } catch (err) {
      toast.show((err as Error)?.message || '读取项目总览失败', 'error');
    } finally {
      setOverviewLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, project.path]);

  const handleOpen = async (target: 'vscode' | 'clion' | 'finder') => {
    if (opening) return;
    setOpening(target);
    const labels = { vscode: 'VS Code', clion: 'CLion', finder: 'Finder' } as const;
    try {
      const res = target === 'vscode' ? await openProjectInVSCode() : target === 'clion' ? await openProjectInCLion() : await openProjectInFinder();
      if (res.ok) toast.show(res.message || `已在 ${labels[target]} 中打开项目目录`, 'success');
      else toast.show(res.message || `在 ${labels[target]} 中打开项目目录失败`, 'error');
    } catch (err) {
      toast.show((err as Error)?.message || `在 ${labels[target]} 中打开项目目录失败`, 'error');
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="page-shell settings-page">
      <div className="app-scroll">
        <div className="sheets-header">
          <p className="sheets-title">设置</p>
        </div>

        <SectionTitle>当前项目</SectionTitle>
        <div className="settings-card">
          <div className="settings-card-title">
            <FolderOpen size={18} className="settings-card-icon" />
            {project.name}
          </div>
          <p className="settings-project-path" data-testid="settings-project-path" title={project.path}>
            {project.path}
          </p>
          <p className="settings-desc">候选、设定、关系、图谱与偏好保存在该项目的 `.workshop` 目录中，可用 VS Code / CLion 或 Finder 直接查看与编辑。</p>
          <div className="settings-actions">
            <button
              type="button"
              className="secondary-btn"
              data-testid="settings-open-vscode"
              disabled={opening !== null}
              onClick={() => void handleOpen('vscode')}
            >
              {opening === 'vscode' ? <Loader2 size={16} className="spin" /> : <Code2 size={16} />}在 VS Code 中打开
            </button>
            <button
              type="button"
              className="secondary-btn"
              data-testid="settings-open-clion"
              disabled={opening !== null}
              onClick={() => void handleOpen('clion')}
            >
              {opening === 'clion' ? <Loader2 size={16} className="spin" /> : <CodeXml size={16} />}在 CLion 中打开
            </button>
            <button
              type="button"
              className="secondary-btn"
              data-testid="settings-open-finder"
              disabled={opening !== null}
              onClick={() => void handleOpen('finder')}
            >
              {opening === 'finder' ? <Loader2 size={16} className="spin" /> : <FolderSearch size={16} />}在 Finder 中打开
            </button>
            <button type="button" className="secondary-btn" data-testid="settings-switch-project" onClick={onSwitchProject}>
              <FolderOpen size={16} />
              切换项目
            </button>
          </div>
        </div>

        <SectionTitle>关于</SectionTitle>
        <div className="settings-card">
          <p className="settings-about-name">Creation Workshop</p>
          <p className="settings-desc">为小说世界观生成人名与地名，并组织候选、设定卡、地名库与关系图谱。</p>
          <p className="settings-desc" data-testid="settings-lexicon-scale">
            当前词库理论组合量：{formatCombination(lexiconScale.grandTotal)}（人名 {formatCombination(lexiconScale.detail.person)} · 地名{' '}
            {formatCombination(lexiconScale.detail.place)}）
          </p>
        </div>

        <StatsTab refreshKey={refreshKey} />

        {overview.trim() ? (
          <>
            <SectionTitle
              right={
                <button
                  type="button"
                  className="icon-btn"
                  title="刷新总览"
                  aria-label="刷新总览"
                  data-testid="settings-overview-refresh"
                  disabled={overviewLoading}
                  onClick={() => void loadOverview()}
                >
                  <RefreshCw size={15} className={cn(overviewLoading && 'spin')} />
                </button>
              }
            >
              总览
            </SectionTitle>
            <div className="settings-card settings-overview-card">
              {overviewLoading ? (
                <p className="settings-desc" data-testid="settings-overview-loading">
                  正在读取项目总览…
                </p>
              ) : (
                <MarkdownView markdown={overview} testId="settings-overview" />
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
