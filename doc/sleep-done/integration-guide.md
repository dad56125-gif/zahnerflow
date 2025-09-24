# Wait/Delay Node Integration Guide

## Quick Integration Steps

### 1. Update Types (packages/types/src/workflow.types.ts)

```typescript
// Add to NodeType union
export type NodeType =
  // ... existing types ...
  | 'wait_delay'  // Add this line
  | 'loop_start'
  | 'loop_end';
```

### 2. Create Frontend Component (apps/frontend/src/nodes/wait-delay.node.tsx)

Copy the component from the implementation plan and save it as `wait-delay.node.tsx`.

### 3. Register Node Type (apps/frontend/src/nodes/types.ts)

```typescript
// Add to NODE_CONFIGS object
wait_delay: {
  type: 'wait_delay',
  name: 'Wait/Delay',
  category: 'flow_control',
  description: 'Pauses workflow execution for a specified duration',
  icon: '⏱️',
  // ... rest of configuration from implementation plan
}
```

### 4. Update Execution Service (apps/backend/src/modules/execution/execution.service.ts)

```typescript
// Add to executeNode switch statement
case 'wait_delay':
  await this.executeWaitDelay(node.config);
  break;

// Add the executeWaitDelay method (copy from implementation plan)
private async executeWaitDelay(config: any): Promise<void> {
  // Implementation from the plan
}

// Update getEstimatedExecutionTime method
case 'wait_delay':
  return (parameters?.duration || 1) * 1000;
```

### 5. Add to Node Registry (if applicable)

If your application uses a node registry, add:

```typescript
// apps/frontend/src/App.tsx or similar
import { WaitDelayNode } from './nodes/wait-delay.node';

// Add to component mapping
const nodeComponents = {
  // ... existing nodes
  wait_delay: WaitDelayNode,
};
```

## Testing the Implementation

### Test Case 1: Basic Wait

```json
{
  "nodes": [
    {
      "id": "start",
      "type": "startup",
      "position": {"x": 50, "y": 50}
    },
    {
      "id": "wait1",
      "type": "wait_delay",
      "position": {"x": 250, "y": 50},
      "config": {
        "duration": 5.0,
        "description": "Test wait"
      }
    },
    {
      "id": "end",
      "type": "shutdown",
      "position": {"x": 450, "y": 50}
    }
  ],
  "edges": [
    {"source": "start", "target": "wait1"},
    {"source": "wait1", "target": "end"}
  ]
}
```

Expected behavior:
- Wait for 5 seconds between startup and shutdown
- Notifications sent at start and end of wait

### Test Case 2: Long Wait with Progress

```json
{
  "config": {
    "duration": 30.0,
    "description": "Long stabilization wait",
    "allow_cancel": true
  }
}
```

Expected behavior:
- Progress updates every second
- Option to cancel during wait

## Troubleshooting

### Common Issues

1. **Node not appearing in palette**
   - Check NODE_CONFIGS registration
   - Verify import statements
   - Check for TypeScript errors

2. **Wait not executing**
   - Check case statement in executeNode method
   - Verify config parameter structure
   - Check backend logs for errors

3. **Notifications not showing**
   - Verify notification service injection
   - Check notification levels
   - Ensure frontend is listening for notifications

4. **TypeScript errors**
   - Run `npm run build` in types package
   - Run `npm run build` in affected apps
   - Check for missing type exports

## Debug Tips

1. **Enable debug logging**:
   ```typescript
   this.logger.log(`Wait config: ${JSON.stringify(config)}`);
   ```

2. **Check notification delivery**:
   - Monitor browser console for WebSocket messages
   - Check backend notification service logs

3. **Verify timing**:
   - Add start/end timestamps to logs
   - Check if wait duration matches expectation

## Performance Considerations

1. **Short waits** (< 1s): Use single setTimeout
2. **Long waits**: Use polling loop with progress updates
3. **Memory**: Clean up timeout references
4. **CPU**: Minimize work in wait loop

## Migration Guide

If replacing an existing delay implementation:

1. Keep old node type for backward compatibility
2. Add migration notes to documentation
3. Update example workflows
4. Communicate changes to users