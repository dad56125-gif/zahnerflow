/**
 * 工作流测试组件
 *
 * 提供工作流功能的测试和验证
 * 包含导出、导入和配置管理的测试用例
 */

import React, { useState } from 'react';
import { ElectrochemicalNode } from '../../nodes/types';
import { LoopInfo } from '../loops/LoopDetector';
import {
  WorkflowManager,
  WorkflowExporter,
  WorkflowImporter,
  type WorkflowData,
  type WorkflowExportOptions,
  type WorkflowImportOptions
} from './index';

// 工作流测试组件属性接口
export interface WorkflowTestProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 工作流测试组件
 */
export const WorkflowTest: React.FC<WorkflowTestProps> = ({
  className = '',
  style = {}
}) => {
  const [testResults, setTestResults] = useState<Array<{
    testName: string;
    status: 'pass' | 'fail' | 'pending';
    message: string;
    duration: number;
  }>>([]);

  // 创建测试数据
  const createTestData = () => {
    const nodes: ElectrochemicalNode[] = [
      {
        id: 'test-node-1',
        name: '测试节点1',
        type: 'ocp_measurement',
        position: { x: 100, y: 100 },
        style: { width: 140, height: 60 },
        data: { parameters: { duration: 30 } },
        status: 'ready'
      },
      {
        id: 'test-node-2',
        name: '测试节点2',
        type: 'chronoamperometry',
        position: { x: 300, y: 100 },
        style: { width: 140, height: 60 },
        data: { parameters: { potential: 0.5 } },
        status: 'ready'
      }
    ];

    const connections = [
      { id: 'test-conn-1', sourceId: 'test-node-1', targetId: 'test-node-2' }
    ];

    const loops: LoopInfo[] = [];

    return { nodes, connections, loops };
  };

  // 测试工作流导出
  const testWorkflowExport = async () => {
    const startTime = Date.now();
    const { nodes, connections, loops } = createTestData();

    try {
      const metadata = {
        name: '测试工作流',
        description: '这是一个测试工作流',
        author: '测试用户',
        tags: ['test'],
        created_at: Date.now(),
        updated_at: Date.now()
      };

      const settings = WorkflowManager.getDefaultSettings();
      const exportOptions: WorkflowExportOptions = {
        includeMetadata: true,
        includeSettings: true,
        format: 'json',
        prettyPrint: true
      };

      const result = await WorkflowManager.exportWorkflow(
        nodes,
        connections,
        loops,
        metadata,
        settings,
        exportOptions
      );

      const duration = Date.now() - startTime;

      setTestResults(prev => [...prev, {
        testName: '工作流导出测试',
        status: 'pass',
        message: `导出成功，文件名: ${result.filename}`,
        duration
      }]);

      return result.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        testName: '工作流导出测试',
        status: 'fail',
        message: `导出失败: ${error instanceof Error ? error.message : '未知错误'}`,
        duration
      }]);
      return null;
    }
  };

  // 测试工作流导入
  const testWorkflowImport = async (exportData: string) => {
    const startTime = Date.now();

    try {
      const importOptions: WorkflowImportOptions = {
        validateStructure: true,
        mergeWithExisting: false,
        preserveIds: false,
        upgradeVersion: true
      };

      const { workflow, validation } = await WorkflowManager.importWorkflow(
        exportData,
        'json',
        importOptions
      );

      const duration = Date.now() - startTime;

      setTestResults(prev => [...prev, {
        testName: '工作流导入测试',
        status: validation.isValid ? 'pass' : 'fail',
        message: validation.isValid
          ? `导入成功，节点数: ${workflow.nodes.length}`
          : `导入验证失败: ${validation.errors.join(', ')}`,
        duration
      }]);

      return workflow;
    } catch (error) {
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        testName: '工作流导入测试',
        status: 'fail',
        message: `导入失败: ${error instanceof Error ? error.message : '未知错误'}`,
        duration
      }]);
      return null;
    }
  };

  // 测试工作流验证
  const testWorkflowValidation = () => {
    const startTime = Date.now();
    const { nodes, connections, loops } = createTestData();

    try {
      const workflow = WorkflowManager.createWorkflowConfig(
        '验证测试工作流',
        nodes,
        connections,
        loops
      );

      const validation = WorkflowManager.validateWorkflow(workflow);
      const duration = Date.now() - startTime;

      setTestResults(prev => [...prev, {
        testName: '工作流验证测试',
        status: validation.isValid ? 'pass' : 'fail',
        message: validation.isValid
          ? '验证通过'
          : `验证失败: ${validation.errors.join(', ')}`,
        duration
      }]);

      return validation;
    } catch (error) {
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        testName: '工作流验证测试',
        status: 'fail',
        message: `验证失败: ${error instanceof Error ? error.message : '未知错误'}`,
        duration
      }]);
      return null;
    }
  };

  // 测试工作流比较
  const testWorkflowComparison = () => {
    const startTime = Date.now();

    try {
      const { nodes: nodes1, connections: connections1, loops: loops1 } = createTestData();
      const { nodes: nodes2, connections: connections2, loops: loops2 } = createTestData();

      // 修改第二个工作流
      nodes2.push({
        id: 'test-node-3',
        name: '新增节点',
        type: 'eis_potentiostatic',
        position: { x: 500, y: 100 },
        style: { width: 140, height: 60 },
        data: { parameters: {} },
        status: 'ready'
      });

      const workflow1 = WorkflowManager.createWorkflowConfig('工作流1', nodes1, connections1, loops1);
      const workflow2 = WorkflowManager.createWorkflowConfig('工作流2', nodes2, connections2, loops2);

      const comparison = WorkflowManager.compareWorkflows(workflow1, workflow2);
      const duration = Date.now() - startTime;

      setTestResults(prev => [...prev, {
        testName: '工作流比较测试',
        status: 'pass',
        message: `比较完成: 新增${comparison.added.length}个节点，修改${comparison.modified.length}个节点`,
        duration
      }]);

      return comparison;
    } catch (error) {
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        testName: '工作流比较测试',
        status: 'fail',
        message: `比较失败: ${error instanceof Error ? error.message : '未知错误'}`,
        duration
      }]);
      return null;
    }
  };

  // 运行完整测试套件
  const runFullTestSuite = async () => {
    setTestResults([]);

    // 测试导出
    const exportData = await testWorkflowExport();
    await new Promise(resolve => setTimeout(resolve, 100));

    // 测试导入
    if (exportData) {
      await testWorkflowImport(exportData);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 测试验证
    testWorkflowValidation();
    await new Promise(resolve => setTimeout(resolve, 100));

    // 测试比较
    testWorkflowComparison();
  };

  // 清除测试结果
  const clearResults = () => {
    setTestResults([]);
  };

  // 计算测试统计
  const testStats = {
    total: testResults.length,
    passed: testResults.filter(r => r.status === 'pass').length,
    failed: testResults.filter(r => r.status === 'fail').length,
    totalDuration: testResults.reduce((sum, r) => sum + r.duration, 0)
  };

  return (
    <div className={`workflow-test ${className}`} style={style}>
      <div className="test-header">
        <h3>工作流功能测试</h3>
        <div className="test-controls">
          <button className="btn-test" onClick={runFullTestSuite}>
            运行完整测试
          </button>
          <button className="btn-test" onClick={clearResults}>
            清除结果
          </button>
        </div>
      </div>

      {/* 测试结果统计 */}
      {testResults.length > 0 && (
        <div className="test-stats">
          <div className="stat-item">
            <span className="stat-label">总计:</span>
            <span className="stat-value">{testStats.total}</span>
          </div>
          <div className="stat-item passed">
            <span className="stat-label">通过:</span>
            <span className="stat-value">{testStats.passed}</span>
          </div>
          <div className="stat-item failed">
            <span className="stat-label">失败:</span>
            <span className="stat-value">{testStats.failed}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">总耗时:</span>
            <span className="stat-value">{testStats.totalDuration}ms</span>
          </div>
        </div>
      )}

      {/* 测试结果列表 */}
      <div className="test-results">
        {testResults.map((result, index) => (
          <div
            key={index}
            className={`test-result ${result.status}`}
          >
            <div className="result-header">
              <span className="result-name">{result.testName}</span>
              <span className={`result-status ${result.status}`}>
                {result.status === 'pass' ? '✅ 通过' :
                 result.status === 'fail' ? '❌ 失败' : '⏳ 待定'}
              </span>
              <span className="result-duration">{result.duration}ms</span>
            </div>
            <div className="result-message">{result.message}</div>
          </div>
        ))}
      </div>

      {/* 单独测试按钮 */}
      <div className="individual-tests">
        <h4>单独测试</h4>
        <div className="test-buttons">
          <button className="btn-individual" onClick={testWorkflowExport}>
            测试导出
          </button>
          <button className="btn-individual" onClick={() => testWorkflowExport().then(data => data && testWorkflowImport(data))}>
            测试导出+导入
          </button>
          <button className="btn-individual" onClick={testWorkflowValidation}>
            测试验证
          </button>
          <button className="btn-individual" onClick={testWorkflowComparison}>
            测试比较
          </button>
        </div>
      </div>

      {/* 测试说明 */}
      <div className="test-info">
        <h4>测试说明</h4>
        <ul>
          <li><strong>导出测试</strong>: 验证工作流能否正确导出为JSON格式</li>
          <li><strong>导入测试</strong>: 验证导出的工作流能否正确导入</li>
          <li><strong>验证测试</strong>: 验证工作流结构的完整性和有效性</li>
          <li><strong>比较测试</strong>: 验证工作流差异检测功能</li>
        </ul>
      </div>
    </div>
  );
};

export default WorkflowTest;