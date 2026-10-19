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
