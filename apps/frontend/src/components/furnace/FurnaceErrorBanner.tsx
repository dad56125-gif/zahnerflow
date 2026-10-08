import React from 'react';
import type { DeviceError } from '../../modules/furnace/furnaceTypes';
import { SpacedCjkText } from '../common/SpacedCjkText';

interface FurnaceErrorBannerProps {
  error: DeviceError;
  onClear: () => void;
}

export const FurnaceErrorBanner: React.FC<FurnaceErrorBannerProps> = ({ error, onClear }) => (
  <div className="error-banner" role="alert">
    <span className="error__message">
      <SpacedCjkText text="错误" />: {error.message || <SpacedCjkText text="未知错误" />}
    </span>
    <button
      className="btn btn--sm btn--secondary"
      onClick={onClear}
    >
      <SpacedCjkText text="关闭" />
    </button>
  </div>
);
