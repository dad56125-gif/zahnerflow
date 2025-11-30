# ZAHNERFLOW 文件路径管理系统架构图

## 1. 系统整体架构图

```mermaid
graph TB
    subgraph "前端层 Frontend"
        UI[FilePathManagerUI 组件]
        API_CLIENT[API Client]
        USER_CTX[UserContext]
        HOOKS[useOnClickOutside Hook]
    end

    subgraph "后端层 Backend"
        CONTROLLER[FilesController]
        SERVICE[FilesService]
        DB[(SQLite Database)]
    end

    subgraph "设备层 Device"
        FASTAPI[Python FastAPI]
        ZAHNER[ZahnerDevice Service]
        THALES[Thales SDK]
        FILESYSTEM[文件系统]
    end

    UI --> API_CLIENT
    API_CLIENT --> CONTROLLER
    CONTROLLER --> SERVICE
    SERVICE --> DB

    SERVICE --> FASTAPI
    FASTAPI --> ZAHNER
    ZAHNER --> THALES
    ZAHNER --> FILESYSTEM
```

## 2. 文件路径配置流程图

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as FilePathManagerUI
    participant API as API Client
    participant FC as FilesController
    participant FS as FilesService
    participant DB as SQLite
    participant D as Device Layer

    Note over U,D: 文件路径配置流程

    U->>UI: 打开文件路径配置界面
    UI->>UI: 组件初始化，加载现有项目
    UI->>API: GET /api/files/projects?user=user123
    API->>FC: getProjects(user)
    FC->>FS: getProjects(user)
    FS->>DB: SELECT DISTINCT project_name FROM files WHERE user=?
    DB-->>FS: 返回项目列表
    FS-->>FC: 返回项目名称数组
    FC-->>API: {success: true, projects: [...]}
    API-->>UI: 响应数据
    UI->>UI: 更新项目下拉列表

    U->>UI: 输入/选择配置信息
    Note right of UI: base_path, project_name, individual_name
    U->>UI: 点击保存按钮
    UI->>UI: 表单验证
    UI->>API: POST /api/files/path-config
    Note right of API: {user, base_path, project_name, individual_name, test_type}
    API->>FC: savePathConfig(config)
    FC->>FS: registerFile(payload)
    FS->>FS: 构建目录路径: base_path/project/individual/test_type
    FS->>DB: INSERT INTO files (...)
    DB-->>FS: 插入成功，返回ID
    FS-->>FC: {id, dir_path, ...}
    FC-->>API: {success: true, id, dir_path}
    API-->>UI: 保存成功响应
    UI->>UI: 关闭界面，调用onSave回调
```

## 3. 设备测量与数据保存流程图

```mermaid
sequenceDiagram
    participant WF as Workflow Engine
    participant API as API Client
    participant FC as FilesController
    participant FS as FilesService
    participant PY as Python FastAPI
    participant ZD as ZahnerDevice
    participant FSYS as File System

    Note over WF,FSYS: 设备测量与数据保存流程

    WF->>API: 发起测量请求
    Note right of API: 包含 output_path 参数
    API->>FC: GET /api/files/path-config?project=xxx
    FC->>FS: getProjectConfig(user, project, individual)
    FS->>DB: 查询文件路径配置
    DB-->>FS: 返回路径配置
    FS-->>FC: {base_path, project_name, individual_name, test_type}
    FC-->>API: 返回路径配置
    API-->>WF: 完整的测量配置

    WF->>PY: POST /measure (with output_path)
    PY->>ZD: connect_device()
    ZD->>ZD: ThalesRemoteConnection.connectToTerm()
    ZD-->>PY: 设备连接成功

    PY->>ZD: start_measurement(output_path)

    loop 测量循环
        ZD->>ZD: device_wrapper.getCurrent()
        ZD->>ZD: 收集数据到内存
        Note right of ZD: 每5分钟检查一次
        alt 超过5分钟
            ZD->>FSYS: _save_data_to_csv()
            Note right of FSYS: 自动创建目录结构<br/>追加写入CSV文件
            FSYS-->>ZD: 保存成功
            ZD->>ZD: 清空内存缓存
        end
        alt 电流异常
            ZD->>PY: 提前终止测量
        end
    end

    ZD->>FSYS: 最终保存剩余数据
    FSYS-->>ZD: 保存完成
    ZD-->>PY: 测量完成，返回统计信息
    PY-->>WF: {status: success, data: {...}}
```

## 4. 目录结构构建逻辑图

```mermaid
flowchart TD
    START[开始构建路径] --> CHECK_CONFIG{检查配置}

    CHECK_CONFIG -->|完整配置| STANDARD[标准路径结构]
    CHECK_CONFIG -->|工作流模式| WORKFLOW[工作流路径结构]

    STANDARD --> BUILD_PATH[路径: base_path/project_name/individual_name/test_type]

    WORKFLOW --> GET_TIMESTAMP[获取时间戳]
    WORKFLOW --> GET_WORKFLOW_ID[获取工作流ID]
    GET_TIMESTAMP --> COMBINE[组合路径]
    GET_WORKFLOW_ID --> COMBINE
    COMBINE --> BUILD_WORKFLOW_PATH[路径: base_path/workflow_id_timestamp/test_type]

    BUILD_PATH --> CREATE_DIR[创建目录结构]
    BUILD_WORKFLOW_PATH --> CREATE_DIR

    CREATE_DIR --> EXAMPLE1[示例: C:\data\archive\电化学实验\样品001\eis\]
    CREATE_DIR --> EXAMPLE2[示例: C:\data\archive\workflow_241129_143022\ocp\]

    START --> INPUT_PARAMS[输入参数]
    INPUT_PARAMS --> CHECK_CONFIG

    subgraph "输入参数"
        BASE_PATH[base_path: 基础路径]
        PROJECT[project_name: 项目名称]
        INDIVIDUAL[individual_name: 样品编号]
        TEST_TYPE[test_type: 测试类型]
        WORKFLOW_ID[workflow_id: 工作流ID]
        TIMESTAMP[timestamp: 时间戳]
    end
