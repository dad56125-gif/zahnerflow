# Wait/Delay Node Implementation Plan

## Overview

This document provides a comprehensive plan for implementing a wait/delay node in the ZahnerFlow electrochemical workflow management system. The wait/delay node will pause workflow execution for a specified time period, allowing for timing control between measurements or other operations.

## Architecture Context

The ZahnerFlow system is a monorepo with:
- **Frontend**: React application using TypeScript
- **Backend**: NestJS application with TypeScript
- **Shared Types**: Package for common type definitions
- **Node Pattern**: Each node type has a frontend component and backend execution logic

## Node Specifications

### Node Type
- **Type**: `wait_delay`
- **Category**: `flow_control`
- **Name**: "Wait/Delay"
- **Description**: "Pauses workflow execution for a specified duration"

### Parameters
- `duration`: number (required) - Duration to wait in seconds (default: 1)
- `description`: string (optional) - Description of the wait purpose
- `allow_cancel`: boolean (optional) - Whether the wait can be cancelled (default: true)

## Implementation Plan

### 1. Type Definitions Updates

**File**: `packages/types/src/workflow.types.ts`

Add the wait/delay node type to the NodeType union:

```typescript
export type NodeType =
  // ... existing types ...
  | 'wait_delay'  // Wait/Delay node
  | 'loop_start'  // Existing
  | 'loop_end';   // Existing
```

### 2. Frontend Implementation

#### 2.1 Node Component

**File**: `apps/frontend/src/nodes/wait-delay.node.tsx`

```typescript
import React, { useState } from 'react';

interface NodeComponentProps {
  node: any;
  onUpdate: (node: any) => void;
}

interface ParameterInputProps {
  label: string;
  type: 'number' | 'text' | 'boolean';
  value: any;
  onChange: (value: any) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  unit?: string;
}

const ParameterInput: React.FC<ParameterInputProps> = ({
  label,
  type,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  unit
}) => {
  return (
    <div className="parameter-group">
      <label className="parameter-label">
        {label}
        {unit && <span className="parameter-unit">({unit})</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(
          type === 'number' ? parseFloat(e.target.value) :
          type === 'boolean' ? e.target.checked : e.target.value
        )}
        min={min}
        max={max}
        step={step}
        className="parameter-input"
        placeholder={placeholder}
        checked={type === 'boolean' ? value : undefined}
      />
    </div>
  );
};

export const WaitDelayNode: React.FC<NodeComponentProps> = ({ node, onUpdate }) => {
  const [parameters, setParameters] = useState(node.parameters || {
    duration: 1.0,
    description: '',
    allow_cancel: true
  });

  const handleParameterChange = (key: string, value: any) => {
    const newParameters = { ...parameters, [key]: value };
    setParameters(newParameters);
    onUpdate({ ...node, parameters: newParameters });
  };

  return (
    <div className="node-content">
      <div className="node-header">
        <span className="node-icon">⏱️</span>
        <span className="node-title">Wait/Delay</span>
      </div>

      <div className="node-parameters">
        <ParameterInput
          label="Duration"
          type="number"
          value={parameters.duration}
          onChange={(value) => handleParameterChange('duration', value)}
          min={0.1}
          max={86400} // 24 hours
          step={0.1}
          unit="seconds"
          placeholder="1.0"
        />

        <ParameterInput
          label="Description"
          type="text"
          value={parameters.description}
          onChange={(value) => handleParameterChange('description', value)}
          placeholder="Purpose of the wait"
        />

        <ParameterInput
          label="Allow Cancel"
          type="boolean"
          value={parameters.allow_cancel}
          onChange={(value) => handleParameterChange('allow_cancel', value)}
        />
      </div>
    </div>
  );
};
```

#### 2.2 Node Type Registration

**File**: `apps/frontend/src/nodes/types.ts`

Update the NodeType type and NODE_CONFIGS:

```typescript
// Add to NodeType union
export type NodeType =
  // ... existing types ...
  | 'wait_delay'  // Wait/Delay node
  // ... rest of types ...

// Add to NODE_CONFIGS
wait_delay: {
  type: 'wait_delay',
  name: 'Wait/Delay',
  category: 'flow_control',
  description: 'Pauses workflow execution for a specified duration',
  icon: '⏱️',
  input: {
    id: 'input',
    name: 'Input',
    dataType: 'flow',
    description: 'Flow control input'
  },
  output: {
    id: 'output',
    name: 'Output',
    dataType: 'flow',
    description: 'Flow control output'
  },
  style: {
    width: 140,
    height: 60,
    background: 'linear-gradient(135deg, #FF9800, #F57C00)',
    borderColor: '#F57C00',
    borderRadius: '8px',
    textColor: '#ffffff',
    icon: '⏱️'
  },
  defaultParameters: {
    duration: 1.0,
    description: '',
    allow_cancel: true
  }
}
```

#### 2.3 Node Mapping

**File**: Update the node component mapping in the main App component or wherever node components are registered:

```typescript
// Import the component
import { WaitDelayNode } from './nodes/wait-delay.node';

// Add to node component mapping
const nodeComponents = {
  // ... existing mappings ...
  wait_delay: WaitDelayNode,
  // ... other mappings ...
};
```

