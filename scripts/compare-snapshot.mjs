#!/usr/bin/env node
/**
 * compare-snapshot.mjs — 快照输出完整性检查
 *
 * 功能：比较原始页面与快照输出，检测内容是否丢失。
 * 支持 HTTP 模式（静态 HTML）和 Playwright 渲染后的对比。
 *
 * 用法：
 *   node scripts/compare-snapshot.mjs <original.html> <snapshot.html>
 *   node scripts/compare-snapshot.mjs debug-page.html apps/cli/snapshot/index.html
 */

import { readFileSync } from 'node:fs';

const [origPath, snapPath] = process.argv.slice(2);

if (!origPath || !snapPath) {
  console.error('Usage: node scripts/compare-snapshot.mjs <original.html> <snapshot.html>');
  process.exit(1);
}

function countTags(htmlStr) {
  const counts = {};
  const matches = htmlStr.match(/<\/(\w+)>/g);
  if (matches) {
    for (const m of matches) {
      const tag = m.slice(2, -1);
      counts[tag] = (counts[tag] || 0) + 1;
    }
  }
  return counts;
}

function fmt(n) { return n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`; }

async function main() {
  const original = readFileSync(origPath, 'utf8');
  const snapshot = readFileSync(snapPath, 'utf8');

  console.log('='.repeat(60));
  console.log('  Snapshot Content Comparison');
  console.log('='.repeat(60));
  console.log(`  Original: ${origPath}`);
  console.log(`  Snapshot: ${snapPath}`);
  console.log('='.repeat(60));

  // ── 1. Size comparison ───────────────────────────────────────
  console.log('\n📏 Size:');
  console.log(`  Original: ${fmt(original.length)} (${original.length} bytes)`);
  console.log(`  Snapshot: ${fmt(snapshot.length)} (${snapshot.length} bytes)`);
  const diff = snapshot.length - original.length;
  console.log(`  Delta:    ${diff >= 0 ? '+' : ''}${fmt(Math.abs(diff))}`);

  // ── 2. Tag count comparison ─────────────────────────────────
  console.log('\n🔢 Element counts:');
  const origTags = countTags(original);
  const snapTags = countTags(snapshot);
  const allTags = new Set([...Object.keys(origTags), ...Object.keys(snapTags)]);
  let hasDiff = false;

  for (const tag of [...allTags].sort()) {
    const oc = origTags[tag] || 0;
    const sc = snapTags[tag] || 0;
    if (oc !== sc) {
      hasDiff = true;
      const sign = sc > oc ? '+' : '';
      console.log(`  ${tag.padEnd(12)} original=${String(oc).padStart(4)}  snapshot=${String(sc).padStart(4)}  (${sign}${sc - oc})`);
    }
  }
  if (!hasDiff) console.log('  ✅ All element counts match');

  // ── 3. Content preservation ──────────────────────────────────
  console.log('\n🔍 Content checks:');

  // Check key structural elements
  const checks = [
    ['<svg', 'SVG elements'],
    ['<script>', 'Inline scripts'],
    ['<style>', 'Inline styles'],
    ['data-i18n', 'i18n attributes'],
    ['marker-end', 'SVG marker references'],
    ['innerHTML', 'JS innerHTML calls'],
    ['createElement', 'JS createElement calls'],
    ['addEventListener', 'JS event listeners'],
    ['appendChild', 'JS appendChild calls'],
  ];

  for (const [pattern, label] of checks) {
    const oc = (original.match(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    const sc = (snapshot.match(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    const ok = oc === sc;
    console.log(`  ${ok ? '✅' : '❌'} ${label}: ${ok ? `${oc} (match)` : `original=${oc} snapshot=${sc}`}`);
  }

  // ── 4. Script content integrity ──────────────────────────────
  const origScript = original.match(/<script>([\s\S]*?)<\/script>/i);
  const snapScript = snapshot.match(/<script>([\s\S]*?)<\/script>/i);

  if (origScript && snapScript) {
    console.log('\n📜 Script content:');
    const os = origScript[1];
    const ss = snapScript[1];
    console.log(`  Original: ${fmt(os.length)}`);
    console.log(`  Snapshot: ${fmt(ss.length)}`);

    // Check for HTML entity encoding issues
    const ampInSnap = (ss.match(/&amp;/g) || []).length;
    const ltInSnap = (ss.match(/&lt;/g) || []).length;
    if (ampInSnap > 0 || ltInSnap > 0) {
      console.log(`  ⚠️  HTML entity encoding detected: &amp;=${ampInSnap}, &lt;=${ltInSnap}`);
      console.log(`  This indicates XML serialization issue — script content may be corrupted.`);
    } else {
      console.log(`  ✅ No HTML entity encoding (clean serialization)`);
    }

    // Check key JS structures
    const keyPatterns = ['function ', 'const ', 'let ', 'var ', '=>', 'import ', 'export '];
    const missing = keyPatterns.filter(p => os.includes(p) && !ss.includes(p));
    if (missing.length) {
      console.log(`  ❌ Missing JS structures: ${missing.join(', ')}`);
    }
  } else {
    console.log('\n📜 Script: (no inline script found)');
  }

  // ── 5. Style content integrity ───────────────────────────────
  const origStyle = original.match(/<style>([\s\S]*?)<\/style>/i);
  const snapStyle = snapshot.match(/<style>([\s\S]*?)<\/style>/i);
  if (origStyle && snapStyle) {
    console.log('\n🎨 Style content:');
    const same = origStyle[1] === snapStyle[1];
    console.log(`  ${same ? '✅' : '❌'} Styles identical: ${same}`);
    if (!same) {
      console.log(`  Original: ${fmt(origStyle[1].length)}`);
      console.log(`  Snapshot: ${fmt(snapStyle[1].length)}`);
    }
  }

  // ── 6. Body content ──────────────────────────────────────────
  const origBody = original.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const snapBody = snapshot.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (origBody && snapBody) {
    // Normalize whitespace for comparison
    const oClean = origBody[1].replace(/\s+/g, ' ').trim();
    const sClean = snapBody[1].replace(/\s+/g, ' ').trim();
    const bodyMatch = oClean === sClean;

    console.log(`\n📄 Body content:`);
    console.log(`  ${bodyMatch ? '✅ Identical' : '❌ Differs'}`);
    if (!bodyMatch) {
      // Find first difference
      for (let i = 0; i < Math.min(oClean.length, sClean.length); i++) {
        if (oClean[i] !== sClean[i]) {
          console.log(`  First diff at position ${i}:`);
          console.log(`    Original: …${oClean.substring(Math.max(0, i - 40), i + 40)}…`);
          console.log(`    Snapshot: …${sClean.substring(Math.max(0, i - 40), i + 40)}…`);
          break;
        }
      }
    }
  }

  // ── 7. Overall verdict ───────────────────────────────────────
  const allChecksPass = !hasDiff && checks.every(([p]) => {
    const oc = (original.match(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    const sc = (snapshot.match(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    return oc === sc;
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${allChecksPass ? '✅ Snapshot integrity check PASSED' : '❌ Snapshot integrity check FAILED — review differences above'}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});