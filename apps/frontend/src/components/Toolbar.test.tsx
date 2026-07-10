import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../runtimeClient', () => ({
  runtimeClient: {
    executions: {
      unrollPreview: vi.fn(),
    },
  },
  runtimeSocket: {
    connectSocket: vi.fn(),
    on: vi.fn(() => () => undefined),
  },
}));

import { Toolbar } from './Toolbar';

describe('Toolbar', () => {
  it('renders from stable primitive execution subscriptions', () => {
    render(
      <Toolbar
        onRunFlow={async () => 'started'}
        selectedWorkstation="zahner-zennium"
        isRunning={false}
        hasError={false}
      />,
    );

    expect(screen.getByRole('button', { name: '运行' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '查看展开后的所有执行步骤' })).toBeDisabled();
  });
});
