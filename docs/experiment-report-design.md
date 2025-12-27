# 实验报告功能设计文档

> 创建日期: 2024-12-14
> 状态: 规划中

## 📋 需求概述

为 ZahnerFlow 添加**实验报告生成**功能，允许用户在工作流执行完成后，手动生成包含执行摘要、节点参数、测量数据图表和统计分析的专业实验报告。

### 核心需求

| 项目 | 决策 |
|------|------|
| **触发方式** | 用户手动点击"生成报告"按钮 |
| **图表质量** | 科研论文级（双Y轴、刻度控制、导出矢量图） |
| **导出格式** | PDF (优先), Word (.docx) |
| **对比功能** | 暂不实现 |

---

## 🏗️ 技术架构

### 整体架构

```
┌────────────────────────────────────────────────────────────┐
│                       前端 (React)                          │
├────────────────────────────────────────────────────────────┤
│  工具栏 / 历史记录                                           │
│  └─ "生成报告" 按钮                                          │
│       │                                                     │
│       ▼                                                     │
│  ReportPreviewModal.tsx (新组件)                            │
│  ├─ 执行摘要卡片                                            │
│  ├─ 节点参数表格                                            │
│  ├─ 图表预览区 (后端返回的 PNG/SVG)                         │
│  ├─ 统计数据表格                                            │
│  └─ 导出按钮 (PDF / Word)                                   │
└────────────────────────────────────────────────────────────┘
                              │ HTTP API
                              ▼
┌────────────────────────────────────────────────────────────┐
│                    后端 (NestJS)                            │
├────────────────────────────────────────────────────────────┤
│  ReportModule (新模块)                                      │
│  ├─ ReportController                                        │
│  │   ├─ GET  /api/report/:executionId          → 报告数据   │
│  │   ├─ GET  /api/report/:executionId/preview  → 预览 HTML  │
│  │   ├─ POST /api/report/:executionId/pdf      → 生成 PDF   │
│  │   └─ POST /api/report/:executionId/docx     → 生成 Word  │
│  │                                                          │
│  ├─ ReportService                                           │
│  │   ├─ aggregateExecutionData()  → 聚合执行+工作流数据     │
│  │   ├─ readMeasurementFiles()    → 读取 CSV 文件          │
│  │   └─ calculateStatistics()     → 计算统计信息           │
│  │                                                          │
│  └─ Python Bridge (child_process)                           │
│       └─ 调用 report_generator.py                           │
└────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────┐
│                 Python 报告生成器                           │
├────────────────────────────────────────────────────────────┤
│  apps/backend/src/modules/report/python/                    │
│  ├─ report_generator.py           主入口                    │
│  ├─ chart_generator.py            Matplotlib 图表生成       │
│  ├─ pdf_generator.py              ReportLab PDF 生成        │
│  └─ docx_generator.py             python-docx Word 生成     │
└────────────────────────────────────────────────────────────┘
```

---

## 📊 报告内容结构

### 1. 封面页
- 报告标题: "实验报告 - {工作流名称}"
- 项目名称 / 样品名称
- 执行时间
- 操作人员

### 2. 执行摘要
```
┌─────────────────────────────────────┐
│ 执行ID: exec_20241214_xxxxx         │
│ 工作流: EIS测试流程                  │
│ 开始时间: 2024-12-14 10:30:00       │
│ 结束时间: 2024-12-14 11:45:00       │
│ 总耗时: 1小时15分钟                  │
│ 状态: ✅ 成功                        │
│ 节点数: 8                           │
└─────────────────────────────────────┘
```

### 3. 节点执行明细表
| 序号 | 节点类型 | 节点名称 | 关键参数 | 状态 | 耗时 |
|-----|---------|---------|---------|-----|------|
| 1 | startup | 启动程序 | host: localhost | ✅ | 3s |
| 2 | eis_potentiostatic | 恒电位EIS | DC: OCV, AC: 25mV | ✅ | 5min |
| ... | ... | ... | ... | ... | ... |

### 4. 测量数据图表 (科研级)
- **EIS 节点**: Nyquist 图 + Bode 图
- **OCP 节点**: 电位-时间曲线
- **CA/CP 节点**: 电流/电位-时间曲线
- **Ramp 节点**: 电流-电位曲线 (扫描曲线)

图表要求:
- 双Y轴支持
- 科学计数法刻度
- 图例位置可控
- 导出 300 DPI PNG 或 SVG

### 5. 统计分析表
| 测量节点 | 参数 | 平均值 | 最大值 | 最小值 | 标准差 |
|---------|------|--------|--------|--------|--------|
| OCP #1 | 电位 | 0.85V | 0.87V | 0.83V | 0.01V |
| CA #1 | 电流 | 10.5mA | 12.1mA | 9.8mA | 0.5mA |

