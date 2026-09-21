import { tutorialOutlines } from "./tutorialOutlines";
import type { NodeType, WorkflowNode } from '@zahnerflow/types';
import { NODE_CONFIGS } from '../../types/NodeConfiguration';
import type { TutorialLesson, TutorialStep } from './tutorialLessons';

// Source: 质子导体电化学测试 SOP, LAB-ELEC-001 V1.0. See doc/tutorial-proton-sop.md.
const group = '质子导体 SOP · 综合实操';
const target = (id: string) => `[data-tutorial-node="${id}"]`;
const param = (key: string) => `[data-tutorial-parameter="${key}"]`;
const anchor = (key: string) => `[data-tutorial-anchor="${key}"]`;
const seed = (type: NodeType, id: string, config: WorkflowNode['config'] = {}): WorkflowNode => ({
  type, id, config: { ...structuredClone(NODE_CONFIGS[type].defaultParameters), ...config },
});
const note = (title: string, text: string, selector = anchor('preview')): TutorialStep => ({ title, text, target: selector, check: { selector } });
const select = (id: string, title: string, text: string): TutorialStep => ({ title, text, target: target(id), action: 'click', check: { selectedId: id } });
const panel = (key: string): TutorialStep => ({ title: '打开真实参数栏', text: '在右侧查看并核对当前节点的实验参数。', target: anchor('parameter-tab'), action: 'click', check: { selector: param(key) } });
const input = (id: string, key: string, value: number, title: string, text: string): TutorialStep => ({ title, text, target: param(key), action: 'type', value: String(value), check: { nodeParameter: [id, key, value] } });
const preview = (text: string): TutorialStep[] => [
  { title: '展开实际执行计划', text, target: anchor('preview'), action: 'click', check: { selector: '.unroll-finder__item' } },
  note('核对执行边界', '展开计划用于核对测量顺序，不代表已经完成气路、加湿和 OCV 判据确认。', '.unroll-finder__columns'),
  { title: '返回画布，保留核对结果', text: '本课程到配置与计划核对为止，不启动炉体、气路或电化学测试。', target: '[aria-label="关闭展开步骤"]', action: 'click', check: { selector: '.unroll-dialog', absent: true } },
];
const heatingNodes = [
  seed('change_temperature', 'sop-heat-93', { stabilizationTime: 0 }),
  seed('wait_delay', 'sop-hold-93'),
  seed('change_temperature', 'sop-heat-260', { stabilizationTime: 0 }),
  seed('wait_delay', 'sop-hold-260'),
  seed('change_temperature', 'sop-heat-665', { stabilizationTime: 0 }),
];
const heatSteps: TutorialStep[] = [note('先区分 SOP 数值与教学前置条件', '画布已备好五个待配置节点。SOP 从 25°C 起算；真实执行前须确认当前温度。两个保温段用等待节点表示，温度节点稳定时间预置为 0，避免重复计时。')];
for (const [temperature, rate] of [[93, 1], [260, 1], [665, 3]]) {
  const id = `sop-heat-${temperature}`;
  heatSteps.push(select(id, `升温到 ${temperature}°C`, `按 SOP 设置目标温度 ${temperature}°C，速率 ${rate}°C/min。`), panel('targetTemperature'),
    input(id, 'targetTemperature', temperature, '设置目标温度', `这里填写 ${temperature}，注意核对目标温度的单位为°C。`),
    input(id, 'rate', rate, '设置升温速率', `${rate}°C/min 来自 SOP，不使用节点默认的 5°C/min。`));
  if (temperature !== 665) {
    const hold = `sop-hold-${temperature}`;
    heatSteps.push(select(hold, `${temperature}°C 保温 120 min`, '选择紧随升温节点的等待段。'), panel('duration'), input(hold, 'duration', 7200, '把分钟换算为秒', '120 min × 60 = 7200 s。这里只承担保温，不代表 OCV 连续监测。'));
  }
}
heatSteps.push(...preview('核对 93°C / 1°C·min⁻¹ → 保温 7200s → 260°C / 1°C·min⁻¹ → 保温 7200s → 665°C / 3°C·min⁻¹。'),
  note('核对理论时间', 'SOP 升温及保温合计 610 min（10h10min）。到 665°C 后另稳定 30min，合计 10h40min；实际耗时以起始温度和设备过程为准。'));

