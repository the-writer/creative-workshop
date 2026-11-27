import { defineConfig } from 'vite';
import path from 'node:path';

// 命令行工具构建：把 src/cli 打包成单文件 CommonJS。
// 产物 release/cli/cli.cjs 既可由 node 直接运行，也可由桌面应用以 `--cli` 模式加载。
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  esbuild: {
    include: /\.[cm]?tsx?$/,
  },
  build: {
    ssr: 'src/cli/index.ts',
    outDir: 'release/cli',
    target: 'node20',
    minify: false,
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'cjs',
        entryFileNames: 'cli.cjs',
        inlineDynamicImports: true,
      },
    },
  },
  ssr: {
    target: 'node',
  },
});
