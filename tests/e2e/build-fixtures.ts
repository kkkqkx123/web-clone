/**
 * E2E Fixture Build Script
 *
 * Batch-builds the E2E fixtures for all frameworks and copies the artifacts into the builds/ directory.
 *
 * Usage:
 *   # Build all frameworks
 *   npx tsx tests/e2e/build-fixtures.ts
 *
 *   # Build a single framework
 *   npx tsx tests/e2e/build-fixtures.ts --framework vue3-spa
 *
 * Build steps for each fixture:
 *   1. npm install (install dependencies)
 *   2. npm run build (production build)
 *   3. Copy artifacts to tests/e2e/builds/<framework>/
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');
const BUILDS_DIR = join(__dirname, 'builds');

interface FixtureConfig {
  name: string;
  /** Subdirectory that contains the build output (relative to the fixture root) */
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

  // Post-process: rewrite absolute paths to relative paths for statically generated frameworks
  // SvelteKit, Next.js, etc. may emit absolute paths (/_app/, /_next/),
  // but the E2E fixture server serves files under the /fixtureName/ prefix
  const htmlPath = join(targetDir, 'index.html');
  if (existsSync(htmlPath)) {
    let html = readFileSync(htmlPath, 'utf-8');
    let modified = false;

    // Fix absolute paths in src/href attributes
    const before1 = html.length;
    html = html.replace(/(src|href)="\/([^"])/g, '$1="./$2');
    if (html.length !== before1) {
      modified = true;
    }

    // Fix absolute paths in dynamic imports like import('/_app/...') inside inline scripts
    // SvelteKit builds emit import("/_app/...") statements inside <script>
    const before2 = html.length;
    html = html.replace(/(import\s*\(\s*["'])\/(_app\/)/g, '$1./$2');
    html = html.replace(/(import\s*\(\s*["'])\/(_next\/)/g, '$1./$2');
    // Fix absolute paths in fetch('/api/...') and similar call sites
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

  // Nuxt 3 special case: when the index file exists without a .html extension
  if (config.name === 'nuxt3-ssr') {
    const nuxtIndexPath = join(targetDir, 'index');
    const nuxtHtmlPath = join(targetDir, 'index.html');
    if (existsSync(nuxtIndexPath) && !existsSync(nuxtHtmlPath)) {
      // In Nuxt static output the index file is HTML; rename it
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
