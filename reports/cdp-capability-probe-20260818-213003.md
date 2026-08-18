# 设备浏览器 CDP 能力验证报告

- 报告生成时间：2026/8/18 21:30:03（本地时间）
- playwright-core 版本：1.60.0（已打 playwright-ohos 补丁）
- 方法来源：lib/coreBundle.js 中全部 `.send("Domain.method")` 调用点；探测对象为 chromium 实现（cr* 源码段）使用的方法 101 个；firefox/webkit 路径专用 105 个与 WebDriver BiDi 家族命令 59 个与本场景无关，未探测
- 探测方式：空参数调用、5 秒超时；"参数校验通过"表示浏览器已解析方法名（方法存在，仅参数不足）；跳过的有状态/破坏性方法由官方用例覆盖（见 ③ 的第一轮证据）

## ① 支持情况概览

| 浏览器 | 支持 | 支持(参数校验) | 不支持 | 无响应 | 协议错误 | 跳过 |
|---|---|---|---|---|---|---|
| chrome（海泰浏览器） | 30 | 41 | 1 | 0 | 5 | 24 |
| huaweiBrowser（华为浏览器） | 30 | 41 | 1 | 0 | 5 | 24 |

## ② 分域明细

图例：✓ 直接支持；△ 支持（参数校验通过，playwright 调用时会携带完整参数）；✗ 不支持；— 无响应；? 协议错误（多为前置条件未满足，方法存在）；跳过 = 有状态/破坏性方法。

### Browser

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Browser.cancelDownload | crBrowser.ts, ffBrowser.ts | △ | △ |
| Browser.getVersion | crBrowser.ts | ✓ | ✓ |
| Browser.getWindowBounds | crPage.ts | △ | △ |
| Browser.getWindowForTarget | crPage.ts | ? | ? |
| Browser.grantPermissions | crBrowser.ts, ffBrowser.ts | △ | △ |
| Browser.resetPermissions | crBrowser.ts, ffBrowser.ts | ✓ | ✓ |
| Browser.setDockTile | crPage.ts, launchApp.ts | ✓ | ✓ |
| Browser.setDownloadBehavior | crBrowser.ts | △ | △ |
| Browser.setWindowBounds | crPage.ts | △ | △ |

### CSS

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| CSS.disable | crCoverage.ts | ✓ | ✓ |
| CSS.enable | crCoverage.ts | ? | ? |
| CSS.startRuleUsageTracking | crCoverage.ts | ✓ | ✓ |
| CSS.stopRuleUsageTracking | crCoverage.ts | ✓ | ✓ |

### DOM

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| DOM.describeNode | crPage.ts, wkPage.ts | △ | △ |
| DOM.disable | crCoverage.ts | ? | ? |
| DOM.enable | crCoverage.ts | ✓ | ✓ |
| DOM.getFrameOwner | crPage.ts | △ | △ |
| DOM.scrollIntoViewIfNeeded | crPage.ts, wkPage.ts | △ | △ |
| DOM.setFileInputFiles | crPage.ts | △ | △ |

### Debugger

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Debugger.disable | crCoverage.ts | ✓ | ✓ |
| Debugger.enable | crCoverage.ts | ✓ | ✓ |
| Debugger.resume | crCoverage.ts | ? | ? |
| Debugger.setSkipAllPauses | crCoverage.ts | △ | △ |

### Emulation

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Emulation.setDefaultBackgroundColorOverride | crPage.ts | ✓ | ✓ |
| Emulation.setDeviceMetricsOverride | crPage.ts, wkPage.ts | △ | △ |
| Emulation.setEmulatedMedia | crPage.ts | ✓ | ✓ |
| Emulation.setFocusEmulationEnabled | crPage.ts | △ | △ |
| Emulation.setGeolocationOverride | crPage.ts | ✓ | ✓ |
| Emulation.setLocaleOverride | crPage.ts | ✓ | ✓ |
| Emulation.setScriptExecutionDisabled | crPage.ts | △ | △ |
| Emulation.setTimezoneOverride | crPage.ts | △ | △ |
| Emulation.setTouchEmulationEnabled | crPage.ts | △ | △ |
| Emulation.setUserAgentOverride | crPage.ts | △ | △ |

### Fetch

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Fetch.continueRequest | crNetworkManager.ts | △ | △ |
| Fetch.disable | crNetworkManager.ts | ✓ | ✓ |
| Fetch.enable | crNetworkManager.ts | ✓ | ✓ |
| Fetch.failRequest | crNetworkManager.ts | △ | △ |
| Fetch.fulfillRequest | crNetworkManager.ts | △ | △ |

