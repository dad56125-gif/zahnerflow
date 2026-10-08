import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import type { DeviceError, FurnacePresetMeta, ProgramSegment } from '../../modules/furnace/furnaceTypes';
import { runtimeClient } from '../../runtimeClient';
import { ControlBar } from './components/ControlBar';
import { SegmentEditor } from './components/SegmentEditor';
import { SegmentValidator } from '../../modules/furnace/segmentValidation';
import { FURNACE_PROGRAM_SEGMENT_COUNT } from '../../modules/furnace/temperatureLimits';
import { toFurnaceDeviceError } from '../../modules/furnace/furnaceError';
import { FurnaceErrorBanner } from './FurnaceErrorBanner';

interface PresetManagerProps {
  presets: FurnacePresetMeta[];
  isConnected: boolean;
  isLoading: boolean;
  onSetSegments: (segments: ProgramSegment[]) => Promise<boolean>;
  onGetSegments: () => Promise<ProgramSegment[] | null>;
  onLoadPresets: () => Promise<boolean>;
  onCreatePreset: (preset: { name: string; segments: ProgramSegment[]; summary?: string }) => Promise<boolean>;
  onUpdatePreset: (name: string, segments: ProgramSegment[]) => Promise<boolean>;
}

const createEmptyInputs = () => {
  const emptyInputs: { [key: string]: string } = {};
  for (let i = 1; i <= FURNACE_PROGRAM_SEGMENT_COUNT; i++) {
    emptyInputs[`temp_${i}`] = '';
    emptyInputs[`time_${i}`] = '';
  }
  return emptyInputs;
};

