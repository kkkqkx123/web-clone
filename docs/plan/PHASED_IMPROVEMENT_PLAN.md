# Playwright适配分阶段改进计划

**基础**: 根据 ANALYSIS_PLAYWRIGHT_DESIGN.md 的分析结果制定

**总体目标**: 补齐CLI层Playwright支持，优化资源管理，保持库API稳定性

---

## 阶段总览

| 阶段 | 优先级 | 目标 | 预期周期 | 依赖 |
|------|-------|------|---------|------|
| P0 | 🔴 高 | CLI Playwright集成 | 2-3天 | 无 |
| P1 | 🟠 中 | ResourceFilter重构 | 1-2天 | P0完成可提前 |
| P2 | 🟡 低 | State保存/恢复 | 1天 | 无 |

---

## Phase 0: CLI Playwright集成

### 0.0 概述

**目标**: 让CLI用户能通过命令行选项使用Playwright进行需要登录或JS执行的网站快照

**成果物**:
- 新增CLI选项支持
- 支持自定义登录脚本
- 支持状态保存和加载

**影响范围**:
- `src/cli.ts` - 主CLI入口（改动）
- `src/config/cli-adapter.ts` - 配置适配器（新增）
- `src/types.ts` - 类型定义（扩展）
- 测试覆盖

### 0.1 类型定义扩展

**文件**: `src/types.ts`

**变更**:
```typescript
// 新增Playwright相关选项
export interface SnapshotOptions {
  // ... 现有字段
  
  // 新增字段（P0）
  usePlaywright?: boolean;
  browserLaunchOptions?: LaunchOptions;
  contextOptions?: BrowserContextOptions;
  authScript?: string;           // 登录脚本文件路径
  authTimeout?: number;          // 登录超时（默认30000ms）
  saveState?: string;            // 保存认证状态路径
  loadState?: string;            // 加载认证状态路径
}

// 浏览器启动配置
export interface LaunchOptions {
  headless?: boolean;
  proxy?: {
    server: string;
    bypass?: string;
  };
  args?: string[];
  timeout?: number;
}

// 浏览器Context配置
export interface BrowserContextOptions {
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezone?: string;
  permissions?: string[];
  acceptDownloads?: boolean;
}
```

**检查清单**:
- [ ] 类型导出正确
- [ ] 默认值合理
- [ ] 与现有types兼容

### 0.2 CLI选项新增

**文件**: `src/cli.ts`

**变更**: 在commander选项中新增以下选项

```typescript
program
  // ... 现有选项
  
  // P0: Playwright支持
  .option('--use-playwright', 'Use Playwright browser (for login-required sites)')
  .option('--headless <bool>', 'Run browser in headless mode (default: true)', 'true')
  .option('--proxy <url>', 'HTTP proxy URL (e.g., http://proxy:8080)')
  .option('--auth-script <path>', 'Login script file (JavaScript, receives page and context)')
  .option('--auth-timeout <ms>', 'Authentication timeout in milliseconds (default: 30000)', '30000')
  .option('--save-state <path>', 'Save browser state (cookies, localStorage) to file')
  .option('--load-state <path>', 'Load browser state from file before snapshot')
  .option('--user-agent <string>', 'Custom User-Agent header')
  .option('--viewport <widthxheight>', 'Viewport size (e.g., 1920x1080)')
```

**实现细节**:
```typescript
// src/cli.ts action回调中
.action(async (url: string, opts: CommanderOpts) => {
  const options = fromCommander(opts, url);
  
  // 新增：确定是否使用Playwright
  const shouldUsePlaywright = opts.usePlaywright 
    || opts.authScript 
    || opts.loadState;
  
  if (shouldUsePlaywright && !url && !opts.convertLocal) {
    console.error(chalk.red('✗ URL required when using Playwright'));
    process.exit(1);
  }
  
  try {
    const result = isLocal
      ? await convertLocalSnapshot(options)
      : shouldUsePlaywright
        ? await snapshotWithPlaywrightCLI(url, options, opts)
        : await snapshot(url, options);
    // ... 现有输出逻辑
  } catch (err) { /* ... */ }
})

// 新增辅助函数
async function snapshotWithPlaywrightCLI(
  url: string,
  options: SnapshotOptions,
  opts: CommanderOpts
): Promise<SnapshotResult> {
  // 此函数在0.3中实现
}
```

**检查清单**:
- [ ] 选项名称直观清晰
- [ ] 帮助文本准确
- [ ] 选项互不冲突
- [ ] 默认值合理

### 0.3 CLI辅助函数实现

**文件**: `src/cli.ts` (新增函数) 或 `src/config/cli-helper.ts` (新建)

