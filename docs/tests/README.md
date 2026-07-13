# 测试文档中心

## 📚 文档列表

### 1. **LIBRARY_REFACTORING_TEST_PLAN.md** (NEW) — 库化改造测试方案
   - 覆盖 Phase 1-4 的测试需求分析
   - 10 个新增测试文件的完整用例设计
   - 当前测试覆盖盲区分析（库 API 导出、依赖重构、逻辑分离）
   - 8 个预存失败测试的根因分析和修复方案
   - 逐日实施计划（4 天，~3 小时工作量）
   - 验收标准和测试质量目标

**何时阅读**：验证库化改造正确性、编写新测试

---

### 2. **PLAYWRIGHT_INTEGRATION_TEST_PLAN.md** - Playwright 集成测试计划
   - 项目当前状态
   - 三层测试金字塔（Mock / 集成 / E2E）
   - Mock 单元测试详细用例
   - 集成测试需求和设计
   - 测试覆盖范围
   - 完整运行指南

**何时阅读**：了解整体测试策略

---

### 2. **TEST_STRUCTURE.md** - 项目结构指南
   - 完整的目录树
   - 各层级的职责定义
   - 文件命名规范
   - 依赖关系图
   - 生命周期管理
   - vitest 配置
   - 快速参考

**何时阅读**：建立项目文件结构，组织新测试文件

---

### 3. **MOCK_GUIDE.md** - Mock 对象使用指南
   - Mock 的作用和何时使用
   - Mock 对象工厂（Page、Context、Results）
   - 测试数据集使用（URLs、Headers、Cookies）
   - 5 种 Mock 模式和最佳实践
   - 常见测试场景的具体代码
   - 高级技巧和调试方法
   - 快速参考

**何时阅读**：编写单元测试，使用 Mock 对象

---

## 🎯 快速开始

### 第一次接触项目

1. 阅读 **PLAYWRIGHT_INTEGRATION_TEST_PLAN.md** 的"测试概览"部分
2. 查看 **TEST_STRUCTURE.md** 的"项目结构"部分
3. 理解 Mock 单元测试 vs 集成测试的区别

### 编写 Mock 单元测试

1. 阅读 **TEST_STRUCTURE.md** → "2.1 单元测试层"
2. 查看 **MOCK_GUIDE.md** → "4. 常见测试场景"
3. 参考现有代码：`src/adapters/__tests__/playwright-fetcher-adapter.test.ts`

### 编写集成测试

1. 阅读 **TEST_STRUCTURE.md** → "2.2 集成测试层"
2. 阅读 **PLAYWRIGHT_INTEGRATION_TEST_PLAN.md** → "4. 集成测试"
3. 确保已安装浏览器：`npx playwright install chromium`

---

## 🏗️ 项目目录速览

```
src/adapters/__tests__/
├── fixtures/
│   ├── mock-factories.ts    # 创建 Mock Page / Context 对象
│   └── test-data.ts         # 测试数据集（URL、Header、Cookie）
├── playwright-fetcher-adapter.test.ts  # ✅ 已完成（43 个用例）
├── http-fetcher-adapter.test.ts        # ⏳ 待实现
├── adapter-switching.test.ts           # ⏳ 待实现
└── fetcher-adapter-interface.test.ts   # ⏳ 待实现

src/__tests__/integration/
├── helpers/
│   ├── browser-setup.ts        # 浏览器启动和生命周期
│   ├── snapshot-helpers.ts     # 快照验证工具
│   └── file-helpers.ts         # 文件系统工具
├── snapshots/
│   ├── example-static.json
│   └── ...
├── snapshot-with-playwright.test.ts  # ⏳ 待实现
├── snapshot-with-http.test.ts        # ⏳ 待实现
└── adapter-compatibility.test.ts     # ⏳ 待实现
```

---

## 📊 测试现状

| 层级 | 类型 | 文件 | 用例数 | 状态 |
|------|------|------|--------|------|
| **单元** | Mock | `playwright-fetcher-adapter.test.ts` | 43 | ✅ 完成 |
| **单元** | Mock | `http-fetcher-adapter.test.ts` | 15-20 | ⏳ 待实现 |
| **单元** | Mock | `fetcher-adapter-interface.test.ts` | 8-10 | ⏳ 待实现 |
| **单元** | Mock | `adapter-switching.test.ts` | 4-6 | ⏳ 待实现 |
| **集成** | 真实浏览器 | `snapshot-with-playwright.test.ts` | 8-10 | ⏳ 待实现 |
| **集成** | 真实浏览器 | `snapshot-with-http.test.ts` | 4-6 | ⏳ 待实现 |
| **集成** | 真实浏览器 | `adapter-compatibility.test.ts` | 3-5 | ⏳ 待实现 |

