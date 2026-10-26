// 项目门：应用启动或切换项目时，先选择/新建项目，随后加载 .workshop 数据进入主界面。

import { useEffect, useState } from 'react';
import { FolderOpen, FolderPlus, Loader2, PenLine } from 'lucide-react';
import { createProject, listRecentProjects, openProject, pickProjectDirectory, type ProjectSummary } from '@/lib/db';
import { formatTime } from '@/components/common';

const DEFAULT_PROJECT_NAME = '未命名项目';

interface ProjectGateProps {
  onOpened: (project: ProjectSummary) => void;
}

type Busy = 'open' | 'create' | 'recent' | null;

export function ProjectGate({ onOpened }: ProjectGateProps) {
  const [recents, setRecents] = useState<ProjectSummary[] | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME);

  const loadRecents = async () => {
    try {
      setRecents(await listRecentProjects());
    } catch {
      setRecents([]);
    }
  };

  useEffect(() => {
    void loadRecents();
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

  const chooseExisting = async () => {
    if (busy) return;
    const picked = await pickProjectDirectory('open');
    if (!picked.ok || !picked.path) return;
    await openPath(picked.path, 'open');
  };

  const chooseCreateLocation = async () => {
    if (busy) return;
    setError('');
    const picked = await pickProjectDirectory('parent');
    if (!picked.ok || !picked.path) return;
    setProjectName(DEFAULT_PROJECT_NAME);
    setParentDir(picked.path);
  };

  const confirmCreate = async () => {
    if (!parentDir || busy === 'create') return;
    setBusy('create');
    setError('');
    try {
      const result = await createProject({ parentDir, name: projectName.trim() });
      if (result.ok && result.project) {
        setParentDir(null);
        onOpened(result.project);
        return;
      }
      setError(result.message || '新建项目失败');
    } catch (err) {
      setError((err as Error)?.message || '新建项目失败');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="project-gate" data-testid="project-gate">
      <div className="project-gate-inner">
        <header className="project-gate-brand">
          <span className="project-gate-seal">创</span>
          <div>
            <h1 className="project-gate-title">创作工坊</h1>
            <p className="project-gate-desc">选择一个项目开始创作。候选、设定、关系与图谱会分门别类保存在项目目录的 `.workshop` 中。</p>
          </div>
        </header>

        <section className="project-gate-card" aria-label="选择项目">
          <div className="project-gate-head">
            <span className="project-gate-head-title">最近项目</span>
            <button type="button" className="link-btn" onClick={() => void loadRecents()} data-testid="project-refresh">
              刷新
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
              <span>新建一个项目，或打开已有的项目文件夹。</span>
            </div>
          ) : (
            <ul className="project-recent-list" data-testid="project-recent-list">
              {recents.map((project) => (
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

          <div className="project-gate-actions">
            <button type="button" className="primary-btn" data-testid="project-create" disabled={busy !== null} onClick={() => void chooseCreateLocation()}>
              {busy === 'create' ? <Loader2 size={15} className="spin" /> : <FolderPlus size={15} />}
              新建项目
            </button>
            <button type="button" className="secondary-btn" data-testid="project-open-folder" disabled={busy !== null} onClick={() => void chooseExisting()}>
              {busy === 'open' ? <Loader2 size={15} className="spin" /> : <FolderOpen size={15} />}
              打开已有项目…
            </button>
          </div>
        </section>
      </div>

      {parentDir ? (
        <div
          className="modal-layer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && busy !== 'create') setParentDir(null);
          }}
        >
          <section
            className="confirm-dialog project-create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-create-title"
            data-testid="project-create-dialog"
          >
            <h2 id="project-create-title" className="dialog-title">
              新建项目
            </h2>
            <p className="dialog-description">将在以下位置创建项目文件夹及其 `.workshop` 数据目录。</p>
            <p className="project-create-path" title={parentDir}>
              {parentDir}
            </p>
            <label className="project-create-label" htmlFor="project-name-input">
              项目名称
            </label>
            <input
              id="project-name-input"
              className="project-create-input"
              value={projectName}
              autoFocus
              maxLength={60}
              data-testid="project-name-input"
              onChange={(event) => setProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void confirmCreate();
              }}
            />
            {error ? (
              <p className="project-gate-error" data-testid="project-create-error">
                {error}
              </p>
            ) : null}
            <div className="dialog-actions">
              <button type="button" className="secondary-btn" disabled={busy === 'create'} onClick={() => setParentDir(null)}>
                取消
              </button>
              <button
                type="button"
                className="primary-btn"
                data-testid="project-create-confirm"
                disabled={busy === 'create' || projectName.trim() === ''}
                onClick={() => void confirmCreate()}
              >
                {busy === 'create' ? <Loader2 size={15} className="spin" /> : null}
                创建项目
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
