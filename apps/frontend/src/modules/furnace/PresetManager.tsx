import React, { useState, useEffect, useCallback } from 'react';
import type { FurnaceState, FurnaceControls } from './useFurnace';
import type { ProgramSegment } from './furnaceTypes';
import { ControlBar } from './components/ControlBar';
import { SegmentEditor } from './components/SegmentEditor';
import { SegmentValidator } from './segmentValidation';

interface PresetManagerProps {
  furnaceState: FurnaceState;
  furnaceControls: FurnaceControls;
}

export const PresetManager: React.FC<PresetManagerProps> = ({ furnaceState, furnaceControls }) => {
  const [inputs, setInputs] = useState<{ [key: string]: string }>({});
  const [currentPresetName, setCurrentPresetName] = useState('');
  const [selectedPresetName, setSelectedPresetName] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [presetSegments, setPresetSegments] = useState<ProgramSegment[]>([]);

  // 初始化输入框为空
  useEffect(() => {
    const emptyInputs: { [key: string]: string } = {};
    for (let i = 1; i <= 27; i++) {
      emptyInputs[`temp_${i}`] = '';
      emptyInputs[`time_${i}`] = '';
    }
    setInputs(emptyInputs);
  }, []);

  // 当presetSegments变化时更新输入框
  useEffect(() => {
    if (presetSegments?.length) {
      const newInputs: { [key: string]: string } = {};
      presetSegments.forEach(segment => {
        newInputs[`temp_${segment.id}`] = segment.temperature.toString();
        newInputs[`time_${segment.id}`] = segment.time.toString();
      });
      setInputs(prev => ({ ...prev, ...newInputs }));
      setValidationErrors({});
    }
  }, [presetSegments]);

  // 预设选择处理 - 选中即加载预设数据到输入框，不影响名称输入框
  const handlePresetSelect = useCallback(async (presetName: string) => {
    if (!presetName) {
      setSelectedPresetName('');
      return;
    }
    setSelectedPresetName(presetName);
    const preset = await furnaceControls.select_preset(presetName);
    setPresetSegments(preset.segments);
  }, [furnaceControls]);

  // 写入处理 - 只有当有有效数据时才执行写入，带安全确认框
  const handleWrite = useCallback(() => {
    // 检查是否有非空数据
    if (!SegmentValidator.hasValidData(inputs)) {
      alert('请输入至少一个程序段的温度或时间数据！');
      return;
    }

    if (!confirm('确认写入？')) return;

    const segments: ProgramSegment[] = [];
    for (let i = 1; i <= 27; i++) {
      const temp = parseInt(inputs[`temp_${i}`] || '0');
      const time = parseInt(inputs[`time_${i}`] || '0');
      if (temp > 0 || time > 0 || time === -121) {
        segments.push({ id: i, temperature: temp, time: time });
      }
    }
    furnaceControls.set_segments(segments);
  }, [inputs, furnaceControls]);

  // 新建处理 - 清空数据和输入框，脱钩下拉菜单
  const handleNew = useCallback(() => {
    const emptyInputs: { [key: string]: string } = {};
    for (let i = 1; i <= 27; i++) {
      emptyInputs[`temp_${i}`] = '';
      emptyInputs[`time_${i}`] = '';
    }
    setInputs(emptyInputs);
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
    for (let i = 1; i <= 27; i++) {
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

    try {
      // 检查是否为现有预设
      const existingPreset = furnaceState.presets.find(p => p.name === currentPresetName);

      if (existingPreset) {
        if (!confirm(`确认覆盖预设 [${currentPresetName}] 吗？`)) {
          return;
        }
        await furnaceControls.update_preset(currentPresetName, validationResult.validated_segments);
      } else {
        await furnaceControls.create_preset({
          name: currentPresetName,
          segments: validationResult.validated_segments,
          summary: `预设程序段：${currentPresetName}`
        });
      }

      await furnaceControls.load_presets();
      alert(`预设 "${currentPresetName}" 保存成功！`);
    } catch (error) {
      console.error('Failed to save preset:', error);
      alert('保存失败，请检查网络连接！');
      await furnaceControls.load_presets();
    }
  }, [currentPresetName, inputs, furnaceState.presets, furnaceControls]);

  // 读取运行处理 - 直接从设置程序段复制数据到预设程序段
  const handleLoadRun = useCallback(async () => {
    try {
      await furnaceControls.get_segments();
      setPresetSegments([...furnaceState.segments]);
      setCurrentPresetName('');
      setSelectedPresetName('');
      setValidationErrors({});
    } catch (error) {
      console.error('Failed to load running segments:', error);
    }
  }, [furnaceControls, furnaceState.segments]);

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
      {/* 顶部控制栏 */}
      <ControlBar
        furnace_state={furnaceState}
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
        furnace_state={furnaceState}
        inputs={inputs}
        on_inputs_change={handleInputsChange}
        validation_errors={validationErrors}
      />

      </div>
  );
};