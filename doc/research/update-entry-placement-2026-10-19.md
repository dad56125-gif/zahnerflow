# 检查更新入口位置评估

实施结果（2026-10-19，已完成）：桌面底部版本号提供手动检查更新、下载安装包、进度、取消/续传及 SHA256 校验，完成后仅打开所在文件夹；不改系统网络设置，不自动安装或重启。主进程唯一维护状态，经既有 preload bridge 暴露；新增独立桌面共享类型，不增加 Python 路由或数据库字段。应用由 2.13.1 MINOR 升至 2.14.0。当前设计以 `.memory/design.md` 的 [桌面-手动更新] 为准，下文保留前期调研过程，不再作为未实施状态的判断。

本轮验证范围（2026-10-19，已完成）：用户决定继续使用 GitHub，先前的 GitCode 优先试用建议已被取代；已验证无应用代理的地址发现、安装包完整下载和应用内技术路径。不修改系统网络设置，不运行安装包。临时脚本、下载和证据放已忽略目录 `.codex-run/`；网络验证不代表更新功能已经接入产品。

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

## 国内平台比较（2026-10-19，历史讨论，选型已被 GitHub 决定取代）

用户说明仅实验室内部使用，没有服务器或对象存储。针对更新发布用途，当前建议优先试用 GitCode，未确认替换 GitHub 发布源。其[最新 Release 接口](https://docs.gitcode.com/docs/apis/get-api-v-5-repos-owner-repo-releases-latest/)返回版本、说明和附件地址，[发行版说明](https://docs.gitcode.com/docs/help/home/org_project/project_manage/release_management/release_overview/)明确支持安装包附件。当前电脑未携带令牌或登录 Cookie 调用公开示例 `TFR-Studios/DeltaForceAnimation_app` 的最新 Release 接口，返回 HTTP 200、v1.0.2 和安装包链接；未下载附件，不宣称安装包免登录下载或实验室全部网络可达已验证。

Gitee 同样支持 Release 与附件，[官方发布插件说明](https://blog.gitee.com/2026/01/23/gitee-go-release-plugin-auto-deploy-artifact/)提供了自动发布流程；本轮未完成其匿名查询及附件下载实测，不能据此判断不支持。两家的实际附件配额均未核实，代码仓库单文件限额不能当作 Release 附件限额。

建议保持开发仓库不动，选定平台后用独立公开发布仓库存放版本说明与安装包，并验证实际包大小、匿名查询和下载。公开发布意味着其他人也可能下载；若需要限制为实验室成员，需另行确定认证方式。功能尚未实施，应用版本不变。

## GitHub DNS 与连接实测（2026-10-19）

本轮只读检查，无系统 DNS、hosts、代理配置变更。系统代理和 HTTP/HTTPS/ALL_PROXY 指向 `127.0.0.1:7890`，WinHTTP 为直连；hosts 未发现 GitHub 相关条目。网卡 DNS 为 `202.204.65.5`、`202.204.67.6`。

绕过应用 HTTP 代理（`curl --noproxy '*'`）时，系统解析 `api.github.com` 为 `20.205.243.168`，项目最新 Release 查询在本轮时间限制内超时；GitHub 首页收到 HTTP 200 头但正文未完成，不能记为完整成功。显式走本地代理时，首页和项目 Release API 均完成 HTTP 200，API 约 1.55 秒，未携带 GitHub 登录凭据。

经现有代理查询 Google DNS over HTTPS 获得 API 地址 `172.182.252.137`；用 `curl --resolve` 仅为本次请求指定该地址，同时绕过应用代理并保留域名及证书校验，两次均成功返回项目最新版本 `release/v2.13.1`，首次约 0.83 秒。这证明当前网络选择另一解析地址可改善 API 查询，但不证明原 DNS 被污染，也不排除网络级透明代理或隧道影响。Google DNS 查询本身借助了已有代理，不代表离线或无代理机器可独立取得同一地址。

对首页临时指定另一解析地址 `172.182.252.133` 仍超时；公开 DNS `223.5.5.5`、`119.29.29.29` 的直接 DNS 查询也超时，不能据此建议直接更改全局 DNS。经代理已成功下载本项目安装包的 94 字节 SHA256 附件，未完整下载约 169.6 MB 安装包，不宣称大文件下载完成或无代理下载可用。

结论：暂不因国内访问问题迁移发布平台，GitHub 仍可作为候选首选。可考虑应用范围的 DNS/地址选择策略，但尚未设计或实现；禁止将本次地址作为永久固定 IP。GitHub 官方说明 IP 会变化，见[地址说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-githubs-ip-addresses)。最终需分别验收版本查询、发布页和安装包下载。本轮仅研究文档，版本不变。

## 无应用代理的获取地址与下载验证（2026-10-19）

状态：地址发现、API 查询、官方附件重定向、原生 Node/Electron HTTPS 小文件下载及整包下载校验已验证。证据目录为本地忽略目录 `.codex-run/github-direct-probe/`，不随 Git 提交或安装包分发。

### 地址发现与下载链

- 所有 curl 探测显式使用 `--noproxy '*'`，子进程环境移除代理变量；不发送 GitHub 令牌或登录 Cookie。网卡检查仅见 WLAN 活跃，默认 IPv4 路由经 WLAN，未发现 TUN 默认路由；不据此声称排除了网关层透明转发。
- 直接访问腾讯 `https://doh.pub/dns-query` 和阿里 `https://dns.alidns.com/resolve` 的 JSON 查询成功，三域名查询各约 81–298 毫秒。Google / Cloudflare DoH 本次超时，不能作为当前环境的必需依赖。
- 当前 API 候选地址 `140.82.114.6` 与 `20.205.243.168` 均查询成功，分别约 1.15 秒和 0.75 秒。上一轮超时的地址本轮恢复，证明网络会波动，不能将一次超时定性为地址永久不可用或 DNS 污染。
- 调用 Release asset API，设置 `Accept: application/octet-stream`，成功获得 HTTP 302 指向 `release-assets.githubusercontent.com`。这是 GitHub 官方支持的二进制获取方式，无需先加载 GitHub 页面；客户端同时需处理直接返回二进制 HTTP 200 的情况。依据：[GitHub Release assets API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)。
- 官方下载节点返回 HTTP 206、Content-Range、ETag；首轮四个地址的 1 MiB 小样本有快有慢，部分超时。不能仅凭一次探测永久选择某个 IP。
- 原生 Node HTTPS（显式独立 Agent、请求级 lookup，保留域名及默认 TLS 验证）完成 DoH → Release → asset API → 官方 CDN 的校验文件下载，响应记录远端公网地址且 `authorized=true`。它证明桌面主进程可用的技术路径，不等于已接入应用界面或完成 Electron 打包验收。

原生运行时复核：同一脚本在项目安装的 Electron 38.8.6（Node 22.22.0）以 `ELECTRON_RUN_AS_NODE=1` 运行，再次通过全链；DNS、API、重定向与校验附件请求分别约 68、653、116、618 毫秒（中间另一次 DNS 为 8 毫秒），证书验证均通过。仅对该子进程设置运行模式并清除代理环境，不启动业务界面或设备后端。

### 拟采用的软件内策略，尚未接入

保持系统网络设置不动，更新模块独立管理 HTTPS DNS、候选地址和按 TTL 的缓存；失败时刷新或尝试其他候选，保留原域名、SNI 与证书验证。候选地址只来自本次解析，不内置本次测试 IP。

先从官方 API 取得版本、资产 ID、大小与摘要，再实时获取官方附件重定向。签名链接会过期，不能持久化为固定下载地址。下载限制并发数，验证 HTTP 206、精确 Content-Range、ETag 和总大小；续传必须绑定同一资产，服务端返回 200 或资源变化不能直接追加。下载完成进行完整 SHA256 比对，再向用户提供安装操作。整个过程可放 Electron 主进程，经既有 preload bridge 提供有限接口，不依赖改系统 hosts，也不需要第三方中转服务器。

本轮测试的 8 路并发仅用于验证；正式产品应按速度与失败率限定并发和重试，不能从此测试宣传固定加速倍数。浏览器开发模式与桌面模式实现边界另行确定。本轮不安装或运行下载的可执行文件。

### 整包结果与独立验收

已完成 `ZAHNERFLOW.Setup.2.13.1.exe`（资产 ID `644193696`）的无应用代理下载，大小 **169,619,949 字节**（约 169.6 MB / 161.8 MiB）。下载文件保存在证据目录 `ZAHNERFLOW.Setup.2.13.1.direct-verified.exe`，没有运行。

完整 SHA256 为 `dc6a45930d2ab7f3e1659ab01eca9c1879c171c1d07f022ab6b21106513186be`，与本次直连获取的 GitHub API 资产摘要及独立下载的 `.sha256` 附件一致。Node 合并阶段校验后，再用 PowerShell `Get-FileHash` 独立读取成品，大小与摘要均一致。

测试经历初始 4 路下载、超时、停止测试进程后保留分片、8 路续传及合并校验，证明本次资源可续传。8 路恢复阶段耗时 212.703 秒，复用了前序已下载分片，因此不能称为全包从零下载耗时，也未做无竞争的单路/并发对照，不报告加速倍数。分片保留只在 HTTP 206、Content-Range 与 ETag 匹配时执行；最终整包摘要是内容完整性的验收依据。

主要本地证据：`dns.json`、`discovery-evidence.json`、`download-probes.json`、`native-https-evidence.json`、`full-download-evidence.json`、`independent-verification.json`。原始响应头与临时签名链接只保存在忽略目录，不能进入发布配置。

结论：当前电脑网络已完成不借助应用代理、不改系统设置的完整下载链；采用国内 HTTPS DNS + 官方 API 资产链接 + 官方 CDN 候选地址 + 有界并发与续传具备落地依据。可达性和速度仍受网络与时间影响；应用界面、取消/重试状态机、下载持久化恢复、安装交互及打包集成尚未实施。本轮仅研究记录，应用版本 `2.13.1 → 2.13.1`，无需升级。

## 实施验收（2026-10-19）

- 13 项隔离回归通过：版本比较、发布资产约束、分段下载、中断/取消续传、签名链接刷新、摘要/缓存损坏拒绝导出、错误与状态一致性、官方 URL 限制。
- 真实组件交互通过：手动检查、更新说明纯文本、旧快照丢弃、关闭重开保留下载、取消/继续、定位文件、深浅色与 1180 像素窗口、浏览器模式限制。
- Electron 38.8.6 的生产 preload、IPC、UpdateManager 与真实组件联动通过；隔离夹具下载完成，非主窗口更新调用被拒绝，安装/重启调用为零。未启动设备后端。
- 生产 DirectUpdateTransport 与下载器在无应用代理路径查询真实 GitHub，并用此前已校验分片作为续传起点，补齐三个缺失分片及一个部分分片；最终文件 169619949 字节，SHA256 为 `dc6a45930d2ab7f3e1659ab01eca9c1879c171c1d07f022ab6b21106513186be`，与 GitHub 相同，另经 PowerShell 独立复核。该次为续传验收，不能表述为新实现重新从零下载整包。
- 共享类型、前端生产构建、桌面构建、类型检查、样式规则及版本一致性检查通过。临时验证源码与证据保留于忽略目录 `.codex-run/update-tests/`，不纳入仓库。
- 未运行安装包、未修改系统 DNS/hosts/代理，未发布 2.14.0 安装包；当前公网版本仍为 2.13.1，本地 2.14.0 不会误报降级更新。可达性结论限当前网络。
