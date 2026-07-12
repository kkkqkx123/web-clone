# Playwright适配改进 - 计划文档索引

## 📋 文档导航

### 1. **快速参考** 🚀 [从这里开始]
**文件**: `QUICK_REFERENCE.md`

适合快速了解计划全貌的开发者。包含：
- 三个阶段的执行概览
- 核心代码文件清单
- CLI选项速览
- 快速启动检查清单

**适用场景**: 项目经理、新开发者、快速审查

---

### 2. **详细计划** 📖 [实现时参考]
**文件**: `PHASED_IMPROVEMENT_PLAN.md`

包含所有实现细节的完整计划。每个阶段包括：
- 详细的代码示例
- 完整的测试策略
- 风险分析与回滚方案
- 分步实现指南

**适用场景**: 实际开发、代码审查、问题排查

---

### 3. **设计分析** 🔍 [背景理解]
**文件**: `../ANALYSIS_PLAYWRIGHT_DESIGN.md`

基于参考设计的深度分析。包含：
- 当前设计的优缺点评估
- 与参考设计的对比分析
- 关键设计决策的理性性评估
- 改进优先级排序

**适用场景**: 架构审查、设计讨论、决策支持

---

## 🎯 阶段概览

### Phase 0: CLI Playwright集成 (P0🔴)
| 指标 | 数值 |
|------|------|
| 优先级 | 🔴 最高 |
| 工作量 | 2.5小时 |
| 关键路径 | 是 |
| 依赖 | 无 |
| 收益 | 用户可通过CLI使用Playwright快照 |

**快速开始**: 见 QUICK_REFERENCE.md Phase 0 部分

**详细指南**: 见 PHASED_IMPROVEMENT_PLAN.md 0.0-0.8 节

---

### Phase 1: ResourceFilter重构 (P1🟠)
| 指标 | 数值 |
|------|------|
| 优先级 | 🟠 中等 |
| 工作量 | 1.5小时 |
| 关键路径 | 否 |
| 依赖 | 可与P2并行 |
| 收益 | 提升代码可维护性 |

**快速开始**: 见 QUICK_REFERENCE.md Phase 1 部分

**详细指南**: 见 PHASED_IMPROVEMENT_PLAN.md 1.0-1.6 节

---

### Phase 2: State保存/恢复 (P2🟡)
| 指标 | 数值 |
|------|------|
| 优先级 | 🟡 低等 |
| 工作量 | 1.5小时 |
| 关键路径 | 否 |
| 依赖 | 可与P1并行 |
| 收益 | 避免重复登录，提升用户体验 |

**快速开始**: 见 QUICK_REFERENCE.md Phase 2 部分

**详细指南**: 见 PHASED_IMPROVEMENT_PLAN.md 2.0-2.7 节

---

## 📊 执行计划

```
Timeline:
┌─────────────────────────────────────────────────────┐
│ Day 1: Phase 0                    (2.5小时)         │
│ ├─ 扩展类型定义 (5min)                              │
│ ├─ 新建cli-helper.ts (20min)                        │
│ ├─ 修改cli.ts (15min)                               │
│ ├─ 单元测试 (20min)                                 │
│ ├─ 集成测试 (15min)                                 │
│ ├─ 回归测试 (10min)                                 │
│ └─ 文档编写 (10min)                                 │
└─────────────────────────────────────────────────────┘
         ↓
┌──────────────────────┬──────────────────────┐
│ Day 2: Phase 1       │ Day 2: Phase 2       │
│ (可并行, 1.5小时)   │ (可并行, 1.5小时)    │
├──────────────────────┼──────────────────────┤
│ ResourceFilter       │ State管理             │
│ ├─ 新建类 (30min)   │ ├─ 扩展adapter (20min) │
│ ├─ 测试 (20min)     │ ├─ CLI集成 (10min)     │
│ ├─ 集成 (15min)     │ ├─ 测试 (20min)        │
│ └─ 验证 (15min)     │ └─ 文档 (10min)        │
└──────────────────────┴──────────────────────┘

总计: 4-5小时开发时间
```

---

## ✅ 验收标准检查清单

### Phase 0 完成
- [ ] CLI选项 `--use-playwright` 正常工作
- [ ] 登录脚本通过 `--auth-script` 可以加载和执行
- [ ] 需要登录的网站可以正确快照
- [ ] 代码覆盖率 ≥80%
- [ ] 现有HTTP快照功能无退化
- [ ] 文档示例可以直接运行
- [ ] 帮助文本清晰准确

