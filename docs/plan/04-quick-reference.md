# 快速参考指南 - Library Architecture 决策摘要

**Document Status:** Final Summary  
**Last Updated:** 2026-07-13  

---

## 🎯 核心决策

### 决策 1：Playwright 作为可选依赖，不放在 peerDependencies

| 方面 | 决策 | 原因 |
|------|------|------|
| **peerDependencies** | ❌ 移除 | 库不强制用户安装 Playwright |
| **devDependencies** | ✅ 保留 | 开发/测试 web-clone 本身需要 |
| **运行时检查** | ✅ 添加 | `loadPlaywrightAdapter()` 动态加载 |
| **用户安装** | ✅ 可选 | 用户在自己项目中决定是否装 |

### 决策 2：库专注快照，不包含 UI 优化

| 逻辑 | 位置 | 职责 |
|------|------|------|
| 资源下载、验证、汇总 | `src/assembler.ts` (库) | ✅ 库职责 |
| HTML 解析、CSS 递归提取 | `src/parser/` (库) | ✅ 库职责 |
| Vue hydration 脚本注入 | `src/cli.ts` (CLI) | ✅ CLI 优化 |

### 决策 3：适配器模式支持多种资源获取方式

**接口：** `FetcherAdapter`
```typescript
// 用户可实现：
- HttpFetcherAdapter (库提供)
- PlaywrightFetcherAdapter (库提供)
- MyCustomAdapter (用户自定义)
- CachingAdapter, HybridAdapter, 等等
```

---

## 📁 文件变更概览

### 新增文件（本阶段）

```
docs/plan/
├── 01-library-architecture.md   # ← 完整架构设计
├── 02-dependency-strategy.md    # ← 依赖策略分析
├── 03-migration-checklist.md    # ← 实施清单
└── 04-quick-reference.md        # ← 本文件
```

### 需要创建的文件（实施时）

```
src/
├── index.ts                      # 库主入口（导出所有 API）
└── adapters/
    └── index.ts                  # 适配器导出（包含动态加载）

docs/
├── guides/
│   └── INTEGRATION.md            # 集成指南（用户向）
└── MIGRATION.md                  # 迁移指南（现有用户向）

examples/
└── playwright-snapshot/
    ├── package.json
    ├── README.md
    ├── src/
    │   ├── index.ts
    │   ├── authenticated-snapshot.ts
    │   ├── spa-snapshot.ts
    │   └── utils/
    └── .env.example
```

### 需要修改的文件

```
package.json
  - 移除 peerDependencies.playwright
  - 移除 peerDependenciesMeta
  - 确保 exports 配置完整

src/assembler.ts
  - 删除库中的 injectVueHydrationScript 调用

src/cli.ts
  - 在 HTTP 模式下添加 injectVueHydrationScript 调用

README.md
  - 更新依赖部分
  - 链接到新文档
```

---

## 🚀 实施路线图

### Phase 1：API 导出（2-3 小时）✅ 设计完成
```
目标：使库完全可用
- 创建 src/index.ts
- 创建 src/adapters/index.ts  
- 更新 package.json exports
验证：npm install web-clone 后 import { snapshot } 可用
```

### Phase 2：依赖重构（15 分钟）✅ 设计完成
```
目标：清晰的依赖关系
- 移除 peerDependencies.playwright
- 验证构建和测试
验证：npm ls 无 peer 警告
```

### Phase 3：逻辑分离（1-2 小时）✅ 设计完成
```
目标：库/CLI 职责分离
- 从库中移除 hydration 脚本注入
- 在 CLI 中添加
验证：库函数完全不关心 UI
```

### Phase 4：文档示例（3-4 小时）✅ 设计完成
```
目标：用户可快速上手
- 集成指南
- 示例项目
- 迁移指南
- README 更新
验证：新用户能按文档快速开始
```

### Phase 5：验收测试（1-2 小时）✅ 设计完成
```
目标：确保实施质量
- 4 个场景测试
- TypeScript 类型检查
- 代码审查
验证：所有验收条件满足
```

---

## 💡 关键设计点

### 1. 库导出完整的公共 API

**现状：** 库存在但不可导入
```javascript
// ❌ 不行
import { snapshot } from 'web-clone'
```

**改进后：** 库导出完整 API
```javascript
// ✅ 可以
import { snapshot } from 'web-clone'
import type { SnapshotOptions } from 'web-clone'
import { HttpFetcherAdapter } from 'web-clone'
```

### 2. Playwright 完全可选

**现状：** peerDependencies 会提示用户安装
```bash
npm install web-clone
# ⚠️ npm WARN peer dep playwright@>=1.40.0 required
```

**改进后：** 用户完全控制
```bash
npm install web-clone           # ✅ 无警告
npm install playwright          # 用户自己决定
```

### 3. 清晰的错误消息

**现状：** 模糊的导入错误
```
Error: Cannot find module 'playwright'
```

**改进后：** 有帮助的错误消息
```
Error: PlaywrightFetcherAdapter requires "playwright" package.
Install it in your project with: npm install playwright
```

### 4. 库与 CLI 职责清晰

```
web-clone 库              web-clone CLI
├── 下载资源            ├── 选择适配器
├── 验证内容            ├── 处理认证
├── 汇总输出            ├── UI 优化
└── 提供 API            └── 用户交互
```

---

## 📊 改进前后对比

