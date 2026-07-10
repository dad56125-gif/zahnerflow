/**
 * Furnace 程序段输入验证工具
 * 实现温度、时间输入的验证逻辑
 */

import {
  FURNACE_TEMPERATURE_MAX_C,
  FURNACE_TEMPERATURE_MIN_C,
  FURNACE_TEMPERATURE_RANGE_LABEL,
  FURNACE_PROGRAM_SEGMENT_COUNT
} from './temperatureLimits';

export interface ValidationResult {
  is_valid: boolean;
  value: number;
  error_message?: string;
}

export class SegmentValidator {
  /**
   * 验证温度输入
   * 范围：25-1100℃
   * @param value 输入值
   * @returns 验证结果
   */
  static validateTemperature(value: string): ValidationResult {
    const trimmed = value.trim();
    const integerRegex = /^-?\d+$/;

    // 检查是否为空值
    if (!trimmed) {
      return { is_valid: false, value: 25, error_message: "请输入温度值！" };
    }

    // 使用正则检查是否为整数
    if (!integerRegex.test(trimmed)) {
      return { is_valid: false, value: 25, error_message: "请输入整数！" };
    }

    const num = parseInt(trimmed);

    // 检查温度范围
    if (num < FURNACE_TEMPERATURE_MIN_C || num > FURNACE_TEMPERATURE_MAX_C) {
      return {
        is_valid: false,
        value: FURNACE_TEMPERATURE_MIN_C,
        error_message: `温度范围：${FURNACE_TEMPERATURE_RANGE_LABEL}`
      };
    }

    return { is_valid: true, value: num };
  }

  /**
   * 验证时间输入
   * 范围：1-9999 或 -121（停止符）
   * @param value 输入值
   * @returns 验证结果
   */
  static validateTime(value: string): ValidationResult {
    const trimmed = value.trim();
    const integerRegex = /^-?\d+$/;

    // 检查是否为空值
    if (!trimmed) {
      return { is_valid: false, value: 1001, error_message: "请输入时间值！" };
    }

    // 使用正则检查是否为整数
    if (!integerRegex.test(trimmed)) {
      return { is_valid: false, value: 1001, error_message: "请输入整数！" };
    }

    const num = parseInt(trimmed);

    // 特殊值：-121（停止符）、0
    if (num === -121 || num === 0) {
      return { is_valid: true, value: num };
    }

    // 正常范围：1-9999
    if (num >= 1 && num <= 9999) {
      return { is_valid: true, value: num };
    }

    return {
      is_valid: false,
      value: 1001,
      error_message: "时间范围：1-9999、-121（停止符）或 0"
    };
  }

  /**
   * 验证程序段数据
   * @param segments 程序段数组
   * @returns 验证结果和错误信息
   */
  static validateSegments(segments: { id: number; temperature: string; time: string }[]): {
    is_valid: boolean;
    validated_segments: { id: number; temperature: number; time: number }[];
    errors: { [key: string]: string };
  } {
    const errors: { [key: string]: string } = {};
    const validated_segments: { id: number; temperature: number; time: number }[] = [];

    for (const segment of segments) {
      const temp_result = this.validateTemperature(segment.temperature);
      const time_result = this.validateTime(segment.time);

      if (!temp_result.is_valid) {
        errors[`temp_${segment.id}`] = temp_result.error_message!;
      }
      if (!time_result.is_valid) {
        errors[`time_${segment.id}`] = time_result.error_message!;
      }

      // 只有有有效数据时才添加到结果中
      if (temp_result.value > 0 || time_result.value > 0 || time_result.value === -121) {
        validated_segments.push({
          id: segment.id,
          temperature: temp_result.value,
          time: time_result.value
        });
      }
    }

    return {
      is_valid: Object.keys(errors).length === 0,
      validated_segments,
      errors
    };
  }

  /**
   * 检查是否有有效的程序段数据
   * 用于写入和保存前的数据检查
   * @param inputs 输入数据对象
   * @returns 是否有至少一个程序段的温度或时间不为空
   */
  static hasValidData(inputs: { [key: string]: string }): boolean {
    for (let i = 1; i <= FURNACE_PROGRAM_SEGMENT_COUNT; i++) {
      const temp = inputs[`temp_${i}`] || '';
      const time = inputs[`time_${i}`] || '';
      if (temp.trim() !== '' || time.trim() !== '') {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取默认温度值
   * @returns 默认温度值
   */
  static getDefaultTemperature(): number {
    return FURNACE_TEMPERATURE_MIN_C;
  }

  /**
   * 获取默认时间值
   * @returns 默认时间值
   */
  static getDefaultTime(): number {
    return 1001;
  }

  /**
   * 获取错误消息的默认值
   * @param field 字段名
   * @returns 默认值
   */
  static getDefaultValue(field: string): number {
    if (field.startsWith('temp_')) {
      return this.getDefaultTemperature();
    } else if (field.startsWith('time_')) {
      return this.getDefaultTime();
    }
    return 0;
  }
}
