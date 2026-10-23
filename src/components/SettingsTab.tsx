// 设置页：应用信息 + 源代码下载（打包 ZIP → 保存到本地 / 调起分享）

import { useMemo, useState } from 'react';
import { Download, FileCode, FileText, Loader2, Share2 } from 'lucide-react';
import { ConfirmDialog, SectionTitle, useAppToast } from '@/components/common';
import { SOURCE_FILES, SOURCE_FILE_COUNT, SOURCE_FILE_TOTAL_BYTES } from '@/lib/source-code';
import { buildZipBase64 } from '@/lib/zip';
import { exportSettingsMarkdown } from '@/lib/export';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ZIP_FILE_NAME = 'worldview-naming-workshop-source.zip';

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function SettingsTab() {
  const toast = useAppToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [packaging, setPackaging] = useState(false);
  const [zipBase64, setZipBase64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [exportingMd, setExportingMd] = useState(false);

  const count = SOURCE_FILE_COUNT;
  const sizeText = useMemo(() => formatBytes(SOURCE_FILE_TOTAL_BYTES), []);

  const handleStartPack = () => {
    setConfirmOpen(false);
    setPackaging(true);
    window.setTimeout(() => {
      try {
        const b64 = buildZipBase64(SOURCE_FILES);
        setZipBase64(b64);
        toast.show('打包完成', 'success');
      } catch {
        toast.show('打包失败，请重试', 'error');
      } finally {
        setPackaging(false);
      }
    }, 30);
  };

  const handleSave = async () => {
    if (!zipBase64 || saving) return;
    setSaving(true);
    try {
      const res = await window.lingguang.saveFile({ data: zipBase64, fileName: ZIP_FILE_NAME });
      if (res && res.success) {
        toast.show('已保存到本地', 'success');
        setZipBase64(null);
      } else {
        toast.show('保存未完成，请重试', 'error');
      }
    } catch (e) {
      toast.show(`保存失败：${e instanceof Error ? e.message : '请重试'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await window.lingguang.app.share({ content: [] });
      if (res && res.success) {
        toast.show('已打开分享面板', 'success');
      } else {
        toast.show(res?.message || '分享未完成', 'error');
      }
    } catch (e) {
      toast.show(`分享失败：${e instanceof Error ? e.message : '请重试'}`, 'error');
    } finally {
      setSharing(false);
    }
  };

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

        <SectionTitle>源代码下载</SectionTitle>
        <div className="settings-card">
          <div className="settings-card-title">
            <FileCode size={18} className="settings-card-icon" />
            项目源码打包
          </div>
          <p className="settings-desc">
            将「世界观命名工坊」当前项目的源代码（页面、数据、逻辑与工程配置）打包为一个 ZIP
            压缩包，打包完成后可保存到本地，或调起分享面板。
          </p>
          <div className="settings-stats">
            <div className="settings-stat">
              <span className="settings-stat-num">{count}</span>
              <span className="settings-stat-label">文件</span>
            </div>
            <div className="settings-stat">
              <span className="settings-stat-num">{sizeText}</span>
              <span className="settings-stat-label">源码体积</span>
            </div>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="primary-btn"
              data-testid="settings-pack-btn"
              disabled={packaging}
              onClick={() => setConfirmOpen(true)}
            >
              {packaging ? <Loader2 size={16} className="spin" /> : <FileCode size={16} />}
              {packaging ? '打包中…' : '打包源代码'}
            </button>
          </div>
        </div>

        <SectionTitle>已保存设定导出</SectionTitle>
        <div className="settings-card">
          <div className="settings-card-title">
            <FileText size={18} className="settings-card-icon" />
            导出全部设定为 Markdown
          </div>
          <p className="settings-desc">
            一键导出全部已保存的设定卡与名称候选，生成 Markdown 文档，并包含全局图谱（节点、连线与可渲染的流程图），可保存到本地继续整理或分享给协作者。
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="primary-btn"
              data-testid="settings-export-md-btn"
              disabled={exportingMd}
              onClick={() => void handleExportMd()}
            >
              {exportingMd ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
              {exportingMd ? '导出中…' : '导出为 Markdown'}
            </button>
          </div>
        </div>

        <SectionTitle>关于</SectionTitle>
        <div className="settings-card">
          <p className="settings-about-name">世界观命名工坊</p>
          <p className="settings-desc">
            为虚构世界观生成人名、地名、官职与绰号，支持组合规则、候选收藏、设定卡、关系图谱与多维统计的命名创作工具。
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="打包源代码"
        description={`将把当前项目的 ${count} 个源码文件（约 ${sizeText}）打包为 ZIP 压缩包，确认后即可保存到本地或调起分享。`}
        confirmText="开始打包"
        testId="settings-confirm"
        onConfirm={handleStartPack}
      />

      <AlertDialog open={zipBase64 !== null} onOpenChange={(o) => { if (!o) setZipBase64(null); }}>
        <AlertDialogContent className="confirm-dialog" data-testid="settings-result">
          <AlertDialogHeader>
            <AlertDialogTitle>打包完成</AlertDialogTitle>
            <AlertDialogDescription>
              已生成 {ZIP_FILE_NAME}（{count} 个文件，约 {sizeText}），可选择保存到本地，或调起分享面板。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="settings-result-actions">
            <button
              type="button"
              className="secondary-btn"
              data-testid="settings-share-btn"
              disabled={sharing || saving}
              onClick={() => void handleShare()}
            >
              <Share2 size={16} />
              {sharing ? '分享中…' : '分享'}
            </button>
            <button
              type="button"
              className="primary-btn"
              data-testid="settings-save-btn"
              disabled={saving || sharing}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
              {saving ? '保存中…' : '保存到本地'}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}