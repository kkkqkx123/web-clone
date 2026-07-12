# Playwright适配设计分析

## 一、当前设计概览

### 核心架构
```
┌─────────────────────────────────┐
│   CLI / Library Consumer         │
└────────────┬────────────────────┘
             │
      ┌──────▼────────┐
      │ Three Public APIs:
      │ • snapshot()
      │ • snapshotWithPlaywright()
      │ • snapshotWithBrowserContext()
      └──────┬────────┘
             │
      ┌──────▼─────────────────────┐
      │  snapshotInternal()         │
      │  (Shared Pipeline)          │
      └──────┬─────────────────────┘
             │
      ┌──────▼──────────────────────────────────┐
      │  FetcherAdapter Interface               │
      │  ├─ fetch(url, options)                │
      │  ├─ canAccess?(url)                    │
      │  ├─ getAuthContext?()                  │
      │  └─ dispose?()                         │
      └──────┬──────────────────────────────────┘
             │
      ┌──────┴────────────┐
      │                   │
  ┌───▼──────┐     ┌─────▼─────────────┐
  │ HttpFetch│     │PlaywrightFetcher  │
  │Adapter   │     │Adapter            │
  └──────────┘     ├─ fetchWithPage()  │
                   ├─ fetchWithContext()
                   └─ getAuthContext() │
                   └─────────────────┘
```

### 三个Public API

**1. `snapshot(url, options)` - 基础HTTP快照**
```typescript
export async function snapshot(
  url: string, 
  optionsWithoutUrl: Omit<SnapshotOptions, 'url'>
): Promise<SnapshotResult> {
  const httpAdapter = new HttpFetcherAdapter();
  return snapshotInternal(options, httpAdapter);
}
```
- 场景：快速快照无需登录的公开网站
- 优点：轻量级，无依赖
- 缺点：无法处理需要登录或动态JS的网站

**2. `snapshotWithPlaywright(url, options, playwrightOptions)` - 完整Playwright管理**
```typescript
export async function snapshotWithPlaywright(
  url: string,
  optionsWithoutUrl: Omit<SnapshotOptions, 'url'>,
  playwrightOptions?: PlaywrightSnapshotOptions
): Promise<SnapshotResult>
```
- Playwright生命周期由函数管理
- 支持 `setupAuth` 回调用于登录流程
- 完成后自动释放资源
- 场景：需要登录的网站

**3. `snapshotWithBrowserContext(url, options, browserContext)` - 用户自管理**
```typescript
export async function snapshotWithBrowserContext(
  url: string,
  optionsWithoutUrl: Omit<SnapshotOptions, 'url'>,
  browserContext: BrowserContext
): Promise<SnapshotResult>
```
- 最灵活的方式，用户完全控制browser/context生命周期
- 支持复用context进行多次快照
- 支持保存/恢复登录状态
- 场景：复杂的自动化流程

---

## 二、与参考设计的对比

### 参考设计的核心思想
```typescript
// Fixture方式（用于测试）
test.extend<{ cloner: WebCloner }>({
  cloner: async ({ page, context }, use) => {
    const cloner = new WebCloner(page, context);
    await use(cloner);
  }
})

// WebCloner门面类（多策略）
class WebCloner {
  async clone(options: CloneOptions): Promise<CloneResult> {
    switch (options.strategy) {
      case 'structure': return StructureAnalyzer...
      case 'resources': return ResourceDownloader...
      case 'full': return FullCloner...
    }
  }
}

// 资源拦截（主动模式）
async enableActiveInterception() {
  await this.page.route('**/*', async (route, request) => {
    if (shouldDownload) {
      const buffer = await route.fetch().then(r => r.body());
      await saveToDisk(url, buffer);
    }
  });
}

// 资源过滤（集中管理）
class ResourceFilter {
  shouldInclude(url, options): boolean {
    // 检查用户过滤器
    // 检查忽略列表
    // 检查资源类型
  }
}
```

### 对比分析

| 维度 | 当前设计 | 参考设计 | 评价 |
|------|--------|--------|------|
| **架构模式** | 单一adapter + 3个API | Facade + 策略模式 | 各有优缺点 |
| **核心抽象** | FetcherAdapter接口 | WebCloner门面 | 当前更抽象 |
| **策略支持** | ✗ 单一全能策略 | ✓ 三种策略 | 参考设计更灵活 |
| **网络拦截** | ✗ 被动获取 | ✓ 主动拦截 | 参考设计更强大 |
| **资源过滤** | 分散在多个地方 | ✓ ResourceFilter类 | 参考设计更清晰 |
| **Fixture支持** | ✗ 无测试集成 | ✓ 原生支持 | 参考设计更友好 |
| **库与CLI分离** | ✗ 混合 | ✓ 清晰分离 | 参考设计更模块化 |
| **复用性** | ✓ 高 | ~ 中等 | 当前更通用 |
| **易用性** | ~ 中等 | ✓ 高 | 参考设计更友好 |

