#!/usr/bin/env node
/**
 * 浏览器环境总览检查
 *
 * 同时检查 Playwright 和 Puppeteer 环境，输出汇总报告。
 *
 * 用法： node scripts/check-browsers.mjs
 */

import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function runScript(name) {
  try {
    const out = execSync(`node ${resolve(ROOT, 'scripts', name)}`, {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, output: err.stdout || '', error: err.stderr || err.message };
  }
}

console.log('═'.repeat(54));
console.log('   🌐  Browser Environment Overview');
console.log('═'.repeat(54));

console.log(`\n  Platform: ${process.platform}`);
console.log(`  Node:     ${process.version}`);
console.log(`  PWD:      ${process.cwd()}\n`);

// ── Playwright ───────────────────────────────────────
console.log('┌─ Playwright ──────────────────────────────┐');
const pw = runScript('check-playwright.mjs');
if (pw.ok) {
  // 提取关键行摘要
  const lines = pw.output.split('\n').filter(l => l.includes('✅') || l.includes('❌'));
  for (const l of lines) console.log(l);
} else {
  console.log('  ❌  Playwright check failed');
  if (pw.error) console.log(`      ${pw.error.split('\n')[0]}`);
}
console.log('└────────────────────────────────────────────┘\n');

// ── Puppeteer ───────────────────────────────────────
console.log('┌─ Puppeteer ───────────────────────────────┐');
const pp = runScript('check-puppeteer.mjs');
if (pp.ok) {
  const lines = pp.output.split('\n').filter(l => l.includes('✅') || l.includes('❌'));
  for (const l of lines) console.log(l);
} else {
  console.log('  ❌  Puppeteer check failed');
  if (pp.error) console.log(`      ${pp.error.split('\n')[0]}`);
}
console.log('└────────────────────────────────────────────┘\n');

console.log('═'.repeat(54));
console.log('   Done.');
console.log('═'.repeat(54));