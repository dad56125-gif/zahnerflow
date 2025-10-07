目标任务：文档重构与总结 (Document Refactoring & Summarization)

## 执行环境与范围：
    目标目录：doc/ 文件夹。
    排除项：忽略 Zahner/, util/, database/ 文件夹，以及 project-structure 文件（无论后缀）。
    操作日期：[今天的日期, 格式 YYYY-MM-DD]

## 具体执行步骤：
### Phase 1: 安全备份 (Safety Archival) ✅ 已完成
    1.在执行任何更改前，将所有未排除的原始文档，整体复制到 archive/doc/[今天的日期]/ 文件夹中。
    2.关键要求：必须严格保留原始的文件和子文件夹结构。
### Phase 2: 分类与重构 (Categorization & Restructuring) ✅ 已完成
    3. 分析：扫描 doc/ 下所有未排除的文件名（及其所在的子文件夹名），确定其负责的范围与功能角色（例如：识别出 Node, Execution, Bus, State 等）。
    * 兜底规则：无法明确归属特定功能模块的文件，归类为 General（通用）。
    4. 创建结构：根据识别出的范围，在 doc/ 下创建相应的模块文件夹。
    * 命名规则：使用 PascalCase (大驼峰)，例如 ExecutionManager, EventBus。
    5. 迁移：将对应的文档移动 (Move) 到新创建的模块文件夹内。此时 doc/ 根目录下应不再有散落的文件。
### Phase 3: 模块核心总结 (Module Summarization) ✅ 已完成
    6. 遍历处理：**将每个新创建的模块文件夹视为一个独立的待办事项 (Todo)。**
    7. 生成总结：分别阅读每个模块文件夹内的所有文档，并且阅读所有涉及到的代码文件，为该模块生成一份名为 README.md 的核心设计文档，存放在该模块文件夹根目录下。
    8. README.md 内容要求：
    * 高度概括，无代码实现，不说废话。
    * 必须包含以下章节：
    * 设计原则 (Design Principles)
    * 对外接口 (Public API)
    * 主要功能列表 (Key Functions)
    * 核心数据模型 (Core Data Model)
    * 模块依赖关系 (Dependencies)
    * 典型端到端工作流程 (Typical Workflow)

## 执行完成总结

### 完整的doc/文件夹结构：

#### 新创建/重构的模块文件夹：
- **DeviceControl** - 设备控制相关文档
- **EventBus** - 事件总线与日志管理文档
- **ExecutionEngine** - 执行引擎和工作流文档
- **NodeSystem** - 节点系统文档
- **ConsoleManagement** - 控制台和日志管理文档
- **DataFlow** - 数据流和参数优化文档
- **General** - 通用文档（无法明确归属的文档）

#### 已删除的空文件夹（无文档内容）：
- ~~DeviceService~~ - 空文件夹，已删除
- ~~ParameterSystem~~ - 空文件夹，已删除
- ~~ProjectManagement~~ - 空文件夹，已删除

#### 原有存在的模块文件夹（未动）：
- **ExecutionManager** - 执行管理器
- **FrontendUI** - 前端UI
- **LoopSystem** - 循环系统
- **NotificationSystem** - 通知系统
- **SleepDelay** - 延迟睡眠
- **StateManagement** - 状态管理
- **Todo** - Todo任务管理

#### 按规则排除的文件夹（未处理）：
- **database** - 数据库相关（按规则排除）
- **util** - 工具类（按规则排除）
- **Zahner** - Zahner设备相关（按规则排除）

### 已完成的README.md设计文档：
1. `doc/DeviceControl/README.md` - 设备控制模块核心设计 ✅
2. `doc/EventBus/README.md` - 事件总线模块核心设计 ✅
3. `doc/ExecutionEngine/README.md` - 执行引擎模块核心设计 ✅
4. `doc/NodeSystem/README.md` - 节点系统模块核心设计 ✅
5. `doc/ConsoleManagement/README.md` - 控制台管理模块核心设计 ✅
6. `doc/DataFlow/README.md` - 数据流模块核心设计 ✅
7. `doc/General/README.md` - 通用模块概览 ✅

### 已存在的README.md文档（未修改）：
8. `doc/ExecutionManager/README.md` - 执行管理器架构文档（已存在）
9. `doc/database/README.md` - 数据库模块文档（已存在，按规则排除但未删除）

### 安全备份状态：
- 原始文档已完整备份到：`archive/doc/2025-10-04/`
- 保留了原有的文件和子文件夹结构
- 排除了 Zahner/, util/, database/ 文件夹和 project-structure 文件

### 新增任务完成情况（2025-10-04）
为5个原本存在但缺少README.md的模块生成核心设计文档：

#### 已完成的README.md设计文档：
8. `doc/StateManagement/README.md` - 状态管理模块核心设计 ✅
9. `doc/SleepDelay/README.md` - 延迟睡眠模块核心设计 ✅
10. `doc/LoopSystem/README.md` - 循环系统模块核心设计 ✅
11. `doc/NotificationSystem/README.md` - 通知系统模块核心设计 ✅
12. `doc/FrontendUI/README.md` - 前端UI模块核心设计 ✅

#### 新增README.md内容要求：
每个README.md包含以下标准章节：
- 设计原则 (Design Principles)
- 对外接口 (Public API)
- 主要功能列表 (Key Functions)
- 核心数据模型 (Core Data Model)
- 模块依赖关系 (Dependencies)
- 典型端到端工作流程 (Typical Workflow)

**执行日期：2025-10-04**
**状态：全部完成 ✅**