# 补丁必要性验证报告

- 报告生成时间：2026/8/17 10:45:35（本地时间）
- 验证方式：每个补丁运行其对应的官方用例 grep（见 scripts/patch-verify-config.json），两浏览器各跑一遍；每用例重启浏览器。
- 环境：PW_OHOS_SKIP_PATCHES=（空，即全部补丁已应用）

## 验证矩阵

| 补丁 | 功能 | 浏览器 | 通过 | 失败 | 跳过 | 结论 |
|---|---|---|---|---|---|---|
| patch-1-launch | 启动机制：chromium.launch 委托 HDC 启动 | chrome | 1 | 1 | 0 | 不应用时 playwright 会尝试本地启动 chromium 可执行文件并失败。 |
| patch-1-launch | 启动机制：chromium.launch 委托 HDC 启动 | huaweiBrowser | 1 | 1 | 0 | 不应用时 playwright 会尝试本地启动 chromium 可执行文件并失败。 |
| patch-1b-persistent | launchPersistentContext 有意拦截 | chrome | 0 | 1 | 0 | 不应用时 persistent 上下文走本地浏览器路径，同样失败但报错不同。 |
| patch-1b-persistent | launchPersistentContext 有意拦截 | huaweiBrowser | 0 | 1 | 0 | 不应用时 persistent 上下文走本地浏览器路径，同样失败但报错不同。 |
| patch-1c-connect-flags | HDC 标志经 CRBrowser.connect 透传 | chrome | 1 | 0 | 0 | 不应用时 ArkWeb/默认上下文标志丢失，华为用例大面积失败。 |
| patch-1c-connect-flags | HDC 标志经 CRBrowser.connect 透传 | huaweiBrowser | 1 | 0 | 0 | 不应用时 ArkWeb/默认上下文标志丢失，华为用例大面积失败。 |
| patch-1e-no-default-context | Chromium 系浏览器跳过默认上下文 | chrome | 4 | 1 | 0 | 海泰浏览器：不应用时 browser.newContext 基于默认上下文，多上下文用例冲突。 |
| patch-1e-no-default-context | Chromium 系浏览器跳过默认上下文 | huaweiBrowser | 0 | 5 | 0 | 海泰浏览器：不应用时 browser.newContext 基于默认上下文，多上下文用例冲突。 |
| patch-1f-validate-guard | 跳过默认上下文后的校验保护 | chrome | 0 | 1 | 0 | 与 patch-1e 配套；单独移除会在无默认上下文时报错。 |
| patch-1f-validate-guard | 跳过默认上下文后的校验保护 | huaweiBrowser | 0 | 1 | 0 | 与 patch-1e 配套；单独移除会在无默认上下文时报错。 |
| patch-init-script | 注入 init script（navigator.webdriver 与 Touch 坐标取整） | chrome | 3 | 0 | 0 | 不应用时验证 webdriver 断言与触摸坐标断言是否仍通过（判断其必要性）。 |
| patch-init-script | 注入 init script（navigator.webdriver 与 Touch 坐标取整） | huaweiBrowser | 1 | 2 | 0 | 不应用时验证 webdriver 断言与触摸坐标断言是否仍通过（判断其必要性）。 |
| patch-8-bounding-box | boundingBox 亚像素取整 | chrome | 85 | 5 | 2 | 华为：不应用时对比 elementhandle-bounding-box 结果。 |
| patch-8-bounding-box | boundingBox 亚像素取整 | huaweiBrowser | 80 | 10 | 2 | 华为：不应用时对比 elementhandle-bounding-box 结果。 |
| patch-2-other-targets | ArkWeb 目标类型 other 识别 | chrome | 3 | 1 | 0 | 华为：不应用时弹窗/新页面无法附加。 |
| patch-2-other-targets | ArkWeb 目标类型 other 识别 | huaweiBrowser | 1 | 3 | 0 | 华为：不应用时弹窗/新页面无法附加。 |
| patch-2a-context-assert | 目标附加的上下文断言保护 | chrome | 3 | 0 | 0 | 与 patch-2 配套。 |
| patch-2a-context-assert | 目标附加的上下文断言保护 | huaweiBrowser | 1 | 2 | 0 | 与 patch-2 配套。 |
| patch-3-screenshot | ArkWeb 截图主路径 | chrome | 2 | 0 | 0 | 华为：配合 patch-3b；不应用时观察 CDP 截图原生行为。 |
| patch-3-screenshot | ArkWeb 截图主路径 | huaweiBrowser | 1 | 1 | 0 | 华为：配合 patch-3b；不应用时观察 CDP 截图原生行为。 |
| patch-3b-screenshot-fallback | HDC 截图回退（snapshot_display） | chrome | 2 | 0 | 0 | 华为：不应用时截图用例应出现大量失败（证明回退必要性）。 |
| patch-3b-screenshot-fallback | HDC 截图回退（snapshot_display） | huaweiBrowser | 1 | 1 | 0 | 华为：不应用时截图用例应出现大量失败（证明回退必要性）。 |
| patch-4-wheel | ArkWeb 滚轮补充滚动 | chrome | 0 | 3 | 0 | 第一轮华为 wheel 7/7 超时——该补丁疑似无效，A/B 验证是否可移除。 |
| patch-4-wheel | ArkWeb 滚轮补充滚动 | huaweiBrowser | 0 | 3 | 0 | 第一轮华为 wheel 7/7 超时——该补丁疑似无效，A/B 验证是否可移除。 |
| patch-5-reuse-context | ArkWeb 复用默认上下文 | chrome | 0 | 1 | 0 | 华为：不应用时 newContext 语义完全失效。 |
| patch-5-reuse-context | ArkWeb 复用默认上下文 | huaweiBrowser | 0 | 1 | 0 | 华为：不应用时 newContext 语义完全失效。 |
| patch-6-reuse-page | ArkWeb 复用页面 | chrome | 1 | 0 | 0 | 华为：不应用时 newPage 失败。 |
| patch-6-reuse-page | ArkWeb 复用页面 | huaweiBrowser | 0 | 1 | 0 | 华为：不应用时 newPage 失败。 |
| patch-6b-close-page | ArkWeb 页面软关闭 | chrome | 5 | 0 | 0 | 华为：不应用时关闭页面破坏会话。 |
| patch-6b-close-page | ArkWeb 页面软关闭 | huaweiBrowser | 2 | 3 | 0 | 华为：不应用时关闭页面破坏会话。 |
| patch-7-context-close | ArkWeb 上下文关闭清理 | chrome | 5 | 0 | 0 | 华为：不应用时关闭上下文后会话状态泄漏。 |
| patch-7-context-close | ArkWeb 上下文关闭清理 | huaweiBrowser | 2 | 3 | 0 | 华为：不应用时关闭上下文后会话状态泄漏。 |
| patch-7b-close-notify | 关闭事件重发 | chrome | 3 | 2 | 0 | 华为：不应用时二次导航断连（历史问题）。 |
| patch-7b-close-notify | 关闭事件重发 | huaweiBrowser | 1 | 4 | 0 | 华为：不应用时二次导航断连（历史问题）。 |
| patch-9b-storage-page | 存储状态页面保活 | chrome | 2 | 1 | 0 | 华为：不应用时 storageState 会关闭被复用页面。 |
| patch-9b-storage-page | 存储状态页面保活 | huaweiBrowser | 1 | 2 | 0 | 华为：不应用时 storageState 会关闭被复用页面。 |
| patch-9c-newpage-guard | newPage 失败保护 | chrome | - | - | - | 无结果文件（grep 无匹配或运行失败） |
| patch-9c-newpage-guard | newPage 失败保护 | huaweiBrowser | - | - | - | 无结果文件（grep 无匹配或运行失败） |
| patch-0-cache-dir | openharmony 平台缓存目录占位 | chrome | 1 | 0 | 0 | 疑似冗余：不下载浏览器二进制。A/B 验证启动是否受影响。 |
| patch-0-cache-dir | openharmony 平台缓存目录占位 | huaweiBrowser | 1 | 0 | 0 | 疑似冗余：不下载浏览器二进制。A/B 验证启动是否受影响。 |
| patch-0-daemon-dir | openharmony 守护进程目录占位 | chrome | 1 | 0 | 0 | 疑似冗余：同 patch-0-cache-dir。 |
| patch-0-daemon-dir | openharmony 守护进程目录占位 | huaweiBrowser | 1 | 0 | 0 | 疑似冗余：同 patch-0-cache-dir。 |

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
