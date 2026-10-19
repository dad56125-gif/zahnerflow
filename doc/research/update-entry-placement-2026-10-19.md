# 检查更新入口位置评估

状态：研究结论，功能尚未实现。归属：桌面端与前端维护者。复核日期：2026-10-19。

## 范围与已确认事实

本轮只评估检查更新控件的放置位置，不实现检测、下载或安装。

- `apps/frontend/src/components/TopBar.tsx`：左侧为用户与教程入口，右侧为设备操作；原版本按钮没有文字，是连续点击进入开发者模式的隐藏入口。
- `apps/frontend/src/components/user/UserSettingsModal.tsx`：现有页签为文件路径、通知设置、个人偏好，属于用户配置。
- `apps/frontend/src/components/BottomBar.tsx`：左侧运行状态，中间实验进度，右侧节点数、循环数、时钟。
- `apps/frontend/src/generated/appVersion.ts`：已有生成的应用版本常量，版本定义仍为根 `VERSION`。
- `apps/desktop/src/preload.cts`、`apps/frontend/src/desktopBridge.ts` 和 `apps/desktop/package.json`：现有桥接没有更新能力，打包配置没有显式更新发布源。检测更新尚需接入，不能把入口设计当作功能已完成。

## 入口方案，用户已同意，尚未实现

首选底部状态栏右侧、时钟之前的可点击版本号，提示文字为“版本与更新”。点击打开沿用共享浮层的小窗口，展示当前版本、“检查更新”按钮及检测结果；发现新版本时再显示新版本号、更新说明和下载入口。

版本号入口在未选择用户时也应可用。窄窗口下优先让位于实验进度，时钟与统计的实际收缩策略需界面验证。不要复用隐藏开发者按钮作为更新触发器，以免干扰连续点击行为。

顶部教程旁的独立更新图标可作备选，但需要新增常驻按钮；用户配置页与应用更新的归属不一致，因此不作为首选。

## 验证边界与后续决策

本轮结论来自组件、样式、桌面桥接和打包配置的静态检查，未执行界面交互或联网更新验证。发布源、检测协议、下载方式以及是否支持自动安装均未确定；本轮不引入自动下载、安装或重启行为。

仅新增研究文档与导航，不改变应用行为，版本保持不变；实现用户可见更新功能时再判断 MINOR 升级。

## GitHub 查询与国内访问讨论

用户已确定查询 GitHub，入口位置已同意；国内网络方案仍在讨论，未部署。Git 远端为 `dad56125-gif/zahnerflow`，本次未核实其公开性或 Release 状态。

GitHub 的公开 Release 查询无需登录；匿名 REST API 按来源 IP 限额，通常每小时 60 次。因此免登录不能解决网络不可达，查询成功也不能证明安装包可下载。

建议按实际使用范围选择：少量且有可用代理的电脑可直连查询并使用其已有代理；面向国内普通用户分发时，可由受控服务查询并缓存 GitHub 的版本信息，客户端访问国内可达的 HTTPS 地址。安装包需要另行同步到可达存储，仅转发版本信息不能解决下载问题。后者是待选方案，不是当前已部署能力。私有仓库若需凭据，应留在服务端，不能打包公共使用的访问令牌到客户端。

第三方公共 GitHub 加速站不作为默认可信更新源。若采用镜像，需保证同一发布版本、明确同步时间，并验证安装包完整性。具体服务与网络可达性尚未实测。

依据：[GitHub Releases REST API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)、[REST API 限额](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)、[electron-builder 更新源支持](https://www.electron.build/docs/publish/)。

## 国内平台比较（2026-10-19）

用户说明仅实验室内部使用，没有服务器或对象存储。针对更新发布用途，当前建议优先试用 GitCode，未确认替换 GitHub 发布源。其[最新 Release 接口](https://docs.gitcode.com/docs/apis/get-api-v-5-repos-owner-repo-releases-latest/)返回版本、说明和附件地址，[发行版说明](https://docs.gitcode.com/docs/help/home/org_project/project_manage/release_management/release_overview/)明确支持安装包附件。当前电脑未携带令牌或登录 Cookie 调用公开示例 `TFR-Studios/DeltaForceAnimation_app` 的最新 Release 接口，返回 HTTP 200、v1.0.2 和安装包链接；未下载附件，不宣称安装包免登录下载或实验室全部网络可达已验证。

Gitee 同样支持 Release 与附件，[官方发布插件说明](https://blog.gitee.com/2026/01/23/gitee-go-release-plugin-auto-deploy-artifact/)提供了自动发布流程；本轮未完成其匿名查询及附件下载实测，不能据此判断不支持。两家的实际附件配额均未核实，代码仓库单文件限额不能当作 Release 附件限额。

建议保持开发仓库不动，选定平台后用独立公开发布仓库存放版本说明与安装包，并验证实际包大小、匿名查询和下载。公开发布意味着其他人也可能下载；若需要限制为实验室成员，需另行确定认证方式。功能尚未实施，应用版本不变。

## GitHub DNS 与连接实测（2026-10-19）

本轮只读检查，无系统 DNS、hosts、代理配置变更。系统代理和 HTTP/HTTPS/ALL_PROXY 指向 `127.0.0.1:7890`，WinHTTP 为直连；hosts 未发现 GitHub 相关条目。网卡 DNS 为 `202.204.65.5`、`202.204.67.6`。

绕过应用 HTTP 代理（`curl --noproxy '*'`）时，系统解析 `api.github.com` 为 `20.205.243.168`，项目最新 Release 查询在本轮时间限制内超时；GitHub 首页收到 HTTP 200 头但正文未完成，不能记为完整成功。显式走本地代理时，首页和项目 Release API 均完成 HTTP 200，API 约 1.55 秒，未携带 GitHub 登录凭据。

经现有代理查询 Google DNS over HTTPS 获得 API 地址 `172.182.252.137`；用 `curl --resolve` 仅为本次请求指定该地址，同时绕过应用代理并保留域名及证书校验，两次均成功返回项目最新版本 `release/v2.13.1`，首次约 0.83 秒。这证明当前网络选择另一解析地址可改善 API 查询，但不证明原 DNS 被污染，也不排除网络级透明代理或隧道影响。Google DNS 查询本身借助了已有代理，不代表离线或无代理机器可独立取得同一地址。

对首页临时指定另一解析地址 `172.182.252.133` 仍超时；公开 DNS `223.5.5.5`、`119.29.29.29` 的直接 DNS 查询也超时，不能据此建议直接更改全局 DNS。经代理已成功下载本项目安装包的 94 字节 SHA256 附件，未完整下载约 169.6 MB 安装包，不宣称大文件下载完成或无代理下载可用。

结论：暂不因国内访问问题迁移发布平台，GitHub 仍可作为候选首选。可考虑应用范围的 DNS/地址选择策略，但尚未设计或实现；禁止将本次地址作为永久固定 IP。GitHub 官方说明 IP 会变化，见[地址说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-githubs-ip-addresses)。最终需分别验收版本查询、发布页和安装包下载。本轮仅研究文档，版本不变。