**建议**: 新建 `src/config/cli-helper.ts` 以保持cli.ts简洁

```typescript
// src/config/cli-helper.ts
import { Page, BrowserContext, LaunchOptions } from 'playwright';
import { snapshotWithPlaywright, type SnapshotOptions } from '../assembler.js';

/**
 * CLI中使用的Playwright快照函数
 */
export async function snapshotWithPlaywrightCLI(
  url: string,
  options: SnapshotOptions,
  cliOpts: Record<string, any>
): Promise<any> {
  // 1. 解析选项
  const playwrightOptions = parseCLIOptions(cliOpts);
  
  // 2. 加载auth脚本（如果提供）
  const setupAuth = cliOpts.authScript
    ? await loadAuthScript(cliOpts.authScript, cliOpts.authTimeout)
    : undefined;
  
  // 3. 调用snapshotWithPlaywright
  const result = await snapshotWithPlaywright(url, options, {
    browserLaunchOptions: playwrightOptions.launch,
    contextOptions: playwrightOptions.context,
    setupAuth,
  });
  
  // 4. 保存状态（如果指定）
  if (cliOpts.saveState && result) {
    await saveAuthState(cliOpts.saveState, result);
  }
  
  return result;
}

/**
 * 解析CLI选项为Playwright配置
 */
function parseCLIOptions(opts: Record<string, any>): {
  launch: LaunchOptions;
  context: BrowserContextOptions;
} {
  return {
    launch: {
      headless: opts.headless !== 'false',
      proxy: opts.proxy ? { server: opts.proxy } : undefined,
    },
    context: {
      userAgent: opts.userAgent,
      viewport: opts.viewport ? parseViewport(opts.viewport) : undefined,
    },
  };
}

/**
 * 从文件加载auth脚本
 */
async function loadAuthScript(
  scriptPath: string,
  timeoutMs: number
): Promise<(page: Page, context: BrowserContext) => Promise<void>> {
  const fs = await import('fs/promises');
  const scriptContent = await fs.readFile(scriptPath, 'utf-8');
  
  // 创建脚本函数
  return async (page: Page, context: BrowserContext) => {
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Auth timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    );
    
    const execution = (async () => {
      // eslint-disable-next-line no-eval, no-new-func
      const fn = new Function('page', 'context', scriptContent);
      return fn(page, context);
    })();
    
    await Promise.race([execution, timeout]);
  };
}

/**
 * 保存认证状态
 */
async function saveAuthState(
  statePath: string,
  result: any
): Promise<void> {
  // P2阶段实现，这里为预留接口
  console.log(`State would be saved to: ${statePath}`);
}

/**
 * 解析视口大小 "1920x1080" → {width: 1920, height: 1080}
 */
function parseViewport(viewportStr: string): { width: number; height: number } {
  const [w, h] = viewportStr.split('x').map(Number);
  if (!w || !h || w <= 0 || h <= 0) {
    throw new Error('Invalid viewport format, expected "widthxheight"');
  }
  return { width: w, height: h };
}
```

**检查清单**:
- [ ] 脚本加载和执行正确
- [ ] 超时处理完善
- [ ] 错误消息清晰
- [ ] 支持ES Module和CommonJS脚本

### 0.4 类型定义适配器

**文件**: `src/config/cli-adapter.ts`

```typescript
// src/config/cli-adapter.ts
/**
 * 从Commander选项转换为SnapshotOptions
 * 扩展原有fromCommander函数
 */

import type { SnapshotOptions } from '../types.js';
import type { CommanderOpts } from './index.js';

/**
 * 扩展的选项转换函数
 */
export function fromCommanderWithPlaywright(
  opts: CommanderOpts,
  url: string
): SnapshotOptions {
  // 先调用原有的转换
  const baseOptions = fromCommander(opts, url);
  
  // 新增Playwright相关字段
  return {
    ...baseOptions,
    usePlaywright: opts.usePlaywright,
    authScript: opts.authScript,
    authTimeout: parseInt(opts.authTimeout || '30000', 10),
    saveState: opts.saveState,
    loadState: opts.loadState,
  };
}
```

**检查清单**:
- [ ] 选项转换完整
- [ ] 类型兼容
- [ ] 默认值正确

### 0.5 测试策略

**文件**: `src/cli.ts` 测试或 `src/config/__tests__/cli-helper.test.ts` (新建)

