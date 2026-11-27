// `workshop open`：拉起 Creation Workshop 桌面应用。

import { spawnSync } from 'node:child_process';

import { APP_BUNDLE_ID, APP_NAME } from '@/cli/constants';

export function runOpen(write: (text: string) => void, writeError: (text: string) => void): number {
  if (process.platform !== 'darwin') {
    writeError('拉起桌面应用仅支持 macOS');
    return 1;
  }
  // -g：后台启动，不激活应用、不抢前台（应用本身只驻留托盘，不弹主窗口）
  const result = spawnSync('/usr/bin/open', ['-g', '-b', APP_BUNDLE_ID], { stdio: 'ignore' });
  if (result.status !== 0) {
    writeError(`拉起 ${APP_NAME} 失败`);
    return 1;
  }
  write(`已在后台拉起 ${APP_NAME}`);
  return 0;
}