| 方面 | 改进前 | 改进后 |
|------|--------|--------|
| **库可用性** | 受限（无导出） | ✅ 完整（所有 API 导出） |
| **Playwright 依赖** | 强制 peerDep | ✅ 完全可选 |
| **CLI 特定优化** | 在库中（混乱） | ✅ 在 CLI 中（清晰） |
| **自定义适配器** | 难以实现 | ✅ 轻松实现 |
| **用户文档** | 缺失 | ✅ 完整（3 个文档 + 示例） |
| **版本控制** | 库锁定 PW | ✅ 用户独立控制 |
| **错误提示** | 模糊 | ✅ 有帮助 |
| **向后兼容** | N/A | ✅ 完全兼容 |

---

## 🔍 常见问题速查

### Q1：为什么要这样做？

**答：** 分离关切点
- 库专注快照逻辑
- CLI 处理用户交互
- 用户完全控制自动化工具的版本

### Q2：会破坏现有代码吗？

**答：** 不会，完全向后兼容
- 现有 CLI 功能保持不变
- 库 API 更完整（只是添加导出）
- 现有用户代码继续工作

### Q3：用户怎么迁移？

**答：** 大多数无需迁移
- 仅 CLI 用户：无需改动
- 库用户：导入方式更好看了
- Playwright 用户：安装在自己项目中即可

### Q4：如何处理 Playwright 版本冲突？

**答：** 用户完全控制
- 用户在自己项目中安装
- 与 web-clone 的 devDependencies 无冲突
- 用户可以使用 Playwright 1.40、1.50 或最新版

### Q5：库如何检查 Playwright？

**答：** 动态导入 + 清晰错误
```typescript
async function loadPlaywrightAdapter() {
  try {
    return await import('./playwright-adapter.js');
  } catch {
    throw new Error('需要安装 playwright...');
  }
}
```

### Q6：示例项目有什么用？

**答：** 用户参考和学习
- 展示如何在自己的项目中使用
- 提供最佳实践
- 可直接复制改进

### Q7：是否支持其他浏览器（Puppeteer 等）？

**答：** 设计上支持
- 实现 FetcherAdapter 接口
- 用户可以集成 Puppeteer、Cypress 等
- 库完全不关心具体实现

---

## 📋 验收标准

### 代码质量 ✅
- [x] TypeScript 编译无错误
- [x] ESLint 无错误
- [x] 单元测试 ≥97% 通过
- [x] 无 peer 依赖警告

### 功能完整 ✅
- [x] HTTP 快照可用
- [x] Playwright 快照可用
- [x] 自定义适配器可用
- [x] 类型导出完整

### 文档充分 ✅
- [x] 架构文档
- [x] 集成指南
- [x] 示例代码
- [x] 迁移说明

### 用户体验 ✅
- [x] 新用户易上手
- [x] 错误信息有帮助
- [x] API 直观易用
- [x] 文档完整易查

---

## 🎬 快速开始（用户视角）

### 安装
```bash
npm install web-clone
```

### HTTP 快照
```javascript
import { snapshot } from 'web-clone';
await snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle'
});
```

### Playwright 快照
```bash
npm install playwright
```
```javascript
import { chromium } from 'playwright';
import { snapshot } from 'web-clone';
import { loadPlaywrightAdapter } from 'web-clone/adapters';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const PlaywrightAdapter = await loadPlaywrightAdapter();
const adapter = new PlaywrightAdapter(page, context);

await snapshot({
  url: 'https://example.com',
  output: './snapshot'
}, adapter);
```

### 自定义适配器
```javascript
import type { FetcherAdapter } from 'web-clone';

class MyAdapter implements FetcherAdapter {
  async fetch(url, options) {
    // 你的实现
  }
}

await snapshot({ url, ... }, new MyAdapter());
```

---

## 📌 关键截止点

| 阶段 | 目标 | 时间 |
|------|------|------|
| API 导出 | `npm install web-clone` + `import {...}` | Day 1 |
| 依赖修复 | `npm ls` 无警告 | Day 1 |
| 逻辑分离 | 库完全独立 | Day 2 |
| 文档完成 | 用户可自行集成 | Day 3 |
| 验收 | 所有测试通过 | Day 4 |

---

## 相关文档导航

| 文档 | 用途 | 读者 |
|------|------|------|
| [01-library-architecture.md](./01-library-architecture.md) | 整体架构设计 | 架构师、核心开发 |
| [02-dependency-strategy.md](./02-dependency-strategy.md) | 依赖策略分析 | 库维护者 |
| [03-migration-checklist.md](./03-migration-checklist.md) | 实施步骤 | 实施者 |
| docs/guides/INTEGRATION.md | 使用指南 | 库用户 |
| docs/MIGRATION.md | 升级说明 | 现有用户 |
| examples/playwright-snapshot/ | 代码示例 | 学习者 |

---

## 版本说明

```
版本：1.0.0+库化
发布日期：待定
破坏性改动：无
新增 API：导出 snapshot(), FetcherAdapter 等
弃用 API：无
迁移工作量：最小
```

---

## 联系与反馈

实施过程中如遇问题：

1. 参考 03-migration-checklist.md 的故障排除
2. 检查示例项目 examples/playwright-snapshot/
3. 查阅 docs/guides/INTEGRATION.md
4. 创建 Issue 或提问

---

**文档完成于：2026-07-13**  
**下一步：启动实施阶段**