```

## 5. 数据流架构图

```mermaid
graph LR
    subgraph "数据源"
        USER_INPUT[用户输入]
        EXISTING_DATA[现有数据库记录]
        DEVICE_DATA[设备测量数据]
    end

    subgraph "数据转换层"
        VALIDATION[数据验证]
        PATH_BUILDING[路径构建]
        NAMING[文件命名]
    end

    subgraph "数据存储"
        METADATA_DB[(文件元数据 SQLite)]
        MEASUREMENT_FILES[(测量数据 CSV)]
        CONFIG_FILES[(配置文件)]
    end

    USER_INPUT --> VALIDATION
    EXISTING_DATA --> PATH_BUILDING
    DEVICE_DATA --> NAMING

    VALIDATION --> METADATA_DB
    PATH_BUILDING --> METADATA_DB
    NAMING --> MEASUREMENT_FILES

    METADATA_DB --> CONFIG_FILES
```

## 6. 错误处理流程图

```mermaid
flowchart TD
    START[操作开始] --> TRY{尝试执行}

    TRY -->|前端验证失败| FRONTEND_ERROR[前端错误处理]
    TRY -->|API调用失败| API_ERROR[API错误处理]
    TRY -->|数据库操作失败| DB_ERROR[数据库错误处理]
    TRY -->|设备连接失败| DEVICE_ERROR[设备错误处理]

    FRONTEND_ERROR --> SHOW_UI_ERROR[显示用户界面错误]
    API_ERROR --> RETRY_API[API重试机制]
    DB_ERROR --> ROLLBACK[事务回滚]
    DEVICE_ERROR -> FALLBACK[降级处理]

    RETRY_API -->|重试成功| SUCCESS[操作成功]
    RETRY_API -->|重试失败| SHOW_UI_ERROR

    ROLLBACK --> SHOW_UI_ERROR
    FALLBACK --> SHOW_UI_ERROR

    SUCCESS --> END[操作结束]
    SHOW_UI_ERROR --> END

    subgraph "错误类型"
        VALIDATION_ERROR[表单验证错误]
        NETWORK_ERROR[网络连接错误]
        PERMISSION_ERROR[文件权限错误]
        DEVICE_OFFLINE[设备离线错误]
    end
```

## 7. 组件交互图

```mermaid
graph TB
    subgraph "React 组件层次"
        APP[App Component]
        WORKFLOW[Workflow Manager]
        FILE_MANAGER[FilePathManagerUI]
        PORTAL[Portal Component]
    end

    subgraph "服务层"
        USER_SERVICE[User Service]
        API_SERVICE[API Service]
        HOOK_SERVICE[Custom Hooks]
    end

    subgraph "外部依赖"
        NESTJS[NestJS Backend]
        PYTHON[Python Device Service]
        SQLITE[(SQLite DB)]
    end

    APP --> USER_SERVICE
    WORKFLOW --> FILE_MANAGER
    FILE_MANAGER --> PORTAL
    FILE_MANAGER --> API_SERVICE
    FILE_MANAGER --> HOOK_SERVICE

    API_SERVICE --> NESTJS
    NESTJS --> SQLITE
    NESTJS --> PYTHON
```

## 8. 实时数据保存机制图

```mermaid
sequenceDiagram
    participant TIMER as 高精度计时器
    participant DEVICE as 设备数据采集
    participant MEMORY as 内存缓存
    participant CHECKER as 定时检查器
    participant SAVER as 文件保存器
    participant FILE as CSV文件

    Note over TIMER,FILE: 实时数据保存机制 (每5分钟)

    loop 测量过程
        TIMER->>DEVICE: 触发数据采集 (1秒间隔)
        DEVICE->>MEMORY: 保存到内存数组
        MEMORY->>MEMORY: data.append({"time": elapsed, "current": current})

        par 每5分钟检查
            CHECKER->>CHECKER: 检查时间间隔 >= 300秒?
            alt 是，需要保存
                CHECKER->>SAVER: 触发文件保存
                SAVER->>FILE: 创建目录 (如不存在)
                SAVER->>FILE: 追加写入CSV
                FILE-->>SAVER: 写入成功
                SAVER->>MEMORY: 清空内存缓存
                Note right of MEMORY: measurement_data.clear()
            end
        end
    end

    Note over TIMER,FILE: 测量结束时
    MEMORY->>SAVER: 保存剩余数据
    SAVER->>FILE: 最终写入
    FILE-->>SAVER: 完成
```