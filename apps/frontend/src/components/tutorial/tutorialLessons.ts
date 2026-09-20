import type { WorkflowNode } from "@zahnerflow/types";
import { deviceLessons } from "./deviceLessons";
import { protonSopLessons } from "./protonSopLessons";
export interface TutorialCheck {
  selector?: string;
  absent?: boolean;
  text?: string;
  count?: number;
  nodeTypes?: string[];
  parameter?: [string, string, number];
  phase?: string;
  selected?: string;
  user?: string;
  chartPoints?: number;
  selectedId?: string;
  nodeParameter?: [string, string, number | string | boolean];
}
export interface TutorialStep {
  title: string;
  text: string;
  target: string;
  action?: "click" | "type" | "drag" | "context" | "hold";
  value?: string;
  destination?: string;
  check: TutorialCheck;
}
export interface TutorialLesson {
  id: string;
  group: string;
  title: string;
  summary: string;
  seed: "empty" | "ocp" | "sequence" | "loop";
  steps: TutorialStep[];
  initialNodes?: WorkflowNode[];
}
export const anchor = (name: string) => `[data-tutorial-anchor="${name}"]`;
export const library = (type: string) => `[data-tutorial-library="${type}"]`;
export const node = (type: string) => `[data-node-type="${type}"]`;
const ocp = "ocp_measurement";
const wait = "wait_delay";
const eis = "eis_potentiostatic";
const parameter = (key: string) => `[data-tutorial-parameter="${key}"]`;
const run: TutorialStep = {
  title: "点击运行",
  text: "运行前核对用户、项目、样品及参数。这里启动教学样例，观察真实运行按钮和节点状态的变化。",
  target: anchor("run"),
  action: "click",
  check: { phase: "running" },
};

