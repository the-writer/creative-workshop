import { useEffect, useState, type ReactNode } from 'react';
import './App.css';
import { Library, MapPin, PenLine, Settings, Share2, Users } from 'lucide-react';
import { GenerateTab, type EditorPrefill } from '@/components/GenerateTab';
import { LibraryTab } from '@/components/LibraryTab';
import { SheetsTab } from '@/components/SheetsTab';
import { SheetEditor } from '@/components/SheetEditor';
import { GraphTab } from '@/components/GraphTab';
import { SettingsTab } from '@/components/SettingsTab';
import { PlacesTab } from '@/components/PlacesTab';
import { ProjectGate } from '@/components/ProjectGate';
import { ToastProvider } from '@/components/common';
import { getCurrentProject, type ProjectSummary } from '@/lib/db';
import { cn } from '@/lib/utils';

type PageKey = 'generate' | 'library' | 'sheets' | 'places' | 'graph' | 'settings';

interface EditorState {
  sheetId: string | null;
  prefill: EditorPrefill | null;
}

const NAV_ITEMS: Array<{ key: PageKey; label: string; icon: ReactNode }> = [
  { key: 'generate', label: '生成', icon: <PenLine size={20} /> },
  { key: 'library', label: '候选库', icon: <Library size={20} /> },
  { key: 'sheets', label: '设定', icon: <Users size={20} /> },
  { key: 'places', label: '地名', icon: <MapPin size={20} /> },
  { key: 'graph', label: '图谱', icon: <Share2 size={20} /> },
  { key: 'settings', label: '设置', icon: <Settings size={20} /> },
];

function WorkshopApp({ project, onSwitchProject }: { project: ProjectSummary; onSwitchProject: () => void }) {
  const [page, setPage] = useState<PageKey>('generate');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const openEditor = (prefill?: EditorPrefill, sheetId?: string) => {
    setEditor({ sheetId: sheetId ?? null, prefill: prefill ?? null });
  };

  const handleSaved = () => {
    setRefreshKey((k) => k + 1);
    setEditor(null);
  };

  return (
    <>
      {/* 生成页常驻挂载：切换底部页签或打开设定编辑器时只隐藏、不卸载，保留已生成结果 */}
      <div className={cn('app-shell', editor && 'app-shell-hidden')} aria-hidden={editor ? true : undefined}>
        <div className="app-page-slot">
          <div className={cn('app-page-pane', page !== 'generate' && 'app-page-pane-hidden')}>
            <GenerateTab onOpenEditor={(p) => openEditor(p)} />
          </div>
          {page === 'library' ? <LibraryTab refreshKey={refreshKey} onOpenEditor={(p) => openEditor(p)} onGoGenerate={() => setPage('generate')} /> : null}
          {page === 'sheets' ? <SheetsTab refreshKey={refreshKey} onOpenEditor={(p, id) => openEditor(p, id)} /> : null}
          {page === 'places' ? <PlacesTab refreshKey={refreshKey} /> : null}
          {page === 'graph' ? <GraphTab refreshKey={refreshKey} onGoSheets={() => setPage('sheets')} /> : null}
          {page === 'settings' ? <SettingsTab project={project} onSwitchProject={onSwitchProject} refreshKey={refreshKey} /> : null}
        </div>
        <nav className="bottom-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn('bottom-nav-btn', page === item.key && 'bottom-nav-btn-active')}
              data-testid={`nav-${item.key}`}
              onClick={() => setPage(item.key)}
            >
              {item.icon}
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {editor ? (
        <SheetEditor
          key={editor.sheetId ?? `new-${editor.prefill?.candidateId || editor.prefill?.characterName || 'blank'}`}
          sheetId={editor.sheetId}
          prefill={editor.prefill}
          onBack={() => setEditor(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}

function App() {
  // undefined = 正在查询当前项目；null = 尚未选择项目（显示项目门）
  const [project, setProject] = useState<ProjectSummary | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void getCurrentProject()
      .then((current) => {
        if (active) setProject(current);
      })
      .catch(() => {
        if (active) setProject(null);
      });
    const unsubscribe = window.workshop.projects.onChanged((next) => setProject(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div id="container" className="app-root">
      <header className="desktop-titlebar" aria-label="窗口标题栏">
        <span className="desktop-titlebar-mark">创</span>
        <span>{project ? project.name : 'Creation Workshop'}</span>
      </header>
      <ToastProvider>
        {project === undefined ? (
          <div className="app-booting" data-testid="app-booting">
            正在打开Creation Workshop…
          </div>
        ) : project === null ? (
          <ProjectGate onOpened={setProject} />
        ) : (
          <WorkshopApp key={project.path} project={project} onSwitchProject={() => setProject(null)} />
        )}
      </ToastProvider>
    </div>
  );
}

export default App;
