#!/bin/bash
# E2E Regression Check Script
#
# 对比当前 E2E 测试结果与基准数据，检测潜在回归。
#
# 使用方式：
#   ./scripts/e2e-regression-check.sh
#
# 依赖：jq（JSON 处理工具）
#
# 基线文件：tests/e2e/baseline/results.json（首次全量通过后生成）
# 当前文件：__tests__/outputs/results.json（每次 E2E 测试自动生成）

set -euo pipefail

BASELINE="tests/e2e/baseline/results.json"
CURRENT="__tests__/outputs/results.json"

# 颜色输出
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

exit_code=0

echo "=========================================="
echo "  E2E Regression Check"
echo "=========================================="

# 检查基线文件是否存在
if [ ! -f "$BASELINE" ]; then
  echo "WARNING: 基线文件不存在: $BASELINE"
  echo "请先运行一次全量 E2E 测试（pnpm test:e2e），然后将 outputs/results.json 复制为 baseline/results.json"
  exit 0
fi

# 检查当前结果文件是否存在
if [ ! -f "$CURRENT" ]; then
  echo "ERROR: 当前结果文件不存在: $CURRENT"
  echo "请先运行 pnpm test:e2e"
  exit 2
fi

# 验证 JSON 文件有效性
if ! jq empty "$BASELINE" 2>/dev/null; then
  echo "ERROR: 基线文件不是有效的 JSON"
  exit 2
fi

if ! jq empty "$CURRENT" 2>/dev/null; then
  echo "ERROR: 当前结果文件不是有效的 JSON"
  exit 2
fi

# Signal tier ordinal ranking
# definitive(4) > strong(3) > moderate(2) > weak(1) > none(0)
tier_rank() {
  case "$1" in
    definitive) echo 4 ;;
    strong)     echo 3 ;;
    moderate)   echo 2 ;;
    weak)       echo 1 ;;
    none|*)     echo 0 ;;
  esac
}

# ============================================
# 检查 1: 所有框架抓取是否成功
# ============================================
echo ""
echo "--- 检查 1: 框架抓取成功率 ---"

CURRENT_FAILURES=$(jq '[.[] | select(.success != true)] | length' "$CURRENT")
BASELINE_FAILURES=$(jq '[.[] | select(.success != true)] | length' "$BASELINE")

if [ "$CURRENT_FAILURES" -gt 0 ]; then
  echo -e "${RED}FAIL: 当前有 $CURRENT_FAILURES 个框架抓取失败${NC}"
  jq -r '.[] | select(.success != true) | "  - \(.framework): \(.error)"' "$CURRENT"
  exit_code=1
else
  echo -e "${GREEN}PASS: 所有框架抓取成功${NC}"
fi

# ============================================
# 检查 2: 框架检测准确率是否下降
# ============================================
echo ""
echo "--- 检查 2: 框架检测准确率 ---"

CURRENT_MATCH_COUNT=$(jq '[.[] | select(.frameworkMatch.match == true)] | length' "$CURRENT")
BASELINE_MATCH_COUNT=$(jq '[.[] | select(.frameworkMatch.match == true)] | length' "$BASELINE")

if [ "$CURRENT_MATCH_COUNT" -lt "$BASELINE_MATCH_COUNT" ]; then
  echo -e "${RED}FAIL: 框架检测匹配数下降 ($BASELINE_MATCH_COUNT → $CURRENT_MATCH_COUNT)${NC}"
  jq -r '.[] | select(.frameworkMatch.match != true) | "  - \(.framework): detected=\(.frameworkMatch.detected), expected=\(.frameworkMatch.expected)"' "$CURRENT"
  exit_code=1
else
  echo -e "${GREEN}PASS: 框架检测准确率未下降${NC}"
fi

# ============================================
# 检查 3: 信号层级回归
# ============================================
echo ""
echo "--- 检查 3: 信号层级回归 ---"

