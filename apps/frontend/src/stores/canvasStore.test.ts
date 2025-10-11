import { describe, test, expect, beforeEach } from 'vitest';
import { useCanvasStore } from './canvasStore';
import { act } from '@testing-library/react';

// Mock data needed for tests
const mockWorkstation = 'zahner-zennium';

describe('useCanvasStore', () => {
  // Reset store state before each test
  beforeEach(() => {
    act(() => {
      useCanvasStore.getState().clearCanvas();
      useCanvasStore.setState({ canvasSize: { width: 800, height: 600 } });
    });
  });

  test('should have correct initial state', () => {
    const { nodes, connections, selectedNode } = useCanvasStore.getState();
    expect(nodes).toEqual([]);
    expect(connections).toEqual([]);
    expect(selectedNode).toBeNull();
  });

  test('addNode should add a new node to the canvas', () => {
    act(() => {
      useCanvasStore.getState().addNode('ocp_measurement', mockWorkstation);
    });

    const { nodes } = useCanvasStore.getState();
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('ocp_measurement');
    expect(nodes[0].position.x).toBeGreaterThanOrEqual(0);
  });

  test('addNode should insert a node at a specific index', () => {
    act(() => {
      useCanvasStore.getState().addNode('ocp_measurement', mockWorkstation);
      useCanvasStore.getState().addNode('chronoamperometry', mockWorkstation);
      useCanvasStore.getState().addNode('wait_delay', mockWorkstation, 1); // Insert at index 1
    });

    const { nodes } = useCanvasStore.getState();
    expect(nodes).toHaveLength(3);
    expect(nodes[1].type).toBe('wait_delay');
    expect(nodes[0].type).toBe('ocp_measurement');
    expect(nodes[2].type).toBe('chronoamperometry');
  });

  test('deleteNode should remove a node and update selection', () => {
    let nodeId: string;
    act(() => {
      useCanvasStore.getState().addNode('ocp_measurement', mockWorkstation);
      nodeId = useCanvasStore.getState().nodes[0].id;
      useCanvasStore.getState().selectNode(useCanvasStore.getState().nodes[0]);
    });

    expect(useCanvasStore.getState().selectedNode).not.toBeNull();

    act(() => {
      useCanvasStore.getState().deleteNode(nodeId);
    });

    const { nodes, selectedNode } = useCanvasStore.getState();
    expect(nodes).toHaveLength(0);
    expect(selectedNode).toBeNull();
  });

  test('updateNode should modify an existing node', () => {
    let nodeToUpdate: any;
    act(() => {
      useCanvasStore.getState().addNode('ocp_measurement', mockWorkstation);
      nodeToUpdate = { ...useCanvasStore.getState().nodes[0] };
    });

    const newName = 'Updated OCP Node';
    nodeToUpdate.name = newName;

    act(() => {
      useCanvasStore.getState().updateNode(nodeToUpdate);
    });

    const { nodes } = useCanvasStore.getState();
    expect(nodes[0].name).toBe(newName);
  });

  test('clearCanvas should reset the store', () => {
    act(() => {
      useCanvasStore.getState().addNode('ocp_measurement', mockWorkstation);
      useCanvasStore.getState().selectNode(useCanvasStore.getState().nodes[0]);
    });

    act(() => {
      useCanvasStore.getState().clearCanvas();
    });

    const { nodes, connections, selectedNode } = useCanvasStore.getState();
    expect(nodes).toEqual([]);
    expect(connections).toEqual([]);
    expect(selectedNode).toBeNull();
  });

  test('recalculateNodePositions should update positions on canvas resize', () => {
    act(() => {
        useCanvasStore.getState().addNode('ocp_measurement', mockWorkstation);
        useCanvasStore.getState().addNode('chronoamperometry', mockWorkstation);
    });
    
    const initialNodes = useCanvasStore.getState().nodes;
    const initialPosition = initialNodes[1].position;

    // Simulate canvas resize
    act(() => {
        useCanvasStore.setState({ canvasSize: { width: 400, height: 600 } });
        useCanvasStore.getState().recalculateNodePositions();
    });

    const updatedNodes = useCanvasStore.getState().nodes;
    const updatedPosition = updatedNodes[1].position;

    // With a smaller canvas, the second node should be on a new line, so its Y position should change.
    expect(updatedPosition.y).not.toBe(initialPosition.y);
  });
});
