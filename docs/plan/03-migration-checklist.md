# 实施清单 - Library Architecture Refactoring

**Status:** Ready for Implementation  
**Start Date:** 2026-07-13  
**Phases:** 4  
**Priority:** P0 (核心库功能)  

---

## 📋 Phase 0：前置准备

### 0.1 代码审查

- [ ] 审查 src/assembler.ts 中的 `injectVueHydrationScript()` 调用点
  - [ ] 确认只在快照输出阶段调用
  - [ ] 确认库逻辑中没有其他 UI 特定代码
  
- [ ] 审查所有 FetcherAdapter 实现
  - [ ] HttpFetcherAdapter ✓
  - [ ] PlaywrightFetcherAdapter ✓
  - [ ] 确保接口完整且清晰

- [ ] 验证当前测试覆盖
  - [ ] 单元测试通过率 ✓ (304/312)
  - [ ] 适配器测试是否完整
  - [ ] 是否有集成测试覆盖库 API

### 0.2 文档审查

- [ ] 当前 README.md 是否有过时信息
- [ ] 是否有内部文档需要更新
- [ ] examples/ 目录是否存在且是否过时

---

## 📦 Phase 1：库 API 导出（优先级：🔴 P0）

### 1.1 创建主入口 `src/index.ts`

```typescript
// ✅ 需要做的：
export type {
  SnapshotOptions,
  SnapshotResult,
  Asset,
  AssetRef,
  AssetType,
} from './types.js';

export { snapshot, convertLocalSnapshot } from './assembler.js';

export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from './adapters/fetcher-adapter.js';

export { HttpFetcherAdapter } from './adapters/http-fetcher-adapter.js';
```

**任务项：**
- [ ] 创建文件 `src/index.ts`
- [ ] 导出所有公共类型和函数
- [ ] 检查是否有遗漏的导出
- [ ] 验证没有导出内部实现细节
- [ ] 运行 `npm run build` 确保编译通过
- [ ] 验证生成的 `dist/index.js` 可访问

### 1.2 创建适配器导出 `src/adapters/index.ts`

```typescript
// ✅ 需要做的：
export { HttpFetcherAdapter } from './http-fetcher-adapter.js';

export type {
  FetcherAdapter,
  FetchOptions,
  FetchResult,
  AuthContext,
} from './fetcher-adapter.js';

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

**任务项：**
- [ ] 创建文件 `src/adapters/index.ts`
- [ ] 实现 `loadPlaywrightAdapter()` 函数
- [ ] 测试动态导入逻辑
- [ ] 测试错误消息（无 Playwright 的情况）
- [ ] 验证 `dist/adapters/index.js` 生成正确

### 1.3 更新 `package.json` 导出配置

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./adapters": "./dist/adapters/index.js",
    "./types": "./dist/types.js",
    "./cli": "./dist/cli.js"
  }
}
```

**任务项：**
- [ ] 编辑 `package.json`
- [ ] 添加或更新 `exports` 字段
- [ ] 验证各导出路径对应的文件存在
- [ ] 测试各导出路径的可导入性

**验证命令：**
```bash
node -e "const {snapshot} = require('./dist/index.js'); console.log(typeof snapshot)"
node -e "const {HttpFetcherAdapter} = require('./dist/index.js'); console.log(HttpFetcherAdapter.name)"
```

---

## 🔧 Phase 2：依赖关系重构（优先级：🔴 P0）

### 2.1 修改 `package.json` 依赖配置

**编辑项：**
1. 移除 `peerDependencies` 块（如果有）
2. 移除 `peerDependenciesMeta` 块（如果有）
3. 保留 `devDependencies.playwright`

**任务项：**
- [ ] 打开 `package.json`
- [ ] 定位 `peerDependencies` 块
- [ ] 删除整个 `peerDependencies` 对象
- [ ] 删除整个 `peerDependenciesMeta` 对象
- [ ] 验证 `devDependencies.playwright` 仍存在
- [ ] 运行 `npm install` 验证无错误
- [ ] 运行 `npm ls` 验证无 peer 警告

**验证：**
```bash
npm ls | grep playwright
# ✓ 应该只显示 devDependencies
# ✓ 不应该显示 peer warnings
```

