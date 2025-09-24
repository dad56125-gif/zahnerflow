# Wait/Delay Node UI Design

## Visual Representation

```
┌─────────────────────────┐
│                         │
│    ⏱️ Wait/Delay        │
│                         │
│    Duration: 5.0 s      │
│                         │
│    ┌─────────────────┐  │
│    │    Input        │  │
│    └─────────────────┘  │
│                         │
│    ┌─────────────────┐  │
│    │    Output       │  │
│    └─────────────────┘  │
│                         │
└─────────────────────────┘
```

## Configuration Panel

When the node is selected, the configuration panel shows:

### Duration Setting
```
┌─────────────────────────────────┐
│ Duration                        │
│ ┌─────────────────────────────┐ │
│ │         5.0                │ │
│ └─────────────────────────────┘ │
│ (seconds)                      │
└─────────────────────────────────┘
```

### Description Field
```
┌─────────────────────────────────┐
│ Description                    │
│ ┌─────────────────────────────┐ │
│ │ Stabilization period        │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Allow Cancel Toggle
```
┌─────────────────────────────────┐
│ ☑ Allow Cancel                 │
└─────────────────────────────────┘
```

## Node States

### Normal State
- Background: Orange gradient (#FF9800 to #F57C00)
- Text: White
- Icon: ⏱️ (stopwatch)

### Executing State
- Background: Pulsing orange
- Icon: ⏳ (hourglass)
- May show progress indicator for long waits

### Completed State
- Returns to normal state
- Brief green flash to indicate completion

### Error State
- Background: Red gradient
- Icon: ❌
- Shows error message

## CSS Classes

```css
/* Node base styles */
.node-wait-delay {
  background: linear-gradient(135deg, #FF9800, #F57C00);
  border: 2px solid #F57C00;
  border-radius: 8px;
  color: white;
  width: 140px;
  min-height: 60px;
  position: relative;
}

/* Executing animation */
.node-wait-delay.executing {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}

/* Progress indicator for long waits */
.node-wait-delay .progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.8);
  transition: width 0.3s ease;
}
```

## Parameter Input Components

The node uses the shared `ParameterInput` component with the following configurations:

### Duration Input
- Type: number
- Min: 0.1
- Max: 86400 (24 hours)
- Step: 0.1
- Unit: seconds

### Description Input
- Type: text
- Max length: 200 characters
- Placeholder: "Purpose of the wait"

### Allow Cancel Input
- Type: boolean (checkbox)
- Default: true

## Tooltip Information

Hovering over the node shows:
- **Node Type**: Wait/Delay
- **Duration**: Current duration setting
- **Status**: Current execution status
- **Description**: Node description if provided