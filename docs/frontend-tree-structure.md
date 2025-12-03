frontend
src
  components
    Canvas.tsx (409行)
      Canvas (组件): 核心画布组件，负责渲染节点、连线及循环层。架构已解耦：布局计算与渲染分离。
      useUnifiedLayout (Hook调用): 调用统一布局引擎 Hook，计算 layoutNodes（带坐标的节点数组）和 layoutEdges（预计算的连接线数组）。
      useSimpleLoopDetection (Hook调用): 极简循环检测 Hook，基于数组遍历+栈配对，返回 SimpleLoopInfo[]。
      resizeObserver: 监听容器 DOM 尺寸变化，防抖（50ms）更新 canvasSize state。
      handleCanvasDrop: 处理画布拖拽放下事件，根据放下坐标估算插入索引，调用 store.addNode 添加节点。
      handleNodeContextMenu: 处理节点右键菜单，弹出确认对话框，删除节点。
      nodePositions: 根据 layoutNodes 转换生成的 {id, x, y, width, height} 数组，供 LoopBoundary 和 ComputedConnectionLines 使用。
      toggleDragMode: 切换 Y 轴拖动模式，激活时允许上下拖动整个画布内容。
      handleMouseDown/Move/Up: Y 轴拖动事件处理，更新 canvasOffsetY state。

    ComputedConnectionLines.tsx (208行)
      ComputedConnectionLines (组件): 纯渲染组件，根据预计算的 layoutEdges 数据绘制 SVG 连接线。
      renderEdge: 遍历每条 edge，根据 type 渲染直线或 L 形折线，仅对 strokeWidth 进行 zoomLevel 反向补偿。
      缩放处理: strokeWidth = 2.5 / zoomLevel，防止线条随画布缩放变细。
      蛇形逻辑: 处理 U 型转折（同侧连接，sourceDir===targetDir）和 Z 型转折（跨行连接）。
      overflow: visible: SVG 样式设置，防止连接线超出画布边界被截断。markerEnd: 箭头标记，固定尺寸由 CSS transform 统一缩放。

    NodeRenderer.tsx (446行)
      NodeRenderer (组件): 统一节点渲染器，从配置获取显示信息，支持所有节点类型。
      getNodeConfig: 输入节点 type，返回节点配置（name、icon、style、category）。
      handleClick/DoubleClick/ContextMenu: 事件处理，点击选中，双击预留，右键删除。
      handleDragStart/End: 拖拽处理，改变透明度提示，位置由布局系统控制。
      remountKey: 从 node.data._force_reset_key 读取，用于强制重新挂载节点，停止动画。
      节点显示逻辑: 根据 type 显示不同参数预览（温度、流量、电压、电流等）。
      React.memo: 深度比较优化，避免不必要的重渲染。

    PropertyPanel.tsx (1058行)
      PropertyPanel (组件): 节点参数编辑面板，根据选中节点动态生成表单。
      Dropdown: 内部下拉组件，支持外部点击关闭和 Esc 键关闭。
      温度节点: 输入目标温度、当前温度、持续时间参数。
      气体流量节点: 输入目标流量、气体类型、设备地址、当前流量，调用 MFC API 获取设备列表。
      EIS 节点: 输入直流偏置、交流扰动、频率范围参数。
      计时电流/电位节点: 输入极化电压/电流、测量持续时间。
      斜坡节点: 输入起始值、结束值、步进值、每步持续时间。
      循环节点: 输入循环次数（loop_count）。
      等待节点: 输入等待时间（duration）。
      应用工作流默认参数: 从 workflowParameterStore 读取并合并到节点参数。

    Toolbar.tsx
      Toolbar (组件): 画布顶部工具栏，包含核心操作按钮。
      onRunFlow: 调用后端 API 启动工作流执行。
      onStopFlow: 调用后端 API 停止工作流执行。
      onResetFlow: 重置画布到初始状态，清空所有节点。
      onToggleWorkflowManager: 打开/关闭工作流管理器模态框。
      onToggleFilePathManager: 打开/关闭文件路径管理器。
      clearCanvas: 清空画布所有节点和连接。
      按钮组: 新建 | 文件路径 | 运行 | 重置/停止 | 工作流

    StatusBar.tsx
      StatusBar (组件): 底部状态栏，显示运行状态和统计信息。
      执行状态: 显示 isRunning、currentNodeIndex、isPaused 状态。
      节点统计: 显示总节点数、循环数、已完成数。
      缩放级别: 显示当前 zoomLevel。
      连接状态: 显示 WebSocket 连接状态。

    TopNavbar.tsx
      TopNavbar (组件): 顶部导航栏，包含 Logo 和用户信息。
      WorkflowIdDisplay: 显示当前工作流 ID。
      UserSelector: 用户选择下拉菜单。

    Sidebar.tsx
      Sidebar (组件): 左侧节点库面板，可拖拽添加节点。
      节点分类: 按 Basic、Advanced、Device 分组显示节点模板。
      拖拽处理: onDragStart 设置 nodeType 到 dataTransfer。

    DataViewer.tsx
      DataViewer (组件): 右侧数据查看面板。
      实时数据显示: 显示当前运行节点的实时数据。
      EIS 曲线: 显示 EIS 测量结果（Nyquist 图、Bode 图）。
      OCP 曲线: 显示开路电位测量结果。
      温度曲线: 显示炉子温度历史。

    NotificationPanel.tsx
      NotificationPanel (组件): 右上角通知面板。
      通知队列: 使用数组管理通知消息。
      自动关闭: 3-5 秒后自动移除通知。
      类型: success、error、warning、info。

    ParameterInput.tsx
      ParameterInput (组件): 通用参数输入组件。
      支持类型: number、text、select、checkbox。
      验证: 内置参数范围验证（根据节点类型配置）。
      单位: 支持单位显示和转换。

    FilePathManagerUI.tsx (517行)
      FilePathManagerUI (组件): 文件路径管理器模态框。
      工作流文件管理: 保存、加载、删除工作流定义 JSON 文件。
      路径配置: 配置数据、日志、导出文件的保存路径。
      文件浏览器: 浏览服务器文件系统（有限权限）。

    UserSelector.tsx (347行)
      UserSelector (组件): 用户选择和工作站切换组件。
      用户选择: 下拉菜单选择当前用户（影响工作流归属）。
      工作站选择: 切换工作站类型（影响可用节点类型）。
      设备列表: 显示和管理当前工作站下的设备。

  features
    loop
      visualization
        LoopBoundary.tsx (275行)
          LoopBoundary (组件): 渲染循环边界色带和循环信息标签。
          findCompleteLoopPath: 查找从 startNodeId 到 endNodeId 的完整路径，包括循环间所有节点。在 Start 左侧添加 width/3 扩展点，End 右侧添加 width/3 扩展点。
          getNodeCenterPoint: 计算节点中心点坐标，考虑 zoomLevel 和 canvasOffsetY 的 CSS transform 变换。
          pathSegments: 将路径点转换为线段数组，L形路径时优先水平或垂直转折。
          beltPath: 使用 generateBeltPath 工具函数，根据 pathSegments 和 beltWidth 生成 SVG path。
          渲染: 单个 path 元素同时用于填充和边框，顶部显示"第 N 级循环 • M 次"文本标签。

        index.ts
          LoopBoundary 导出: 导出 LoopBoundary 组件和 LoopBoundaryProps 接口。
      core (已删除)
        LoopDetector.ts (已删除)
        LoopContextManager.ts (已删除)
        LoopMetadataManager.ts (已删除)
        LoopLevelCalculator.ts (已删除)
        LoopSystemController.ts (已删除)
        fingerprint_cache.ts (已删除)

    workflow
      WorkflowManager.ts (806行)
        WorkflowManager (类): 工作流管理核心，负责导入、导出、验证、版本升级。
        exportWorkflow: 导出工作流为 JSON/CSV 格式。参数: nodes, connections, loops, metadata, settings, options。返回 { data, filename }。
        importWorkflow: 导入工作流，支持格式检测、结构验证、版本升级。参数: data, format, options。返回 { workflow, validation }。
        validateWorkflow: 验证工作流结构，检查节点唯一性、位置有效性、连接完整性、循环边界。返回 { isValid, errors, warnings, suggestions }。
        upgradeWorkflowVersion: 升级工作流版本（1.0.0 → 1.1.0 → 2.0.0），自动添加新字段。
        convertToCSV: 将工作流数据转换为 CSV 格式，包含元数据、节点、连接、循环信息。
        parseFromCSV: 从 CSV 解析工作流数据（简化实现）。
        createWorkflowTemplate: 根据节点类型数组创建工作流模板。
        compareWorkflows: 比较两个工作流差异，返回 added、removed、modified 节点列表。

      WorkflowManagerUI.tsx (706行)
        WorkflowManagerUI (组件): 工作流管理器主界面，模态框形式。
        工作流列表: 从后端加载工作流列表，支持搜索、过滤、排序。
        创建: 点击"新建"打开创建表单，输入名称、描述、标签。
        导入: 支持上传 JSON/CSV 文件，调用 WorkflowManager.importWorkflow。
        导出: 选择工作流，调用 WorkflowManager.exportWorkflow，下载文件。
        删除: 确认后调用后端 API 删除工作流。
        加载: 双击或点击"加载"将工作流加载到画布。

      index.ts
        核心导出: WorkflowManager、WorkflowManagerUI。
        类型导出: WorkflowData、WorkflowMetadata、WorkflowSettings、WorkflowExportOptions、WorkflowImportOptions、WorkflowValidationResult。

  hooks
    useUnifiedLayout.ts (458行)
      useUnifiedLayout (Hook): 统一布局引擎入口，完全控制节点显示方式。
      calculateSnakeLayout: 蛇形布局算法。偶数行 L->R，奇数行 R->L。返回 layoutNodes、layoutEdges、actualColumns、adjustedDimensions。
      calculateGridLayout: 网格布局算法。固定 L->R 方向，行列排列。
      calculateResponsiveLayout: 动态响应式布局。根据 canvasWidth 和 zoomLevel 动态计算列数（最小 2，最大 8）。
      generateConnectionLines: 连接线生成引擎。计算 sourceDir/targetDir（1=向右，-1=向左），生成直线或 L 形折线。L形连接时根据行号奇偶性决定转折方向。

    useSimpleLoopDetection.ts (59行)
      useSimpleLoopDetection (Hook): 极简循环检测器，与后端逻辑 100% 一致。
      核心算法: 遍历节点数组，loop_start 入栈，loop_end 出栈配对。栈深度 = 嵌套层级 level。返回 SimpleLoopInfo[]。

    useMfc.ts (373行)
      useMfc (Hook): MFC 设备状态管理 Hook。
      connectDevice: 连接到指定地址的 MFC 设备，返回连接结果。
      disconnectDevice: 断开当前 MFC 设备连接。
      setFlowRate: 设置目标流量（sccm），发送命令到设备。
      getDeviceStatus: 查询设备当前状态（流量、温度、阀门状态）。
      WebSocket 订阅: 监听实时数据更新。

    useFurnace.ts
      useFurnace (Hook): 炉子设备状态管理 Hook。
      connectDevice: 连接炉子设备。
      disconnectDevice: 断开炉子连接。
      startProgram: 启动温度程序。
      stopProgram: 停止温度程序。
      setTemperature: 设置目标温度。
      getTemperature: 获取当前温度。

    useCanvasBlur.ts
      useCanvasBlur (Hook): Canvas 模糊效果控制。
      enableBlur: 启用 CSS backdrop-filter 模糊。
      disableBlur: 禁用模糊，恢复清晰。

    useNodeChangeDetection.ts
      useNodeChangeDetection (Hook): 节点变化检测。
      比较节点 position、width、height，变化时触发更新信号。

    useOnClickOutside.ts
      useOnClickOutside (Hook): 外部点击检测。
      监听 document click，判断点击是否在指定元素外部，触发回调。

  services
    layout
      LayoutConfig.ts (309行)
        LayoutConfig (配置对象): 统一布局配置，项目唯一的布局真实来源。
        DEFAULT_LAYOUT_CONFIG: 默认配置对象，包含 mode、nodeWidth、nodeHeight、spacing、minColumns、maxColumns、zoomAware 等参数。
        calculateDynamicColumns: 根据 canvasWidth、zoomLevel 和 nodeCount 动态计算最优列数。返回 { optimalColumns, adjustedNodeWidth, adjustedSpacing, effectiveContainerWidth }。
        getActualColumns: 获取最终实际使用的列数。优先级: 固定列数 > 动态计算 > 最小列数。
        isValidZoomLevel: 验证 zoomLevel 是否在有效范围内（minZoomLevel 到 maxZoomLevel）。
        ComputedEdge: 连接线数据接口，包含 id、source/target、sourcePosition/targetPosition、type、sourceDir/targetDir。

      ConnectionBindingService.ts (463行)
        ConnectionBindingService (类): 连接线绑定服务，专注数据转换和缓存。
        convertFromComputedEdges: 将 ComputedEdge[] 转换为 ConnectionData[]，保持向后兼容。
        convertSingleEdge: 转换单个 edge，处理 L 形连接的控制点计算。
        generateCachedConnectionsFromEdges: 直接从 ComputedEdge 生成缓存数据，避免中间转换，提升性能。
        shouldUpdateEdges: 比较前后 edges 数组，检查连接点位置或类型是否变化，决定是否需要重新渲染。
        getConnectionStats: 统计 edges 数组，返回 { total, straight, lShape, animated }。
        shouldUpdateConnections (已废弃): 旧版方法，检查基于 NodePosition 的连接是否需要更新。
        createDefaultUtils: 创建默认的布局工具函数实例（getNodeSize、isPositionInNode、calculateDistance、generateUniqueId）。

      index.ts
        导出: LayoutConfig、ConnectionBindingService、computedEdges、layoutNodes 等核心接口和函数。

    stores
      canvasStore.ts (250行)
        useCanvasStore (Zustand Store): 画布状态管理。
        nodes: ElectrochemicalNode[] - 节点数组。
        connections: Connection[] - 连接数组（向后兼容，实际使用 layoutEdges）。
        selectedNode: ElectrochemicalNode | null - 当前选中的节点。
        canvasSize: { width, height } - 画布尺寸。
        validationError: string | null - 验证错误信息。
        setCanvasSize: 设置画布尺寸。
        addNode: 添加节点，智能配对循环节点，估算插入索引，应用工作流默认参数。
        deleteNode: 删除节点和相关的所有连接。
        selectNode: 选中/取消选中节点。
        updateNode: 更新节点数据，深度比较避免不必要的重渲染。
        batchUpdateNodes: 批量更新多个节点，减少状态变化次数。
        clearCanvas: 清空画布，重置所有状态。
        validateNodes: 验证节点配置（startup/shutdown 唯一性、位置有效性）。
        calculateNodeIndex: 根据坐标估算节点插入索引（用于拖拽放置）。

      workflowStore.ts
        useWorkflowStore (Zustand Store): 工作流状态管理。
        currentWorkflow: WorkflowData | null - 当前工作流。
        workflowList: WorkflowData[] - 工作流列表。
        isLoading: boolean - 加载状态。
        setCurrentWorkflow: 设置当前工作流。
        loadWorkflowList: 从后端加载工作流列表。
        createWorkflow: 创建新工作流。
        updateWorkflow: 更新工作流。
        deleteWorkflow: 删除工作流。

      workflowParameterStore.ts
        useWorkflowParameterStore (Zustand Store): 工作流参数管理。
        workflowDefaults: Record<string, Record<string, any>> - 工作流级别默认参数。
        deviceDefaults: Record<string, Record<string, any>> - 设备级别默认参数。
        setWorkflowDefaultParameters: 设置工作流默认参数。
        getWorkflowDefaultParameters: 获取指定节点类型的工作流默认参数。
        applyDeviceDefaults: 应用设备默认参数到节点。

      executionStore.ts
        useExecutionStore (Zustand Store): 执行状态管理。
        isRunning: boolean - 是否正在运行。
        isPaused: boolean - 是否暂停。
        currentNodeIndex: number - 当前节点索引。
        executionLog: string[] - 执行日志。
        startExecution: 启动执行。
        pauseExecution: 暂停执行。
        resumeExecution: 恢复执行。
        stopExecution: 停止执行。
        nextNode: 执行下一个节点。

      index.ts
        统一导出所有 Store：useCanvasStore、useWorkflowStore、useWorkflowParameterStore、useExecutionStore。

    workflowExecutionService.ts
      workflowExecutionService (服务): WebSocket 连接封装，负责工作流执行控制。
      connect: 建立 WebSocket 连接，监听执行状态更新。
      disconnect: 断开 WebSocket 连接。
      startWorkflow: 发送 start 命令到后端。
      pauseWorkflow: 发送 pause 命令。
      stopWorkflow: 发送 stop 命令。
      onStateChange: 监听执行状态变化事件。
      onNodeComplete: 监听节点完成事件。

    workflowService.ts
      workflowService (服务): HTTP API 封装，负责工作流 CRUD。
      getWorkflowList: 获取工作流列表，GET /api/workflows。
      getWorkflow: 获取单个工作流，GET /api/workflows/:id。
      createWorkflow: 创建工作流，POST /api/workflows。
      updateWorkflow: 更新工作流，PUT /api/workflows/:id。
      deleteWorkflow: 删除工作流，DELETE /api/workflows/:id。

    websocket.service.ts
      websocketService (服务): 通用 WebSocket 连接管理。
      connect: 连接到 WebSocket 服务器，自动重连机制。
      disconnect: 断开连接。
      send: 发送消息。
      onMessage: 监听消息，支持按事件类型订阅。
      onOpen/Close/Error: 连接状态监听。

    workflowSyncUtil.ts
      workflowSyncUtil (工具): 前端后端工作流同步工具。
      syncWorkflow: 将本地工作流同步到后端。
      resolveConflicts: 检测并解决工作流冲突。
      createSnapshot: 创建工作流快照。

    deviceService.ts
      deviceService (服务): 设备管理 API 封装。
      discoverDevices: 扫描网络设备，GET /api/devices/discover。
      connectDevice: 连接设备，POST /api/devices/:id/connect。
      disconnectDevice: 断开设备，POST /api/devices/:id/disconnect。
      getDeviceStatus: 获取设备状态，GET /api/devices/:id/status。
      sendCommand: 发送设备命令，POST /api/devices/:id/command。

  types
    nodes
      types.ts (971行)
        ElectrochemicalNode (接口): 完整的电化学节点数据结构，包含 id、type、category、name、position、data、status、input、output、style、layoutMeta。
        NodeType (类型): 枚举所有节点类型（startup、shutdown、loop_start、loop_end、change_temperature、change_gas_flow、eis_potentiostatic、eis_galvanostatic、ocp_measurement、chronoamperometry、chronopotentiometry、voltage_ramp、current_ramp、lsv_measurement、wait_delay）。
        NodeCategory (类型): basic_measurement、advanced_measurement、control、device。
        NodeStatus (类型): ready、running、completed、error、paused。
        NodeData (接口): name、description、parameters、createdAt、updatedAt。
        Port (接口): id、name、dataType（flow/data）。
        NodeStyle (接口): width、height、background、borderColor、borderRadius、textColor、icon。
        LayoutMeta (接口): index、row、col、isLeftToRight、isFirstInRow、isLastInRow、isInOddRow、width、columns。
        SimpleLoopInfo (接口): id、startNodeId、endNodeId、level、nodeIds、iterationCount（前端极简检测器返回）。
        ElectrochemicalNodeInput: 向后兼容的输入接口。
        getNodeConfig: 根据 NodeType 返回节点配置（name、icon、category、style、input/output 定义）。
        getNodeConfigByWorkstation: 根据 NodeType 和 WorkstationType 返回工作站特定的节点配置。
        createDefaultNodeData: 创建默认的 NodeData。
        createDefaultNodeDataWithWorkstation: 创建工作站特定的默认 NodeData。

      index.ts
        统一导出所有节点相关类型和函数。

    devices.ts (336行)
      Device (接口): 设备抽象接口，id、name、type、status、connection、metadata。
      DeviceType (类型): furnace、mfc、potentiostat、multimeter。
      DeviceStatus (类型): connected、disconnected、error、connecting。
      ConnectionInfo (接口): host、port、protocol（tcp/serial/usb）、timeout。
      DeviceMetadata (接口): manufacturer、model、serialNumber、firmwareVersion、capabilities。
      DeviceData (接口): 设备特定数据扩展点。

    index.ts
      统一导出所有类型模块。

  modules
    furnace
      FurnaceDeviceModal.tsx (363行)
        FurnaceDeviceModal (组件): 炉子设备配置模态框。
        temperatureProgram: 温度程序状态管理。
        currentSegment: 当前执行的段索引。
        startProgram: 启动温度程序，按顺序执行各段。
        stopProgram: 停止程序，冷却到室温。
        setTemperature: 设置目标温度，立即执行。
        connectionSettings: 连接参数配置表单。

      FurnaceTemperatureChart.tsx
        FurnaceTemperatureChart (组件): 温度曲线图表（Chart.js）。
       实时数据: 每秒更新当前温度点。
       历史回看: 加载历史温度数据。
       目标温度线: 显示设定温度参考线。

      ControlBar.tsx
        ControlBar (组件): 炉子控制栏（嵌入在模态框）。
        start: 启动炉子加热。
        stop: 停止加热。
        emergencyStop: 紧急停止，立即断电。

      SegmentEditor.tsx
        SegmentEditor (组件): 温度段编辑器（嵌入在模态框）。
        addSegment: 添加新段（目标温度、持续时间）。
        editSegment: 编辑现有段参数。
        deleteSegment: 删除段。
        validateSegment: 验证段时间和温度范围。

      ConnectionPanel.tsx
        ConnectionPanel (组件): 炉子连接配置面板。
        scanDevices: 扫描串口/CAN 设备。
        connect: 连接到炉子控制器。
        disconnect: 断开连接。
        connectionStatus: 显示连接状态指示器。

      PresetManager.tsx
        PresetManager (组件): 温度预设管理器。
        savePreset: 保存当前温度设置为预设。
        loadPreset: 加载预设到温度程序。
        deletePreset: 删除预设。
        exportPresets: 导出预设为 JSON。
        importPresets: 从 JSON 导入预设。

      ProgramEditor.tsx
        ProgramEditor (组件): 完整温度程序编辑器。
        multiSegment: 支持多段程序编辑。
        loopProgram: 循环执行程序。
        rampConfig: 温度斜坡速率配置。

      StatusPanel.tsx
        StatusPanel (组件): 炉子状态面板。
        currentTemperature: 实时温度显示（大字体）。
        targetTemperature: 目标温度显示。
        heatingStatus: 加热状态指示（关/开/加热/冷却）。
        safetyAlarms: 安全警报显示（过温、传感器故障）。

      segmentValidation.ts
        segmentValidation (模块): 温度段验证逻辑。
        validateDuration: 验证段时间是否大于 0。
        validateTemperatureRange: 验证温度范围在设备允许范围内。
        validateSegmentSequence: 验证段序列的连续性。

      furnaceApi.ts
        furnaceApi (API): REST API 客户端。
        connect: POST /api/devices/furnace/connect。
        disconnect: POST /api/devices/furnace/disconnect。
        setTemperature: POST /api/devices/furnace/set-temperature。
        getTemperature: GET /api/devices/furnace/temperature。
        startProgram: POST /api/devices/furnace/start-program。
        stopProgram: POST /api/devices/furnace/stop-program。

      furnaceTypes.ts
        furnaceTypes (类型定义): 炉子相关的 TypeScript 类型。
        FurnaceDevice: 炉子设备接口。
        FurnaceState: 炉子状态接口。
        TemperatureSegment: 温度段接口（目标温度、持续时间）。
        TemperatureProgram: 温度程序接口（段数组）。

      furnaceWebSocket.service.ts
        furnaceWebSocketService: WebSocket 服务。
        subscribeToTemperature: 订阅实时温度数据。
        subscribeToStatus: 订阅炉子状态变化。
        sendCommand: 发送控制命令。

      useFurnace.ts
        useFurnace (Hook): 炉子状态管理。
        furnaceState: 当前炉子状态（温度、加热、连接）。
        connectFurnace: 连接炉子。
        disconnectFurnace: 断开炉子。
        setTargetTemperature: 设置目标温度。
        getCurrentTemperature: 获取当前温度。
        startTemperatureProgram: 启动温度程序。
        stopTemperatureProgram: 停止程序。

      index.ts
        FurnaceDeviceModal 导出: 导出所有炉子组件和类型。

    mfc
      MFCDeviceCard.tsx
        MFCDeviceCard (组件): MFC 设备卡片（设备列表中显示）。
        connectionStatus: 连接状态指示（绿/红点）。
        currentFlowRate: 当前流量显示。
        targetFlowRate: 目标流量显示。
        gasType: 气体类型显示。
        quickActions: 快速操作按钮（连接、设置流量）。

      MFCModal.tsx
        MFCModal (组件): MFC 设备配置模态框。
        deviceAddress: 设备地址配置。
        gasTypeSelection: 气体类型选择下拉菜单。
        flowRateControl: 流量控制滑块或输入框。
        calibration: 校准参数配置。

      MFCConnectionPanel.tsx
        MFCConnectionPanel (组件): MFC 连接配置面板。
        scanForDevices: 扫描 COM 端口或 TCP 设备。
        connectMFC: 连接到 MFC 设备。
        disconnectMFC: 断开连接。
        connectionParams: 连接参数表单（端口、波特率、地址）。

      mfcApi.ts
        mfcApi (API): REST API 客户端。
        connect: POST /api/devices/mfc/connect。
        disconnect: POST /api/devices/mfc/disconnect。
        setFlowRate: POST /api/devices/mfc/set-flow-rate。
        getFlowRate: GET /api/devices/mfc/flow-rate。
        getDeviceInfo: GET /api/devices/mfc/info。

      mfcTypes.ts
        mfcTypes (类型定义): MFC 相关的 TypeScript 类型。
        MfcDevice: MFC 设备接口。
        MfcState: MFC 状态接口。
        GasType: 气体类型枚举（H2、N2、O2、Ar、CO2）。
        FlowRate: 流量接口（目标值、当前值、单位）。

      mfcWebSocket.service.ts (327行)
        mfcWebSocketService: WebSocket 服务。
        subscribeToFlowRate: 订阅实时流量数据。
        subscribeToDeviceStatus: 订阅设备状态变化。
        sendFlowRateCommand: 发送流量设置命令。
        deviceDiscovery: 设备发现广播。

      useMfc.ts (373行)
        useMfc (Hook): MFC 状态管理。
        mfcDevices: MFC 设备列表。
        selectedMfc: 当前选中的 MFC 设备。
        connectMfc: 连接 MFC。
        disconnectMfc: 断开 MFC。
        setTargetFlowRate: 设置目标流量。
        getCurrentFlowRate: 获取当前流量。

      index.ts
        MFCDeviceCard 导出: 导出所有 MFC 组件和类型。

  utils
    clipper.ts
      clipper (模块): 使用 ClipperLib 计算几何路径。
      generateBeltPath: 根据路径段和宽度生成带状路径（用于循环边界）。
      generateLPath: 生成 L 形路径。
      generateSmoothPath: 生成平滑曲线路径（贝塞尔曲线）。

  managers
    state-linkage.manager.ts (406行)
      state-linkage.manager (模块): 状态联动管理器（全局协调器）。
      linkNodeToDevice: 将画布节点与设备状态关联，设备状态变化自动更新节点状态。
      unlinkNodeFromDevice: 解除节点与设备的关联。
      syncExecutionState: 同步执行状态到 UI，更新按钮状态、进度条。
      updateWorkflowParameters: 将工作流参数变更应用到相关节点。
      batchLinkNodes: 批量关联节点和设备（加载工作流时）。

    canvas
      Canvas.tsx (409行)
        Canvas (组件): 核心画布组件，负责渲染节点、连线及循环层。架构已解耦：布局计算与渲染分离。
        useUnifiedLayout (Hook调用): 调用统一布局引擎 Hook，计算 layoutNodes（带坐标的节点数组）和 layoutEdges（预计算的连接线数组）。

      canvasStore.ts (250行)
        useCanvasStore (Zustand Store): 画布状态管理。

      useUnifiedLayout.ts (458行)
        useUnifiedLayout (Hook): 统一布局引擎入口，完全控制节点显示方式。

      useSimpleLoopDetection.ts (59行)
        useSimpleLoopDetection (Hook): 极简循环检测器，与后端逻辑 100% 一致。

      LoopBoundary.tsx (275行)
        LoopBoundary (组件): 渲染循环边界色带和循环信息标签。

      ComputedConnectionLines.tsx (208行)
        ComputedConnectionLines (组件): 纯渲染组件，根据预计算的 layoutEdges 数据绘制 SVG 连接线。

  contexts
    UserContext.tsx
      UserContext (Context): 用户上下文。
      currentUser: 当前登录用户。
      userPermissions: 用户权限列表。
      login/logout: 登录登出函数。

  services
    api.ts
      api (模块): Axios 封装的基础 HTTP 客户端。
      get: 封装 GET 请求。
      post: 封装 POST 请求。
      put: 封装 PUT 请求。
      patch: 封装 PATCH 请求。
      delete: 封装 DELETE 请求。
      request拦截器: 添加认证 token。
      response拦截器: 统一错误处理。

    api
      zahnerApi.ts
        zahnerApi (模块): Zahner 设备专用 API。
        connectPotentiostat: 连接电化学工作站。
        startEIS: 启动 EIS 测量。
        stopEIS: 停止 EIS 测量。
        getEISData: 获取 EIS 数据。
        getPotentiostatStatus: 获取设备状态.

  main.tsx
    main (入口): React 应用入口。
    ReactDOM.render: 挂载 App 组件到 #root。
    Store 初始化: 初始化所有 Zustand Store。
    Service 初始化: 初始化 WebSocket 连接。
    全局配置: 加载应用配置。

  App.tsx (310行)
    App (根组件): 应用根组件，负责路由和全局布局。
    TopNavbar: 顶部导航栏。
    Sidebar: 左侧节点库。
    Canvas: 核心画布区域。
    PropertyPanel: 右侧属性面板。
    DataViewer: 数据查看器（可切换显示）。
    StatusBar: 底部状态栏。
    NotificationPanel: 通知面板。
    ModalContainer: 模态框容器。
    UserContext.Provider: 提供用户上下文。
    Routes: React Router 路由配置.

  shared
    utils
      glassEffect.ts (176行)
        GlassEffect (类): 毛玻璃反光效果，支持鼠标跟随、3D 倾斜、边缘高亮。
        init: 初始化效果，为所有 .glass 元素添加反光元素。
        setupElementEffects: 为单个元素设置鼠标事件监听。
        updateShineEffect: 更新反光位置和效果。
        destroy: 清理所有效果元素和事件监听。
        setupAutoGlassEffect: 自动初始化所有玻璃态元素.


 潜在风险与改进点（需要关注的地方）
