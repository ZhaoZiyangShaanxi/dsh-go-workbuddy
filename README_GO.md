# DSH Go 适配版

本包基于 [dingminhua/dsh-connect-workbuddy](https://github.com/dingminhua/dsh-connect-workbuddy) 5.20.32（MIT）加入 DSH Go 原生界面。原有 WorkBuddy 模型 provider、流式对话、账号库和网页设置页仍由上游实现提供。项目源码遵循仓库中的 MIT 许可证，原作者版权声明保留。

## 手机端功能

- 「全部功能 / 聊天页插件 / 插件详情」提供国内版与国际版原生面板。
- 在面板发起 WorkBuddy OAuth，显示本地生成的授权二维码；用另一台设备扫码时，手机无需离开 DSH Go。面板自动轮询并保存授权结果。
- 同一台手机完成授权时，可点「打开授权页」。配套的 DSH Go 应用补丁会在确认后用 Android Custom Tabs 于应用内打开 WorkBuddy 登录页；登录成功返回面板后，插件会自动保存授权结果。未安装应用补丁的 DSH Go 仍会调用外部浏览器。
- 国内版授权页可选「手机号」并用短信验证码登录。手机上的「微信登录」可能只打开 WorkBuddy 小程序，未必完成网页 OAuth；此时回到授权页改用手机号入口。
- 积分余额约每 60 秒刷新；国内版与国际版均尝试显示最近 7 天、最多 50 条请求消耗记录。国际版账单接口尚未用真实账号验证，失败时会明确报错。
- 在 DSH 模型选择器中直接选择上游动态发现的 DeepSeek、Kimi、GLM、混元、MiniMax 等可用模型；实际目录由账号和 WorkBuddy 服务端决定。面板显示当前已注册模型数，首次授权成功后自动刷新目录；「刷新」按钮也会更新目录、余额和明细。

## 安装

要求 DSH Go 的本机引擎及 DSH `>=0.2.1-rc.2 <0.3.0-0`。目前请从 [GitHub Releases](https://github.com/ZhaoZiyangShaanxi/dsh-go-workbuddy/releases) 下载 `dsh-go-workbuddy-0.1.1.tgz` 并放入手机的 Download 目录，然后在 DSH Go 的本机终端执行：

```sh
dsh plugin --profile web add /sdcard/Download/dsh-go-workbuddy-0.1.1.tgz
```

若手机终端无法读取 `/sdcard/Download`，请在 DSH Go 设置中开启访问手机文件，或把包复制进本机 Linux 环境并用该路径安装。npm 发布和市场收录完成后，也可使用 `dsh plugin --profile web add dsh-go-workbuddy@0.1.1`。已安装 `dsh-connect-workbuddy` 时，请先卸载它，再安装本包；两者注册相同的 WorkBuddy provider，不应同时启用。重新启动本机引擎后打开插件详情中的 WorkBuddy 面板。

源码构建：`pnpm install --frozen-lockfile && pnpm run check && pnpm pack`。

### 同机应用内授权

[`patches/DSH-Go-应用内授权.patch`](patches/DSH-Go-应用内授权.patch) 是针对 [DSH Go 源码](https://github.com/ccch1mneyyy/dsh-Go) `d15858a` 的应用补丁。应用构建者在对应源码目录执行 `git apply --check <补丁路径>`、`git apply <补丁路径>`，再依照 DSH Go 的构建文档生成并安装 APK。补丁仅把此插件发出的、带 OAuth `state` 的 WorkBuddy HTTPS 登录页交给应用内浏览器；其他链接仍走原有确认与外部浏览器流程。

当前交付不含已构建 APK。已安装的官方 DSH Go 无法仅靠更换 `.tgz` 改变链接打开方式；若不改装 App，可用另一设备扫码，使手机始终停留在 DSH Go 面板。应用补丁尚未通过 Flutter 测试或 Android 真机登录验证，安装前需由构建者完成这两项验证。

## 数据与限制

凭据留在 DSH 引擎的 WorkBuddy vault；面板不向第三方二维码服务发送 OAuth state。账单响应可能含请求正文，本适配版只保留请求 ID、时间、模型和积分，面板只显示时间、模型和积分。余额与账单属于非公开接口，WorkBuddy 调整接口后可能需要更新。

已在 Android 真机与 DSH Go 1.0.13 / DSH 0.2.2-rc.1 验证国内版：手机号网页 OAuth 自动回传，余额与消耗明细可读取，模型出现在 DSH Go 选择器，对话成功且账单显示对应扣费。国际版尚无真实账号测试。应用内浏览器补丁仅通过静态检查；因未取得官方 App 的签名密钥及本机 Flutter 构建环境，补丁尚未构建 APK 或在真机验证，当前官方 APK 的同机授权仍会打开外部浏览器。

参考：[上游插件](https://github.com/dingminhua/dsh-connect-workbuddy)、[DSH Go 原生插件文档](https://github.com/ccch1mneyyy/dsh-Go/tree/main/docs/plugins)、[WorkBuddy 套餐与用量](https://www.codebuddy.cn/docs/workbuddy/Usage)。
