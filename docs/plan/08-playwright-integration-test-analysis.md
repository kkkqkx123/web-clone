# Playwright 集成测试正确运行方案分析

## 背景

当前 monorepo 中有两个 Playwright 集成测试文件被 `describe.skipIf` 跳过：

| 文件 | 位置 | 测试数 | 被跳过原因 |
|------|------|--------|------------|
| `snapshot-with-real-content.test.ts` | `packages/core/src/__tests__/integration/` | 4 | `playwright` 包不可用 |
| `snapshot-with-playwright.test.ts` | `apps/cli/src/__tests__/integration/` | 17 | `playwright` 包不可用 |

## 依赖分析

### playwright 的安装位置

```
packages/adapter-playwright/node_modules/playwright
  → symlink to node_modules/.pnpm/playwright@1.58.2/node_modules/playwright
```

`playwright` 是 `@web-clone/adapter-playwright` 的**直接依赖**（dependencies），仅此一个包拥有它。

### pnpm 的依赖隔离

由于 pnpm 的严格依赖隔离机制：

- `playwright` **不会**被提升到根 `node_modules/`
- 从 `packages/core/` 或 `apps/cli/` 中 `import 'playwright'` 会报 `ERR_MODULE_NOT_FOUND`
- 即使 `@web-clone/adapter-playwright` 是 CLI 的 `optionalDependencies`，pnpm 也不会把它的子依赖暴露给 CLI

### 浏览器二进制文件

Playwright 测试还需要浏览器二进制文件，通过环境变量 `PLAYWRIGHT_BROWSERS_PATH` 指定位置：

```bash
export PLAYWRIGHT_BROWSERS_PATH="D:\\Source\\pw-browsers"
```

## 三种可行方案

### 方案 A：将 playwright 添加为 devDependency

**步骤**：
1. 在 `packages/core/package.json` 和 `apps/cli/package.json` 的 `devDependencies` 中添加 `"playwright": "1.58.2"`
2. 运行 `pnpm install` 重建 symlink
3. 设置 `PLAYWRIGHT_BROWSERS_PATH` 环境变量
4. 运行测试

**优点**：
- 改动最小，无需移动文件
- 测试原地运行，保持当前目录结构

**缺点**：
- 两个包各增加 ~300MB 依赖（playwright 含浏览器二进制下载）
- 核心库和 CLI 包本来不需要 playwright，它会出现在 `node_modules` 和锁文件中

**影响范围**：
- `packages/core/package.json` 增加 `"playwright": "1.58.2"` 到 `devDependencies`
- `apps/cli/package.json` 增加 `"playwright": "1.58.2"` 到 `devDependencies`

---

### 方案 B：将集成测试迁移到 adapter-playwright 包

**步骤**：
1. 将 `snapshot-with-real-content.test.ts` 迁移到 `packages/adapter-playwright/src/__tests__/integration/`
2. 将 `snapshot-with-playwright.test.ts` 迁移到 `packages/adapter-playwright/src/__tests__/integration/`
3. 更新所有 import 路径（`../../index.js` → `@web-clone/core`，`./helpers/browser-setup` 需要一起迁移或复制）
4. 将 `helpers/test-server.ts` 和 `helpers/browser-setup.ts` 也迁移过去
5. 从原位置删除被跳过的测试文件
6. 移除 `packages/core` 和 `apps/cli` 中的条件跳过逻辑

**优点**：
- 架构清晰，测试与依赖共处一个包
- 不增加其他包的依赖体积
- 符合 monorepo 的最佳实践

**缺点**：
- 需要迁移 4 个文件（2 个测试 + 2 个 helper），更新 import 路径
- 测试文件可能引用 `@web-clone/core` 内部模块路径（如 `../../index.js`），需要改为公开 API 导入
- `apps/cli` 的测试引用了 `snapshot()` 和 CLI 相关逻辑，需要额外处理

**影响范围**：

需要迁移的文件：

| 源路径 | 目标路径 |
|--------|----------|
| `packages/core/src/__tests__/integration/snapshot-with-real-content.test.ts` | `packages/adapter-playwright/src/__tests__/integration/snapshot-with-real-content.test.ts` |
| `packages/core/src/__tests__/integration/helpers/test-server.ts` | `packages/adapter-playwright/src/__tests__/integration/helpers/test-server.ts` |
| `apps/cli/src/__tests__/integration/snapshot-with-playwright.test.ts` | `packages/adapter-playwright/src/__tests__/integration/snapshot-with-playwright.test.ts` |
| `apps/cli/src/__tests__/integration/helpers/browser-setup.ts` | `packages/adapter-playwright/src/__tests__/integration/helpers/browser-setup.ts` |

需要移除的跳过逻辑：

| 文件 | 移除内容 |
|------|----------|
| `packages/core/src/__tests__/integration/snapshot-with-real-content.test.ts` | 整个文件 |
| `apps/cli/src/__tests__/integration/snapshot-with-playwright.test.ts` | 整个文件 |