export const tutorialLessons: TutorialLesson[] = [
  {
    id: "prepare",
    group: "开始之前",
    title: "准备实验信息",
    summary: "先观察缺少用户、项目和样品时的运行提示，再补齐信息。工作站与示例流程已预置。",
    seed: "ocp",
    steps: [
      {
        title: "缺少信息时尝试运行",
        text: "先不填写实验信息，点击运行，看看系统为什么没有开始。用户决定实验归属，项目和样品用于识别及保存实验数据。",
        target: anchor("run"), action: "click",
        check: { selector: ".toolbar-run-warning", text: "缺少用户、项目名称、样品名称", phase: "idle" },
      },
      {
        title: "看懂信息缺失提示",
        text: "提示出现时，运行按钮暂不可用，流程仍未启动。请先补齐实验归属和项目、样品信息，避免生成无法识别的实验记录。",
        target: ".toolbar__group--top-right", check: { selector: ".toolbar-run-warning", phase: "idle" },
      },
      {
        title: "打开用户列表",
        text: "点击顶栏的用户选择器；首次使用可通过旁边的新建用户按钮创建用户。",
        target: anchor("user"),
        action: "click",
        check: { selector: '[data-tutorial-user="教学用户"]' },
      },
      {
        title: "选择用户",
        text: "选择教学用户。实际使用时选择实验所属用户。",
        target: '[data-tutorial-user="教学用户"]',
        action: "click",
        check: { user: "教学用户" },
      },
      {
        title: "仅选择用户仍不够",
        text: "再次点击运行：用户已确定，但项目和样品仍为空，提示现在只列出这两项。",
        target: anchor("run"), action: "click",
        check: { selector: ".toolbar-run-warning", text: "缺少项目名称、样品名称", phase: "idle" },
      },
      {
        title: "打开用户配置",
        text: "点击齿轮，打开日常使用的用户配置窗口。",
        target: anchor("settings"),
        action: "click",
        check: { selector: ".settings__save-indicator" },
      },
      {
        title: "填写保存路径",
        text: "基础路径、项目名称和样品编号共同决定数据保存位置。",
        target: anchor("base-path"),
        action: "type",
        value: "C:\\data\\tutorial",
        check: { selector: anchor("base-path") },
      },
      {
        title: "填写项目名称",
        text: "输入 Tutorial。字段通过原有校验后自动保存。",
        target: '[placeholder="或输入新项目名"]',
        action: "type",
        value: "Tutorial",
        check: { selector: ".save-status.saved" },
      },
      {
        title: "填写样品编号",
        text: "输入 Sample02，核对下方完整路径与自动保存状态。",
        target: '[placeholder="输入样品编号"]',
        action: "type",
        value: "Sample02",
        check: { selector: ".save-status.saved" },
      },
      {
        title: "关闭配置",
        text: "保存完成后返回主界面。",
        target: ".settings .modal__close",
        action: "click",
        check: { selector: ".settings__save-indicator", absent: true },
      },
      {
        title: "信息齐全后开始",
        text: "用户、项目和样品已填写，点击运行不再出现信息缺失提示。工作站和 OCP 节点是本课预置条件，播放的是隔离教学记录。",
        target: anchor("run"), action: "click", check: { phase: "running" },
      },
    ],
  },
  {
    id: "add",
    group: "工作流编辑",
    title: "添加节点",
    summary: "点击或拖动左侧节点，将步骤加入画布。",
    seed: "empty",
    steps: [
      {
        title: "找到测量节点",
        text: "工作站选定后，在左侧找到开路电位测量。",
        target: library(ocp),
        check: { nodeTypes: [] },
      },
      {
        title: "点击添加",
        text: "点击后，画布末尾立即加入一个开路电位节点。",
        target: library(ocp),
        action: "click",
        check: { nodeTypes: [ocp] },
      },
      {
        title: "选中节点",
        text: "点击画布中的节点，右侧显示其属性。",
        target: node(ocp),
        action: "click",
        check: { selected: ocp },
      },
      {
        title: "拖入等待节点",
        text: "也可以从左侧节点库拖入画布，新节点加在末尾。",
        target: library(wait),
        action: "drag",
        destination: ".canvas__viewport",
        check: { nodeTypes: [ocp, wait] },
      },
    ],
  },
  {
    id: "reorder",
    group: "工作流编辑",
    title: "调整节点顺序",
    summary: "拖动节点，改变实验的执行顺序。",
    seed: "sequence",
    steps: [
      {
        title: "核对原始顺序",
        text: "当前顺序为开路电位、等待、恒电位 EIS。",
        target: node(eis),
        check: { nodeTypes: [ocp, wait, eis] },
      },
      {
        title: "拖动 EIS 节点",
        text: "按住 EIS，拖到等待节点的位置后松开。",
        target: node(eis),
        action: "drag",
        destination: node(wait),
        check: { nodeTypes: [ocp, eis, wait] },
      },
      {
        title: "核对新顺序",
        text: "节点序号及连线已更新；EIS 现在位于等待之前。",
        target: node(eis),
        action: "click",
        check: { nodeTypes: [ocp, eis, wait], selected: eis },
      },
    ],
  },
  {
    id: "parameters",
    group: "工作流编辑",
    title: "修改节点参数",
    summary: "通过右侧属性栏修改并确认参数。",
    seed: "ocp",
    steps: [
      {
        title: "选中节点",
        text: "点击开路电位节点，打开右侧属性栏。",
        target: node(ocp),
        action: "click",
        check: { selected: ocp },
      },
      {
        title: "打开参数页",
        text: "切换到参数页，查看测量时长等配置。",
        target: anchor("parameter-tab"),
        action: "click",
        check: { selector: parameter("measurementDuration") },
      },
      {
        title: "修改测量时长",
        text: "输入 30 秒，移开焦点提交修改。参数使用与实际编辑相同的校验。",
        target: parameter("measurementDuration"),
        action: "type",
        value: "30",
        check: { parameter: [ocp, "measurementDuration", 30] },
      },
      {
        title: "核对节点摘要",
        text: "画布上的参数摘要同步更新为 30 秒。",
        target: node(ocp),
        check: { selector: node(ocp), text: "30" },
      },
    ],
  },
  {
    id: "delete",
    group: "工作流编辑",
    title: "删除节点",
    summary: "右键打开确认框，确认后移除节点。",
    seed: "sequence",
    steps: [
      {
        title: "右键等待节点",
        text: "在待删除的节点上点击鼠标右键。",
        target: node(wait),
        action: "context",
        check: { selector: "#confirm-dialog-overlay .dialog__content" },
      },
      {
        title: "确认删除",
        text: "核对节点名称后点击删除。取消则保留原节点。",
        target: "#confirm-dialog-overlay .btn--danger",
        action: "click",
        check: { nodeTypes: [ocp, eis] },
      },
      {
        title: "检查画布",
        text: "等待节点已删除，序号和连线自动更新。",
        target: node(eis),
        check: { selector: node(wait), absent: true, nodeTypes: [ocp, eis] },
      },
    ],
  },
  {
    id: "loop",
    group: "流程与执行",
    title: "创建循环",
    summary: "添加成对的循环边界，并设置重复次数。",
    seed: "empty",
    steps: [
      {
        title: "添加循环开始",
        text: "先添加循环开始，随后放入需要重复的测量节点。",
        target: library("loop_start"),
        action: "click",
        check: { nodeTypes: ["loop_start"] },
      },
      {
        title: "添加循环体",
        text: "把开路电位测量加入循环体。",
        target: library(ocp),
        action: "click",
        check: { nodeTypes: ["loop_start", ocp] },
      },
      {
        title: "添加循环结束",
        text: "用循环结束封闭循环体；起止边界必须配对。",
        target: library("loop_end"),
        action: "click",
        check: { nodeTypes: ["loop_start", ocp, "loop_end"] },
      },
      {
        title: "选中循环开始",
        text: "次数由循环开始节点配置。",
        target: node("loop_start"),
        action: "click",
        check: { selected: "loop_start" },
      },
      {
        title: "打开循环参数",
        text: "在右侧切换到参数页。",
        target: anchor("parameter-tab"),
        action: "click",
        check: { selector: parameter("loopCount") },
      },
      {
        title: "设置重复次数",
        text: "填写 3 次并移开焦点。循环次数为 0 时跳过循环体。",
        target: parameter("loopCount"),
        action: "type",
        value: "3",
        check: { parameter: ["loop_start", "loopCount", 3] },
      },
    ],
  },
  {
    id: "preview",
    group: "流程与执行",
    title: "查看执行步骤",
    summary: "打开实际执行计划，核对循环与自动边界。",
    seed: "loop",
    steps: [
      {
        title: "打开展开预览",
        text: "点击右下角展开按钮，后端生成实际执行计划。",
        target: anchor("preview"),
        action: "click",
        check: { selector: ".unroll-row[data-step]", count: 5 },
      },
      {
        title: "检查循环展开",
        text: "循环体展开为 3 次测量，前后包含系统自动插入的启动与停止步骤。",
        target: ".unroll-dialog__sequence",
        check: { selector: ".unroll-row--system", count: 2 },
      },
      {
        title: "选择测量步骤",
        text: "点击第一条测量查看参数和执行序号。",
        target: '.unroll-row[data-step="1"]',
        action: "click",
        check: { selector: '.unroll-row[data-step="1"][aria-pressed="true"]' },
      },
      {
        title: "返回画布",
        text: "核对完成后关闭预览，画布结构保持不变。",
        target: '[aria-label="关闭展开步骤"]',
        action: "click",
        check: {
          selector: ".unroll-dialog",
          absent: true,
          nodeTypes: ["loop_start", ocp, "loop_end"],
        },
      },
    ],
  },
  {
    id: "run",
    group: "流程与执行",
    title: "开始运行",
    summary: "观察运行按钮、节点状态与实际进度组件。",
    seed: "ocp",
    steps: [
      run,
      {
        title: "观察运行状态",
        text: "流程启动后，运行按钮变为停止按钮，画布编辑锁定；下方显示当前步骤及预计时间。",
        target: anchor("progress"),
        check: { phase: "running", selector: ".toolbar-stop-button" },
      },
      {
        title: "等待执行结束",
        text: "收到完成状态后，按钮变为重置。本教学回放模拟器数据。",
        target: anchor("run"),
        check: { phase: "completed" },
      },
    ],
  },
  {
    id: "chart",
    group: "流程与执行",
    title: "查看测量曲线",
    summary: "在实际测量面板中选择节点并查看曲线。",
    seed: "ocp",
    steps: [
      run,
      {
        title: "打开测量面板",
        text: "点击底部中央进度区域，打开测量曲线。",
        target: anchor("progress"),
        action: "click",
        check: { selector: ".chart-modal" },
      },
      {
        title: "选择测量类型",
        text: "顶部按测量类型分类，下方标签对应节点。此例的 OCP 表示开路电位。",
        target: ".tab-primary-item",
        action: "click",
        check: {
          selector: ".chart-modal__tab-container .is-active",
          text: "OCP",
        },
      },
      {
        title: "查看曲线数据",
        text: "曲线由项目现有图表组件绘制，数据来自模拟器的测量事件。",
        target: ".chart-modal__content",
        check: { selector: ".chart-modal__content canvas", chartPoints: 8 },
      },
    ],
  },
  {
    id: "stop",
    group: "流程与执行",
    title: "长按停止与重置",
    summary: "长按停止，等待确认，再重置执行状态。",
    seed: "ocp",
    steps: [
      run,
      {
        title: "普通点击不会停止",
        text: "短按仅提示需要长按，流程仍在运行。",
        target: anchor("run"),
        action: "click",
        check: { phase: "running" },
      },
      {
        title: "长按 1 秒",
        text: "持续按住按钮，环形进度完成后才发出停止请求。",
        target: anchor("run"),
        action: "hold",
        check: { phase: "cancelling" },
      },
      {
        title: "等待停止确认",
        text: "等待当前步骤退出并收到停止确认，按钮随后变为重置。",
        target: anchor("run"),
        check: { phase: "cancelled" },
      },
      {
        title: "关闭停止提示",
        text: "收到停止结果后，通知中心会显示停止原因。核对后关闭通知。",
        target: '#notification-panel-overlay [title="关闭"]',
        action: "click",
        check: {
          selector: "#notification-panel-overlay .notification",
          absent: true,
        },
      },
      {
        title: "重置运行状态",
        text: "点击重置清理本次执行状态，画布节点保留。",
        target: anchor("run"),
        action: "click",
        check: { phase: "idle", nodeTypes: [ocp] },
      },
    ],
  },
  {
    id: "records",
    group: "实验记录",
    title: "查看与复用记录",
    summary: "查看已有实验报告，并将流程重新加载到画布。",
    seed: "empty",
    steps: [
      {
        title: "打开实验记录",
        text: "点击画布左上角的实验记录按钮。",
        target: anchor("records"),
        action: "click",
        check: { selector: ".report-history__wf-item" },
      },
      {
        title: "展开历史执行",
        text: "点击工作流旁的展开箭头，查看每次执行。",
        target: ".report-history__item-expand",
        action: "click",
        check: { selector: ".report-history__run-item" },
      },
      {
        title: "查看报告",
        text: "选择一次执行，查看状态、步骤结果和输出文件信息。",
        target: ".report-history__run-item",
        action: "click",
        check: { selector: '[data-tutorial-anchor="export-html"]' },
      },
      {
        title: "报告导出入口",
        text: "通过这里可导出 HTML 或 PDF。本片段仅展示入口；实际点击会下载报告文件。",
        target: anchor("export-html"),
        check: { selector: ".report__preview", text: "开路" },
      },
      {
        title: "返回工作流定义",
        text: "返回定义后，可核对和复用原流程。",
        target: anchor("report-definition"),
        action: "click",
        check: { selector: '[data-tutorial-anchor="load-workflow"]' },
      },
      {
        title: "加载到画布",
        text: "加载后在画布中继续编辑。实际使用时会替换当前画布，运行中不可加载。",
        target: anchor("load-workflow"),
        action: "click",
        check: { nodeTypes: [ocp] },
      },
    ],
  },
  ...deviceLessons,
  ...protonSopLessons,
];
