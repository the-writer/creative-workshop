// 项目门：启动或切换项目时选择项目；打开目录时自动创建目录并初始化缺失的 .workshop。

import { useEffect, useState } from 'react';
import { FolderOpen, Loader2, PenLine } from 'lucide-react';
import { listRecentProjects, openProject, pickProjectDirectory, type ProjectSummary } from '@/lib/db';
import { formatTime } from '@/components/common';

interface ProjectGateProps {
  onOpened: (project: ProjectSummary) => void;
}

type Busy = 'open' | 'recent' | null;

export function ProjectGate({ onOpened }: ProjectGateProps) {
  const [recents, setRecents] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void listRecentProjects()
      .then((list) => {
        if (active) setRecents(list);
      })
      .catch(() => {
        if (active) setRecents([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const openPath = async (path: string, source: Busy) => {
    if (busy) return;
    setBusy(source);
    setError('');
    try {
      const result = await openProject(path);
      if (result.ok && result.project) {
        onOpened(result.project);
        return;
      }
      setError(result.message || '打开项目失败');
    } catch (err) {
      setError((err as Error)?.message || '打开项目失败');
    } finally {
      setBusy(null);
    }
  };

  const chooseProject = async () => {
    if (busy) return;
    setError('');
    const picked = await pickProjectDirectory('open');
    if (!picked.ok || !picked.path) return;
    await openPath(picked.path, 'open');
  };

  return (
    <div className="project-gate" data-testid="project-gate">
      <div className="project-gate-inner">
        <header className="project-gate-brand">
          <span className="project-gate-seal">创</span>
          <div className="project-gate-heading-row">
            <h1 className="project-gate-title">创作工坊</h1>
            <p className="project-gate-desc">选择一个项目开始创作。</p>
          </div>
        </header>

        <section className="project-gate-card" aria-label="选择项目">
          <div className="project-gate-head">
            <span className="project-gate-head-title">项目</span>
            <button
              type="button"
              className="secondary-btn project-open-btn"
              data-testid="project-open-folder"
              disabled={busy !== null}
              onClick={() => void chooseProject()}
            >
              {busy === 'open' ? <Loader2 size={15} className="spin" /> : <FolderOpen size={15} />}
              打开项目
            </button>
          </div>

          {recents === null ? (
            <p className="project-gate-hint">
              <Loader2 size={14} className="spin" /> 正在读取最近项目…
            </p>
          ) : recents.length === 0 ? (
            <div className="project-gate-empty" data-testid="project-empty">
              <PenLine size={26} className="project-gate-empty-icon" />
              <p>还没有项目</p>
              <span>打开一个目录即可开始；目录不存在时自动创建并初始化。</span>
            </div>
          ) : (
            <ul className="project-recent-list" data-testid="project-recent-list">
              {recents.map((project, index) => (
                <li key={project.path}>
                  <button
                    type="button"
                    className="project-recent-item"
                    data-testid={`project-recent-${project.name}`}
                    disabled={busy !== null}
                    onClick={() => void openPath(project.path, 'recent')}
                  >
                    <span className="project-recent-name">
                      {busy === 'recent' ? <Loader2 size={15} className="spin" /> : <FolderOpen size={15} />}
                      {project.name}
                      {index === 0 ? (
                        <span className="project-recent-tag" data-testid="project-last-tag">
                          上次
                        </span>
                      ) : null}
                    </span>
                    <span className="project-recent-path">{project.path}</span>
                    <span className="project-recent-time">{project.lastOpenedAt ? `上次打开 ${formatTime(project.lastOpenedAt)}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error ? (
            <p className="project-gate-error" data-testid="project-error">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
