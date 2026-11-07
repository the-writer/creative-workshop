// 项目门：启动或切换项目时选择项目；打开目录时自动创建目录并初始化缺失的 .workshop。

import { useEffect, useState } from 'react';
import { FolderOpen, Loader2, PenLine, Trash2 } from 'lucide-react';
import { listRecentProjects, openProject, pickProjectDirectory, removeRecentProject, type ProjectSummary } from '@/lib/db';
import { ConfirmDialog, formatTime, useAppToast } from '@/components/common';

interface ProjectGateProps {
  onOpened: (project: ProjectSummary) => void;
}

type Busy = 'open' | 'recent' | null;

export function ProjectGate({ onOpened }: ProjectGateProps) {
  const toast = useAppToast();
  const [recents, setRecents] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<ProjectSummary | null>(null);
  const [removing, setRemoving] = useState(false);

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

  const handleRemoveRecent = async () => {
    if (!removeTarget || removing) return;
    const target = removeTarget;
    setRemoving(true);
    try {
      const res = await removeRecentProject(target.path);
      if (res.ok) {
        setRecents((prev) => (prev ? prev.filter((project) => project.path !== target.path) : prev));
        toast.show('已从最近项目列表移除（未删除任何文件）', 'success');
      } else {
        toast.show(res.message || '移除失败，请重试', 'error');
      }
    } catch (err) {
      toast.show((err as Error)?.message || '移除失败，请重试', 'error');
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  return (
    <div className="project-gate" data-testid="project-gate">
      <div className="project-gate-inner">
        <header className="project-gate-brand">
          <span className="project-gate-seal">创</span>
          <div className="project-gate-heading-row">
            <h1 className="project-gate-title">Creation Workshop</h1>
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
                <li key={project.path} className="project-recent-row">
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
                  <button
                    type="button"
                    className="icon-btn project-recent-delete"
                    title="从最近项目列表移除（不会删除文件）"
                    aria-label={`从列表移除 ${project.name}`}
                    data-testid={`project-delete-${project.name}`}
                    disabled={busy !== null}
                    onClick={() => setRemoveTarget(project)}
                  >
                    <Trash2 size={15} />
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

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="从最近项目列表移除？"
        description={`只会从列表中移除「${removeTarget?.name ?? ''}」，磁盘上的项目文件不会被删除。`}
        confirmText={removing ? '移除中…' : '移除'}
        destructive
        testId="project-remove-confirm"
        onConfirm={() => void handleRemoveRecent()}
      />
    </div>
  );
}
