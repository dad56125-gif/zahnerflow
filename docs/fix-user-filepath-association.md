# 用户-文件路径配置关联修复

## 问题描述

**问题 1：文件路径没有正确应用到测量文件保存位置**
- 前端配置的路径保存在 `sessionStorage`，不与后端同步
- 后端执行测量时从错误的数据源读取配置
- 执行时没有传递当前用户信息，导致无法关联用户配置

**问题 2：用户切换后路径配置丢失**
- 路径配置保存在全局 `sessionStorage`，与用户无关联
- 切换用户后仍显示上一个用户的配置

## 解决方案

### 完整数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Frontend)                           │
├─────────────────────────────────────────────────────────────────┤
│  UserContext.tsx                                                │
│    ├─ setCurrentUser(user)                                      │
│    │   └─► loadUserPathConfig(user)  ─► GET /files/user-config  │
│    │                                                            │
│    └─ setFilePathConfig(config)                                 │
│        └─► POST /files/user-config   ─► 保存到后端              │
│                                                                 │
│  App.tsx → runFlow()                                            │
│    └─► startExecution(workflowId, nodes, currentUser)  ✅ 传用户│
│                                                                 │
│  executionStateBridge.ts → startExecution()                     │
│    └─► executeWorkflow(wfId, nodes, { ownerName })  ✅ 传后端   │
└─────────────────────────────────────────────────────────────────┘
                              ↕ HTTP API
┌─────────────────────────────────────────────────────────────────┐
│                        后端 (Backend)                            │
├─────────────────────────────────────────────────────────────────┤
│  execution.controller.ts                                        │
│    └─► POST /executions { ownerName }   ✅ 接收用户名           │
│                                                                 │
│  execution.service.ts                                           │
│    └─► executeWorkflow(wfId, nodes, ownerName)                  │
│        ├─► createWorkflow({ ownerName })  ✅ 关联用户           │
│        └─► executeMeasurement()                                 │
│            └─► getUserPathConfig(workflow.ownerName) ✅ 读配置  │
│                                                                 │
│  files.service.ts                                               │
│    ├─ getUserPathConfig(user)       ─► 从 user_path_configs 读取│
│    └─ saveUserPathConfig(user, cfg) ─► 保存到 user_path_configs │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                      数据库 (SQLite)                             │
├─────────────────────────────────────────────────────────────────┤
│  user_path_configs (新表)                                       │
│    ├─ user TEXT PRIMARY KEY                                     │
│    ├─ base_path TEXT                                            │
│    ├─ project_name TEXT                                         │
│    ├─ individual_name TEXT                                      │
│    └─ updated_at TEXT                                           │
└─────────────────────────────────────────────────────────────────┘
```

### 修改的文件

| 文件 | 修改内容 |
|------|----------|
| `backend/files/files.service.ts` | 新增 `user_path_configs` 表和 `getUserPathConfig`/`saveUserPathConfig` 方法 |
| `backend/files/files.controller.ts` | 新增 `GET/POST /files/user-config` API |
| `backend/execution/execution.controller.ts` | 接收并传递 `ownerName` 参数 |
| `backend/execution/execution.service.ts` | 修改 `executeWorkflow` 接收 `ownerName`，修复 `executeMeasurement` 使用正确的用户配置 |
| `frontend/shared/UserContext.tsx` | 重构：用户切换时加载配置，配置改变时保存到后端 |
| `frontend/workflow/workflowService.ts` | `executeWorkflow` API 添加 `ownerName` 参数 |
| `frontend/state/executionStateBridge.ts` | `startExecution` 接收并传递 `ownerName` |
| `frontend/App.tsx` | `runFlow` 传递 `currentUser` 给 `startExecution` |
| `frontend/components/FilePathManagerUI.tsx` | 简化：移除重复的 API 调用 |

### 核心修复链路

1. **用户登录/切换时**：
   ```
   setCurrentUser('UserA') 
     → loadUserPathConfig('UserA') 
     → GET /files/user-config?user=UserA 
     → 更新 filePathConfig 状态
   ```

2. **配置保存时**：
   ```
   setFilePathConfig(newConfig) 
     → 更新本地状态 
     → POST /files/user-config {user, config} 
     → 保存到数据库
   ```

3. **执行工作流时**（核心修复）：
   ```
   App.tsx: runFlow() 
     → startExecution(wfId, nodes, currentUser)  ✅ 传递用户
     → POST /executions { ownerName: currentUser }
     → createWorkflow({ ownerName })  ✅ 关联用户
     → executeMeasurement()
       → getUserPathConfig(workflow.ownerName)  ✅ 读配置
       → buildOutputPath(userConfig)  ✅ 使用正确路径
   ```

## 验证步骤

1. 登录用户 A，配置路径为 `D:\data\userA_project`
2. 切换到用户 B，确认路径重置为默认值
3. 为用户 B 配置新路径 `E:\data\userB_project`
4. 切换回用户 A，确认显示 `D:\data\userA_project`
5. **关键：运行测量，检查后端日志确认：**
   - `[Controller] 接收前端节点列表 - 数量: X, 用户: UserA`
   - `[Measurement] User: UserA, UserConfig: {...}`
   - `[Measurement] Output path: D:\data\userA_project\...`
