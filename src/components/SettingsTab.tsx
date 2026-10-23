// 设置页：应用信息、数据导出，以及暂不可用能力的保留入口

import { useState } from 'react';
import { FileText, Loader2, Share2 } from 'lucide-react';
import { ConfirmDialog, SectionTitle, useAppToast } from '@/components/common';
import { exportSettingsMarkdown } from '@/lib/export';

export function SettingsTab() {
  const toast = useAppToast();
  const [shareUnavailable, setShareUnavailable] = useState(false);
  const [exportingMd, setExportingMd] = useState(false);

  const handleExportMd = async () => {
    if (exportingMd) return;
    setExportingMd(true);
    const res = await exportSettingsMarkdown();
    setExportingMd(false);
    if (res.ok) toast.show(`已导出 ${res.fileName}`, 'success');
    else toast.show(res.message || '导出失败', 'error');
  };

  return (
    <div className="page-shell settings-page">
      <div className="app-scroll">
        <div className="sheets-header">
          <p className="sheets-title">设置</p>
        </div>

        <SectionTitle>分享</SectionTitle>
        <div className="settings-card">
          <div className="settings-card-title">
            <Share2 size={18} className="settings-card-icon" />
            分享当前数据
          </div>
          <p className="settings-desc">当前桌面版暂未接入系统分享服务，入口保留以便后续恢复。</p>
          <div className="settings-actions">
            <button type="button" className="secondary-btn" data-testid="settings-share-btn" onClick={() => setShareUnavailable(true)}>
              <Share2 size={16} />
              分享
            </button>
          </div>
        </div>

        <SectionTitle>已保存设定导出</SectionTitle>
        <div className="settings-card">
          <div className="settings-card-title">
            <FileText size={18} className="settings-card-icon" />
            导出全部设定为 Markdown
          </div>
          <p className="settings-desc">导出设定卡、名称候选与全局图谱，并包含可直接渲染的 Mermaid 流程图。</p>
          <div className="settings-actions">
            <button type="button" className="primary-btn" data-testid="settings-export-md-btn" disabled={exportingMd} onClick={() => void handleExportMd()}>
              {exportingMd ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
              {exportingMd ? '导出中…' : '导出为 Markdown'}
            </button>
          </div>
        </div>

        <SectionTitle>关于</SectionTitle>
        <div className="settings-card">
          <p className="settings-about-name">创作工坊</p>
          <p className="settings-desc">为小说世界观生成人名、地名、官职与绰号，并组织候选、设定卡、关系图谱与统计。</p>
        </div>
      </div>

      <ConfirmDialog
        open={shareUnavailable}
        onOpenChange={setShareUnavailable}
        title="分享暂不可用"
        description="当前桌面版未接入系统分享服务。入口已保留，可通过设置页的数据导出功能保存文件。"
        confirmText="知道了"
        showCancel={false}
        testId="settings-unavailable"
        onConfirm={() => setShareUnavailable(false)}
      />
    </div>
  );
}