---

### 方案 C：根级 devDependency + 统一集成测试脚本

**步骤**：
1. 在根 `package.json` 的 `devDependencies` 中添加 `"playwright": "1.58.2"`
2. 在根 `package.json` 中添加 `scripts.test:integration:playwright` 脚本
3. 测试文件原地保留，使用 `describe.skipIf` 的 fallback 机制

**优点**：
- 所有包共享同一个 playwright 依赖（不重复）
- 测试文件保留在原位，便于按包组织
- 仅在根级增加一次依赖

**缺点**：
- 根级多一个 ~300MB 的 devDependency
- 仍然需要设置 `PLAYWRIGHT_BROWSERS_PATH` 环境变量
- pnpm 可能仍然不会将 playwright 提升到各包的解析路径中（取决于 pnpm 配置）

## 推荐方案

### 推荐：方案 B（迁移到 adapter-playwright 包）

理由：

1. **架构正确**：集成测试应属于 adapter-playwright 包，它既拥有 `playwright` 依赖，又拥有 `@web-clone/core` 依赖（用于 `snapshot()` 函数），天然适合运行端到端测试

2. **不污染运行时依赖**：`@web-clone/core` 和 CLI 包的消费者不需要 playwright，不应出现在它们的 `package.json` 中

3. **pnpm 隔离友好**：测试与依赖在同一个包内，pnpm 的依赖解析不会出问题

4. **可扩展性**：后续添加更多 Playwright 集成测试时，都放在同一个包中

### 如果选方案 B 的具体实施步骤

#### Step 1: 创建目标目录

```bash
mkdir -p packages/adapter-playwright/src/__tests__/integration/helpers
```

#### Step 2: 迁移 test-server.ts

将 `packages/core/src/__tests__/integration/helpers/test-server.ts` 复制到 `packages/adapter-playwright/src/__tests__/integration/helpers/test-server.ts`。

该文件不依赖任何包内模块，无需修改 import。

#### Step 3: 迁移 browser-setup.ts

将 `apps/cli/src/__tests__/integration/helpers/browser-setup.ts` 复制到 `packages/adapter-playwright/src/__tests__/integration/helpers/browser-setup.ts`。

该文件导入 `playwright`，而 `adapter-playwright` 包拥有 playwright 依赖，无需修改。

#### Step 4: 迁移 snapshot-with-real-content.test.ts

核心改动：
- `import { snapshot } from '../../index.js'` → `import { snapshot } from '@web-clone/core'`
- `import { startTestServer, ... } from './helpers/test-server.js'` → 路径不变（在同一包内）
- 移除条件跳过逻辑（`describe.skipIf`），直接使用 `describe`

#### Step 5: 迁移 snapshot-with-playwright.test.ts

核心改动：
- `import { snapshot } from '@web-clone/core'` → 保持不变（公开 API）
- `import { PlaywrightFetcherAdapter } from '@web-clone/adapter-playwright'` → 改为本地导入 `import { PlaywrightFetcherAdapter } from '../../adapter.js'`
- `import { ... } from './helpers/browser-setup'` → `'./helpers/browser-setup.js'`（路径不变）
- 移除条件跳过逻辑

#### Step 6: 删除原文件

从 `packages/core` 和 `apps/cli` 中删除已迁移的测试文件和 helper 文件。

#### Step 7: 更新 adapter-playwright 的 package.json

在 `@web-clone/adapter-playwright/package.json` 的 `scripts` 中，`test` 命令会自动包含 `src/__tests__/integration/` 目录（因为 vitest 会扫描 `**/*.{test,spec}.?(c|m)[jt]s?(x)`）。

但需要确保 vitest 的 include 模式包含 `integration/` 子目录。检查 vitest 配置，如果默认 exclude 排除了 `integration/`，则需要添加一个单独的 `test:integration` 脚本。

## 验证步骤

```bash
# 1. 设置浏览器环境
export PLAYWRIGHT_BROWSERS_PATH="D:\\Source\\pw-browsers"

# 2. 运行 adapter-playwright 的全部测试（包括迁移后的集成测试）
pnpm --filter @web-clone/adapter-playwright test

# 3. 确认 core 和 CLI 的测试不再包含 Playwright 测试
pnpm --filter @web-clone/core test
pnpm --filter @kkkqkx123/web-clone-cli test

# 4. 运行完整测试套件
pnpm test
```

## 环境要求

运行 Playwright 集成测试前，需要满足：

1. **Playwright 包已安装**：`pnpm install` 后 `@web-clone/adapter-playwright` 的依赖已解析
2. **浏览器二进制文件可用**：`PLAYWRIGHT_BROWSERS_PATH` 指向包含 Chromium 的目录
3. **验证浏览器**：`pnpm browsers:check` 输出显示 `✅ Chromium found`