# E2E 回归基准

此目录存放 E2E 测试的基线数据文件。

## 文件说明

| 文件 | 用途 | 生成方式 |
|------|------|---------|
| `results.json` | 全量 E2E 快照结果的基准数据 | `cp tests/e2e/outputs/results.json tests/e2e/baseline/results.json` |

## 更新时机

- **首次生成**：首次全量 E2E 测试全部通过后
- **必要时更新**：框架 fixture 重大更新或管线行为预期改变时（需人工确认无回归）

## 回归对比

```bash
# 运行 E2E 测试
pnpm test:e2e

# 执行回归检查
./scripts/e2e-regression-check.sh
```
