/**
 * 程序段管理Hook
 */

import { useState, useCallback } from 'react';
import { ProgramSegment } from '../../../types/devices';

export interface SegmentOperationProgress {
  isLoading: boolean;
  operation: 'reading' | 'writing' | null;
  progress: number; // 0-100
  currentSegment: number; // 1-30
}

export interface FurnaceProgramData {
  segments: ProgramSegment[];
  segmentOperation: SegmentOperationProgress;
}

export interface FurnaceProgramControls {
  setSegments: (segments: ProgramSegment[]) => void;
  updateSegmentOperation: (operation: 'reading' | 'writing' | null, currentSegment: number, progress: number) => void;
  completeSegmentOperation: () => void;
  clearSegmentOperation: () => void;
  resetProgram: () => void;
}

export function useFurnaceProgram(): [FurnaceProgramData, FurnaceProgramControls] {
  const [state, setState] = useState<FurnaceProgramData>({
    segments: [],
    segmentOperation: {
      isLoading: false,
      operation: null,
      progress: 0,
      currentSegment: 0,
    },
  });

  const setSegments = useCallback((segments: ProgramSegment[]) => {
    setState(prev => ({ ...prev, segments }));
  }, []);

  const updateSegmentOperation = useCallback((
    operation: 'reading' | 'writing' | null,
    currentSegment: number,
    progress: number
  ) => {
    setState(prev => ({
      ...prev,
      segmentOperation: {
        isLoading: operation !== null,
        operation,
        currentSegment,
        progress,
      }
    }));
  }, []);

  const completeSegmentOperation = useCallback(() => {
    setState(prev => ({
      ...prev,
      segmentOperation: {
        isLoading: false,
        operation: null,
        progress: 100,
        currentSegment: 0,
      }
    }));

    // 2秒后重置进度显示
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        segmentOperation: {
          isLoading: false,
          operation: null,
          progress: 0,
          currentSegment: 0,
        }
      }));
    }, 2000);
  }, []);

  const clearSegmentOperation = useCallback(() => {
    setState(prev => ({
      ...prev,
      segmentOperation: {
        isLoading: false,
        operation: null,
        progress: 0,
        currentSegment: 0,
      }
    }));
  }, []);

  const resetProgram = useCallback(() => {
    setState({
      segments: [],
      segmentOperation: {
        isLoading: false,
        operation: null,
        progress: 0,
        currentSegment: 0,
      },
    });
  }, []);

  const controls: FurnaceProgramControls = {
    setSegments,
    updateSegmentOperation,
    completeSegmentOperation,
    clearSegmentOperation,
    resetProgram,
  };

  return [state, controls];
}