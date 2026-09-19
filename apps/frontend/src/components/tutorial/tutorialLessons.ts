export type TutorialScene =
  "workflow" | "setup" | "preview" | "chart" | "records";
export type TutorialAction = "point" | "click" | "drag" | "type" | "hold";
export interface TutorialFrame {
  title: string;
  text: string;
  target: string;
  action?: TutorialAction;
  scene?: TutorialScene;
  nodes?: string[];
  selected?: string;
  value?: string;
  status?: string;
  duration?: number;
}
export interface TutorialLesson {
  id: string;
  group: string;
  title: string;
  summary: string;
  frames: TutorialFrame[];
}

// 教学样例只描述画面，不包含真实设备命令或运行时数据。
export const tutorialLessons: TutorialLesson[] = [
  {
    id: "prepare",
    group: "开始之前",
    title: "准备实验信息",
    summary: "先确认用户、保存位置和工作站，再开始编排。",
    frames: [
      {
        title: "选择用户",
        text: "在顶栏选择用户；首次使用可点击旁边的新建用户按钮。",
        target: "user",
        scene: "setup",
        action: "click",
      },
      {
        title: "设置保存信息",
        text: "打开用户配置，填写基础路径、项目名称和样品编号，检查路径预览与自动保存状态。",
        target: "settings",
        scene: "setup",
        action: "type",
      },
      {
        title: "选择工作站",
        text: "选择 ZAHNER ZENNIUM 后可使用节点库。选择型号不代表真机连接已成功。",
        target: "station",
        scene: "setup",
        action: "click",
      },
    ],
  },
  {
    id: "add",
    group: "工作流编辑",
    title: "添加节点",
    summary: "从左侧节点库开始搭建你的流程。",
    frames: [
      {
        title: "找到测量节点",
        text: "选择工作站后，左侧显示可用节点。这里以开路电位测量为例。",
        target: "library",
        nodes: [],
      },
      {
        title: "点击添加",
        text: "点击节点，将它添加到画布末尾；也可以从节点库拖入画布。",
        target: "library",
        action: "click",
        nodes: [],
      },
      {
        title: "节点已加入",
        text: "画布中的节点按顺序执行。选中节点后，可以在右侧修改参数。",
        target: "ocp",
        nodes: ["ocp"],
        selected: "ocp",
      },
    ],
  },
  {
    id: "reorder",
    group: "工作流编辑",
    title: "调整节点顺序",
    summary: "拖动节点，改变实验的执行顺序。",
    frames: [
      {
        title: "找到要移动的节点",
        text: "当前顺序为开路电位、等待、恒电位 EIS。准备把 EIS 移到等待之前。",
        target: "eis",
      },
      {
        title: "按住并拖动",
        text: "按住 EIS 节点，拖向等待节点所在的位置。",
        target: "wait",
        action: "drag",
        selected: "eis",
      },
      {
        title: "释放并检查顺序",
        text: "释放鼠标后，顺序变为开路电位、EIS、等待。运行前再次核对。",
        target: "eis",
        nodes: ["ocp", "eis", "wait"],
      },
    ],
  },
  {
    id: "parameters",
    group: "工作流编辑",
    title: "修改节点参数",
    summary: "选中节点，在右侧属性栏编辑。",
    frames: [
      {
        title: "选中节点",
        text: "点击画布中的开路电位节点，右侧显示它的参数。",
        target: "ocp",
        action: "click",
        selected: "ocp",
        value: "10",
      },
      {
        title: "打开参数页",
        text: "在右侧属性栏点击参数页签，查看可编辑的测量参数。",
        target: "parameter-tab",
        action: "click",
        selected: "ocp",
        value: "10",
      },
      {
        title: "修改测量时间",
        text: "在测量时间输入框中修改数值。演示将 10 秒改为 30 秒。",
        target: "parameter",
        action: "type",
        selected: "ocp",
        value: "30",
      },
      {
        title: "检查数值和单位",
        text: "输入数值后点击输入框外，使修改应用到当前节点，无需另点保存。运行期间不能修改参数。",
        target: "parameter",
        selected: "ocp",
        value: "30",
      },
    ],
  },
  {
    id: "delete",
    group: "工作流编辑",
    title: "删除节点",
    summary: "右键目标节点，确认后删除。",
    frames: [
      {
        title: "右键节点",
        text: "在需要删除的等待节点上点击鼠标右键。",
        target: "wait",
        action: "click",
      },
      {
        title: "确认删除",
        text: "软件会弹出确认框。确认前检查目标；取消则保留节点。",
        target: "confirm",
        status: "confirm",
      },
      {
        title: "检查剩余流程",
        text: "确认后删除等待节点。若删除循环边界，还需要检查循环是否完整配对。",
        target: "eis",
        nodes: ["ocp", "eis"],
      },
    ],
  },
  {
    id: "loop",
    group: "流程与执行",
    title: "创建循环",
    summary: "用循环开始和循环结束包住需要重复的步骤。",
    frames: [
      {
        title: "放入成对边界",
        text: "将待重复的测量放在循环开始与循环结束之间。",
        target: "loop",
        nodes: ["loop", "ocp", "end"],
      },
      {
        title: "打开循环参数",
        text: "选中循环开始，点击右侧参数页签。",
        target: "parameter-tab",
        action: "click",
        nodes: ["loop", "ocp", "end"],
        selected: "loop",
        value: "3",
      },
      {
        title: "设置次数",
        text: "选中循环开始，在右侧设置循环次数。这里演示重复 3 次。",
        target: "parameter",
        action: "type",
        nodes: ["loop", "ocp", "end"],
        selected: "loop",
        value: "3",
      },
      {
        title: "检查配对",
        text: "循环起止必须成对，次数必须为非负整数；设置为 0 会跳过循环体。",
        target: "end",
        nodes: ["loop", "ocp", "end"],
        selected: "loop",
        value: "3",
      },
    ],
  },
  {
    id: "preview",
    group: "流程与执行",
    title: "查看执行步骤",
    summary: "运行前，检查真正执行的步骤顺序。",
    frames: [
      {
        title: "打开展开预览",
        text: "点击画布右下方的展开按钮，查看实际执行步骤。",
        target: "preview",
        action: "click",
      },
      {
        title: "检查展开结果",
        text: "循环、工作流块和高级测量会展开；启动与停止程序由系统自动插入。",
        target: "sequence",
        scene: "preview",
      },
      {
        title: "核对步骤参数",
        text: "选择步骤查看参数。可以从允许的步骤启动，但系统自动边界不能作为手动起点。",
        target: "detail",
        scene: "preview",
        action: "click",
      },
    ],
  },
  {
    id: "run",
    group: "流程与执行",
    title: "开始运行",
    summary: "核对实验信息与设备准备情况，再启动流程。",
    frames: [
      {
        title: "运行前检查",
        text: "确认用户、项目、样品、保存路径及测量参数。温度和气体节点需要对应设备已连接。",
        target: "run",
      },
      {
        title: "点击运行",
        text: "点击画布右上角的运行按钮。工作站启动由系统处理，连接或启动失败时查看通知。",
        target: "run",
        action: "click",
      },
      {
        title: "观察当前步骤",
        text: "运行时节点和底部进度更新，画布编辑被锁定。本窗口展示的只是教学状态。",
        target: "progress",
        selected: "ocp",
        status: "running",
      },
    ],
  },
  {
    id: "chart",
    group: "流程与执行",
    title: "查看测量曲线",
    summary: "通过底部进度区域打开测量图表。",
    frames: [
      {
        title: "找到进度区域",
        text: "点击主界面底部中央的进度区域，打开测量图表面板。",
        target: "progress",
        action: "click",
        status: "running",
      },
      {
        title: "选择测量结果",
        text: "在面板中选择测量类型、节点和循环轮次，查看对应曲线。",
        target: "chart-tabs",
        scene: "chart",
      },
      {
        title: "查看曲线",
        text: "测量数据随执行更新；不同节点与轮次分别显示。此处曲线仅为教学示意。",
        target: "curve",
        scene: "chart",
      },
    ],
  },
  {
    id: "stop",
    group: "流程与执行",
    title: "长按停止与重置",
    summary: "长按 1 秒发出停止请求，结束后再重置。",
    frames: [
      {
        title: "找到停止按钮",
        text: "流程运行后，运行按钮变为停止按钮。普通点击不会停止流程。",
        target: "run",
        status: "running",
      },
      {
        title: "按住 1 秒",
        text: "持续按住停止按钮，直到环形进度完成。中途松开会取消本次长按。",
        target: "run",
        action: "hold",
        status: "running",
        duration: 2400,
      },
      {
        title: "等待停止确认",
        text: "请求发出后等待当前步骤按其中断规则退出，不能把按钮变化当作设备已经停止。",
        target: "run",
        status: "cancelling",
      },
      {
        title: "重置运行状态",
        text: "执行结束后按钮变为重置。重置清理本次运行状态，不等于清空画布。",
        target: "run",
        action: "click",
        status: "cancelled",
      },
    ],
  },
  {
    id: "records",
    group: "实验记录",
    title: "查看与复用记录",
    summary: "找到历史执行、导出报告，并复用已有流程。",
    frames: [
      {
        title: "打开实验记录",
        text: "点击画布左上方的实验记录按钮，按工作流查找历史执行。",
        target: "records",
        action: "click",
      },
      {
        title: "查看执行报告",
        text: "选择一次执行，查看步骤结果和输出信息，可导出 HTML 或 PDF 报告。",
        target: "report",
        scene: "records",
      },
      {
        title: "复用工作流",
        text: "回到工作流定义，点击加载到画布，再根据当前实验修改参数。",
        target: "load",
        scene: "records",
        action: "click",
      },
    ],
  },
];