### Phase 1 完成
- [ ] ResourceFilter类创建成功
- [ ] 过滤器正确应用到资源获取
- [ ] 日志显示过滤统计
- [ ] 单元测试覆盖率 ≥85%
- [ ] 代码可维护性提升可见

### Phase 2 完成
- [ ] saveState() 正确保存状态到文件
- [ ] loadState() 正确加载状态并恢复
- [ ] CLI选项 `--save-state` 和 `--load-state` 可用
- [ ] 状态文件格式符合JSON Schema
- [ ] 单元测试覆盖率 ≥80%
- [ ] 安全最佳实践文档完整

---

## 🔧 快速命令参考

### 启动开发环境
```bash
# 安装依赖
npm install

# 运行现有测试（确保基础功能正常）
npm test

# 构建项目
npm run build
```

### Phase 0 验证
```bash
# 测试基础Playwright快照
npm run dev -- https://example.com --use-playwright

# 测试带登录脚本
npm run dev -- https://app.example.com \
  --use-playwright \
  --auth-script ./examples/auth.js
```

### Phase 1 验证
```bash
# 运行ResourceFilter测试
npm test -- resource-filter

# 验证过滤输出
npm run dev -- https://example.com --verbose
```

### Phase 2 验证
```bash
# 保存状态
npm run dev -- https://app.example.com \
  --use-playwright \
  --auth-script ./auth.js \
  --save-state ./state.json

# 加载状态
npm run dev -- https://app.example.com \
  --use-playwright \
  --load-state ./state.json
```

---

## 📁 涉及的文件清单

### 新建文件
```
src/config/cli-helper.ts
src/core/resource-filter.ts
src/core/__tests__/resource-filter.test.ts
docs/PLAYWRIGHT_CLI.md
```

### 修改文件
```
src/cli.ts
src/types.ts
src/assembler.ts
src/adapters/playwright-fetcher-adapter.ts
src/config/cli-adapter.ts
src/adapters/__tests__/playwright-fetcher-adapter.test.ts
```

### 不修改的现有功能
```
src/parser/*
src/output/*
src/transform/*
src/fetcher.ts (仅在assembler层面集成过滤)
src/validators.ts (保留现有验证)
```

---

## 🚨 常见问题速查

### Q: Phase 0会影响现有的HTTP快照吗？
**A**: 否。HTTP快照继续使用现有的 `snapshot()` API，Playwright只有在 `--use-playwright` 等选项时才会启用。

### Q: Phase 1会改变现有的过滤行为吗？
**A**: ResourceFilter只是重构，默认行为与现有完全一致。新增的是过滤统计输出。

### Q: Phase 2中状态文件会泄露敏感信息吗？
**A**: 会包含cookies和tokens。文档中明确要求用户：
- `chmod 600 state.json` 限制权限
- 添加 `*.state.json` 到 `.gitignore`

### Q: 三个阶段必须按顺序做吗？
**A**: P0必须首先完成（库API基础）。P1和P2可以并行进行，互不依赖。

### Q: 如果某个阶段出现问题怎么办？
**A**: 每个阶段都有回滚方案。见详细计划中的"风险与回滚"部分。

---

## 📞 进度跟踪

使用此模板跟踪三个阶段的进展：

```markdown
## Phase 0: CLI Playwright集成
- [ ] 完成 0.1 - 类型定义
- [ ] 完成 0.2 - CLI选项
- [ ] 完成 0.3 - CLI helper
- [ ] 完成 0.4 - 类型适配
- [ ] 完成 0.5 - 测试
- [ ] 完成 0.6 - 文档
- [ ] 通过 0.7 - 验收

## Phase 1: ResourceFilter重构
- [ ] 完成 1.1 - ResourceFilter类
- [ ] 完成 1.2 - 集成assembler
- [ ] 完成 1.3 - 类型扩展
- [ ] 完成 1.4 - 测试
- [ ] 通过 1.5 - 验收

## Phase 2: State保存/恢复
- [ ] 完成 2.1 - Adapter扩展
- [ ] 完成 2.2 - CLI helper更新
- [ ] 完成 2.3 - CLI集成
- [ ] 完成 2.4 - 测试
- [ ] 通过 2.5 - 验收
```

---

## 📚 相关文档

- **当前项目文档**: 见 README.md 和 docs/
- **参考设计**: 用户提供的Fixture + WebCloner示例
- **分析报告**: ANALYSIS_PLAYWRIGHT_DESIGN.md

---

**文档更新**: 2024年  
**版本**: 1.0  
**状态**: 📋 计划阶段