---

## 🚀 常用命令

### Mock 单元测试

```bash
# 运行所有 Mock 测试
npm run test:run -- src/adapters/__tests__

# 监听模式（开发中）
npm run test -- src/adapters/__tests__

# 特定文件
npm run test:run -- src/adapters/__tests__/playwright-fetcher-adapter.test.ts

# 特定测试用例
npm run test:run -- --grep "should fetch HTML"
```

### 集成测试

```bash
# 安装浏览器（仅首次）
npx playwright install chromium

# 运行所有集成测试
npm run test:run -- src/__tests__/integration --timeout 30000

# 调试模式
PWDEBUG=1 npm run test:run -- src/__tests__/integration
```

### 覆盖率

```bash
# 生成覆盖率报告
npm run test:coverage

# 查看 HTML 报告
open coverage/index.html
```

---

## 💡 关键概念

### Mock 测试（无需真实浏览器）

✅ **优势**
- 快速（< 1 秒）
- 无网络依赖
- 100% 可重复
- 易于调试

❌ **局限**
- 不够真实
- 需要维护 Mock

**使用场景**：
- 单个方法逻辑
- 参数验证
- 错误处理

---

### 集成测试（需要真实浏览器）

✅ **优势**
- 验证真实交互
- 测试输出结构
- JavaScript 执行

❌ **局限**
- 慢（30秒+）
- 需要浏览器
- 需要网络

**使用场景**：
- 适配器与快照管道交互
- 输出文件验证
- 完整工作流

---

## 📖 文档路线图

```
新手入门
  ↓
PLAYWRIGHT_INTEGRATION_TEST_PLAN.md （总体概览）
  ↓ ↓ ↓
┌─────────────────────────────────────┐
│                                     │
TEST_STRUCTURE.md      MOCK_GUIDE.md   │
（建立项目）           （编写测试）    │
│                                     │
└─────────────────────────────────────┘
  ↓ ↓
实战编码
  ↓
参考现有代码 + 文档
  ↓
完成测试
```

---

## ❓ 常见问题

### Q1：我应该先读哪个文档？

**A**：按这个顺序：
1. 本 README（5 分钟）
2. PLAYWRIGHT_INTEGRATION_TEST_PLAN.md 的"测试概览"（10 分钟）
3. TEST_STRUCTURE.md（15 分钟）
4. 具体需求对应的文档

### Q2：如何快速编写测试？

**A**：
1. 参考 `src/adapters/__tests__/playwright-fetcher-adapter.test.ts` 的现有结构
2. 使用 `createMockPage()` 和 `createMockContext()` 创建 Mock
3. 使用 `TEST_URLS` 和 `TEST_HEADERS` 填充测试数据
4. 参考 MOCK_GUIDE.md 的"5. 常见测试场景"

### Q3：集成测试需要做什么准备？

**A**：
1. 安装 Playwright：`npx playwright install chromium`
2. 阅读 TEST_STRUCTURE.md 的"2.2 集成测试层"
3. 参考 PLAYWRIGHT_INTEGRATION_TEST_PLAN.md 的"4. 集成测试"
4. 使用 `beforeAll` / `afterAll` 管理浏览器生命周期

### Q4：怎么调试 Mock 问题？

**A**：参考 MOCK_GUIDE.md 的"7. 调试 Mock 问题"

---

## 📝 文档维护

### 何时更新文档

- ✅ 新增测试类型或工具
- ✅ 改变项目结构
- ✅ 发现常见问题
- ✅ 优化工作流

### 文件负责人

- `PLAYWRIGHT_INTEGRATION_TEST_PLAN.md` - 整体测试战略
- `TEST_STRUCTURE.md` - 项目文件组织
- `MOCK_GUIDE.md` - Mock 对象使用

---

## 🎓 相关资源

- [Vitest 文档](https://vitest.dev/)
- [Playwright API](https://playwright.dev/docs/api/class-page)
- [项目 CLAUDE.md](../../CLAUDE.md) - 项目总体指南

---

## ✨ 总结

这个测试文档体系提供了：

1. **清晰的分层**：Mock 测试 vs 集成测试
2. **详细的指导**：从项目结构到具体代码
3. **现成的工具**：factories、test-data、helpers
4. **快速参考**：命令、模式、场景

**目标**：让任何开发者都能快速理解和编写测试代码。

**下一步**：
- [ ] 完成 fixtures（mock-factories.ts、test-data.ts）
- [ ] 实现 HttpFetcherAdapter 单元测试
- [ ] 建立集成测试框架
- [ ] 补充更多文档（TEST_SETUP.md、BROWSER_INTEGRATION_GUIDE.md）
