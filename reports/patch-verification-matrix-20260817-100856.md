# 补丁必要性验证报告

- 报告生成时间：2026/8/17 10:08:56（本地时间）
- 验证方式：每个补丁运行其对应的官方用例 grep（见 scripts/patch-verify-config.json），两浏览器各跑一遍；每用例重启浏览器。
- 环境：PW_OHOS_SKIP_PATCHES=（空，即全部补丁已应用）

## 验证矩阵

| 补丁 | 功能 | 浏览器 | 通过 | 失败 | 跳过 | 结论 |
|---|---|---|---|---|---|---|
| patch-4-wheel | ArkWeb 滚轮补充滚动 | chrome | 0 | 3 | 0 |  |
| patch-4-wheel | ArkWeb 滚轮补充滚动 | huaweiBrowser | 0 | 3 | 0 |  |

## 说明与 A/B 用法

- 表格中的"结论"列为补丁说明（含第一轮证据与疑点），结合通过与失败数判断：
  - 有补丁时通过、无补丁时失败 → 补丁必要；
  - 有补丁与无补丁结果相同且都失败 → 补丁无效或功能另有瓶颈（如 patch-4）；
  - 有补丁与无补丁结果相同且都通过 → 补丁冗余，可移除（如 patch-0 两个占位补丁）。
- A/B 流程（以 patch-4-wheel 为例）：
  ```
  PW_OHOS_SKIP_PATCHES=patch-4-wheel pnpm rebuild   # 重装恢复原始文件后跳过该补丁
  node scripts/verify-patches.mjs patch-4-wheel     # 无补丁基准
  pnpm rebuild                                      # 恢复全部补丁
  node scripts/verify-patches.mjs patch-4-wheel     # 有补丁基准
  ```
- 跳过补丁仅在 playwright-core 为原始文件时生效（pnpm rebuild 会重装并重新打补丁）。
- 单条验证数据位于 test-progress/verify/<补丁id>-<浏览器>/（results/ 与 failures/）。