```typescript
// 单元测试：选项解析
describe('CLI Playwright Options', () => {
  it('should parse headless option correctly', () => {
    const opts = { headless: 'false' };
    const parsed = parseCLIOptions(opts);
    expect(parsed.launch.headless).toBe(false);
  });
  
  it('should parse viewport correctly', () => {
    const result = parseViewport('1920x1080');
    expect(result).toEqual({ width: 1920, height: 1080 });
  });
  
  it('should handle invalid viewport', () => {
    expect(() => parseViewport('invalid')).toThrow();
  });
});

// 集成测试：auth脚本加载
describe('Auth Script Loading', () => {
  it('should load and execute auth script', async () => {
    const script = 'page.goto("https://example.com");';
    const fn = await loadAuthScript(script, 5000);
    
    // mock page和context
    const mockPage = { goto: vi.fn() };
    const mockContext = {};
    
    await fn(mockPage as any, mockContext as any);
    expect(mockPage.goto).toHaveBeenCalled();
  });
});
```

**检查清单**:
- [ ] 单元测试覆盖主要函数
- [ ] 集成测试验证完整流程
- [ ] 边界条件测试完善

### 0.6 文档和示例

**文件**: `docs/PLAYWRIGHT_CLI.md` (新建)

```markdown
# CLI Playwright Support

## Basic Usage

### Simple Playwright Snapshot

```bash
npm run dev -- https://example.com --use-playwright
```

### With Login

```bash
# 1. Create auth script
cat > auth.js << 'EOF'
// page: Playwright Page object
// context: Playwright BrowserContext object
await page.goto('https://app.example.com/login');
await page.fill('input[name="email"]', 'user@example.com');
await page.fill('input[name="password"]', 'secret');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard');
EOF

# 2. Run snapshot with auth
npm run dev -- https://app.example.com/dashboard \
  --use-playwright \
  --auth-script ./auth.js \
  --auth-timeout 30000
```

### Save and Restore State

```bash
# First run: save state
npm run dev -- https://app.example.com \
  --use-playwright \
  --auth-script ./auth.js \
  --save-state ./state.json

# Subsequent runs: reuse state
npm run dev -- https://app.example.com \
  --use-playwright \
  --load-state ./state.json
```

### Custom Browser Options

```bash
npm run dev -- https://example.com \
  --use-playwright \
  --headless false \
  --proxy http://proxy:8080 \
  --user-agent "Custom User-Agent" \
  --viewport 1920x1080
```

## Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--use-playwright` | flag | false | Enable Playwright browser |
| `--headless <bool>` | bool | true | Run in headless mode |
| `--proxy <url>` | string | - | HTTP proxy URL |
| `--auth-script <path>` | path | - | Login script file |
| `--auth-timeout <ms>` | number | 30000 | Auth script timeout |
| `--save-state <path>` | path | - | Save state to file |
| `--load-state <path>` | path | - | Load state from file |
| `--user-agent <string>` | string | - | Custom User-Agent |
| `--viewport <WxH>` | string | - | Viewport size |
```

**检查清单**:
- [ ] 示例清晰可运行
- [ ] 选项说明完整
- [ ] 常见场景覆盖

### 0.7 实现步骤（顺序执行）

1. **步骤0.7.1**: 扩展 `src/types.ts` 中的SnapshotOptions（5min）
   - 添加Playwright相关类型
   - 导出新增接口

2. **步骤0.7.2**: 新建 `src/config/cli-helper.ts`（20min）
   - 实现parseCLIOptions
   - 实现loadAuthScript
   - 实现parseViewport

3. **步骤0.7.3**: 修改 `src/cli.ts`（15min）
   - 新增CLI选项定义
   - 修改action回调判断逻辑
   - 集成cli-helper

4. **步骤0.7.4**: 添加单元测试（20min）
   - 新建`src/config/__tests__/cli-helper.test.ts`
   - 覆盖关键函数

5. **步骤0.7.5**: 集成测试验证（15min）
   - 测试完整登录流程
   - 验证状态保存（P0阶段预留，P2实现）

6. **步骤0.7.6**: 文档编写（10min）
   - 新建 `docs/PLAYWRIGHT_CLI.md`
   - 更新主README

7. **步骤0.7.7**: 回归测试（10min）
   - 验证现有HTTP快照功能不受影响
   - 验证CLI帮助文本正确

### 0.8 风险与回滚

**风险**:
1. auth脚本执行出错导致快照失败
   - *缓解*: 完善错误提示，明确指出auth失败
2. Playwright依赖缺失
   - *缓解*: 检查依赖，提示用户安装

**回滚方案**:
```bash
# 如出现问题，回滚至前一个commit
git revert <commit-hash>