const preNodes = ['stable', 'pretreat', 'hydrogen'].map(name => seed('ocp_measurement', `sop-${name}`));
const preSteps: TutorialStep[] = [note('连续监测要求与软件边界', 'SOP 要求从到达 665°C 起连续监测 OCV。这里用三个测量段讲解时段；分段节点不保证跨气氛切换无缝采集，正式实验须先确认连续监测方案。')];
for (const [name, seconds, title, text] of [
  ['stable', 1800, '665°C 稳定 30 min', '到达 665°C 立即开始 OCV 监测；30min = 1800s。'],
  ['pretreat', 7200, '预处理气氛稳定 2 h', '人工确认燃料侧 5sccm H₂ + 45sccm N₂、空气侧 50sccm air，然后持续监测 2h。气路地址与阀位不由本教程猜测。'],
  ['hydrogen', 3600, '切换 50sccm H₂ 并稳定 1 h', '燃料侧改为 50sccm H₂，空气侧保持 50sccm air；确认切换后监测 3600s。'],
] as const) {
  const id = `sop-${name}`;
  preSteps.push(select(id, title, text), panel('measurementDuration'), input(id, 'measurementDuration', seconds, '配置监测时长', text));
}
preSteps.push(note('人工关口：稳态 OCV > 1V 才放行', 'SOP 写明 >1V 时切换燃料侧至 100sccm H₂，空气侧保持 air。不到 1V 时暂停报告；恰好 1V 的处理未写明，必须确认，不能默认通过。', target('sop-hydrogen')),
  note('异常不继续后续步骤', '本教程没有替你判断实测 OCV，也没有创建自动条件分支。任何异常均按 SOP 停止后续步骤并报告。', anchor('run')),
  ...preview('核对 1800s → 7200s → 3600s 三段监测。气氛切换、稳态判据和连续性需要独立确认。'));

