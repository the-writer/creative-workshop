// 设置页：项目切换与 VS Code 打开项目目录、应用信息

import { useState } from 'react';
import { Code2, FolderOpen, Loader2 } from 'lucide-react';
import { openProjectInVSCode, type ProjectSummary } from '@/lib/db';
import { SectionTitle, useAppToast } from '@/components/common';

interface SettingsTabProps {
  project: ProjectSummary;
  onSwitchProject: () => void;
}

export function SettingsTab({ project, onSwitchProject }: SettingsTabProps) {
  const toast = useAppToast();
  const [opening, setOpening] = useState(false);

  const handleOpenInVSCode = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const res = await openProjectInVSCode();
      if (res.ok) toast.show(res.message || '已在 VS Code 中打开项目目录', 'success');
      else toast.show(res.message || '打开项目目录失败', 'error');
    } catch (err) {
      toast.show((err as Error)?.message || '打开项目目录失败', 'error');
    } finally {
      setOpening(false);
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
          <p className="settings-desc">候选、设定、关系、图谱与偏好保存在该项目的 `.workshop` 目录中，可用 VS Code 直接查看与编辑。</p>
          <div className="settings-actions">
            <button type="button" className="secondary-btn" data-testid="settings-open-vscode" disabled={opening} onClick={() => void handleOpenInVSCode()}>
              {opening ? <Loader2 size={16} className="spin" /> : <Code2 size={16} />}在 VS Code 中打开
            </button>
            <button type="button" className="secondary-btn" data-testid="settings-switch-project" onClick={onSwitchProject}>
              <FolderOpen size={16} />
              切换项目
            </button>
          </div>
        </div>

        <SectionTitle>关于</SectionTitle>
        <div className="settings-card">
          <p className="settings-about-name">创作工坊</p>
          <p className="settings-desc">为小说世界观生成人名、地名、官职与绰号，并组织候选、设定卡、关系图谱与统计。</p>
        </div>
      </div>
    </div>
  );
}