# 临时禁用Playwright支持
npm run dev -- <url>  # 会自动回退到HTTP
```

---

## Phase 1: ResourceFilter重构

### 1.0 概述

**目标**: 集中管理资源过滤逻辑，提升代码可维护性

**现状分析**:
- 过滤逻辑分散在 `validators.ts`、`assembler.ts`、`fetcher.ts`
- 无统一的ResourceFilter类
- 难以扩展和维护

**成果物**:
- 新建 `src/core/resource-filter.ts`
- 重构资源获取流程
- 增加过滤策略的灵活性

**影响范围**:
- `src/core/resource-filter.ts` - 新建
- `src/assembler.ts` - 修改（集成ResourceFilter）
- `src/fetcher.ts` - 修改（简化）
- `src/types.ts` - 扩展（过滤选项）

### 1.1 ResourceFilter类设计

**文件**: `src/core/resource-filter.ts` (新建)

```typescript
/**
 * 统一的资源过滤引擎
 * 支持多层策略：用户自定义 → 内置黑名单 → 类型检查
 */

import { extname } from 'node:path';

export interface FilterContext {
  url: string;
  type?: 'css' | 'js' | 'img' | 'font' | 'media' | 'other';
  size?: number;
  mime?: string;
}

export interface FilterOptions {
  // 用户自定义过滤函数（返回false表示排除）
  customFilter?: (url: string) => boolean;
  
  // 要跳过的文件扩展名
  skipExtensions?: string[];
  
  // 最大文件大小
  maxFileSize?: number;
  
  // 是否启用默认黑名单
  enableDefaultBlacklist?: boolean;
}

export class ResourceFilter {
  // 默认忽略的域名和路径（跟踪、分析等）
  private readonly defaultBlacklist = [
    /google-analytics\.com/,
    /facebook\.com\/tr/,
    /doubleclick\.net/,
    /hotjar\.com/,
    /clarity\.ms/,
    /mixpanel\.com/,
    /segment\.com/,
    /amplitude\.com/,
  ];
  
  // 默认跳过的文件扩展名
  private readonly defaultSkipExtensions = [
    // 压缩包
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
    // 安装器
    '.exe', '.msi', '.dmg', '.apk', '.deb', '.rpm',
    // 文档
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    // 视频
    '.mp4', '.webm', '.m4v', '.mkv', '.avi', '.mov', '.flv',
    // 音频
    '.mp3', '.wav', '.aac', '.flac', '.ogg', '.wma', '.m4a',
    // 其他
    '.iso', '.torrent', '.wasm', '.bin', '.ts', '.m3u8',
  ];
  
  constructor(private options: FilterOptions = {}) {}
  
