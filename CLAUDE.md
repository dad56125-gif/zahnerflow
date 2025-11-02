# AGENTS.md
# Language
- **Chinese.** The default language shall be used for searching and thinking, and Chinese shall be used for replies.

### Core Rule
- All API parameters, interface definitions, and variable names must uniformly use **snake_case**.
- The use of camelCase for naming is prohibited; non-compliant code will not be accepted.

### Other Rule
- Use the backend Python script as the naming source, ensuring it is fully consistent with the device API.
- The parameter names in the frontend, backend, and Python script must be fully aligned.
- Before adding or modifying a parameter name, check the Parametername.md file in the root directory.
- After adding or modifying a parameter name, update the Parametername.md file in the root directory.
- Independently refer to the Realme.md documents in the doc/ directory of different modules as needed. While these documents may not be completely accurate, they can provide useful guidance.

## Frontend Structure
```
apps/frontend/src/
├── components/
│   ├── features/              # 功能模块组件
│   │   ├── loop/             # 循环系统
│   │   │   ├── core/         # 核心逻辑
│   │   │   │   ├── LoopDetector.ts
│   │   │   │   └── LoopContextManager.ts
│   │   │   ├── visualization/ # 可视化组件
│   │   │   │   ├── LoopBoundary.tsx
│   │   │   │   ├── LoopVisualizer.tsx
│   │   │   │   └── LoopControlPanel.tsx
│   │   │   └── index.ts      # 统一导出
│   │   ├── workflow/         # 工作流系统
│   │   ├── furnace/          # 炉温控制
│   │   └── mfc/             # 质量流量控制器
│   ├── common/               # 通用组件
│   └── layout/               # 布局组件
├── services/                 # 业务逻辑层
│   ├── api/                  # API服务
│   ├── hooks/                # React Hooks
│   └── stores/               # 状态管理
├── types/                    # 类型定义层
│   ├── nodes/               # 节点类型
│   └── devices/             # 设备类型
├── utils/                    # 工具函数层
└── styles/                   # 样式文件