---

## 🗂️ 文件结构

```
apps/backend/src/modules/report/
├── report.module.ts
├── report.controller.ts
├── report.service.ts
├── dto/
│   ├── report-request.dto.ts
│   └── report-response.dto.ts
├── python/
│   ├── report_generator.py      # 主入口，接收 JSON 参数
│   ├── chart_generator.py       # Matplotlib 图表
│   ├── pdf_generator.py         # ReportLab PDF
│   ├── docx_generator.py        # python-docx Word
│   ├── templates/
│   │   ├── report_template.html  # HTML 模板 (用于预览)
│   │   └── styles.css
│   └── requirements.txt
└── tests/

apps/frontend/src/components/
├── ReportPreviewModal.tsx       # 报告预览弹窗
└── ReportButton.tsx             # 生成报告按钮
```

---

## 📦 依赖项

### Python 依赖 (requirements.txt)
```
matplotlib>=3.7
numpy>=1.24
pandas>=2.0
reportlab>=4.0
python-docx>=0.8
Pillow>=9.0
```

### 前端依赖
- 无需新增依赖，复用现有 Modal 组件

---

## 🔄 数据流程

### 1. 用户点击"生成报告"按钮
```typescript
// 前端
const handleGenerateReport = async (executionId: string) => {
  // 1. 获取报告数据
  const reportData = await fetch(`/api/report/${executionId}`);
  
  // 2. 打开预览 Modal
  setReportPreview(reportData);
  setPreviewOpen(true);
};
```

### 2. 后端聚合数据
```typescript
// ReportService
async getReportData(executionId: string): Promise<ReportData> {
  // 1. 从 executions 表获取执行元数据
  const execution = await this.db.query('SELECT * FROM executions WHERE id = ?', [executionId]);
  
  // 2. 从 workflows 表获取工作流定义
  const workflow = await this.workflowService.findById(execution.workflow_id);
  
  // 3. 遍历节点，找出测量节点的 output_file
  const measurementFiles = this.findMeasurementFiles(workflow.nodes, executionId);
  
  // 4. 读取 CSV 并计算统计
  const statistics = await this.calculateStatistics(measurementFiles);
  
  // 5. 调用 Python 生成图表
  const charts = await this.generateCharts(measurementFiles);
  
  return { execution, workflow, statistics, charts };
}
```

### 3. Python 生成图表
```python
# chart_generator.py
import matplotlib.pyplot as plt
import pandas as pd

def generate_tvi_chart(csv_path: str, output_path: str, chart_type: str):
    """生成 T-V-I 曲线图"""
    df = pd.read_csv(csv_path)
    
    fig, ax1 = plt.subplots(figsize=(10, 6), dpi=150)
    
    # 电压曲线 (左Y轴)
    ax1.plot(df['time'], df['voltage'], 'b-', label='Voltage')
    ax1.set_xlabel('Time (s)')
    ax1.set_ylabel('Voltage (V)', color='b')
    
    # 电流曲线 (右Y轴)
    ax2 = ax1.twinx()
    ax2.plot(df['time'], df['current'], 'r-', label='Current')
    ax2.set_ylabel('Current (A)', color='r')
    
    plt.title('Measurement Data')
    plt.tight_layout()
    plt.savefig(output_path, format='png', dpi=300)
    plt.close()
```

### 4. 生成 PDF/Word
```python
# pdf_generator.py
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Image, Table

def generate_pdf(report_data: dict, output_path: str):
    doc = SimpleDocTemplate(output_path, pagesize=A4)
    story = []
    
    # 封面
    story.append(Paragraph(f"实验报告: {report_data['workflow_name']}", title_style))
    
    # 执行摘要
    story.append(Paragraph("执行摘要", heading_style))
    story.append(Table(summary_table_data))
    
    # 图表
    for chart in report_data['charts']:
        story.append(Image(chart['path'], width=400, height=300))
    
    doc.build(story)
```

---

## 📅 实施计划

| 阶段 | 任务 | 预计工时 | 优先级 |
|-----|------|---------|--------|
| **Phase 1** | 后端 ReportModule 骨架 | 2h | P0 |
| **Phase 1** | 数据聚合 API (GET /report/:id) | 2h | P0 |
| **Phase 2** | Python chart_generator.py | 4h | P0 |
| **Phase 2** | NestJS → Python 调用桥接 | 2h | P0 |
| **Phase 3** | pdf_generator.py | 4h | P1 |
| **Phase 3** | docx_generator.py | 3h | P1 |
| **Phase 4** | 前端 ReportPreviewModal | 3h | P1 |
| **Phase 4** | 前端 ReportButton 集成 | 1h | P1 |
| **Phase 5** | 测试 & 优化 | 4h | P2 |