export const PresetManager: React.FC<PresetManagerProps> = memo(({
  presets,
  isConnected,
  isLoading,
  onSetSegments,
  onGetSegments,
  onLoadPresets,
  onCreatePreset,
  onUpdatePreset,
}) => {
  const [inputs, setInputs] = useState<{ [key: string]: string }>(createEmptyInputs);
  const [currentPresetName, setCurrentPresetName] = useState('');
  const [selectedPresetName, setSelectedPresetName] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [presetSegments, setPresetSegments] = useState<ProgramSegment[]>([]);
  const [presetError, setPresetError] = useState<DeviceError | null>(null);
  // 预设选择/读取运行的请求代次，用于拒绝乱序旧回包
  const presetRequestRef = useRef(0);

  useEffect(() => () => {
    presetRequestRef.current += 1;
  }, []);

  // 当presetSegments变化时更新输入框
  // 重要：先清空所有输入框，再加载预设数据，避免保留之前"读取运行"获取的残留值
  useEffect(() => {
    if (presetSegments?.length) {
      // 第1步：创建空白输入对象
      const newInputs: { [key: string]: string } = {};
      for (let i = 1; i <= FURNACE_PROGRAM_SEGMENT_COUNT; i++) {
        newInputs[`temp_${i}`] = '';
        newInputs[`time_${i}`] = '';
      }
      // 第2步：填入预设中的数据
      presetSegments.forEach(segment => {
        newInputs[`temp_${segment.id}`] = segment.temperature.toString();
        newInputs[`time_${segment.id}`] = segment.time.toString();
      });
      setInputs(newInputs);
      setValidationErrors({});
    }
  }, [presetSegments]);

  // 预设选择处理 - 选中即加载预设数据到输入框，不影响名称输入框
  const handlePresetSelect = useCallback(async (presetName: string) => {
    const requestId = ++presetRequestRef.current;
    setPresetError(null);
    if (!presetName) {
      setSelectedPresetName('');
      return;
    }
    try {
      const preset = await runtimeClient.devices.furnace.presets.get<{ segments: ProgramSegment[] }>(presetName);
      if (requestId !== presetRequestRef.current) return;
      setSelectedPresetName(presetName);
      setPresetSegments(preset.segments);
    } catch (error) {
      if (requestId !== presetRequestRef.current) return;
      setPresetError(toFurnaceDeviceError(error, '读取预设失败'));
      console.error('Failed to load preset:', error);
    }
  }, []);

  // 写入处理 - 只有当有有效数据时才执行写入，带安全确认框
  // 注意：写入后需要重新读取设备段，确保 furnaceState.segments 包含完整数据
  const handleWrite = useCallback(async () => {
    // 检查是否有非空数据
    if (!SegmentValidator.hasValidData(inputs)) {
      alert('请输入至少一个程序段的温度或时间数据！');
      return;
    }

    if (!confirm('确认写入？')) return;

    const segments: ProgramSegment[] = [];
    for (let i = 1; i <= FURNACE_PROGRAM_SEGMENT_COUNT; i++) {
      const temp = parseInt(inputs[`temp_${i}`] || '0');
      const time = parseInt(inputs[`time_${i}`] || '0');
      if (temp > 0 || time > 0 || time === -121) {
        segments.push({ id: i, temperature: temp, time: time });
      }
    }

    setPresetError(null);
    // 写入失败时停止后续读取，避免把旧数据误当成本次写入结果。
    const writeSucceeded = await onSetSegments(segments);
    if (!writeSucceeded) return;
    // 重新读取设备的完整程序段，确保"设置程序段"标签页能看到完整数据
    await onGetSegments();
  }, [inputs, onGetSegments, onSetSegments]);

  // 新建处理 - 清空数据和输入框，脱钩下拉菜单
  const handleNew = useCallback(() => {
    presetRequestRef.current += 1;
    setInputs(createEmptyInputs());
    setCurrentPresetName('');
    setSelectedPresetName('');
    setValidationErrors({});
  }, []);

  // 保存处理 - 校验输入框，智能判断覆盖或新建
  const handleSave = useCallback(async () => {
    if (!currentPresetName.trim()) {
      alert('请输入预设名称！');
      return;
    }

    // 检查是否有数据
    if (!SegmentValidator.hasValidData(inputs)) {
      alert('请输入至少一个程序段的温度或时间数据！');
      return;
    }

    // 验证所有输入
    const segmentsForValidation: { id: number; temperature: string; time: string }[] = [];
    for (let i = 1; i <= FURNACE_PROGRAM_SEGMENT_COUNT; i++) {
      const temp = inputs[`temp_${i}`] || '';
      const time = inputs[`time_${i}`] || '';
      if (temp.trim() !== '' || time.trim() !== '') {
        segmentsForValidation.push({
          id: i,
          temperature: temp || SegmentValidator.getDefaultTemperature().toString(),
          time: time || SegmentValidator.getDefaultTime().toString()
        });
      }
    }

    const validationResult = SegmentValidator.validateSegments(segmentsForValidation);

    if (!validationResult.is_valid) {
      setValidationErrors(validationResult.errors);
      alert('请修正输入错误后再保存！');
      return;
    }

    setValidationErrors({});
    setPresetError(null);

    try {
      // 检查是否为现有预设
      const existingPreset = presets.find(p => p.name === currentPresetName);
      if (existingPreset && !confirm(`确认覆盖预设 [${currentPresetName}] 吗？`)) {
        return;
      }

      const saved = existingPreset
        ? await onUpdatePreset(currentPresetName, validationResult.validated_segments)
        : await onCreatePreset({
          name: currentPresetName,
          segments: validationResult.validated_segments,
          summary: `预设程序段：${currentPresetName}`
        });

      if (!saved) return;

      await onLoadPresets();
      alert(`预设 "${currentPresetName}" 保存成功！`);
    } catch (error) {
      const deviceError = toFurnaceDeviceError(error, '保存失败');
      setPresetError(deviceError);
      console.error('Failed to save preset:', error);
      alert(`保存失败：${deviceError.message}`);
    }
  }, [currentPresetName, inputs, onCreatePreset, onLoadPresets, onUpdatePreset, presets]);

  // 读取运行处理 - 直接从设置程序段复制数据到预设程序段
  const handleLoadRun = useCallback(async () => {
    const requestId = ++presetRequestRef.current;
    setPresetError(null);
    try {
      const loadedSegments = await onGetSegments();
      if (requestId !== presetRequestRef.current) return;
      if (!loadedSegments) return;
      setPresetSegments([...loadedSegments]);
      setCurrentPresetName('');
      setSelectedPresetName('');
      setValidationErrors({});
    } catch (error) {
      if (requestId !== presetRequestRef.current) return;
      setPresetError(toFurnaceDeviceError(error, '读取运行程序段失败'));
      console.error('Failed to load running segments:', error);
    }
  }, [onGetSegments]);

  // 输入变化处理 - 支持对象和函数两种形式
  const handleInputsChange = useCallback((
    newInputs: { [key: string]: string } | ((prev: { [key: string]: string }) => { [key: string]: string })
  ) => {
    setInputs(prev => {
      if (typeof newInputs === 'function') {
        return newInputs(prev);
      }
      return newInputs;
    });
  }, []);

  // 计算是否有有效数据（用于控制保存按钮状态）
  const hasValidData = SegmentValidator.hasValidData(inputs);

  return (
    <div className="presets-tab">
      {presetError && (
        <FurnaceErrorBanner
          error={presetError}
          onClear={() => setPresetError(null)}
        />
      )}

      {/* 顶部控制栏 */}
      <ControlBar
        presets={presets}
        isConnected={isConnected}
        isLoading={isLoading}
        current_preset_name={currentPresetName}
        selected_preset_name={selectedPresetName}
        has_valid_data={hasValidData}
        on_preset_select={handlePresetSelect}
        on_write={handleWrite}
        on_preset_name_change={setCurrentPresetName}
        on_new={handleNew}
        on_save={handleSave}
        on_load_run={handleLoadRun}
      />

      {/* 程序段编辑器 */}
      <SegmentEditor
        isConnected={isConnected}
        inputs={inputs}
        on_inputs_change={handleInputsChange}
        validation_errors={validationErrors}
      />

    </div>
  );
});