### HeapProfiler

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| HeapProfiler.collectGarbage | crPage.ts | ✗ | ✗ |

### IO

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| IO.close | crNetworkManager.ts, crProtocolHelper.ts | △ | △ |
| IO.read | crNetworkManager.ts, crProtocolHelper.ts | △ | △ |

### Input

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Input.dispatchDragEvent | crDragDrop.ts | △ | △ |
| Input.dispatchKeyEvent | crInput.ts, wkInput.ts | △ | △ |
| Input.dispatchMouseEvent | crInput.ts, wkInput.ts | △ | △ |
| Input.dispatchTouchEvent | crInput.ts | △ | △ |
| Input.insertText | crInput.ts | △ | △ |
| Input.setInterceptDrags | crDragDrop.ts | 跳过 | 跳过 |

### Log

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Log.enable | crPage.ts | ✓ | ✓ |

### Network

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Network.clearBrowserCache | crNetworkManager.ts | 跳过 | 跳过 |
| Network.emulateNetworkConditions | crNetworkManager.ts | 跳过 | 跳过 |
| Network.enable | crNetworkManager.ts, wkPage.ts | ✓ | ✓ |
| Network.getResponseBody | crNetworkManager.ts, ffNetworkManager.ts, wkInterceptableRequest.ts | △ | △ |
| Network.loadNetworkResource | crNetworkManager.ts | 跳过 | 跳过 |
| Network.setCacheDisabled | crNetworkManager.ts | 跳过 | 跳过 |
| Network.setExtraHTTPHeaders | crNetworkManager.ts, ffPage.ts, wkPage.ts | △ | △ |

### Page

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Page.addScriptToEvaluateOnNewDocument | crDevTools.ts, crPage.ts | △ | △ |
| Page.bringToFront | crPage.ts, ffPage.ts | ✓ | ✓ |
| Page.captureScreenshot | crPage.ts | ✓ | ✓ |
| Page.close | crPage.ts, ffPage.ts | 跳过 | 跳过 |
| Page.enable | crDevTools.ts, crPage.ts, wkPage.ts | ✓ | ✓ |
| Page.getFrameTree | crPage.ts | ✓ | ✓ |
| Page.getLayoutMetrics | crPage.ts | ✓ | ✓ |
| Page.getNavigationHistory | crPage.ts | ✓ | ✓ |
| Page.handleJavaScriptDialog | crPage.ts | △ | △ |
| Page.navigate | crBrowser.ts, crPage.ts, ffPage.ts | 跳过 | 跳过 |
| Page.navigateToHistoryEntry | crPage.ts | 跳过 | 跳过 |
| Page.printToPDF | crPdf.ts | 跳过 | 跳过 |
| Page.reload | crPage.ts, ffPage.ts, wkPage.ts | 跳过 | 跳过 |
| Page.removeScriptToEvaluateOnNewDocument | crPage.ts | △ | △ |
| Page.setBypassCSP | crPage.ts, wkPage.ts | △ | △ |
| Page.setFontFamilies | crPage.ts | △ | △ |
| Page.setInterceptFileChooserDialog | crPage.ts, ffPage.ts, wkPage.ts | 跳过 | 跳过 |
| Page.setLifecycleEventsEnabled | crPage.ts | △ | △ |
| Page.startScreencast | crPage.ts | 跳过 | 跳过 |

### Profiler

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Profiler.disable | crCoverage.ts | ✓ | ✓ |
| Profiler.enable | crCoverage.ts | ✓ | ✓ |
| Profiler.startPreciseCoverage | crCoverage.ts | ✓ | ✓ |
| Profiler.stopPreciseCoverage | crCoverage.ts | ✓ | ✓ |
| Profiler.takePreciseCoverage | crCoverage.ts | ? | ? |

### Runtime

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Runtime.addBinding | crDevTools.ts, crPage.ts, wkPage.ts | △ | △ |
| Runtime.callFunctionOn | crExecutionContext.ts, wkExecutionContext.ts | △ | △ |
| Runtime.enable | crDevTools.ts, crPage.ts, crServiceWorker.ts, electron.ts, wkPage.ts, wkWorkers.ts | ✓ | ✓ |
| Runtime.evaluate | crDevTools.ts, crExecutionContext.ts, electron.ts, ffExecutionContext.ts, wkExecutionContext.ts | △ | △ |
| Runtime.getProperties | crExecutionContext.ts, wkExecutionContext.ts | △ | △ |
| Runtime.releaseObject | crProtocolHelper.ts, wkExecutionContext.ts | △ | △ |
| Runtime.runIfWaitingForDebugger | crDevTools.ts, crPage.ts, crServiceWorker.ts | 跳过 | 跳过 |

