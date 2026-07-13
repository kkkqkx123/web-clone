# 依赖策略分析 - Playwright 依赖管理

**Status:** Design Decision  
**Date:** 2026-07-13  

---

## 问题陈述

### 当前配置

```json
{
  "name": "web-clone",
  "dependencies": { /* 核心依赖 */ },
  "peerDependencies": {
    "playwright": ">=1.40.0"
  },
  "peerDependenciesMeta": {
    "playwright": {
      "optional": true
    }
  },
  "devDependencies": {
    "playwright": "^1.58.2"
  }
}
```

### 存在的问题

| 问题 | 影响 | 严重性 |
|------|------|--------|
| peerDependencies 中有 playwright | npm 会警告用户必须安装 | 🔴 P0 |
| 库和用户项目的 PW 版本可能冲突 | 难以调试的版本问题 | 🔴 P0 |
| 库不是真的需要 PW（是可选的） | 误导用户的依赖关系 | 🟡 P1 |
| 库不应该锁定用户的 PW 版本 | 阻止用户升级 | 🟡 P1 |

---

## 根本原因分析

### 为什么可能被配置成 peerDependencies？

**错误的理由：**
> "PlaywrightFetcherAdapter 需要 Playwright，所以应该在 peerDependencies"

**问题：**
1. 库**提供** PlaywrightFetcherAdapter，但**不强制使用**
2. 用户可以完全忽略 Playwright，只用 HTTP 适配器
3. 如果用户确实需要 Playwright，会在**自己的项目**中安装
4. 库和用户项目应该是**独立的**依赖决策

### 真实使用场景

**场景 1：用户只用 HTTP 模式**
```typescript
import { snapshot } from 'web-clone';
await snapshot('https://example.com', {...});
// ✓ 完全不需要 Playwright
// ✗ 但 npm 会警告安装 Playwright（浪费空间）
```

**场景 2：用户自己管理 Playwright**
```typescript
// 用户的项目（package.json）
{
  "dependencies": {
    "web-clone": "^1.0.0"
  },
  "devDependencies": {
    "playwright": "^1.50.0"  // ← 用户自己决定版本
  }
}

// 用户的代码
import { chromium } from 'playwright';
import { loadPlaywrightAdapter } from 'web-clone/adapters';

const PlaywrightAdapter = await loadPlaywrightAdapter();
// ✓ 用户完全控制版本
// ✓ web-clone 不强制要求
```

**场景 3：集成到 CI/CD 或 Agent**
```yaml
# CI Pipeline
jobs:
  snapshot:
    steps:
      - run: npm install web-clone  # 不安装 PW
      - run: npm install playwright # 单独步骤，版本独立
      - run: node my-snapshot.js
```

---

## 决策：移除 peerDependencies 中的 Playwright

### 最终方案

```json
{
  "dependencies": {
    // 核心库依赖（不包含 playwright）
    "@babel/parser": "^8.0.4",
    "chalk": "^5.6.2",
    "commander": "^15.0.0",
    // ... 等等
  },
  "devDependencies": {
    // ✓ 开发和测试 web-clone 本身需要
    "playwright": "^1.58.2",
    "typescript": "^5.9.3",
    "vitest": "^4.1.10"
  },
  // ❌ 移除 peerDependencies.playwright
  // ❌ 移除 peerDependenciesMeta
}
```

### 配套改动：运行时检查

**当 PlaywrightFetcherAdapter 被加载时：**

```typescript
// src/adapters/index.ts
export async function loadPlaywrightAdapter() {
  try {
    const module = await import('./automation/playwright/adapter.js');
    return module.PlaywrightFetcherAdapter;
  } catch (err) {
    throw new Error(
      'PlaywrightFetcherAdapter requires "playwright" package. ' +
      'Install it in your project with: npm install playwright'
    );
  }
}
```

**用户看到清晰的错误信息：**
```
Error: PlaywrightFetcherAdapter requires "playwright" package.
Install it in your project with: npm install playwright
```

---

## 架构图

### 改进前：混乱的依赖关系

```
npm install web-clone
  ↓
npm 看到 peerDependencies.playwright
  ↓
⚠️ npm warn: 请安装 playwright
  ↓
用户困惑：我只用 HTTP，为什么要装 PW？
```

### 改进后：清晰的依赖关系

```
用户项目 A（仅 HTTP）
└── web-clone
    └── devDependencies: playwright (仅开发 web-clone)

用户项目 B（自己用 PW）
├── web-clone
├── devDependencies: playwright (用户自己的 PW 实例)
└── src/
    └── my-snapshot.ts (使用 loadPlaywrightAdapter)
```

---

## 对比表

