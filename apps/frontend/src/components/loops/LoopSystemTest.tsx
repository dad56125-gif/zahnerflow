/**
 * 循环系统测试组件
 *
 * 提供循环系统功能的测试和验证
 * 包含测试用例、调试工具和性能监控
 */

import React, { useState, useEffect } from 'react';
import { ElectrochemicalNode, NodeType } from '../../nodes/types';
import {
  LoopDetector,
  LoopContextManager,
  type LoopInfo,
  type LoopDetectionResult,
  type LoopExecutionContext
} from './index';

// 测试组件属性接口
export interface LoopSystemTestProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 循环系统测试组件
 */
export const LoopSystemTest: React.FC<LoopSystemTestProps> = ({
  className = '',
  style = {}
}) => {
  const [testNodes, setTestNodes] = useState<ElectrochemicalNode[]>([]);
  const [testConnections, setTestConnections] = useState<Array<{ sourceId: string; targetId: string }>>([]);
  const [detectionResult, setDetectionResult] = useState<LoopDetectionResult | null>(null);
  const [testResults, setTestResults] = useState<Array<{
    testName: string;
    status: 'pass' | 'fail' | 'pending';
    message: string;
    duration: number;
  }>>([]);

  // 创建测试节点
  const createTestNodes = () => {
    const nodes: ElectrochemicalNode[] = [
      {
        id: 'node-1',
        name: '开路电位测量',
        type: 'ocp_measurement',
        position: { x: 100, y: 100 },
        style: { width: 140, height: 60 },
        data: {
          parameters: {
            duration: 30,
            sampling_rate: 1.0
          }
        },
        status: 'ready'
      },
      {
        id: 'loop-start-1',
        name: '循环开始',
        type: 'loop_start',
        position: { x: 300, y: 100 },
        style: { width: 140, height: 60 },
        data: {
          parameters: {
            loop_id: 'loop-1',
            iteration_count: 5,
            delay_ms: 100
          }
        },
        status: 'ready'
      },
      {
        id: 'node-3',
        name: '计时安培法',
        type: 'chronoamperometry',
        position: { x: 500, y: 100 },
        style: { width: 140, height: 60 },
        data: {
          parameters: {
            potential: 0.5,
            duration: 60
          }
        },
        status: 'ready'
      },
      {
        id: 'loop-end-1',
        name: '循环结束',
        type: 'loop_end',
        position: { x: 700, y: 100 },
        style: { width: 140, height: 60 },
        data: {
          parameters: {
            loop_id: 'loop-1'
          }
        },
        status: 'ready'
      },
      {
        id: 'node-5',
        name: '电化学阻抗谱',
        type: 'eis_potentiostatic',
        position: { x: 900, y: 100 },
        style: { width: 140, height: 60 },
        data: {
          parameters: {
            potential: 0.3,
            frequency_range: '1MHz-1Hz'
          }
        },
        status: 'ready'
      }
    ];

    const connections = [
      { sourceId: 'node-1', targetId: 'loop-start-1' },
      { sourceId: 'loop-start-1', targetId: 'node-3' },
      { sourceId: 'node-3', targetId: 'loop-end-1' },
      { sourceId: 'loop-end-1', targetId: 'loop-start-1' },
      { sourceId: 'loop-end-1', targetId: 'node-5' }
    ];

    setTestNodes(nodes);
    setTestConnections(connections);
  };

  // 运行循环检测测试
  const runLoopDetectionTest = async () => {
    const startTime = Date.now();

    try {
      const result = LoopDetector.detectLoops(testNodes, testConnections);
      const duration = Date.now() - startTime;

      setDetectionResult(result);

      const testResult = {
        testName: '循环检测测试',
        status: result.loops.length > 0 ? 'pass' : 'fail' as 'pass' | 'fail',
        message: result.loops.length > 0
          ? `检测到 ${result.loops.length} 个循环`
          : '未检测到循环',
        duration
      };

      setTestResults(prev => [...prev, testResult]);
    } catch (error) {
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        testName: '循环检测测试',
        status: 'fail',
        message: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
        duration
      }]);
    }
  };

  // 运行循环上下文测试
  const runLoopContextTest = async () => {
    const startTime = Date.now();

    try {
      if (!detectionResult || detectionResult.loops.length === 0) {
        throw new Error('没有可测试的循环');
      }

      const loop = detectionResult.loops[0];
      const context = LoopContextManager.initializeLoop(loop);

      // 测试状态更新
      LoopContextManager.pauseLoop(loop.id);
      LoopContextManager.resumeLoop(loop.id);
      LoopContextManager.resetLoop(loop.id);

      const finalContext = LoopContextManager.getLoopContext(loop.id);

      const duration = Date.now() - startTime;

      const testResult = {
        testName: '循环上下文测试',
        status: finalContext ? 'pass' : 'fail' as 'pass' | 'fail',
        message: finalContext ? '上下文操作成功' : '上下文操作失败',
        duration
      };

      setTestResults(prev => [...prev, testResult]);
    } catch (error) {
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        testName: '循环上下文测试',
        status: 'fail',
        message: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
        duration
      }]);
    }
  };

  // 运行循环验证测试
  const runLoopValidationTest = async () => {
    const startTime = Date.now();

    try {
      if (!detectionResult || detectionResult.loops.length === 0) {
        throw new Error('没有可验证的循环');
      }

      const loop = detectionResult.loops[0];
      const validation = LoopDetector.validateLoop(loop, testNodes);

      const duration = Date.now() - startTime;

      const testResult = {
        testName: '循环验证测试',
        status: validation.isValid ? 'pass' : 'fail' as 'pass' | 'fail',
        message: validation.isValid
          ? '循环验证通过'
          : `验证失败: ${validation.errors.join(', ')}`,
        duration
      };

      setTestResults(prev => [...prev, testResult]);
    } catch (error) {
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        testName: '循环验证测试',
        status: 'fail',
        message: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
        duration
      }]);
    }
  };

  // 运行性能测试
  const runPerformanceTest = async () => {
    const startTime = Date.now();

    try {
      // 创建大量节点进行性能测试
      const largeNodeSet: ElectrochemicalNode[] = [];
      const largeConnectionSet: Array<{ sourceId: string; targetId: string }> = [];

      for (let i = 0; i < 100; i++) {
        const node: ElectrochemicalNode = {
          id: `perf-node-${i}`,
          name: `性能测试节点 ${i}`,
          type: i % 2 === 0 ? 'ocp_measurement' : 'chronoamperometry',
          position: { x: (i % 10) * 150, y: Math.floor(i / 10) * 100 },
          style: { width: 140, height: 60 },
          data: { parameters: {} },
          status: 'ready'
        };
        largeNodeSet.push(node);

        if (i > 0) {
          largeConnectionSet.push({
            sourceId: `perf-node-${i - 1}`,
            targetId: `perf-node-${i}`
          });
        }
      }

      // 添加循环
      largeNodeSet.push({
        id: 'perf-loop-start',
        name: '性能测试循环开始',
        type: 'loop_start',
        position: { x: 150, y: 200 },
        style: { width: 140, height: 60 },
        data: {
          parameters: {
            loop_id: 'perf-loop',
            iteration_count: 10
          }
        },
        status: 'ready'
      });

      largeNodeSet.push({
        id: 'perf-loop-end',
        name: '性能测试循环结束',
        type: 'loop_end',
        position: { x: 450, y: 200 },
        style: { width: 140, height: 60 },
        data: {
          parameters: {
            loop_id: 'perf-loop'
          }
        },
        status: 'ready'
      });

      largeConnectionSet.push(
        { sourceId: 'perf-node-49', targetId: 'perf-loop-start' },
        { sourceId: 'perf-loop-start', targetId: 'perf-node-50' },
        { sourceId: 'perf-node-99', targetId: 'perf-loop-end' },
        { sourceId: 'perf-loop-end', targetId: 'perf-loop-start' }
      );

      const result = LoopDetector.detectLoops(largeNodeSet, largeConnectionSet);
      const duration = Date.now() - startTime;

      const testResult = {
        testName: '性能测试 (100节点)',
        status: duration < 1000 ? 'pass' : 'fail' as 'pass' | 'fail',
        message: `检测耗时: ${duration}ms, 发现循环: ${result.loops.length}`,
        duration
      };

      setTestResults(prev => [...prev, testResult]);
    } catch (error) {
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        testName: '性能测试',
        status: 'fail',
        message: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
        duration
      }]);
    }
  };

  // 运行所有测试
  const runAllTests = async () => {
    setTestResults([]);

    await runLoopDetectionTest();
    await new Promise(resolve => setTimeout(resolve, 100));

    await runLoopContextTest();
    await new Promise(resolve => setTimeout(resolve, 100));

    await runLoopValidationTest();
    await new Promise(resolve => setTimeout(resolve, 100));

    await runPerformanceTest();
  };

  // 清除测试结果
  const clearResults = () => {
    setTestResults([]);
    setDetectionResult(null);
  };

  // 计算测试统计
  const testStats = {
    total: testResults.length,
    passed: testResults.filter(r => r.status === 'pass').length,
    failed: testResults.filter(r => r.status === 'fail').length,
    totalDuration: testResults.reduce((sum, r) => sum + r.duration, 0)
  };

  return (
    <div className={`loop-system-test ${className}`} style={style}>
      <div className="test-header">
        <h3>循环系统测试</h3>
        <div className="test-controls">
          <button className="btn-test" onClick={createTestNodes}>
            创建测试数据
          </button>
          <button
            className="btn-test"
            onClick={runAllTests}
            disabled={testNodes.length === 0}
          >
            运行所有测试
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

      {/* 循环检测结果 */}
      {detectionResult && (
        <div className="detection-result">
          <h4>循环检测结果</h4>
          <div className="result-summary">
            <div>检测到的循环: {detectionResult.loops.length}</div>
            <div>孤立的开始节点: {detectionResult.orphanStartNodes.length}</div>
            <div>孤立的结束节点: {detectionResult.orphanEndNodes.length}</div>
            <div>嵌套循环: {detectionResult.nestedLoops.length}</div>
            <div>无效连接: {detectionResult.invalidConnections.length}</div>
          </div>

          {detectionResult.loops.length > 0 && (
            <div className="loops-details">
              <h5>循环详情:</h5>
              {detectionResult.loops.map((loop, index) => (
                <div key={index} className="loop-detail">
                  <div>循环ID: {loop.id}</div>
                  <div>开始节点: {loop.startNodeId}</div>
                  <div>结束节点: {loop.endNodeId}</div>
                  <div>迭代次数: {loop.iterationCount}</div>
                  <div>包含节点: {loop.nodeIds.join(', ')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 测试数据信息 */}
      {testNodes.length > 0 && (
        <div className="test-data-info">
          <h4>测试数据</h4>
          <div>节点数量: {testNodes.length}</div>
          <div>连接数量: {testConnections.length}</div>
          <div>
            节点类型: {Array.from(new Set(testNodes.map(n => n.type))).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoopSystemTest;