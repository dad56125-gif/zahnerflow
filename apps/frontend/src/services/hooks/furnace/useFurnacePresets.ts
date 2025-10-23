/**
 * 预设管理Hook
 */

import { useState, useCallback } from 'react';
import { FurnacePresetMeta, FurnacePreset } from '../../../types/devices';

export interface FurnacePresetsData {
  presets: FurnacePresetMeta[];
  selectedPreset: FurnacePreset | null;
  isLoading: boolean;
}

export interface FurnacePresetsControls {
  setPresets: (presets: FurnacePresetMeta[]) => void;
  setSelectedPreset: (preset: FurnacePreset | null) => void;
  setLoading: (loading: boolean) => void;
  addPreset: (preset: FurnacePresetMeta) => void;
  updatePresetInList: (name: string, preset: FurnacePresetMeta) => void;
  removePreset: (name: string) => void;
  resetPresets: () => void;
}

export function useFurnacePresets(): [FurnacePresetsData, FurnacePresetsControls] {
  const [state, setState] = useState<FurnacePresetsData>({
    presets: [],
    selectedPreset: null,
    isLoading: false,
  });

  const setPresets = useCallback((presets: FurnacePresetMeta[]) => {
    setState(prev => ({ ...prev, presets }));
  }, []);

  const setSelectedPreset = useCallback((selectedPreset: FurnacePreset | null) => {
    setState(prev => ({ ...prev, selectedPreset }));
  }, []);

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading }));
  }, []);

  const addPreset = useCallback((preset: FurnacePresetMeta) => {
    setState(prev => ({
      ...prev,
      presets: [...prev.presets, preset]
    }));
  }, []);

  const updatePresetInList = useCallback((name: string, updatedPreset: FurnacePresetMeta) => {
    setState(prev => ({
      ...prev,
      presets: prev.presets.map(preset =>
        preset.name === name ? updatedPreset : preset
      )
    }));
  }, []);

  const removePreset = useCallback((name: string) => {
    setState(prev => ({
      ...prev,
      presets: prev.presets.filter(preset => preset.name !== name),
      selectedPreset: prev.selectedPreset?.name === name ? null : prev.selectedPreset
    }));
  }, []);

  const resetPresets = useCallback(() => {
    setState({
      presets: [],
      selectedPreset: null,
      isLoading: false,
    });
  }, []);

  const controls: FurnacePresetsControls = {
    setPresets,
    setSelectedPreset,
    setLoading,
    addPreset,
    updatePresetInList,
    removePreset,
    resetPresets,
  };

  return [state, controls];
}