上帝组件（God Components）的出现
问题文件：PropertyPanel.tsx (1058 行)
风险：这个文件太大了。它包含了温度、MFC、EIS、循环等所有节点类型的表单逻辑。
建议：这是下一个重构的重点。应该应用策略模式，将每种 Node 的表单拆分为独立的子组件（如 TemperatureForm, GasFlowForm），PropertyPanel 只负责根据 node.type 进行分发。
类型定义的臃肿
问题文件：types/nodes/types.ts (971 行)
风险：所有的节点类型定义都塞在一个文件里。随着节点类型增加，这个文件会变得难以维护，且容易产生合并冲突。
建议：按领域拆分。例如 types/nodes/core.ts (基础接口), types/nodes/electrochemical.ts (电化学相关), types/nodes/control.ts (控制流相关)。
部分 UI 逻辑与业务逻辑耦合
问题文件：WorkflowManagerUI.tsx (706 行)
风险：UI 组件里包含了不少数据处理逻辑（如过滤、排序）。
建议：可以考虑引入自定义 Hook（如 useWorkflowList）来封装列表的加载、筛选和排序逻辑，让 UI 组件只负责展示。
文件路径管理的复杂性
观察：FilePathManagerUI.tsx 处理了比较复杂的文件系统交互。
建议：如果后续文件操作变多，建议将文件系统相关的逻辑抽离为 useFileSystem hook，模仿操作系统的文件操作接口。