### 2.2 验证构建和测试

**任务项：**
- [ ] 运行 `npm run build` - 必须通过
- [ ] 运行 `npm run test:run` - 应保持通过率
- [ ] 运行 `npm run lint` - 无错误
- [ ] 验证生成的 `dist/` 文件结构

**预期结果：**
```
✓ Build successful
✓ Tests: 304/312 passed (97.4%)
✓ No lint errors
```

---

## 📝 Phase 3：库/CLI 逻辑分离（优先级：🟡 P1）

### 3.1 分析 `injectVueHydrationScript` 使用

**任务项：**
- [ ] 搜索 `injectVueHydrationScript` 的所有调用点
  ```bash
  grep -r "injectVueHydrationScript" src/
  ```
- [ ] 文档化每个调用点的上下文
- [ ] 分析是否必须在库中（答案应该是"否"）

**期望找到的调用点：**
- `assembler.ts`: `snapshotInternal()` 中（应移除）
- 可能在其他地方（如果有，分析为什么）

### 3.2 修改 `src/assembler.ts`

**当前代码（库中）：**
```typescript
// ❌ 不好的做法
async function snapshotInternal(...) {
  // ... 快照逻辑
  injectVueHydrationScript(document);  // ← 不应该在库中
}
```

**修改后：**
```typescript
// ✅ 好的做法
async function snapshotInternal(...) {
  // ... 快照逻辑
  // ✗ 删除 injectVueHydrationScript 调用
  // 库只负责快照，不关心优化
}
```

**任务项：**
- [ ] 在 `snapshotInternal()` 中找到 `injectVueHydrationScript` 调用
- [ ] 注释掉或删除这行
- [ ] 确保库函数完全不依赖这个脚本注入
- [ ] 运行测试验证没有破坏现有功能

### 3.3 修改 `src/cli.ts`（将优化移到 CLI）

**当前：** 无特殊优化（HTTP 模式需要）

**修改后：** CLI 可以在 HTTP 模式下进行优化

```typescript
// src/cli.ts
async function main() {
  // ... 快照逻辑
  
  // 仅在 HTTP 模式下优化
  if (!options.playwright) {
    injectVueHydrationScript(document);
  }
}
```

**任务项：**
- [ ] 在 CLI 的输出阶段添加 hydration 脚本注入
- [ ] 仅当使用 HTTP 适配器时注入
- [ ] 测试 HTTP 模式是否仍能工作

### 3.4 验证分离效果

**任务项：**
- [ ] 库导入时不应加载任何 Playwright 代码
- [ ] 库函数不应有任何副作用（UI 修改等）
- [ ] CLI 可以自由添加最优化，不影响库

**测试命令：**
```bash
# 纯库使用（不包含 CLI 优化）
node -e "const lib = require('./dist/index.js'); console.log(Object.keys(lib))"

# 验证没有注入 hydration 脚本
npm run snapshot -- https://example.com 2>&1 | grep -i "hydration"
```

---

## 📚 Phase 4：文档与示例（优先级：🟡 P1）

### 4.1 编写集成指南 `docs/guides/INTEGRATION.md`

**包含内容：**
- [ ] 安装说明（3 种方式）
- [ ] 快速开始（最简单的例子）
- [ ] 场景 A：HTTP 快照
- [ ] 场景 B：Playwright 快照
- [ ] 场景 C：认证快照
- [ ] 场景 D：AI Agent 集成
- [ ] API 参考
- [ ] 自定义 Adapter 示例
- [ ] 故障排除

**任务项：**
- [ ] 创建文件 `docs/guides/INTEGRATION.md`
- [ ] 每个场景提供完整代码示例
- [ ] 验证代码示例能运行（至少在文档中标注）
- [ ] 添加文件到 GitHub (如果使用 Git)

### 4.2 创建示例项目 `examples/playwright-snapshot/`

**目录结构：**
```
examples/playwright-snapshot/
├── package.json
├── README.md
├── .env.example
├── src/
│   ├── index.ts                    # 基础示例
│   ├── authenticated-snapshot.ts   # 认证示例
│   ├── spa-snapshot.ts             # SPA 示例
│   ├── batch-snapshot.ts           # 批量示例
│   └── utils/
│       ├── auth-helper.ts
│       └── wait-helpers.ts
└── .gitignore
```