for framework in vue3-spa react18-spa angular-spa sveltekit-ssr nextjs-ssr nuxt3-ssr; do
  CURRENT_TIER=$(jq -r ".[] | select(.framework == \"$framework\") | .frameworkMatch.tier // \"none\"" "$CURRENT")
  BASELINE_TIER=$(jq -r ".[] | select(.framework == \"$framework\") | .frameworkMatch.tier // \"none\"" "$BASELINE")

  if [ -z "$CURRENT_TIER" ] || [ "$CURRENT_TIER" = "null" ]; then
    echo -e "${RED}FAIL: $framework 无检测结果${NC}"
    exit_code=1
  else
    CURRENT_RANK=$(tier_rank "$CURRENT_TIER")
    BASELINE_RANK=$(tier_rank "$BASELINE_TIER")

    if [ "$CURRENT_RANK" -lt "$BASELINE_RANK" ]; then
      echo -e "${RED}FAIL: $framework 信号层级降级: $BASELINE_TIER → $CURRENT_TIER${NC}"
      exit_code=1
    elif [ "$CURRENT_RANK" -gt "$BASELINE_RANK" ]; then
      echo -e "${GREEN}PASS: $framework 信号层级提升: $BASELINE_TIER → $CURRENT_TIER${NC}"
    else
      echo -e "${GREEN}PASS: $framework 信号层级正常 ($CURRENT_TIER)${NC}"
    fi
  fi
done

# ============================================
# 检查 4: 资源下载数量
# ============================================
echo ""
echo "--- 检查 4: 资源下载数 ---"

for framework in vue3-spa react18-spa angular-spa sveltekit-ssr nextjs-ssr nuxt3-ssr; do
  CURRENT_FETCHED=$(jq ".[] | select(.framework == \"$framework\") | .stats.fetchedAssets // 0" "$CURRENT")
  BASELINE_FETCHED=$(jq ".[] | select(.framework == \"$framework\") | .stats.fetchedAssets // 0" "$BASELINE")

  if [ -z "$CURRENT_FETCHED" ] || [ "$CURRENT_FETCHED" = "null" ]; then
    echo -e "${RED}FAIL: $framework 无资源下载统计${NC}"
    exit_code=1
  elif [ "$CURRENT_FETCHED" -lt "$BASELINE_FETCHED" ]; then
    echo -e "${RED}FAIL: $framework 丢失资源: $BASELINE_FETCHED → $CURRENT_FETCHED${NC}"
    exit_code=1
  else
    echo -e "${GREEN}PASS: $framework 资源数正常 ($CURRENT_FETCHED)${NC}"
  fi
done

# ============================================
# 检查 5: 耗时是否显著增加
# ============================================
echo ""
echo "--- 检查 5: 耗时回归 ---"

for framework in vue3-spa react18-spa angular-spa sveltekit-ssr nextjs-ssr nuxt3-ssr; do
  CURRENT_DURATION=$(jq ".[] | select(.framework == \"$framework\") | .duration // 0" "$CURRENT")
  BASELINE_DURATION=$(jq ".[] | select(.framework == \"$framework\") | .duration // 0" "$BASELINE")

  if [ -z "$CURRENT_DURATION" ] || [ "$CURRENT_DURATION" = "null" ]; then
    echo -e "${YELLOW}WARN: $framework 无耗时数据${NC}"
  elif awk "BEGIN {exit !($CURRENT_DURATION > $BASELINE_DURATION * 2)}"; then
    echo -e "${YELLOW}WARN: $framework 耗时显著增加: ${BASELINE_DURATION}ms → ${CURRENT_DURATION}ms${NC}"
  else
    echo -e "${GREEN}PASS: $framework 耗时正常 (${CURRENT_DURATION}ms)${NC}"
  fi
done

# ============================================
# 结果汇总
# ============================================
echo ""
echo "=========================================="
if [ $exit_code -eq 0 ]; then
  echo -e "${GREEN}E2E 回归检查全部通过${NC}"
else
  echo -e "${RED}E2E 回归检查发现问题，请检查以上输出${NC}"
fi
echo "=========================================="

exit $exit_code
