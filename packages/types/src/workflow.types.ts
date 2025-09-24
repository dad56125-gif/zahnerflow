// 工作流特定类型定义 - 基于实际后端API实现

// 实际的工作流验证结果 - 对应后端 validateWorkflow() 方法
export interface ActualWorkflowValidationResult {
  valid: boolean;
  errors: string[];  // 简化版本，与后端实现一致
  warnings: string[];  // 简化版本，与后端实现一致
}

// 删除了以下无用接口，因为实际API中不存在：
// - WorkflowTemplate (没有模板系统)
// - WorkflowSchedule (没有调度系统) 
// - WorkflowStatistics (没有统计系统)
// - WorkflowExportData (没有导出/导入功能)
// - ValidationError/ValidationWarning (后端只返回简单字符串数组)
// - WorkflowExecutionHistory (没有历史记录系统)
// - NodeUsage (没有节点使用统计)