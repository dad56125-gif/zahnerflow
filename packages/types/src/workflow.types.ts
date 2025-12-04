// 工作流特定类型定义 - API协议层

// 工作流验证结果 - API协议
export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];  // 验证错误列表
  warnings: string[];  // 验证警告列表
}