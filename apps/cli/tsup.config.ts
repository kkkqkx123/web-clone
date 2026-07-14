import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  dts: false,
  sourcemap: true,
  target: 'node20',
  platform: 'node',
  shims: false,
  bundle: true,
  splitting: false,
  // commander/ chalk 等 CLI 依赖应打包进单文件，
  // 但 monorepo workspace 依赖需外部化，避免重复打包
  external: [
    '@web-clone/core',
    '@web-clone/codegen',
    '@web-clone/adapter-playwright',
    '@web-clone/adapter-puppeteer',
  ],
});