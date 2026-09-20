import type { TutorialLesson, TutorialStep } from "./tutorialLessons";

const furnace = ".workspace-device-modal--furnace";
const mfc = ".workspace-device-modal--mfc";
const card = '[data-tutorial-mfc-address="32"]';
const connection = (modal: string, name: string): TutorialStep[] => [
  { title: `打开${name}`, text: `点击顶栏${name}，打开日常使用的设备窗口。本课使用项目模拟器采集的状态，所有教学操作均不会连接真实设备。`, target: `[data-tutorial-anchor="${name === "管式炉" ? "furnace" : "mfc"}"]`, action: "click", check: { selector: `${modal} .device-connection` } },
  { title: "刷新端口列表", text: "点击刷新，列出当前可选串口。未获取端口时，端口选择与连接按钮不可用。", target: `${modal} .device-connection__actions .btn--secondary`, action: "click", check: { selector: `${modal} .device-connection__port-trigger:not(:disabled)` } },
  { title: "选择串口", text: "连接前核对设备串口；这里列出 COM_SIMULATOR 教学端口，真实实验选择设备实际占用的 COM 端口。", target: `${modal} .device-connection__port-trigger`, action: "click", check: { selector: '[data-tutorial-port="COM_SIMULATOR"]' } },
  { title: "确认端口", text: "从现有端口列表选择端口。若列表为空，使用刷新并检查连接。", target: '[data-tutorial-port="COM_SIMULATOR"]', action: "click", check: { selector: `${modal} .device-connection__port-trigger`, text: "COM_SIMULATOR" } },
  { title: "连接设备", text: name === "管式炉" ? "点击连接，核对连接状态及温度读数。连接成功本身不会启动炉子程序。" : "点击连接后，系统自动扫描 32–80 地址；扫描完成后核对通道地址、气体与量程。", target: `${modal} .device-connection__actions .btn--primary`, action: "click", check: { selector: name === "管式炉" ? `${modal} .device-connection.is-connected` : `${card} .mfc__input:not(:disabled)` } },
];

export const deviceLessons: TutorialLesson[] = [
  {
    id: "furnace-control", group: "设备连接与控制", title: "连接与控制管式炉",
    summary: "选择端口并连接，读取程序段，辨认 PV/SV，演示运行、保温、继续、停止与断开。", seed: "empty",
    steps: [
      ...connection(furnace, "管式炉"),
      { title: "辨认温度与输出", text: "PV 是当前实测温度，SV 是设定温度，MV 是输出百分比。这里是模拟器室温读数，不代表已经到达 SOP 所需温度。", target: `${furnace} .device-dashboard__furnace-layout`, check: { selector: `${furnace} .device-dashboard__pv-value`, text: "25.0" } },
      { title: "核对炉子程序", text: "运行前打开程序段页，读取炉内已有程序；连接设备不等于已经写入正确的升温方案。", target: `${furnace} .tabs__trigger:nth-child(2)`, action: "click", check: { selector: `${furnace} .tabs__panel.is-active .segments__editor` } },
      { title: "读取程序段", text: "读取按钮获取炉内程序。此处为模拟器默认程序，仅教授控制过程；真实实验必须先核对温度、时间及 SOP。", target: `${furnace} .presets-tab .control-bar .btn--primary`, action: "click", check: { selector: `${furnace} .furnace-segments-combo__pane:first-child .segment__input[value="25"]` } },
      { title: "返回实时监控", text: "回到监控页使用炉子控制按钮。", target: `${furnace} .tabs__trigger:first-child`, action: "click", check: { selector: `${furnace} .control-panel .btn--success:not(:disabled)` } },
      { title: "运行程序", text: "点击运行启动当前炉子程序；状态变为 RUNNING，保温按钮可用。", target: `${furnace} .control-panel .btn--success`, action: "click", check: { selector: `${furnace} .device-dashboard__status-badge`, text: "RUNNING" } },
      { title: "保温暂停", text: "点击保温，状态变为 PAUSED。它暂停程序推进，与停止整个程序不同。", target: `${furnace} .control-panel .btn--warning`, action: "click", check: { selector: `${furnace} .device-dashboard__status-badge`, text: "PAUSED" } },
      { title: "继续运行", text: "再次点击运行，恢复当前炉子程序，状态回到 RUNNING。", target: `${furnace} .control-panel .btn--success`, action: "click", check: { selector: `${furnace} .device-dashboard__status-badge`, text: "RUNNING" } },
      { title: "停止程序", text: "点击停止并核对 STOPPED。停止程序不表示炉体已经冷却，实际温度仍以 PV 为准。", target: `${furnace} .control-panel .btn--danger`, action: "click", check: { selector: `${furnace} .device-dashboard__status-badge`, text: "STOPPED" } },
      { title: "断开连接", text: "已停止后断开通信。真实实验中断开通信不能代替停止程序。", target: `${furnace} .device-connection .btn--danger`, action: "click", check: { selector: `${furnace} .device-connection:not(.is-connected)` } },
      { title: "返回工作区", text: "关闭管式炉窗口。升温节点编排见 SOP 升温课程。", target: `${furnace} .modal__close`, action: "click", check: { selector: furnace, absent: true } },
    ],
  },
  {
    id: "mfc-control", group: "设备连接与控制", title: "连接与控制流量计",
    summary: "连接并自动扫描 MFC，核对气体及量程，设置 N₂ 流量、观察反馈、归零后断开。", seed: "empty",
    steps: [
      ...connection(mfc, "流量计"),
      { title: "核对地址、气体和量程", text: "32 号通道为教学 N₂，量程 200 sccm。真实实验先核对通道和气路，不能只按卡片位置认设备。", target: `${card} .mfc__card-head`, check: { selector: `${card} .mfc__max`, text: "200" } },
      { title: "填写目标流量", text: "输入 50 sccm。输入数值尚未下发；本课数字只用于操作演示，不替代 SOP 的气体配比。", target: `${card} .mfc__input`, action: "type", value: "50", check: { selector: `${card} .mfc__flow--set`, text: "0.0" } },
      { title: "设置流量", text: "点击设置后，核对设定值变为 50.0。设定值与实际反馈是两项数据，不能只看输入框。", target: `${card} .mfc__input-row button`, action: "click", check: { selector: `${card} .mfc__flow--set`, text: "50.0" } },
      { title: "观察反馈", text: "卡片分别显示实际和设定流量，右侧汇总总流量。这里回放模拟器反馈；真实气路应等待读数稳定并核对供气。", target: `${card} .mfc__values`, check: { selector: `${card} .mfc__flow--set`, text: "50.0" } },
      { title: "准备归零", text: "输入 0，准备结束本次教学供气。真实实验按 SOP 的气氛切换与停机顺序执行。", target: `${card} .mfc__input`, action: "type", value: "0", check: { selector: `${card} .mfc__flow--set`, text: "50.0" } },
      { title: "下发零流量", text: "点击设置并确认设定值归零。设备卡片返回空闲通道区域。", target: `${card} .mfc__input-row button`, action: "click", check: { selector: `${card} .mfc__flow--set`, text: "0.0" } },
      { title: "断开流量计", text: "归零后断开通信。断开按钮本身不是零流量命令。", target: `${mfc} .mfc-modal__header-actions .btn--danger`, action: "click", check: { selector: `${mfc} .device-connection` } },
      { title: "返回工作区", text: "连接与手动控制完成；流程中需要改变气体流量时再配置对应节点。", target: `${mfc} .modal__close`, action: "click", check: { selector: mfc, absent: true } },
    ],
  },
];