**总计**: 约 25 小时

---

## 🚧 待决问题

1. **图表存储位置**: 临时目录 or 永久归档?
2. **报告模板自定义**: 是否允许用户自定义 Logo/标题?
3. **大数据性能**: 单个 CSV 超过 10 万行时如何处理?
4. **多语言**: 是否需要英文报告?

---

## 📝 备注

- 此功能为低优先级，待核心流程稳定后实施
- Python 环境需与 FastAPI 设备服务共享，避免重复安装
- 可考虑使用 `python-shell` npm 包简化 NestJS → Python 调用

简化版实验报告 - 实施方案
功能范围
包含：

✅ 封面页（项目信息、执行时间、操作人员）
✅ 执行摘要（执行ID、状态、耗时）
✅ 节点执行明细表（循环内节点自动缩进）
暂不实现：

❌ 测量数据图表
❌ 统计分析表
技术方案
方案对比
方案	技术栈	复杂度	工时
A. 纯前端生成	jsPDF + html2canvas	🟢 低	4-6h
B. Python 生成	ReportLab + child_process	🟡 中	8-10h
推荐方案 A：纯前端生成，无需后端改动，快速上线。

方案 A 详细设计
架构
⚠️ 独立性要求：前端报告生成模块需保持独立，与业务组件解耦，方便后续迁移到 Python/混合方案。

前端 React
├── modules/report/                [NEW] 独立报告模块
│   ├── ReportGeneratorModal.tsx   报告预览+导出弹窗
│   ├── reportDataBuilder.ts       数据构建工具
│   ├── pdfExporter.ts             PDF 导出逻辑
│   └── types.ts                   报告类型定义
│
└── 依赖: jsPDF + html2canvas
迁移策略：

报告数据结构 (ReportData) 设计为与生成器无关的中间格式
未来迁移时，只需替换 pdfExporter.ts → 调用后端 Python API
报告内容
1. 封面页
╔═══════════════════════════════════════════╗
║                                           ║
║           实验报告                         ║
║      ─────────────────────                ║
║                                           ║
║   项目名称: {project_name}                ║
║   样品名称: {individual_name}             ║
║   工作流:   {workflow_name}               ║
║                                           ║
║   执行时间: 2024-12-15 10:30              ║
║   操作人员: {user}                        ║
║                                           ║
╚═══════════════════════════════════════════╝
2. 执行摘要
项目	值
执行ID	exec_20241215_xxxxx
状态	✅ 成功 / ❌ 失败
开始时间	2024-12-15 10:30:00
结束时间	2024-12-15 11:45:00
总耗时	1小时15分钟
节点总数	8
3. 节点执行明细表
序号	节点类型	节点名称	关键参数	状态	耗时
1	startup	启动程序	host: localhost	✅	3s
2	loop_start	循环开始	次数: 3	✅	-
└ 3	eis_potentiostatic	EIS测试	DC: OCV	✅	5min
└ 4	ocp_measurement	OCP	60s	✅	1min
5	loop_end	循环结束	-	✅	-
6	shutdown	关闭程序	-	✅	2s
缩进规则：循环内的节点前添加 └ 前缀和额外缩进。

文件结构
apps/frontend/src/modules/report/   [NEW] 独立报告模块
├── ReportGeneratorModal.tsx        报告预览+导出弹窗
├── reportDataBuilder.ts            数据构建工具
├── pdfExporter.ts                  PDF 导出逻辑 (可替换为后端调用)
├── types.ts                        类型定义
└── _report.css                     报告样式
数据来源
interface ReportData {
  // 封面信息
  projectName: string;
  individualName: string;
  workflowName: string;
  user: string;  // 操作人员
  
  // 执行摘要
  executionId: string;
  status: 'completed' | 'failed';
  startTime: Date;
  endTime: Date;
  duration: number; // 秒
  
  // 节点明细
  nodes: ReportNodeInfo[];
}
interface ReportNodeInfo {
  index: number;
  type: string;
  label: string;
  keyParams: string;
  status: 'success' | 'failed' | 'skipped';
  duration?: number;
  indentLevel: number;  // 0=普通, 1=循环内, 2=嵌套循环内
}
数据来源：

workflow 对象（节点定义）
executionHistory 数组（执行记录）
unrolledSteps（展开后的执行步骤，用于判断循环嵌套）