---

## 三、当前设计的优缺点

### 优点

1. **清晰的接口抽象**
   - FetcherAdapter是标准接口，支持多种实现
   - 新增adapter无需修改核心逻辑
   - 符合策略模式原则

2. **分层的API设计**
   - 三个接口覆盖从简单到复杂的场景
   - 用户可选择合适的复杂度级别
   - 库使用者与CLI使用者都有支持

3. **完整的认证管理**
   ```typescript
   // 自动继承Cookies
   const cookies = await context.cookies();
   
   // 自动提取localStorage token
   const storageState = await context.storageState();
   
   // 支持自定义header
   const headers = { 'Authorization': 'Bearer token' };
   ```

4. **双策略资源获取**
   - 主文档：page.goto() → 执行JS、处理重定向
   - 子资源：context.request.fetch() → 继承认证、快速
   - 场景适配良好

5. **良好的测试覆盖**
   - `playwright-fetcher-adapter.test.ts` 完整测试
   - Mock友好的接口设计

### 缺点

1. **CLI未集成Playwright支持** ⚠️ **最关键**
   - CLI目前硬编码使用HttpFetcherAdapter
   - 用户无法通过CLI进行需要登录的网站快照
   - 只有library用户能使用Playwright能力

   ```typescript
   // src/cli.ts 第38-53行
   const result = isLocal
     ? await convertLocalSnapshot(options)
     : await snapshot(options.url, options);  // ← 永远是HTTP
   ```

2. **网络拦截能力缺失**
   - 无法主动拦截和修改请求
   - 无法缓存资源以便重复使用
   - 相比参考设计的route()拦截限制重

3. **资源过滤逻辑分散**
   - 资源过滤分布在多个文件
   - 无统一的ResourceFilter类
   - 难以维护和扩展

   ```typescript
   // 分散在：
   // 1. src/validators.ts - 文件验证
   // 2. src/assembler.ts - 资源去重
   // 3. src/fetcher.ts - 下载过滤
   ```

4. **缺少测试Fixture**
   - 虽然有三个public API，但缺少Playwright fixture
   - 测试中使用Playwright时需要手动管理生命周期
   - 不如参考设计的test.extend()便利

5. **登录流程不够灵活**
   ```typescript
   // 当前方式：setupAuth回调
   setupAuth: async (page, context) => {
     await page.goto(loginUrl);
     await page.fill(...);
     await page.click(...);
   }
   
   // 问题：
   // 1. 每次快照都要重新登录
   // 2. 无法复用已保存的state
   // 3. 无法检查登录状态
   ```

6. **策略抽象不足**
   - 当前只有"完整快照"一种策略
   - 缺少"仅分析结构"、"仅下载资源"等轻量选项
   - 参考设计的structure/resources/full三层更清晰

7. **资源访问性检查未充分利用**
   ```typescript
   // 接口定义了canAccess()但很少使用
   canAccess?(url: string): Promise<boolean>;
   ```

---

## 四、关键设计决策分析

### 决策1：两种资源获取策略

**实现** (src/adapters/playwright-fetcher-adapter.ts:133-164)
```typescript
const isMainDocument =
  !currentUrl || 
  currentUrl === 'about:blank' ||
  new URL(url).origin === new URL(currentUrl).origin;

if (isMainDocument) {
  return this.fetchWithPage(url, options, mergedOptions);
} else {
  return this.fetchWithContext(url, options, mergedOptions);
}
```

**评价：✓ 合理**
- 主文档需要JS执行和重定向处理 → page.goto()
- 子资源需要快速获取和认证继承 → context.request.fetch()
- 同源判断准确，边界清晰

**可改进点：**
- 无法处理跨域fetch的情况（如API调用）
- 同源判断仅看origin，不考虑cookie domain

---

### 决策2：三个Public API层次

**实现** (src/assembler.ts:193-273)
- 基础级：`snapshot()` - HTTP only
- 中等级：`snapshotWithPlaywright()` - 完整管理
- 高级级：`snapshotWithBrowserContext()` - 用户自管

**评价：✓ 合理但不完整**