### Security

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Security.setIgnoreCertificateErrors | crPage.ts | △ | △ |

### Storage

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Storage.clearCookies | crBrowser.ts | 跳过 | 跳过 |
| Storage.clearDataForOrigin | crBrowser.ts | 跳过 | 跳过 |
| Storage.getCookies | crBrowser.ts | ✓ | ✓ |
| Storage.setCookies | crBrowser.ts | △ | △ |

### Target

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Target.attachToBrowserTarget | crConnection.ts | 跳过 | 跳过 |
| Target.closeTarget | crBrowser.ts | 跳过 | 跳过 |
| Target.createBrowserContext | crBrowser.ts | 跳过 | 跳过 |
| Target.createTarget | crBrowser.ts | 跳过 | 跳过 |
| Target.detachFromTarget | crConnection.ts | 跳过 | 跳过 |
| Target.disposeBrowserContext | crBrowser.ts | 跳过 | 跳过 |
| Target.getTargetInfo | crBrowser.ts | ✓ | ✓ |
| Target.setAutoAttach | crBrowser.ts, crPage.ts | 跳过 | 跳过 |

### Tracing

| 方法 | playwright 使用位置 | chrome（海泰浏览器） | huaweiBrowser（华为浏览器） |
|---|---|---|---|
| Tracing.end | crBrowser.ts | 跳过 | 跳过 |
| Tracing.start | crBrowser.ts | 跳过 | 跳过 |

## ③ 对 playwright 能力的影响（不支持/差异方法按功能分组）

### JS/CSS 覆盖率（js-coverage）

- 影响：第一轮证据：海泰 js-coverage 用例存在失败。

- `CSS.enable` — chrome（海泰浏览器）: ? 协议错误：cdpSession.send: Protocol error (CSS.enable): DOM agent needs to be enabled first.；huaweiBrowser（华为浏览器）: ? 协议错误：cdpSession.send: Protocol error (CSS.enable): DOM agent needs to be enabled first.
- `Debugger.resume` — chrome（海泰浏览器）: ? 协议错误：cdpSession.send: Protocol error (Debugger.resume): Can only perform operation while paused.；huaweiBrowser（华为浏览器）: ? 协议错误：cdpSession.send: Protocol error (Debugger.resume): Can only perform operation while paused.
- `DOM.disable` — chrome（海泰浏览器）: ? 协议错误：cdpSession.send: Protocol error (DOM.disable): DOM agent hasn't been enabled；huaweiBrowser（华为浏览器）: ? 协议错误：cdpSession.send: Protocol error (DOM.disable): DOM agent hasn't been enabled
- `Profiler.takePreciseCoverage` — chrome（海泰浏览器）: ? 协议错误：cdpSession.send: Protocol error (Profiler.takePreciseCoverage): Precise coverage has not been started.；huaweiBrowser（华为浏览器）: ? 协议错误：cdpSession.send: Protocol error (Profiler.takePreciseCoverage): Precise coverage has not been started.

### 页面、导航与框架（page-goto/page-wait-for-*/frames 等官方用例）

- 影响：第一轮证据：导航时序超时（goBack/goForward、popup opener）、华为对非法 URL 的 Page.navigate 返回协议错误（8 例）、执行上下文提前销毁（4 例）。

- `Browser.getWindowForTarget` — chrome（海泰浏览器）: ? 协议错误：cdpSession.send: Protocol error (Browser.getWindowForTarget): No web contents in the target；huaweiBrowser（华为浏览器）: ? 协议错误：cdpSession.send: Protocol error (Browser.getWindowForTarget): No web contents in the target
- `HeapProfiler.collectGarbage` — chrome（海泰浏览器）: ✗ 不支持：cdpSession.send: Protocol error (HeapProfiler.collectGarbage): 'HeapProfiler.collectGarbage' wasn't found；huaweiBrowser（华为浏览器）: ✗ 不支持：cdpSession.send: Protocol error (HeapProfiler.collectGarbage): 'HeapProfiler.collectGarbage' wasn't found

## ④ 说明

- "支持（参数校验通过）"：浏览器解析了方法名并返回参数错误，说明方法在协议层存在；playwright 调用时携带完整参数，行为需由官方用例验证。
- 跳过的方法清单与原因见 scripts/cdp-config.json；其对应功能由官方用例 + 第一轮测试结果交叉验证（见 ③）。
- 探针会话为一次性会话，探测结束后浏览器被正常关闭（含 HDC 转发清理）。