**任务项：**
- [ ] 创建 `examples/playwright-snapshot/` 目录
- [ ] 编写 `package.json`（依赖 web-clone 和 playwright）
- [ ] 实现基础示例 (`index.ts`)
- [ ] 实现认证示例 (`authenticated-snapshot.ts`)
- [ ] 实现 SPA 示例 (`spa-snapshot.ts`)
- [ ] 编写 `README.md` 说明如何运行
- [ ] 测试每个示例能运行（至少验证语法）

### 4.3 更新主 README.md

**需要修改的部分：**
- [ ] 依赖部分：明确 Playwright 是可选的
- [ ] 使用说明：链接到 INTEGRATION.md
- [ ] 快速开始：HTTP 模式示例
- [ ] 高级用法：Playwright 模式简介

**示例内容：**
```markdown
## 使用方式

### 快速开始（HTTP）
npm install web-clone

### 使用 Playwright（可选）
npm install playwright

详见 [INTEGRATION.md](docs/guides/INTEGRATION.md)
```

**任务项：**
- [ ] 打开 `README.md`
- [ ] 更新依赖部分
- [ ] 添加指向 INTEGRATION.md 的链接
- [ ] 删除过时或误导的信息

### 4.4 编写迁移指南（针对现有用户）

**文件：** `docs/MIGRATION.md`

**内容：**
- 为什么做这个改动
- 对现有代码的影响
- 如何升级（几乎零改动）
- 新功能和优势
- FAQ

**任务项：**
- [ ] 创建 `docs/MIGRATION.md`
- [ ] 说明改动向后兼容
- [ ] 提供升级检查表
- [ ] 列出新增的公共 API

---

## 🧪 验证与测试

### 测试场景 1：纯库使用（HTTP）

```bash
# 创建临时目录
mkdir /tmp/test-http-snapshot
cd /tmp/test-http-snapshot

# 安装库
npm install /path/to/web-clone

# 创建测试脚本
cat > index.js << 'EOF'
const { snapshot } = require('web-clone');

snapshot('https://example.com', {
  output: './snapshot',
  mode: 'bundle'
}).then(() => console.log('✓ HTTP snapshot works'))
  .catch(err => console.error('✗ Error:', err.message));
EOF

# 运行
node index.js
```

**验收条件：**
- [ ] 脚本成功运行
- [ ] 输出 "✓ HTTP snapshot works"
- [ ] 无 Playwright 相关警告

### 测试场景 2：库 + Playwright 使用

```bash
mkdir /tmp/test-pw-snapshot
cd /tmp/test-pw-snapshot

npm install /path/to/web-clone playwright

cat > index.js << 'EOF'
const { chromium } = require('playwright');
const { snapshot } = require('web-clone');
const { loadPlaywrightAdapter } = require('web-clone/adapters');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    const PlaywrightAdapter = await loadPlaywrightAdapter();
    const adapter = new PlaywrightAdapter(page, context);
    
    await snapshot({
      url: 'https://example.com',
      output: './snapshot'
    }, adapter);
    
    console.log('✓ Playwright snapshot works');
  } finally {
    await context.close();
    await browser.close();
  }
})();
EOF

node index.js
```

**验收条件：**
- [ ] 脚本成功运行
- [ ] 输出 "✓ Playwright snapshot works"

### 测试场景 3：无 Playwright 时的错误处理

```bash
mkdir /tmp/test-pw-error
cd /tmp/test-pw-error

npm install /path/to/web-clone
# 注意：不安装 playwright

cat > index.js << 'EOF'
const { loadPlaywrightAdapter } = require('web-clone/adapters');

loadPlaywrightAdapter()
  .catch(err => {
    if (err.message.includes('playwright')) {
      console.log('✓ Error message is helpful');
    }
  });
EOF

node index.js
```

**验收条件：**
- [ ] 错误消息清晰（包含 "npm install playwright"）
- [ ] 不是模糊的 "Cannot find module" 错误

### 测试场景 4：类型检查（TypeScript）

