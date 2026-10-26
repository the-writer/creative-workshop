import { useState, type ReactNode } from 'react';
import './App.css';
import { BarChart3, Library, PenLine, Settings, Share2, Users } from 'lucide-react';
import { GenerateTab, type EditorPrefill } from '@/components/GenerateTab';
import { LibraryTab } from '@/components/LibraryTab';
import { SheetsTab } from '@/components/SheetsTab';
import { SheetEditor } from '@/components/SheetEditor';
import { GraphTab } from '@/components/GraphTab';
import { StatsTab } from '@/components/StatsTab';
import { SettingsTab } from '@/components/SettingsTab';
import { ToastProvider } from '@/components/common';
import { cn } from '@/lib/utils';

type PageKey = 'generate' | 'library' | 'sheets' | 'graph' | 'stats' | 'settings';

interface EditorState {
  sheetId: string | null;
  prefill: EditorPrefill | null;
}

const NAV_ITEMS: Array<{ key: PageKey; label: string; icon: ReactNode }> = [
  { key: 'generate', label: '生成', icon: <PenLine size={20} /> },
  { key: 'library', label: '候选库', icon: <Library size={20} /> },
  { key: 'sheets', label: '设定', icon: <Users size={20} /> },
  { key: 'graph', label: '图谱', icon: <Share2 size={20} /> },
  { key: 'stats', label: '统计', icon: <BarChart3 size={20} /> },
  { key: 'settings', label: '设置', icon: <Settings size={20} /> },
];

function App() {
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
    <div id="container" className="app-root">
      <header className="desktop-titlebar" aria-label="窗口标题栏">
        <span className="desktop-titlebar-mark">创</span>
        <span>创作工坊</span>
      </header>
      <ToastProvider>
        {/* 生成页常驻挂载：切换底部页签或打开设定编辑器时只隐藏、不卸载，保留已生成结果 */}
        <div className={cn('app-shell', editor && 'app-shell-hidden')} aria-hidden={editor ? true : undefined}>
          <div className="app-page-slot">
            <div className={cn('app-page-pane', page !== 'generate' && 'app-page-pane-hidden')}>
              <GenerateTab onOpenEditor={(p) => openEditor(p)} />
            </div>
            {page === 'library' ? <LibraryTab refreshKey={refreshKey} onOpenEditor={(p) => openEditor(p)} onGoGenerate={() => setPage('generate')} /> : null}
            {page === 'sheets' ? <SheetsTab refreshKey={refreshKey} onOpenEditor={(p, id) => openEditor(p, id)} /> : null}
            {page === 'graph' ? <GraphTab refreshKey={refreshKey} onGoSheets={() => setPage('sheets')} /> : null}
            {page === 'stats' ? <StatsTab refreshKey={refreshKey} /> : null}
            {page === 'settings' ? <SettingsTab /> : null}
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
      </ToastProvider>
    </div>
  );
}

export default App;