| 方面 | 当前配置 | 新配置 |
|------|---------|--------|
| **peerDependencies.playwright** | ✅ 有 | ❌ 无 |
| **devDependencies.playwright** | ✅ 有 | ✅ 有 |
| **库强制用户安装 PW** | ✅ 是 | ❌ 否 |
| **用户可自由选择 PW 版本** | ❌ 否 | ✅ 是 |
| **HTTP 用户受影响** | ✅ 是（不必要警告） | ❌ 否 |
| **运行时 PW 检查** | ❌ 否 | ✅ 有 |
| **文档清晰度** | 🔶 模糊 | 🟢 清晰 |

---

## 迁移影响分析

### 对现有用户的影响

**1. 仅使用 HTTP 的用户**
```diff
  npm install web-clone
- npm warn: peer dep playwright required
+ npm info: web-clone installed successfully ✓
```
**影响：** ✅ 改进（少一个困惑的警告）

**2. 已经安装了 Playwright 的用户**
```typescript
// 代码无需改动
import { loadPlaywrightAdapter } from 'web-clone/adapters';
// ✓ 继续正常工作
```
**影响：** ✅ 零影响

**3. 动态加载 Playwright 的用户**
```typescript
// 代码无需改动
const PlaywrightAdapter = await loadPlaywrightAdapter();
// ✓ 继续正常工作
```
**影响：** ✅ 零影响

### 对新用户的影响

**更清晰的文档：**
```markdown
## 使用 Playwright

1. 仅当需要自动化浏览器时
2. 在你的项目中安装：npm install playwright
3. 使用 loadPlaywrightAdapter() 加载

不使用 Playwright？完全没问题，HTTP 模式开箱即用！
```

**更好的错误信息：**
```
Error: PlaywrightFetcherAdapter requires "playwright" package.
Install it in your project with: npm install playwright
```
vs 当前无信息的 import 错误

---

## 实施步骤

### 步骤 1：更新 package.json

```bash
# 编辑 package.json
# 1. 删除 peerDependencies 整个块
# 2. 删除 peerDependenciesMeta 整个块
# 保留 devDependencies.playwright
```

### 步骤 2：验证导出

```bash
npm run build
npm ls  # 验证没有 peer 警告
```

### 步骤 3：测试每个场景

```bash
# 场景 1：仅 HTTP
npm install
npm run test:http

# 场景 2：with Playwright
npm install playwright
npm run test:playwright

# 场景 3：库导入
npm pack
cd /tmp
npm install /path/to/web-clone-1.0.0.tgz
node -e "const snapshot = require('web-clone'); console.log(snapshot)"
```

### 步骤 4：更新文档

- [ ] 更新 README.md - 依赖部分
- [ ] 编写 docs/guides/INTEGRATION.md
- [ ] 更新示例代码
- [ ] 写迁移指南（给已有用户）

---

## FAQ

### Q: 为什么不用 optionalDependencies？

**optionalDependencies** 不适合，因为：
1. 定义的是库本身的可选依赖，不是用户的选择
2. npm install 会尝试安装，失败时忽略（较差的用户体验）
3. 应该明确告诉用户"你需要时自己装"

### Q: 如果用户忘记安装 Playwright 怎么办？

**最好的情况：** 运行时清晰的错误信息
```
Error: PlaywrightFetcherAdapter requires "playwright" package.
Install it in your project with: npm install playwright
```

**当前做法对比：**
```
Error: Cannot find module 'playwright'
(用户不知道为什么需要它)
```

### Q: 库中能否硬依赖一个"最小 Playwright 分发"？

**不行，原因：**
1. Playwright 包含浏览器二进制文件（~200MB），不适合库
2. 浏览器版本应该由用户决定，不是库
3. 会增加 web-clone 的装包时间

### Q: devDependencies 中的 Playwright 用来做什么？

**用途：**
1. 编写和运行集成测试（PlaywrightFetcherAdapter 的测试）
2. 开发时调试
3. 验证 adapter 实现的正确性

---

## 验证清单

- [ ] 从 package.json 移除 peerDependencies.playwright
- [ ] 保留 devDependencies.playwright
- [ ] 验证 npm ls 无 peer 警告
- [ ] 测试库导入（无 PW 的情况）
- [ ] 测试 loadPlaywrightAdapter（有 PW 的情况）
- [ ] 运行完整测试套件
- [ ] 更新 docs/guides/INTEGRATION.md
- [ ] 更新 README.md
- [ ] 清理 example 代码中的过时说法

---

## 相关决策

- 📌 [01-library-architecture.md](./01-library-architecture.md) - 整体架构设计
- 📌 [03-migration-checklist.md](./03-migration-checklist.md) - 实施清单