function measurementCourse(electrolysis: boolean): TutorialLesson {
  const prefix = electrolysis ? 'ec' : 'fc';
  const end = electrolysis ? 1.5 : 0.4;
  const nodes: WorkflowNode[] = [];
  for (const temperature of [650, 600, 550, 500]) {
    const base = `sop-${prefix}-${temperature}`;
    nodes.push(seed('change_temperature', `${base}-temperature`, { targetTemperature: temperature, stabilizationTime: 0 }),
      seed('ocp_measurement', `${base}-stable`, { measurementDuration: electrolysis && temperature === 650 ? 1800 : 900 }),
      seed('ocp_measurement', `${base}-ocv`, { measurementDuration: 60 }),
      seed('voltage_ramp', `${base}-lsv`, { start_voltage: 0, startVoltageReference: 'ocv', end_voltage: end, endVoltageReference: 'absolute' }),
      seed('eis_potentiostatic', `${base}-eis`, { eisUpperFrequency: 1000000, eis_amplitude: 0.02, enableDcBias: false }));
  }
  nodes.push(seed('change_temperature', `sop-${prefix}-return`, { targetTemperature: 650, stabilizationTime: 0 }));
  // Only this teaching example starts from ordinary defaults to demonstrate actual edits.
  nodes[3] = seed('voltage_ramp', `sop-${prefix}-650-lsv`);
  nodes[4] = seed('eis_potentiostatic', `sop-${prefix}-650-eis`);
  const first = `sop-${prefix}-650`;
  const steps: TutorialStep[] = [
    note(electrolysis ? '切换电解模式：先确认湿度' : '发电模式：先确认气氛', electrolysis ? '燃料侧 H₂ + 3%H₂O；空气侧 air + 20%H₂O。SOP 要求在 650°C 重新稳定至少 30min；本例用 1800s。加湿调整是人工确认项。' : '燃料侧 H₂ + 3%H₂O，空气侧 air + 3%H₂O。首次进入发电测试按15min稳定；若由电解切回发电，应在650°C重新稳定30min。加湿与流量仍需人工确认。'),
    note('完整模板中的待确认项', '画布已预置四温度点模板。SOP 未给出降温/回温速率、LSV 扫描时长或速率、采样与电流限值；界面默认值仅供教学，必须在正式实验前补齐。'),
    select(`${first}-stable`, '检查首个温度点的稳定时段', electrolysis ? '650°C 模式切换按至少 30min 执行，不用普通温度点的 15min 替代。' : '降至 650°C 后稳定 15min，并持续监测 OCV。'),
    panel('measurementDuration'),
    input(`${first}-stable`, 'measurementDuration', electrolysis ? 1800 : 900, '确认稳定时长（秒）', electrolysis ? '30min = 1800s；若未稳定则不能因计时结束而自动放行。' : '15min = 900s；OCV 稳态和异常仍需核对。'),
    select(`${first}-ocv`, '正式测量第一步：记录 OCV 1min', '稳定段之后再记录 60s OCV，区分稳定观察与正式数据段。'),
    panel('measurementDuration'), input(`${first}-ocv`, 'measurementDuration', 60, '设置正式 OCV 记录时长', 'SOP 每个温度点均要求 OCV 1min → LSV → EIS。'),
    select(`${first}-lsv`, '配置 LSV 的电位参考', '使用真实“电压斜坡”节点。起点是当时的 OCV，不能把固定 1V 当作起点。'), panel('start_voltage'),
    { title: '打开起始电位参考模式', text: '选择开路电位参考，再用 0V 偏移表示从 OCV 开始。', target: param('startVoltageReference'), action: 'click', check: { selector: '[data-tutorial-option="startVoltageReference:ocv"]' } },
    { title: '选择开路电位参考', text: '起点已改为开路电位参考；接下来把相对 OCV 的偏移设为0V。', target: '[data-tutorial-option="startVoltageReference:ocv"]', action: 'click', check: { nodeParameter: [`${first}-lsv`, 'startVoltageReference', 'ocv'] } },
    input(`${first}-lsv`, 'start_voltage', 0, '起点设为 OCV + 0V', '0 表示相对 OCV 偏移为零，不是绝对电位 0V。'),
    input(`${first}-lsv`, 'end_voltage', end, `结束电位 ${end}V`, `终点使用绝对电位参考：${electrolysis ? '电解模式 1.5V' : '发电模式 0.4V'}。`),
    { ...note('确认终点参考与未给定参数', '终点应为绝对电位。扫描时长、采样间隔和电流安全限值仍为教学默认值，SOP 未给出，不能直接照搬运行。', param('endVoltageReference')), check: { nodeParameter: [`${first}-lsv`, 'endVoltageReference', 'absolute'] } },
    select(`${first}-eis`, '配置恒电位 EIS', 'SOP：0.1Hz–1MHz，OCV 无偏压，交流振幅 20mV。'), panel('eisLowerFrequency'),
    input(`${first}-eis`, 'eisLowerFrequency', 0.1, '低频限制 0.1Hz', '频率输入单位为 Hz。'),
    input(`${first}-eis`, 'eisUpperFrequency', 1000000, '高频限制 1MHz', '1MHz = 1000000Hz；正式使用前核对设备与接线能否满足该频段。'),
    input(`${first}-eis`, 'eis_amplitude', 0.02, '20mV 换算为 0.02V', '恒电位 EIS 的振幅字段单位为 V。'),
    { ...note('确认直流偏置关闭', '保持直流偏置禁用，表示 OCV 无外加直流偏置；不能把“绝对 0V 偏置开启”当作同一设置。其余频点、周期数和扫描策略不是 SOP 给定值。', param('enableDcBias')), check: { nodeParameter: [`${first}-eis`, 'enableDcBias', false] } },
  ];
  for (const temperature of [600, 550, 500]) {
    const base = `sop-${prefix}-${temperature}`;
    steps.push(select(`${base}-temperature`, `复核 ${temperature}°C 测试块`, `模板按 ${temperature}°C → OCV稳定900s → 正式OCV60s → LSV终点${end}V → EIS 排列。不同温度不能用不改变参数的普通循环冒充。`),
      { ...note('核对该温度点稳定时长', '目标温度不同，但测量顺序保持一致；SOP 要求稳定 15min，仍需确认 OCV 和气氛条件。', target(`${base}-stable`)), check: { nodeParameter: [`${base}-stable`, 'measurementDuration', 900] } });
  }
  steps.push(select(`sop-${prefix}-return`, '全部测试后回到 650°C', 'SOP 要求升回 650°C；回温速率未给出，正式使用前确认。'),
    ...preview('核对四组 650 → 600 → 550 → 500°C，每组稳定观察后按 OCV → LSV → EIS 顺序；最后回到 650°C。'),
    note('完成配置教学，正式执行前补齐条件', '再次核对气路、湿度、连续OCV方案、阈值判定、扫描速度和保护限值。遇到异常停止后续步骤并报告。本教程不启动完整实验。', anchor('run')));
  return { id: `sop-${prefix}`, outline: tutorialOutlines[electrolysis ? "sop-ec" : "sop-fc"], group, title: electrolysis ? '04 电解模式与四温度点复核' : '03 发电模式与四温度点配置', summary: `基于 LAB-ELEC-001 V1.0，实操 OCV 参考、${end}V 终点、EIS 单位换算与完整降温计划。未给定参数明确标注；只做配置与核对。`, seed: 'empty', initialNodes: nodes, steps };
}

export const protonSopLessons: TutorialLesson[] = [
  { id: 'sop-heating', outline: tutorialOutlines['sop-heating'], group, title: '01 分段升温与保温编排', summary: '从真实节点配置 93°C、260°C、665°C 三段升温和两段保温，核对时间单位及执行顺序。', seed: 'empty', initialNodes: heatingNodes, steps: heatSteps },
  { id: 'sop-preparation', outline: tutorialOutlines['sop-preparation'], group, title: '02 预处理与 OCV 放行判据', summary: '学习 30min、2h、1h 三个监测时段，核对预处理气氛、切换条件及人工放行边界。', seed: 'empty', initialNodes: preNodes, steps: preSteps },
  measurementCourse(false), measurementCourse(true),
];
