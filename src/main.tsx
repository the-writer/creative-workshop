import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { RulesWindow } from './components/RulesWindow';

interface ErrorBoundaryState {
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : '未知错误' };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('应用渲染失败', error, info.componentStack);
  }

  override render() {
    if (this.state.message) {
      return (
        <main className="fatal-error">
          <h1>Creation Workshop暂时无法显示</h1>
          <p>{this.state.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            重新载入
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('缺少应用挂载节点');

const isRulesWindow = new URLSearchParams(window.location.search).get('window') === 'rules';

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>{isRulesWindow ? <RulesWindow /> : <App />}</AppErrorBoundary>
  </StrictMode>,
);
