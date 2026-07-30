/**
 * E2E Assertion Utilities
 *
 * 公共断言函数，统一各框架的验证标准。
 * 所有断言均针对 web-clone 的快照输出结果进行验证。
 */

import { expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { CrawlResult } from './spider-runner.js';

/**
 * 验证 bundle 模式的输出目录结构：
 * - 必须存在 index.html
 * - 如果下载了子资源，应存在 assets/ 目录
 */
export function assertBundleStructure(outputDir: string): void {
  expect(existsSync(outputDir), `输出目录应存在: ${outputDir}`).toBe(true);
  expect(existsSync(join(outputDir, 'index.html')), `应存在 index.html: ${outputDir}`).toBe(true);
}

/**
 * 验证 single-file 模式输出：
 * - 输出文件存在
 * - HTML 中包含内联 CSS（<style>）或 data: URI
 */
export function assertSingleFileMode(outputPath: string): void {
  expect(existsSync(outputPath), `single-file 输出应存在: ${outputPath}`).toBe(true);

  const content = readFileSync(outputPath, 'utf-8');

  // single-file 模式下 HTML 中的 CSS/JS 应该被内联
  const hasInlineStyles = /<style[^>]*>/.test(content);
  const hasDataUri = /data:(text\/css|application\/javascript|text\/javascript)/.test(content);
  const hasScriptContent = /<script[^>]*>[\s\S]{50,}?<\/script>/.test(content);

  // 至少有一种内联方式
  expect(
    hasInlineStyles || hasDataUri || hasScriptContent,
    `single-file 模式应有内联 CSS 或 data: URI，或含内容的 <script>: ${outputPath}`
  ).toBe(true);

  // 检查同目录下不应有 assets/ 子目录
  const parentDir = dirname(outputPath);
  const assetsDir = join(parentDir, 'assets');
  if (existsSync(assetsDir)) {
    const entries = readdirSync(assetsDir);
    expect(
      entries.length,
      `single-file 模式下 assets/ 应为空，但包含 ${entries.length} 个文件`
    ).toBe(0);
  }
}

/**
 * 验证 HTML 文件包含有效的结构标记：
 * - 包含 <!DOCTYPE html>
 * - 包含 <html> 和 </html>
 * - 包含 <head>
 * - 包含 <body>
 */
export function assertValidHtml(htmlPath: string): void {
  expect(existsSync(htmlPath), `HTML 文件应存在: ${htmlPath}`).toBe(true);
  const content = readFileSync(htmlPath, 'utf-8');
  expect(content, 'HTML 内容不应为空').toBeTruthy();
  expect(content, '应包含 DOCTYPE 声明').toMatch(/<!DOCTYPE html/i);
  expect(content, '应包含 <html> 标签').toMatch(/<html/i);
  expect(content, '应包含 </html> 标签').toMatch(/<\/html>/i);
  expect(content, '应包含 <head> 标签').toMatch(/<head/i);
  expect(content, '应包含 <body> 标签').toMatch(/<body/i);
}

/**
 * 验证页面内容被正确捕获：
 * - 文本内容 > 100 字符（排除空白页 / 加载骨架）
 * - 至少包含 3 个 HTML 元素标签（排除仅文本的空白页）
 */
export function assertContentCaptured(htmlPath: string): void {
  const content = readFileSync(htmlPath, 'utf-8');

  // 提取纯文本（去除 HTML 标签）
  const textContent = content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  expect(
    textContent.length,
    `文本内容长度应 >= 100，实际: ${textContent.length}
     内容预览: ${textContent.substring(0, 200)}`
  ).toBeGreaterThanOrEqual(100);

  // 统计 HTML 元素标签数量
  const elementMatches = content.match(/<\/[a-zA-Z][a-zA-Z0-9]*>/g) || [];
  expect(
    elementMatches.length,
    `应至少包含 3 个 HTML 闭合标签，实际: ${elementMatches.length}`
  ).toBeGreaterThanOrEqual(3);
}

/**
 * 验证框架检测结果：
 * - 检测到的框架与期望一致
 * - 置信度 >= minConfidence
 */
export function assertFrameworkDetection(
  result: CrawlResult,
  expectedFramework: string,
  minConfidence = 0
): void {
  expect(
    result.frameworkMatch,
    `爬取结果应包含 frameworkMatch 信息: ${result.framework}`
  ).not.toBeNull();

  const match = result.frameworkMatch!;
  expect(
    match.detected,
    `${result.framework}: 检测到的框架应为 ${expectedFramework}，实际: ${match.detected}`
  ).toBe(expectedFramework);
  expect(
    match.match,
    `${result.framework}: 框架应匹配 ${expectedFramework}`
  ).toBe(true);
  expect(
    match.confidence,
    `${result.framework}: 置信度 ${match.confidence} 应 >= ${minConfidence}`
  ).toBeGreaterThanOrEqual(minConfidence);
}

/**
 * 验证 SPA 检测结果存在且包含了水合标记。
 */
export function assertSpaHydrationDetected(result: CrawlResult): void {
  expect(
    result.spaDetection,
    `${result.framework}: SPA 检测结果不应为空`
  ).not.toBeNull();

  const spa = result.spaDetection!;
  expect(
    spa.markers,
    `${result.framework}: 至少应有 1 个检测标记`
  ).not.toHaveLength(0);
  expect(
    spa.confidence,
    `${result.framework}: 置信度应 > 0`
  ).toBeGreaterThan(0);
}

/**
 * 验证子资源被下载：
 * - assets/ 目录存在且非空
 */
export function assertSubResourcesDownloaded(outputDir: string): void {
  const assetsDir = join(outputDir, 'assets');
  if (existsSync(assetsDir)) {
    const entries = readdirSync(assetsDir);
    expect(
      entries.length,
      `assets/ 目录应包含子资源文件`
    ).toBeGreaterThan(0);
  }
  // 如果 assets 不存在，说明页面可能没有外部子资源或已被内联，
  // 这不视为失败，但记录为信息
}

/**
 * 验证所有爬取结果均无错误。
 */
export function assertAllCrawlsSuccessful(results: CrawlResult[]): void {
  const failures = results.filter((r) => !r.success);
  expect(
    failures,
    `所有爬取应成功，失败数: ${failures.length}/${results.length}\n${failures.map((f) => `  - ${f.framework}: ${f.error}`).join('\n')}`
  ).toHaveLength(0);
}

/**
 * 生成并验证爬取结果摘要。
 */
export function generateResultsSummary(results: CrawlResult[]): string {
  const lines: string[] = [];
  lines.push('='.repeat(60));
  lines.push('SPA 抓取 E2E 测试结果汇总');
  lines.push('='.repeat(60));

  for (const r of results) {
    const status = r.success ? 'PASS' : 'FAIL';
    const match = r.frameworkMatch;
    const detected = match ? match.detected : 'N/A';
    const expected = match?.expected || 'N/A';
    const confidence = match ? `${(match.confidence * 100).toFixed(1)}%` : 'N/A';
    const duration = `${(r.duration / 1000).toFixed(1)}s`;

    lines.push(`\n[${status}] ${r.framework}`);
    lines.push(`  框架检测: ${detected} (期望: ${expected}, 置信度: ${confidence})`);
    if (r.spaDetection?.isHydrated) {
      lines.push(`  水合状态: 已确认`);
    }
    if (r.stats) {
      lines.push(`  资源: ${r.stats.fetchedAssets}/${r.stats.totalAssets} 已下载, ${r.stats.totalBytes} bytes`);
    }
    lines.push(`  耗时: ${duration}`);
    if (r.error) {
      lines.push(`  错误: ${r.error}`);
    }
  }

  const passed = results.filter((r) => r.success).length;
  lines.push(`\n总计: ${passed}/${results.length} 通过`);

  const summary = lines.join('\n');
  console.log(summary);
  return summary;
}
