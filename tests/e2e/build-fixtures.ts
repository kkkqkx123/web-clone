/**
 * E2E Fixture Build Script
 *
 * 批量构建所有框架的 E2E fixture 并复制产物到 builds/ 目录。
 *
 * 使用方式：
 *   # 构建所有框架
 *   npx tsx tests/e2e/build-fixtures.ts
 *
 *   # 构建单个框架
 *   npx tsx tests/e2e/build-fixtures.ts --framework vue3-spa
 *
 * 每个 fixture 的构建流程：
 *   1. npm install（安装依赖）
 *   2. npm run build（生产构建）
 *   3. 复制产物到 tests/e2e/builds/<framework>/
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const FIXTURES_DIR = join(__dirname, 'fixtures');
const BUILDS_DIR = join(__dirname, 'builds');

interface FixtureConfig {
  name: string;
  /** 构建产物所在的子目录（相对于 fixture 根目录） */
  outputSubdir: string;
}

const FIXTURES: FixtureConfig[] = [
  { name: 'vue3-spa', outputSubdir: 'dist' },
  { name: 'react18-spa', outputSubdir: 'dist' },
  { name: 'angular-spa', outputSubdir: 'dist' },
  { name: 'sveltekit-ssr', outputSubdir: 'dist' },
  { name: 'nextjs-ssr', outputSubdir: 'dist' },
  { name: 'nuxt3-ssr', outputSubdir: '.output/public' },
  { name: 'vitepress-ssr', outputSubdir: '.vitepress/dist' },
  { name: 'vue2-spa', outputSubdir: 'dist' },
  { name: 'astro-ssr', outputSubdir: 'dist' },
];

function buildFixture(config: FixtureConfig): boolean {
  const fixtureDir = join(FIXTURES_DIR, config.name);
  const outputDir = join(fixtureDir, config.outputSubdir);
  const targetDir = join(BUILDS_DIR, config.name);

  console.log(`\n=== Building ${config.name} ===`);

  if (!existsSync(fixtureDir)) {
    console.error(`  ERROR: Fixture directory not found: ${fixtureDir}`);
    return false;
  }

  // Step 1: Install dependencies
  console.log(`  [1/3] Installing dependencies...`);
  try {
    execSync('npm install --no-package-lock', {
      cwd: fixtureDir,
      stdio: 'inherit',
      timeout: 180000,
    });
  } catch (err) {
    console.error(`  ERROR: npm install failed for ${config.name}`);
    return false;
  }

  // Step 2: Build
  console.log(`  [2/3] Building...`);
  try {
    execSync('npm run build', {
      cwd: fixtureDir,
      stdio: 'inherit',
      timeout: 300000,
      env: { ...process.env, NODE_ENV: 'production' },
    });
  } catch (err) {
    console.error(`  ERROR: Build failed for ${config.name}`);
    return false;
  }

  // Step 3: Copy output
  console.log(`  [3/3] Copying to builds/${config.name}...`);
  if (!existsSync(outputDir)) {
    console.error(`  ERROR: Output directory not found: ${outputDir}`);
    return false;
  }

  // Clean and recreate target
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true });
  }
  mkdirSync(targetDir, { recursive: true });

  cpSync(outputDir, targetDir, { recursive: true });

  // 后处理：修复静态生成框架的绝对路径为相对路径
  // SvelteKit、Next.js 等框架可能生成绝对路径 (/_app/, /_next/)
  // 但 E2E fixture server 使用 /fixtureName/ 前缀提供文件
  const htmlPath = join(targetDir, 'index.html');
  if (existsSync(htmlPath)) {
    let html = readFileSync(htmlPath, 'utf-8');
    let modified = false;

    // 修复 src/href 属性中的绝对路径
    const before1 = html.length;
    html = html.replace(/(src|href)="\/([^"])/g, '$1="./$2');
    if (html.length !== before1) {
      modified = true;
    }

    // 修复内联脚本中的 import('/_app/...') 等动态导入绝对路径
    // SvelteKit 构建产物会在 <script> 中生成 import("/_app/...") 语句
    const before2 = html.length;
    html = html.replace(/(import\s*\(\s*["'])\/(_app\/)/g, '$1./$2');
    html = html.replace(/(import\s*\(\s*["'])\/(_next\/)/g, '$1./$2');
    // 修复 fetch('/api/...') 和类似函数调用中的绝对路径
    html = html.replace(/(["'])\/(_app\/)/g, '$1./$2');
    html = html.replace(/(["'])\/(_next\/)/g, '$1./$2');

    if (html.length !== before2) {
      modified = true;
    }

    if (modified) {
      writeFileSync(htmlPath, html);
      console.log(`  Post-processed: fixed absolute paths in index.html`);
    }
  }

  // Nuxt 3 特殊处理：如果 index 文件存在但没有 .html 扩展名
  if (config.name === 'nuxt3-ssr') {
    const nuxtIndexPath = join(targetDir, 'index');
    const nuxtHtmlPath = join(targetDir, 'index.html');
    if (existsSync(nuxtIndexPath) && !existsSync(nuxtHtmlPath)) {
      // Nuxt 静态输出中 index 就是 HTML，重命名
      const content = readFileSync(nuxtIndexPath, 'utf-8');
      writeFileSync(nuxtHtmlPath, content);
      console.log(`  (nuxt3-ssr) Renamed index -> index.html`);
    }
  }

  console.log(`  DONE: ${config.name}`);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const frameworkFilter = args.find((a) => a.startsWith('--framework='))?.split('=')[1];

  const fixturesToBuild = frameworkFilter
    ? FIXTURES.filter((f) => f.name === frameworkFilter)
    : FIXTURES;

  if (frameworkFilter && fixturesToBuild.length === 0) {
    console.error(`Unknown framework: ${frameworkFilter}`);
    console.error(`Available: ${FIXTURES.map((f) => f.name).join(', ')}`);
    process.exit(1);
  }

  // Ensure builds directory exists
  mkdirSync(BUILDS_DIR, { recursive: true });

  const results: { name: string; success: boolean }[] = [];

  for (const fixture of fixturesToBuild) {
    const success = buildFixture(fixture);
    results.push({ name: fixture.name, success });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Build Summary');
  console.log('='.repeat(60));
  for (const r of results) {
    console.log(`  [${r.success ? 'OK' : 'FAIL'}] ${r.name}`);
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.error(`\n${failed.length} fixture(s) failed to build.`);
    process.exit(1);
  }

  console.log(`\nAll ${results.length} fixture(s) built successfully.`);
}

main();
