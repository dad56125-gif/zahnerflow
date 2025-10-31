import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, test, expect } from 'vitest';
import { LoopBoundary } from '../LoopBoundary';
import { LoopStartNode, LoopEndNode } from '../../nodes/types';

// Mock loopContextManager
vi.mock('../../services/LoopContextManager', () => ({
  loopContextManager: {
    validateLoopPair: vi.fn(() => true),
    getLoopLevel: vi.fn(() => 0),
    getCurrentLoop: vi.fn(() => ({
      loopId: 'test-loop-1',
      currentIteration: 0,
      iterations: 5
    })),
    getLoopPair: vi.fn(() => ({ startNodeId: 'start-1', endNodeId: 'end-1' }))
  }
}));

describe('LoopBoundary SVG Rendering', () => {
  const mockStartNode: LoopStartNode = {
    id: 'start-1',
    type: 'loopStart',
    position: { x: 100, y: 100 },
    data: {
      parameters: {
        loop_id: 'test-loop-1',
        loop_variable: 'i',
        start_value: 0,
        end_value: 5,
        step: 1
      }
    }
  };

  const mockEndNode: LoopEndNode = {
    id: 'end-1',
    type: 'loopEnd',
    position: { x: 400, y: 300 },
    data: {
      parameters: {
        loop_id: 'test-loop-1'
      }
    }
  };

  const mockNodesInLoop = [
    { id: 'node-1', position: { x: 200, y: 200 } },
    { id: 'node-2', position: { x: 300, y: 250 } }
  ];

  test('renders SVG boundary instead of div border', () => {
    render(
      <LoopBoundary
        startNode={mockStartNode}
        endNode={mockEndNode}
        nodesInLoop={mockNodesInLoop}
      />
    );

    // 应该渲染SVG元素而不是div
    const svgElement = document.querySelector('svg');
    expect(svgElement).toBeInTheDocument();

    // 不应该有bracket-container类（旧实现）
    const bracketContainer = document.querySelector('.bracket-container');
    expect(bracketContainer).not.toBeInTheDocument();
  });

  test('calculates correct boundary path around all nodes', () => {
    render(
      <LoopBoundary
        startNode={mockStartNode}
        endNode={mockEndNode}
        nodesInLoop={mockNodesInLoop}
      />
    );

    // 应该有一个路径元素
    const pathElement = document.querySelector('path');
    expect(pathElement).toBeInTheDocument();

    // 路径应该有d属性（路径数据）
    expect(pathElement).toHaveAttribute('d');

    // 路径应该是闭合的（以Z结尾）
    const pathData = pathElement?.getAttribute('d');
    expect(pathData).toMatch(/Z$/);
  });

  test('displays loop information label', () => {
    render(
      <LoopBoundary
        startNode={mockStartNode}
        endNode={mockEndNode}
        nodesInLoop={mockNodesInLoop}
      />
    );

    // 应该显示循环ID
    expect(screen.getByText('test-loop-1')).toBeInTheDocument();

    // 应该显示循环变量
    expect(screen.getByText(/i = /)).toBeInTheDocument();

    // 应该显示迭代信息
    expect(screen.getByText('1/5')).toBeInTheDocument();
  });

  test('applies correct colors based on loop level', () => {
    render(
      <LoopBoundary
        startNode={mockStartNode}
        endNode={mockEndNode}
        nodesInLoop={mockNodesInLoop}
      />
    );

    const svgElement = document.querySelector('svg');

    // level 0 应该是橙色
    const pathElement = svgElement?.querySelector('path');
    expect(pathElement).toHaveAttribute('stroke', '#FF9800');
    expect(pathElement).toHaveAttribute('fill', 'rgba(255, 152, 0, 0.1)');
  });

  test('handles irregular node arrangements', () => {
    const irregularNodes = [
      { id: 'node-1', position: { x: 150, y: 100 } },
      { id: 'node-2', position: { x: 450, y: 150 } },
      { id: 'node-3', position: { x: 350, y: 350 } },
      { id: 'node-4', position: { x: 50, y: 300 } }
    ];

    render(
      <LoopBoundary
        startNode={mockStartNode}
        endNode={mockEndNode}
        nodesInLoop={irregularNodes}
      />
    );

    // 应该创建凸包或合适的多边形路径
    const pathElement = document.querySelector('path');
    const pathData = pathElement?.getAttribute('d');

    // 路径应该包含所有外围点
    expect(pathData).toBeDefined();
    expect(pathData?.length).toBeGreaterThan(20);
  });

  test('returns null when boundary is invalid', () => {
    const invalidStartNode = {
      ...mockStartNode,
      position: null
    };

    const { container } = render(
      <LoopBoundary
        startNode={invalidStartNode}
        endNode={mockEndNode}
        nodesInLoop={mockNodesInLoop}
      />
    );

    // 应该返回null，不渲染任何内容
    expect(container.firstChild).toBeNull();
  });
});