```
complexity scale:
简      snapshot()
  ↑     ┌─────────────────────┐
  │     │ setupAuth回调       │
  │     │ 自动释放资源        │
  │     └─────────────────────┘
  │     snapshotWithPlaywright()
  │     ┌─────────────────────┐
  │     │ 用户管理context     │
  │     │ 支持复用和保存state │
  │     └─────────────────────┘
  │     snapshotWithBrowserContext()
  │     ┌─────────────────────┐
  │     │ 最灵活              │
  │     │ 支持链式操作        │
  │     └─────────────────────┘
复
```

**缺点：**
- CLI完全未利用中、高级API
- 用户需要写代码才能用Playwright（库用户友好，CLI用户不友好）

---

### 决策3：认证信息提取

**实现** (src/adapters/playwright-fetcher-adapter.ts:316-349)
```typescript
async getAuthContext(): Promise<AuthContext> {
  // 1. 获取browser cookies
  const cookies = await this.context.cookies();
  
  // 2. 获取storage state
  const storageState = await this.context.storageState();
  
  // 3. 智能提取token
  for (const item of localStorage) {
    if (item.name.toLowerCase().includes('token') 
        || item.name.toLowerCase().includes('auth')) {
      token = item.value;
      break;
    }
  }
}
```

**评价：✓ 很好**
- 覆盖三种常见认证方式
- 自动识别token命名惯例
- 返回AuthContext便于迁移

**可改进点：**
- Token搜索逻辑过于简单（case-insensitive name match）
- 没有处理多个origin的情况（仅取第一个）

---

## 五、现有设计的理性性评估

### 作为Library API：✓ 很好
- 三层API满足不同复杂度需求
- 接口设计稳定且易扩展
- 测试覆盖良好

### 作为CLI Tool：✗ 不够完整
- 只支持HTTP，无Playwright
- 无法快照需要登录的网站
- 无法执行客户端JS

### 总体设计理性性：⭐ 6/10

**强点：**
- 清晰的分层和抽象 (+2)
- 完整的认证支持 (+1)
- 接口设计稳定 (+1)
- 测试覆盖好 (+1)
- 符合设计模式 (+1)

**弱点：**
- CLI未集成 (-2)
- 无网络拦截 (-1)
- 资源过滤分散 (-1)
- 缺少Fixture支持 (-1)
- 无state保存/恢复 (-1)

---

## 六、与参考设计的融合建议

### 建议1：在CLI层添加Playwright支持 🔴 **优先级最高**

当前CLI代码：
```typescript
// src/cli.ts:51-53
const result = isLocal
  ? await convertLocalSnapshot(options)
  : await snapshot(options.url, options);
```

建议改为：
```typescript
// 检查是否需要Playwright
const needsPlaywright = opts.usePlaywright || opts.browserLaunch || opts.setupAuth;

const result = isLocal
  ? await convertLocalSnapshot(options)
  : needsPlaywright
    ? await snapshotWithPlaywright(url, options, {
        browserLaunchOptions: opts.browserLaunch,
        setupAuth: opts.setupAuth,
      })
    : await snapshot(url, options);
```

新增CLI选项：
```bash
--use-playwright              # 启用Playwright
--setup-auth <script>         # 登录脚本文件
--save-state <path>           # 保存认证状态
--load-state <path>           # 加载认证状态
--browser-launch <json>       # Browser启动配置
```

### 建议2：抽象ResourceFilter类

```typescript
// src/core/resource-filter.ts
class ResourceFilter {
  private defaultFilters = [
    /google-analytics\.com/,
    /facebook\.com\/tr/,
  ];
  
  private defaultSkipExtensions = [
    '.zip', '.rar', '.pdf', '.mp4'
  ];
  
  shouldInclude(url: string, options: SnapshotOptions): boolean {
    // 1. 用户自定义过滤
    if (options.urlFilter && !options.urlFilter(url)) return false;
    
    // 2. 检查忽略列表
    if (this.matches(url, this.defaultFilters)) return false;
    
    // 3. 检查文件类型
    const ext = path.extname(new URL(url).pathname);
    if (this.shouldSkipExtension(ext, options)) return false;
    
    return true;
  }
  
  private shouldSkipExtension(ext: string, options: SnapshotOptions): boolean {
    // 实现skipTypes逻辑
  }
}
```

集成点：
```typescript
// src/fetcher.ts
const filter = new ResourceFilter();
const filteredRefs = allRefs.filter(ref => 
  filter.shouldInclude(ref.url, options)
);
```

### 建议3：Fixture支持 - **不必要** ✗

**重新评估：** 建议删除此项

**原因：**
1. **库已提供完整API** - 现有的 `snapshotWithBrowserContext()` 完全满足所有场景
2. **Fixture只是包装** - Fixture本质上就是对API的薄包装，没有增加新能力
3. **测试用户可自行包装** - 如果测试用户需要Fixture，可以简单地创建：
   ```typescript
   // 用户自己在测试中定义，无需库提供
   const adapter = new PlaywrightFetcherAdapter(page, context);
   ```
4. **维护负担** - 额外的导出、文档和测试覆盖

**替代方案：**
库提供充分的文档示例，展示如何在Playwright测试中使用库API：

```typescript
// 文档中的示例：如何在 @playwright/test 中使用 web-clone
import { test, expect } from '@playwright/test';
import { snapshotWithBrowserContext } from 'web-clone';

test('snapshot after login', async ({ browser }) => {
  // 用户完全控制context生命周期
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // 登录
  await page.goto('https://app.example.com/login');
  await page.fill('#username', 'user');
  await page.fill('#password', 'pass');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  
  // 使用库进行快照
  const result = await snapshotWithBrowserContext(
    'https://app.example.com/data',
    { output: './snapshot' },
    context
  );
  
  expect(result.stats.fetched).toBeGreaterThan(0);
  
  await context.close();
});
```

**结论：** 库API已足够，Fixture是可选的便利层，优先级极低，不建议实现。

### 建议4：增强PlaywrightFetcherAdapter

**支持State保存/恢复：**
```typescript
class PlaywrightFetcherAdapter {
  // 保存认证状态
  async saveState(path: string): Promise<void> {
    const state = await this.context.storageState();
    await writeFile(path, JSON.stringify(state, null, 2));
  }
  
  // 恢复认证状态
  async loadState(path: string): Promise<void> {
    const state = JSON.parse(await readFile(path, 'utf-8'));
    if (state.cookies) {
      await this.context.addCookies(state.cookies);
    }
    if (state.origins) {
      // 恢复localStorage等
    }
  }
}
```

**支持网络拦截（可选）：**
```typescript
// 被动模式：只记录不修改
async enableNetworkMonitor() {
  const requests: Array<{url, method, status, size}> = [];
  
  await this.page.route('**/*', async (route) => {
    const request = route.request();
    const response = await route.fetch();
    
    requests.push({
      url: request.url(),
      method: request.method(),
      status: response.status(),
      size: (await response.body()).length
    });
    
    await route.fulfill({ response });
  });
  
  return requests;
}
```

### 建议5：考虑可选的策略层

虽然不一定完全采用参考设计的三层策略，但可以在选项中添加：

```typescript
type SnapshotStrategy = 'full' | 'resources-only' | 'structure-only';

interface SnapshotOptions {
  // ... existing
  strategy?: SnapshotStrategy;  // 新增
}

// 使用示例
if (options.strategy === 'structure-only') {
  // 只解析HTML，不下载资源
  const parsed = parseHtml(html, url);
  return { components: parsed, assets: [], stats: {...} };
}
```

---

## 七、总结与建议优先级

### 现有设计的理性性

**总体评分：7/10**

作为Library设计：✓ 很好（8/10）
- 分层清晰，接口稳定
- 认证支持完整
- 测试覆盖好

作为CLI Tool：✗ 不完整（5/10）
- 无Playwright集成
- 用户无法处理需要登录的网站
- 功能受限

### 改进优先级

| 优先级 | 建议 | 影响度 | 工作量 |
|-------|------|-------|--------|
| 🔴 P0 | CLI集成Playwright支持 | 很高 | 中等 |
| 🟠 P1 | 抽象ResourceFilter类 | 中等 | 小 |
| 🟡 P2 | 增加State保存/恢复 | 中等 | 小 |
| 🟢 P3 | 可选策略层 | 低 | 中 |

### 核心结论

当前设计在**接口和库层面**是合理且优秀的，但在**CLI层面**存在明显gap。推荐优先完成：

1. **P0：CLI Playwright集成** - 这是用户最直观的需求
2. **P1：ResourceFilter重构** - 提升代码可维护性
3. **P2+：可选增强** - 根据实际需求再决定

参考设计的思想很好，但**不必要完全复制**。建议在现有库API基础上做*有针对性的增强*：
- ✓ 库层面已完整（三层API足够）
- ✗ CLI层面有明显缺口（需补齐Playwright支持）
- ✗ 资源管理可优化（ResourceFilter重构）
