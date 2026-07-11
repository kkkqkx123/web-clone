# docs/plan 目录导引

本目录包含 web-clone 库化和 Playwright 集成的完整设计方案。

## 📚 文档清单

### 1. [playwright-library-integration.md](./playwright-library-integration.md) - 总体设计方案
**核心文档，应首先阅读**

包含内容：
- **第一部分**：当前架构分析
  - 项目现状和限制
  - 关键模块说明
  
- **第二部分**：库架构设计（分层架构）
  - 适配器模式
  - 分离关注点
  
- **第三部分**：Playwright 集成工作流
  - 使用流程和代码示例
  - 高级场景（Cookie、动态渲染、多页面、代理）
  
- **第四部分**：公开 API 设计
  - 导出结构
  - package.json 更新
  
- **第五部分**：实现步骤（大纲）
  - 5 个实现阶段的概览
  
- **第六部分**：设计决策和权衡
  - 关键决策的理由
  
- **第七部分**：使用示例（简短）
  - GitHub 私有仓库
  - SPA 多页
  - API 令牌
  
- **第八部分**：测试策略
  
- **第九部分**：迁移和向后兼容性
  
- **第十部分**：性能和优化
  
- **第十一部分**：部署和发布
  
- **第十二部分**：常见问题
  
- **第十三部分**：时间线和成本估计

### 2. [implementation-roadmap.md](./implementation-roadmap.md) - 详细实现路线图
**开发团队的工作指南**

包含内容：
- **一、项目结构变更**
  - 目录结构对比
  
- **二、分阶段实现计划**
  - 阶段 1（基础设施）：适配器接口、HTTP 实现、类型定义 → 2-3 天
  - 阶段 2（Playwright 适配器）：Playwright 实现、单元测试 → 3-5 天
  - 阶段 3（集成和重构）：assembler.ts、库入口、package.json → 3-4 天
  - 阶段 4（文档和示例）：API 文档、集成指南、示例代码 → 2-3 天
  - 阶段 5（测试和验证）：集成测试、E2E 测试 → 2-3 天
  
- **三、关键代码修改清单**
  - 需要修改/创建的文件
  - 无需修改的文件
  
- **四、测试覆盖率目标**
  
- **五、发布检查清单**
  
- **六、向后兼容性验证**
  
- **七、风险评估和缓解**
  
- **八、成功指标**

### 3. [code-framework.md](./code-framework.md) - 代码框架详细实现
**开发者的代码参考**

包含内容：
- **一、适配器接口层**
  - 核心接口定义：FetcherAdapter, FetchOptions, FetchResult, AuthContext
  - 导出文件结构
  
- **二、HTTP 适配器实现**
  - 完整 HttpFetcherAdapter 代码
  - 单元测试代码
  
- **三、Playwright 适配器实现**
  - 完整 PlaywrightFetcherAdapter 代码（300+ 行）
  - 单元测试代码（400+ 行）
  - 内部方法详解
  
- **四、assembler.ts 集成改动**
  - 关键修改点
  - 集成代码示例
  
- **五、类型定义更新**
  
- **六、库入口文件**
  
- **七、总结和检查清单**

### 4. [examples.md](./examples.md) - 实际使用示例
**终端用户和集成者的参考**

包含 6 个完整的、可运行的示例代码：

1. **基础示例**：简单登录和快照
   - 最简单的工作流
   - ~100 行代码
   
2. **多页快照**：SPA 应用
   - 一次登录，多页面快照
   - Cookie 复用
   - ~150 行代码
   
3. **API 令牌认证**
   - JWT/OAuth 令牌处理
   - 自定义请求头
   - ~120 行代码
   
4. **高级 JS 执行**
   - 动态内容加载
   - 无限滚动、延迟图片、模态框
   - ~150 行代码
   
5. **错误处理和重试**
   - 生产级别的错误处理
   - 重试逻辑、日志、资源清理
   - ~300 行代码
   
6. **批量快照和导出**
   - 批量处理多个 URL
   - 生成报告
   - ~150 行代码

每个示例都包含详细的注释和说明。

---

## 🎯 按角色阅读指南

### 📋 项目经理 / 决策者
1. 阅读 `playwright-library-integration.md` 的：
   - 第二部分：库架构设计
   - 第十部分：性能和优化
   - 第十三部分：时间线和成本估计

2. 查看 `implementation-roadmap.md` 的：
   - 二、分阶段实现计划（时间估计）
   - 八、成功指标

**预计阅读时间**：30 分钟