### 3. Backend Implementation

#### 3.1 Execution Service Updates

**File**: `apps/backend/src/modules/execution/execution.service.ts`

Add wait/delay node handling in the `executeNode` method:

```typescript
private async executeNode(executionId: string, node: any) {
  // ... existing code ...

  try {
    switch (node.type) {
      // ... existing cases ...

      case 'wait_delay':
        await this.executeWaitDelay(node.config);
        break;

      // ... existing default case ...
    }

    // ... rest of the method ...
  } catch (error) {
    // ... existing error handling ...
  }
}

/**
 * Execute wait/delay node
 */
private async executeWaitDelay(config: any): Promise<void> {
  const duration = config?.duration || 1.0;
  const description = config?.description || 'Waiting';
  const allowCancel = config?.allow_cancel !== false;

  this.logger.log(`Starting wait/delay: ${duration}s - ${description}`);

  // Wait start notification
  this.notificationService.notifyExecutionDetail(
    `Wait/Delay started: ${duration}s`,
    description
  );

  // Calculate end time
  const endTime = Date.now() + (duration * 1000);

  // Check every 100ms if wait should continue
  while (Date.now() < endTime) {
    // Check if execution has been paused or cancelled
    // This requires access to execution status, might need to pass executionId

    // Sleep for 100ms
    await new Promise(resolve => setTimeout(resolve, 100));

    // For production: Add check for cancellation if allow_cancel is true
    // if (allowCancel && this.isExecutionCancelled(executionId)) {
    //   throw new Error('Wait cancelled by user');
    // }
  }

  // Wait completion notification
  this.notificationService.notifyExecutionDetail(
    `Wait/Delay completed: ${duration}s`,
    description
  );

  this.logger.log(`Wait/delay completed: ${duration}s`);
}
```

#### 3.2 Update Estimated Execution Time

**File**: `apps/backend/src/modules/execution/execution.service.ts`

Update the `getEstimatedExecutionTime` method:

```typescript
private getEstimatedExecutionTime(nodeType: string, parameters: any): number {
  switch (nodeType) {
    // ... existing cases ...

    case 'wait_delay':
      return (parameters?.duration || 1) * 1000; // Convert to milliseconds

    // ... existing default case ...
  }
}
```

### 4. State Machine Integration

The wait/delay node integrates with the existing state machine pattern as follows:

1. **Execution Flow**: The node is executed sequentially like other nodes
2. **State Transitions**:
   - Before wait: `running`
   - During wait: `running` (with wait status in details)
   - After wait: continues to next node
3. **Pause/Resume**: The wait can be paused and resumed if implemented
4. **Cancellation**: If `allow_cancel` is true, the wait can be cancelled

### 5. Notification System Integration

The wait/delay node should send the following notifications:

1. **Wait Start**: When the wait begins
   - Level: `DebugNotificationLevel.EXECUTION_DETAIL`
   - Message: "Wait/Delay started: Xs"
   - Details: Description from parameters

2. **Wait Progress** (Optional): For long waits (> 10s)
   - Level: `DebugNotificationLevel.EXECUTION_DETAIL`
   - Message: "Wait progress: X%"
   - Details: Time remaining

3. **Wait Completion**: When the wait ends
   - Level: `DebugNotificationLevel.EXECUTION_DETAIL`
   - Message: "Wait/Delay completed: Xs"
   - Details: Description from parameters

### 6. Testing Considerations

#### Unit Tests
- Test parameter validation
- Test duration calculation
- Test notification calls
- Test cancellation behavior

#### Integration Tests
- Test wait in workflow sequence
- Test pause/resume during wait
- Test cancellation during wait
- Test maximum duration limits

#### Edge Cases
- Zero or negative duration
- Very long duration (24+ hours)
- Network issues during wait
- System shutdown during wait

### 7. Future Enhancements

1. **Progress Reporting**: Add progress updates for long waits
2. **Dynamic Duration**: Allow duration to be set from previous node outputs
3. **Conditional Waits**: Wait based on external conditions
4. **Wait Until**: Wait until a specific time instead of duration
5. **Interruptible Waits**: More sophisticated cancellation handling

### 8. Implementation Checklist

- [ ] Update type definitions in `packages/types`
- [ ] Create frontend node component
- [ ] Register node type and configuration
- [ ] Implement backend execution logic
- [ ] Update execution time estimation
- [ ] Add notification integration
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Update documentation
- [ ] Test with actual workflows

### 9. Risk Mitigation

1. **Blocking Operations**: The wait uses setTimeout with polling to avoid completely blocking the event loop
2. **Resource Usage**: Long waits should not consume significant CPU resources
3. **Memory Leaks**: Ensure timeout references are properly cleaned up
4. **Time Accuracy**: Use Date.now() for accuracy rather than cumulative setTimeout

## Conclusion

The wait/delay node implementation follows the established patterns in ZahnerFlow and integrates cleanly with the existing architecture. It provides essential timing control for electrochemical workflows while maintaining the system's robustness and usability.