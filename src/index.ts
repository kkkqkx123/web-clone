/**
 * web-clone 库入口
 *
 * 提供三个主要API：
 * 1. snapshot() - 基础快照（HTTP直接拉取）
 * 2. snapshotWithPlaywright() - Playwright快照（支持认证）
 * 3. snapshotWithBrowserContext() - 细粒度控制（自己管理浏览器）
 *
 * 还提供 convertLocalSnapshot() 用于本地转换
 */

// 核心快照API
export {
  snapshot,
  snapshotWithPlaywright,
  snapshotWithBrowserContext,
  convertLocalSnapshot,
} from './assembler.js';

// 核心类型
export type {
  SnapshotOptions,
  SnapshotResult,
  SnapshotMode,
  AssetType,
  AssetStatus,
  Asset,
  AssetRef,
  ComponentSpec,
  ComponentManifest,
  StateVariable,
  EventBinding,
  MethodSpec,
  MigrationTodo,
  ConvertResult,
  FrameworkCodeGenOptions,
  GeneratedComponent,
  GeneratedFramework,
} from './types.js';

// Playwright相关导出（高级功能）
export { PlaywrightFetcherAdapter } from './adapters/index.js';
export type { PlaywrightAdapterOptions } from './adapters/index.js';

// 可选工具函数导出
export { parseHtml } from './parser/html-parser.js';