---

### 💻 开发者 / 架构师
1. 完整阅读 `playwright-library-integration.md`
   - 理解整体架构和设计理由
   
2. 阅读 `implementation-roadmap.md` 的：
   - 一、项目结构变更
   - 二、分阶段实现计划
   - 三、关键代码修改清单
   
3. 参考 `code-framework.md` 的：
   - 一、适配器接口层
   - 对应实现部分（开始编码时）

**预计阅读时间**：2-3 小时

---

### 👨‍💻 实现工程师
1. 快速浏览 `playwright-library-integration.md` 的：
   - 第二部分：库架构设计（关键概念）
   - 第四部分：公开 API 设计
   
2. 详细阅读 `implementation-roadmap.md` 的：
   - 二、分阶段实现计划（你的具体任务）
   - 三、关键代码修改清单
   
3. 逐部分阅读 `code-framework.md`（对应实现）
   - 当实现 HTTP 适配器时，查看第二部分
   - 当实现 Playwright 适配器时，查看第三部分
   - 当修改 assembler.ts 时，查看第四部分
   
4. 参考 `examples.md` 的相关示例作为集成测试

**预计工作周期**：2-3 周（按阶段）

---

### 🧪 测试 / QA
1. 阅读 `implementation-roadmap.md` 的：
   - 四、测试覆盖率目标
   - 五、发布检查清单
   - 六、向后兼容性验证
   
2. 查看 `code-framework.md` 的：
   - 对应模块的单元测试代码
   
3. 参考 `examples.md` 的示例创建测试场景

**预计阅读时间**：1-2 小时

---

### 📖 文档 / 技术写作
1. 整体阅读所有文档
   - 理解功能和使用场景
   
2. 创建用户文档时，参考：
   - `examples.md` 的示例代码
   - `playwright-library-integration.md` 的使用场景
   
3. 创建 API 文档时，参考：
   - `code-framework.md` 的接口定义
   - `playwright-library-integration.md` 第四部分

**预计阅读时间**：2-3 小时

---

## 🚀 快速开始

### 如果你要...

**...理解整体方案**
→ 先读 `playwright-library-integration.md` 的摘要版（第二、三、四、六部分）

**...开始编码**
→ 按 `implementation-roadmap.md` 的阶段计划，参考 `code-framework.md` 的代码框架

**...集成到 Playwright 工作流**
→ 直接跳到 `examples.md`，选择最相关的示例修改使用

**...部署和发布**
→ 查看 `playwright-library-integration.md` 第十一部分和 `implementation-roadmap.md` 五、六部分

**...解答用户问题**
→ 查看 `playwright-library-integration.md` 第十二部分（常见问题）

---

## 📊 文档关系图

```
playwright-library-integration.md (总体设计)
    ├─ 整体架构 ──────────────┬──> implementation-roadmap.md (实现细节)
    │                         └──> code-framework.md (代码实现)
    │
    ├─ 使用场景 ──────────────┬──> examples.md (实际代码示例)
    │                         └──> 用户文档
    │
    ├─ API 设计 ──────────────┬──> code-framework.md (接口定义)
    │                         └──> API 参考文档
    │
    ├─ 时间线 ────────────────> implementation-roadmap.md (分阶段计划)
    │
    ├─ 测试策略 ──────────────> code-framework.md (单元测试代码)
    │
    └─ 发布清单 ──────────────> implementation-roadmap.md (发布检查)
```

---

## ✅ 验证清单

- [ ] 所有文档已创建
- [ ] 文档之间的交叉引用清晰
- [ ] 代码示例可直接使用
- [ ] 实现步骤清晰且可行
- [ ] 向后兼容性已明确说明
- [ ] 测试策略已详细规划
- [ ] 时间和资源估计已给出

---

## 💬 文档维护

这套文档应在以下情况下更新：
- Playwright API 有重大变更
- 架构设计有调整
- 新增实现步骤或发现
- 用户反馈或常见问题增加

---

## 📝 版本历史

- v1.0 (2025-07-11): 初始版本，包含 4 个设计文档和完整示例集

---

## 🔗 相关资源

- [Playwright 文档](https://playwright.dev)
- [Node.js 最佳实践](https://nodejs.org)
- [TypeScript 手册](https://www.typescriptlang.org)
- [NPM 包发布指南](https://docs.npmjs.com)

---

**最后更新**：2025-07-11  
**文档维护者**：架构和文档团队  
**状态**：✅ 完成，可用于实现
