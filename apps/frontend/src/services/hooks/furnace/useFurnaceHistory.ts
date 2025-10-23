/**
 * 历史数据管理Hook
 */

import { useState, useCallback } from 'react';
import { FurnaceSample, HistoryQueryParams } from '../../../types/devices';
import { FurnaceApi } from '../../../api';

export interface FurnaceHistoryData {
  historyData: FurnaceSample[];
  historyParams: HistoryQueryParams;
  isLoading: boolean;
}

export interface FurnaceHistoryControls {
  setHistoryData: (data: FurnaceSample[]) => void;
  setHistoryParams: (params: HistoryQueryParams) => void;
  updateHistoryParams: (params: Partial<HistoryQueryParams>) => void;
  setLoading: (loading: boolean) => void;
  addSample: (sample: FurnaceSample) => void;
  loadHistoryData: (params?: HistoryQueryParams) => Promise<void>;
  resetHistory: () => void;
}

export function useFurnaceHistory(): [FurnaceHistoryData, FurnaceHistoryControls] {
  const [state, setState] = useState<FurnaceHistoryData>({
    historyData: [],
    historyParams: FurnaceApi.getDefaultHistoryParams(),
    isLoading: false,
  });

  const setHistoryData = useCallback((historyData: FurnaceSample[]) => {
    setState(prev => ({ ...prev, historyData }));
  }, []);

  const setHistoryParams = useCallback((historyParams: HistoryQueryParams) => {
    setState(prev => ({ ...prev, historyParams }));
  }, []);

  const updateHistoryParams = useCallback((params: Partial<HistoryQueryParams>) => {
    setState(prev => ({
      ...prev,
      historyParams: {
        ...prev.historyParams,
        ...params,
      },
    }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }));
  }, []);

  const addSample = useCallback((sample: FurnaceSample) => {
    setState(prev => ({
      ...prev,
      historyData: [...prev.historyData, sample]
    }));
  }, []);

  const loadHistoryData = useCallback(async (params?: HistoryQueryParams): Promise<void> => {
    try {
      setLoading(true);

      const finalParams = params || state.historyParams;
      const historyData = await FurnaceApi.getTemperatureHistory(finalParams);

      setState(prev => ({
        ...prev,
        historyData,
        historyParams: finalParams,
      }));
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  }, [setLoading, state.historyParams]);

  const resetHistory = useCallback(() => {
    setState({
      historyData: [],
      historyParams: FurnaceApi.getDefaultHistoryParams(),
      isLoading: false,
    });
  }, []);

  const controls: FurnaceHistoryControls = {
    setHistoryData,
    setHistoryParams,
    updateHistoryParams,
    setLoading,
    addSample,
    loadHistoryData,
    resetHistory,
  };

  return [state, controls];
}