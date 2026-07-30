/**
 * E2E 测试专用 vitest 配置
 *
 * 与根 vitest.config.ts 的区别：
 * - 更长的超时时间（90s，每个框架的完整爬取可能需要 30s+）
 * - 串行执行（避免多个浏览器实例竞争资源）
 * - 不重试失败（方便快速定位问题）
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // E2E 测试需要真实浏览器和网络，给足时间
    testTimeout: 90000,
    hookTimeout: 30000,
    // 串行执行以避免浏览器冲突
    threads: false,
    singleThread: true,
    // E2E 测试不重试：失败即停止，便于快速定位
    retry: 0,
    // 报告器
    reporters: ['default', 'json'],
    outputFile: {
      json: './tests/e2e/outputs/test-results.json',
    },
  },
});