  /**
   * 检查资源是否应该被包含
   */
  shouldInclude(context: FilterContext): boolean {
    // 1. 用户自定义过滤器优先级最高
    if (this.options.customFilter && !this.options.customFilter(context.url)) {
      return false;
    }
    
    // 2. 检查内置黑名单
    if (this.options.enableDefaultBlacklist !== false) {
      if (this.isBlacklisted(context.url)) {
        return false;
      }
    }
    
    // 3. 检查文件大小
    if (this.options.maxFileSize && context.size) {
      if (context.size > this.options.maxFileSize) {
        return false;
      }
    }
    
    // 4. 检查文件扩展名
    const ext = this.extractExtension(context.url);
    if (!this.isExtensionAllowed(ext)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 批量过滤资源
   */
  filter<T extends FilterContext>(items: T[]): T[] {
    return items.filter(item => this.shouldInclude(item));
  }
  
  /**
   * 检查URL是否在黑名单中
   */
  private isBlacklisted(url: string): boolean {
    return this.defaultBlacklist.some(pattern => pattern.test(url));
  }
  
  /**
   * 检查扩展名是否被允许
   */
  private isExtensionAllowed(ext: string): boolean {
    const skipList = this.options.skipExtensions ?? this.defaultSkipExtensions;
    return !skipList.some(skip => skip.toLowerCase() === ext.toLowerCase());
  }
  
  /**
   * 从URL提取文件扩展名
   */
  private extractExtension(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      return extname(pathname).toLowerCase();
    } catch {
      return '';
    }
  }
  
  /**
   * 获取当前过滤统计
   */
  getStats(items: FilterContext[]): {
    total: number;
    included: number;
    filtered: number;
    filterReasons: Record<string, number>;
  } {
    const stats = {
      total: items.length,
      included: 0,
      filtered: 0,
      filterReasons: {
        blacklist: 0,
        extension: 0,
        size: 0,
        custom: 0,
      },
    };
    
    for (const item of items) {
      if (!this.shouldInclude(item)) {
        stats.filtered++;
        
        // 统计过滤原因
        if (this.isBlacklisted(item.url)) {
          stats.filterReasons.blacklist++;
        } else if (!this.isExtensionAllowed(this.extractExtension(item.url))) {
          stats.filterReasons.extension++;
        } else if (this.options.maxFileSize && item.size && item.size > this.options.maxFileSize) {
          stats.filterReasons.size++;
        } else if (this.options.customFilter && !this.options.customFilter(item.url)) {
          stats.filterReasons.custom++;
        }
      } else {
        stats.included++;
      }
    }
    
    return stats;
  }
}
```

**检查清单**:
- [ ] 过滤逻辑完整
- [ ] 默认黑名单合理
- [ ] 统计信息准确
- [ ] 接口设计清晰

### 1.2 集成到assembler

**文件**: `src/assembler.ts`

**变更**:
```typescript
import { ResourceFilter, type FilterContext } from './core/resource-filter.js';

// 在snapshotInternal函数中使用
async function snapshotInternal(
  options: SnapshotOptions,
  adapter: FetcherAdapter
): Promise<SnapshotResult> {
  // ... 现有代码 ...
  
  // 创建过滤器实例
  const filter = new ResourceFilter({
    skipExtensions: parseSkipTypes(options.skipTypes),
    maxFileSize: options.maxFileSize,
    enableDefaultBlacklist: true,
  });
  
  // 过滤资源
  const allRefs: AssetRef[] = [...parsed.assets];
  // ... 添加CSS内联资源等 ...
  
  // 应用过滤
  const filteredRefs = filter.filter(
    allRefs.map(ref => ({
      url: ref.url,
      type: ref.type,
    }))
  ).map(filtered => 
    allRefs.find(ref => ref.url === filtered.url)
  ).filter(Boolean) as AssetRef[];
  
  // 日志输出（P1新增）
  const stats = filter.getStats(allRefs.map(ref => ({url: ref.url, type: ref.type})));
  if (stats.filtered > 0) {
    process.stdout.write(
      `Filtered ${stats.filtered}/${stats.total} resources ` +
      `(blacklist: ${stats.filterReasons.blacklist}, ` +
      `extension: ${stats.filterReasons.extension})\n`
    );
  }
  
  // 后续使用filteredRefs而不是allRefs
  // ... 保持现有逻辑 ...
}
```

**检查清单**:
- [ ] 过滤正确应用
- [ ] 日志输出清晰
- [ ] 不影响现有功能

### 1.3 类型扩展

**文件**: `src/types.ts`

```typescript
export interface SnapshotOptions {
  // ... 现有字段
  
  // P1: 过滤配置（扩展）
  urlFilter?: (url: string) => boolean;  // 自定义URL过滤函数
  enableDefaultBlacklist?: boolean;      // 启用默认黑名单（默认true）
}
```

**检查清单**:
- [ ] 类型兼容现有代码
- [ ] 默认行为不变

### 1.4 测试

**文件**: `src/core/__tests__/resource-filter.test.ts` (新建)

```typescript
import { describe, it, expect } from 'vitest';
import { ResourceFilter, type FilterContext } from '../resource-filter.js';

describe('ResourceFilter', () => {
  describe('shouldInclude', () => {
    it('should filter blacklist URLs', () => {
      const filter = new ResourceFilter({ enableDefaultBlacklist: true });
      const context: FilterContext = { url: 'https://google-analytics.com/track' };
      
      expect(filter.shouldInclude(context)).toBe(false);
    });
    
    it('should filter skipped extensions', () => {
      const filter = new ResourceFilter({ skipExtensions: ['.zip', '.pdf'] });
      
      expect(filter.shouldInclude({ url: 'https://example.com/file.zip' })).toBe(false);
      expect(filter.shouldInclude({ url: 'https://example.com/file.pdf' })).toBe(false);
      expect(filter.shouldInclude({ url: 'https://example.com/file.css' })).toBe(true);
    });
    
    it('should respect custom filter', () => {
      const filter = new ResourceFilter({
        customFilter: (url) => !url.includes('internal')
      });
      
      expect(filter.shouldInclude({ url: 'https://example.com/internal.js' })).toBe(false);
      expect(filter.shouldInclude({ url: 'https://example.com/external.js' })).toBe(true);
    });
    
    it('should check file size', () => {
      const filter = new ResourceFilter({ maxFileSize: 1024 * 1024 }); // 1MB
      
      expect(filter.shouldInclude({ url: 'https://example.com/large.bin', size: 2 * 1024 * 1024 })).toBe(false);
      expect(filter.shouldInclude({ url: 'https://example.com/small.css', size: 512 * 1024 })).toBe(true);
    });
  });
  
  describe('getStats', () => {
    it('should calculate statistics correctly', () => {
      const filter = new ResourceFilter({ skipExtensions: ['.zip'] });
      const items: FilterContext[] = [
        { url: 'https://example.com/file.zip' },
        { url: 'https://example.com/style.css' },
        { url: 'https://example.com/script.js' },
      ];
      
      const stats = filter.getStats(items);
      expect(stats.total).toBe(3);
      expect(stats.filtered).toBe(1);
      expect(stats.included).toBe(2);
    });
  });
});
```

**检查清单**:
- [ ] 单元测试覆盖完整
- [ ] 边界条件测试充分
- [ ] 测试通过率100%

### 1.5 实现步骤

1. **步骤1.5.1**: 新建 `src/core/resource-filter.ts`（30min）
2. **步骤1.5.2**: 新建 `src/core/__tests__/resource-filter.test.ts`（20min）
3. **步骤1.5.3**: 修改 `src/assembler.ts` 集成过滤器（15min）
4. **步骤1.5.4**: 更新 `src/types.ts` 类型定义（5min）
5. **步骤1.5.5**: 回归测试和验证（15min）

**总计**: ~1.5小时

### 1.6 风险与回滚

**风险**:
1. 过滤器排除了有用的资源
   - *缓解*: 支持`enableDefaultBlacklist: false`禁用默认黑名单

**回滚方案**:
```bash
git revert <commit-hash>
```

---

## Phase 2: State保存/恢复

### 2.0 概述

**目标**: 支持保存和加载认证状态，避免重复登录

**成果物**:
- 扩展PlaywrightFetcherAdapter支持state操作
- CLI支持 `--save-state` 和 `--load-state` 选项
- 完整的状态生命周期管理

**影响范围**:
- `src/adapters/playwright-fetcher-adapter.ts` - 扩展
- `src/config/cli-helper.ts` - 扩展（实现保存逻辑）
- `src/assembler.ts` - 修改（集成state加载）

### 2.1 PlaywrightFetcherAdapter扩展

**文件**: `src/adapters/playwright-fetcher-adapter.ts`

```typescript
export class PlaywrightFetcherAdapter implements FetcherAdapter {
  // ... 现有代码 ...
  
