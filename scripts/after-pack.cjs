const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const asarmor = require('asarmor');

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const asarPath = join(packager.getResourcesDir(appOutDir), 'app.asar');

  const archive = await asarmor.open(asarPath);
  archive.patch();
  await archive.write(asarPath);

  const platform = packager.platform.name;
  const productFilename = packager.appInfo.productFilename;
  const executablePath =
    platform === 'mac'
      ? join(appOutDir, `${productFilename}.app`, 'Contents', 'MacOS', productFilename)
      : platform === 'win'
        ? join(appOutDir, `${productFilename}.exe`)
        : join(appOutDir, productFilename);

  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  await flipFuses(executablePath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: platform === 'mac' && context.arch === 'arm64',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });

  if (platform === 'mac') {
    const appPath = join(appOutDir, `${productFilename}.app`);
    const signing = spawnSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
    if (signing.status !== 0) throw new Error('ad-hoc 签名失败');
  }
};