```bash
mkdir /tmp/test-ts-types
cd /tmp/test-ts-types

npm install /path/to/web-clone typescript

cat > test.ts << 'EOF'
import { snapshot, SnapshotOptions } from 'web-clone';
import { FetcherAdapter } from 'web-clone';

const options: SnapshotOptions = {
  url: 'https://example.com',
  output: './snapshot',
  mode: 'bundle'
};

snapshot('https://example.com', options);
EOF

npx tsc --noEmit test.ts
```

**验收条件：**
- [ ] 无 TypeScript 编译错误
- [ ] 类型提示正确
- [ ] IDE 自动完成工作

---

## ✅ 最终验收清单

### 代码质量
- [ ] 无 TypeScript 编译错误
- [ ] `npm run build` 成功
- [ ] `npm run lint` 无错误
- [ ] 单元测试通过率 ≥ 97%
- [ ] `npm ls` 无 peer 依赖警告

### 功能验证
- [ ] 场景 1 (HTTP)：✅ 通过
- [ ] 场景 2 (Playwright)：✅ 通过
- [ ] 场景 3 (Error handling)：✅ 通过
- [ ] 场景 4 (TypeScript)：✅ 通过

### 文档完整
- [ ] `docs/plan/01-library-architecture.md` ✅
- [ ] `docs/plan/02-dependency-strategy.md` ✅
- [ ] `docs/guides/INTEGRATION.md` ✅
- [ ] `docs/MIGRATION.md` ✅
- [ ] `examples/playwright-snapshot/` ✅
- [ ] README.md 已更新 ✅

### 用户体验
- [ ] 新用户可快速上手（HTTP 模式）
- [ ] 需要 Playwright 的用户有清晰的文档
- [ ] 错误消息有帮助性
- [ ] API 文档完整且易查找

---

## 🚀 实施顺序（推荐）

**Day 1：基础 API（2-3 小时）**
1. Phase 1.1 - 创建 `src/index.ts`
2. Phase 1.2 - 创建 `src/adapters/index.ts`
3. Phase 1.3 - 更新 `package.json` 导出
4. Phase 2 - 修改依赖配置
5. 验证 & 测试

**Day 2：逻辑分离（1-2 小时）**
1. Phase 3 - 分离库/CLI 逻辑
2. 验证分离效果

**Day 3：文档（2-3 小时）**
1. Phase 4.1 - 集成指南
2. Phase 4.2 - 示例项目
3. Phase 4.3 - README 更新
4. Phase 4.4 - 迁移指南

**Day 4：验收（1 小时）**
1. 完整功能测试（4 个场景）
2. 代码审查
3. 最终打包测试

---

## 📊 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 破坏现有 API | 🔴 高 | ✅ 完全向后兼容，仅添加导出 |
| 导出不完整 | 🟡 中 | ✅ 详细检查表，多次验证 |
| 文档不清晰 | 🟡 中 | ✅ 提供完整示例和教程 |
| 测试不足 | 🟡 中 | ✅ 4 个完整的场景测试 |

---

## 附录

### A. 命令快速参考

```bash
# 构建
npm run build

# 测试
npm run test:run
npm run lint

# 验证包
npm pack
npm ls

# 清理
npm run test:clean
```

### B. 文件变更汇总

```
新增：
  src/index.ts
  src/adapters/index.ts
  docs/plan/01-library-architecture.md
  docs/plan/02-dependency-strategy.md
  docs/plan/03-migration-checklist.md
  docs/guides/INTEGRATION.md
  docs/MIGRATION.md
  examples/playwright-snapshot/**

修改：
  package.json (删除 peerDependencies)
  src/assembler.ts (删除 hydration 脚本注入)
  src/cli.ts (添加 hydration 脚本注入)
  README.md (更新依赖和使用说明)

无需改动：
  src/adapters/fetcher-adapter.ts (接口已完整)
  src/adapters/http-fetcher-adapter.ts (实现已完整)
  src/adapters/automation/playwright/adapter.ts (实现已完整)
```

### C. 验收署名

当所有项完成时：

```
实施者：____________  日期：__________
审核者：____________  日期：__________
发布者：____________  日期：__________
```