  /**
   * 保存浏览器认证状态
   * 包括cookies、localStorage、sessionStorage等
   */
  async saveState(path: string): Promise<void> {
    const fs = await import('fs/promises');
    const { dirname } = await import('path');
    
    // 获取完整状态
    const state = await this.context.storageState();
    
    // 确保目录存在
    const dir = dirname(path);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // 目录已存在
    }
    
    // 保存状态文件
    await fs.writeFile(path, JSON.stringify(state, null, 2), 'utf-8');
  }
  
  /**
   * 从文件加载认证状态
   * 恢复cookies和localStorage
   */
  async loadState(path: string): Promise<void> {
    const fs = await import('fs/promises');
    
    try {
      const content = await fs.readFile(path, 'utf-8');
      const state = JSON.parse(content);
      
      // 恢复cookies
      if (state.cookies && Array.isArray(state.cookies)) {
        await this.context.addCookies(state.cookies);
      }
      
      // 恢复localStorage和sessionStorage
      if (state.origins && Array.isArray(state.origins)) {
        for (const origin of state.origins) {
          if (origin.localStorage && Array.isArray(origin.localStorage)) {
            // 使用page.evaluate注入localStorage
            const page = await this.context.newPage();
            try {
              await page.goto(origin.origin, { waitUntil: 'domcontentloaded' }).catch(() => {});
              
              // 注入localStorage
              await page.evaluate((items) => {
                for (const { name, value } of items) {
                  localStorage.setItem(name, value);
                }
              }, origin.localStorage);
              
              // 暂存状态（避免页面卸载时丢失）
              // 实际应用中可能需要保持页面打开或使用其他机制
            } finally {
              await page.close();
            }
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to load state from ${path}: ${error}`);
    }
  }
  
  /**
   * 获取当前状态摘要（用于调试和验证）
   */
  async getStateSummary(): Promise<{
    cookieCount: number;
    localStorageCount: number;
    origins: string[];
  }> {
    const state = await this.context.storageState();
    
    return {
      cookieCount: state.cookies?.length ?? 0,
      localStorageCount: state.origins?.reduce((sum, o) => sum + (o.localStorage?.length ?? 0), 0) ?? 0,
      origins: state.origins?.map(o => o.origin) ?? [],
    };
  }
}
```

**检查清单**:
- [ ] saveState实现完整
- [ ] loadState实现完整
- [ ] 错误处理充分
- [ ] localStorage恢复正确

### 2.2 CLI helper更新

**文件**: `src/config/cli-helper.ts`

```typescript
// 更新saveAuthState实现
async function saveAuthState(
  statePath: string,
  result: any,
  adapter: PlaywrightFetcherAdapter
): Promise<void> {
  try {
    await adapter.saveState(statePath);
    console.log(`✓ State saved to: ${statePath}`);
    
    // 打印状态摘要
    const summary = await adapter.getStateSummary();
    console.log(`  Cookies: ${summary.cookieCount}`);
    console.log(`  LocalStorage items: ${summary.localStorageCount}`);
    console.log(`  Origins: ${summary.origins.join(', ')}`);
  } catch (error) {
    console.warn(`✗ Failed to save state: ${error}`);
  }
}

// 新增loadAuthState
async function loadAuthState(
  statePath: string,
  adapter: PlaywrightFetcherAdapter
): Promise<void> {
  try {
    await adapter.loadState(statePath);
    console.log(`✓ State loaded from: ${statePath}`);
  } catch (error) {
    console.warn(`✗ Failed to load state: ${error}`);
    throw error;  // 加载失败应该中止
  }
}
```

**检查清单**:
- [ ] 保存逻辑与adapter集成
- [ ] 加载逻辑实现
- [ ] 用户反馈清晰

### 2.3 CLI集成

**文件**: `src/cli.ts`

在snapshotWithPlaywrightCLI中添加：

```typescript
export async function snapshotWithPlaywrightCLI(
  url: string,
  options: SnapshotOptions,
  cliOpts: Record<string, any>
): Promise<any> {
  // 1. 解析选项
  const playwrightOptions = parseCLIOptions(cliOpts);
  
  // 2. 创建browser和context
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(playwrightOptions.launch);
  const context = await browser.newContext(playwrightOptions.context);
  
  try {
    // 2.5. 加载已保存的状态（P2新增）
    const adapter = new PlaywrightFetcherAdapter(context.newPage(), context);
    if (cliOpts.loadState) {
      await loadAuthState(cliOpts.loadState, adapter);
    }
    
    // 3. 加载auth脚本（如果提供）
    const setupAuth = cliOpts.authScript && !cliOpts.loadState
      ? await loadAuthScript(cliOpts.authScript, cliOpts.authTimeout)
      : undefined;
    
    // 4. 调用snapshotWithPlaywright
    const result = await snapshotWithPlaywright(url, options, {
      browserLaunchOptions: playwrightOptions.launch,
      contextOptions: playwrightOptions.context,
      setupAuth,
    });
    
    // 5. 保存状态（如果指定，P2新增）
    if (cliOpts.saveState) {
      await saveAuthState(cliOpts.saveState, result, adapter);
    }
    
    return result;
  } finally {
    await context.close();
    await browser.close();
  }
}
```

**检查清单**:
- [ ] 状态加载在auth之前
- [ ] 状态保存在快照之后
- [ ] 生命周期管理正确

### 2.4 测试

**文件**: `src/adapters/__tests__/playwright-fetcher-adapter.test.ts` (扩展)

```typescript
describe('PlaywrightFetcherAdapter - State Management', () => {
  it('should save state to file', async () => {
    const fs = await import('fs/promises');
    const path = '/tmp/test-state.json';
    
    await adapter.saveState(path);
    
    const content = await fs.readFile(path, 'utf-8');
    const state = JSON.parse(content);
    
    expect(state.cookies).toBeDefined();
    expect(state.origins).toBeDefined();
  });
  
  it('should load state from file', async () => {
    const path = '/tmp/test-state.json';
    
    // 先保存状态
    await adapter.saveState(path);
    
    // 创建新adapter并加载状态
    const newAdapter = new PlaywrightFetcherAdapter(newPage, newContext);
    await newAdapter.loadState(path);
    
    const summary = await newAdapter.getStateSummary();
    expect(summary.cookieCount).toBeGreaterThan(0);
  });
  
  it('should handle missing state file', async () => {
    const adapter = new PlaywrightFetcherAdapter(mockPage, mockContext);
    
    await expect(adapter.loadState('/nonexistent/path.json')).rejects.toThrow();
  });
});
```

**检查清单**:
- [ ] 保存和加载测试完整
- [ ] 错误处理测试充分
- [ ] 状态完整性验证

### 2.5 文档更新

**文件**: `docs/PLAYWRIGHT_CLI.md` (扩展)

```markdown
## State Management

### Save State After Login

```bash
npm run dev -- https://app.example.com/dashboard \
  --use-playwright \
  --auth-script ./auth.js \
  --save-state ~/.app-state.json
```

Output:
```
✓ State saved to: ~/.app-state.json
  Cookies: 5
  LocalStorage items: 3
  Origins: https://app.example.com
```

### Reuse Saved State

After saving state once, you can reuse it in subsequent snapshots:

```bash
# Fast snapshot without re-login
npm run dev -- https://app.example.com \
  --use-playwright \
  --load-state ~/.app-state.json
```

### State File Format

State file is a JSON containing cookies and localStorage:

```json
{
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123",
      "domain": "app.example.com",
      "path": "/",
      "expires": 1700000000,
      "secure": true,
      "httpOnly": true,
      "sameSite": "Lax"
    }
  ],
  "origins": [
    {
      "origin": "https://app.example.com",
      "localStorage": [
        {
          "name": "user_token",
          "value": "xyz789"
        }
      ]
    }
  ]
}
```

### Security Note

State files contain authentication tokens and cookies. Treat them as sensitive:

```bash
# Good practice: restrict permissions
chmod 600 ~/.app-state.json

# Good practice: don't commit to git
echo "*.state.json" >> .gitignore
```
```

**检查清单**:
- [ ] 示例清晰
- [ ] 安全提示完整
- [ ] 文件格式说明

### 2.6 实现步骤

1. **步骤2.6.1**: 扩展PlaywrightFetcherAdapter（20min）
   - 实现saveState
   - 实现loadState
   - 实现getStateSummary

2. **步骤2.6.2**: 更新cli-helper（10min）
   - 实现saveAuthState
   - 实现loadAuthState

3. **步骤2.6.3**: 修改snapshotWithPlaywrightCLI（10min）
   - 集成load逻辑
   - 集成save逻辑

4. **步骤2.6.4**: 添加测试（20min）
   - 保存/加载测试
   - 错误处理测试

5. **步骤2.6.5**: 文档更新（10min）

**总计**: ~1.5小时

### 2.7 风险与回滚

**风险**:
1. 状态文件包含敏感信息
   - *缓解*: 文档中强调安全最佳实践

2. localStorage恢复可能失败（SOP限制）
   - *缓解*: 仅在加载时打印警告，不中止流程

**回滚方案**:
```bash
git revert <commit-hash>
```

---

## 总体时间线

| 阶段 | 并行可行 | 关键路径 | 总时间 |
|------|--------|---------|--------|
| P0 | ✗ | 是 | 2.5h |
| P1 | ✓ | 否 | 1.5h |
| P2 | ✓ | 否 | 1.5h |
| **总计** | - | - | **5.5h** |

**建议执行顺序**:
1. 完成P0 (2.5h)
2. 同时并行P1和P2 (1.5h)
3. 总计: ~4h工作时间

---

## 质量保证清单

### 代码质量
- [ ] 所有新增代码通过linting
- [ ] TypeScript无类型错误
- [ ] 测试覆盖率 ≥80%
- [ ] 代码注释完整

### 功能测试
- [ ] HTTP快照功能无退化
- [ ] Playwright快照完整可用
- [ ] 登录脚本加载和执行正确
- [ ] 状态保存和加载正确

### 文档
- [ ] README更新完整
- [ ] 新建文档清晰准确
- [ ] 示例代码可运行
- [ ] 安全提示充分

### 用户体验
- [ ] CLI帮助文本清晰
- [ ] 错误消息有意义
- [ ] 成功消息鼓励性
- [ ] 日志信息实用

---

## 附录：命令参考

### Phase 0完成后

```bash
# 基础Playwright快照
npm run dev -- https://example.com --use-playwright

# 需要登录的网站
npm run dev -- https://app.example.com/dashboard \
  --use-playwright \
  --auth-script ./auth.js

# 保存状态以备复用
npm run dev -- https://app.example.com/dashboard \
  --use-playwright \
  --auth-script ./auth.js \
  --save-state ./state.json
```

### Phase 2完成后

```bash
# 复用已保存的状态（快速）
npm run dev -- https://app.example.com/data \
  --use-playwright \
  --load-state ./state.json

# 完整选项示例
npm run dev -- https://app.example.com \
  --use-playwright \
  --headless false \
  --proxy http://proxy:8080 \
  --user-agent "Mozilla/5.0" \
  --viewport 1920x1080 \
  --auth-script ./auth.js \
  --auth-timeout 60000 \
  --save-state ./state.json \
  --extract-components \
  -o ./snapshot
```

---

## 后续考虑事项

### 不在此计划范围内（可在后续迭代中考虑）

1. **网络拦截和缓存** - 实现request.route()拦截
2. **高级认证流程** - MFA、OAuth、SAML等
3. **策略层抽象** - structure/resources/full三层策略
4. **性能优化** - 并行Playwright操作、资源预过滤
5. **监控和指标** - 网络瀑布图、性能分析

---

**文档版本**: 1.0  
**最后更新**: 2024年  
**维护者**: web-clone团队
