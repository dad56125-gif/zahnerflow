/**
 * 节点参数显示组件
 * 使用数据驱动配置替代硬编码的条件渲染
 */

import React from 'react';

// 参数显示配置类型
interface ParamDisplayConfig {
    label: string;
    key: string;
    unit?: string;
    format?: (value: any, params?: Record<string, any>) => string;
    secondary?: {
        label: string;
        key: string;
        unit?: string;
        format?: (value: any) => string;
    };
}

// 智能电流格式化函数：根据数值大小自动选择单位（A、mA、μA）
const formatCurrent = (v: any): string => {
    const value = v || 0; // 原始值为安培
    const absValue = Math.abs(value);

    if (absValue >= 1) {
        // ≥1A: 显示 A
        return `${value}A`;
    } else if (absValue >= 0.001) {
        // 1mA - 999mA: 显示整数 mA
        const mA = Math.round(value * 1000);
        return `${mA}mA`;
    } else if (absValue > 0) {
        // <1mA: 显示 μA
        const uA = Math.round(value * 1000000);
        return `${uA}μA`;
    } else {
        return '0mA';
    }
};

// 节点类型到参数显示配置的映射
const NODE_PARAM_CONFIG: Record<string, ParamDisplayConfig> = {
    change_temperature: {
        label: '温度',
        key: 'target_temperature',
        unit: '°C',
        format: (v) => Math.round(v || 25).toString()
    },
    change_gas_flow: {
        label: '流量',
        key: 'target_flow_rate',
        unit: 'sccm',
        format: (v) => {
            const num = typeof v === 'number' ? v : parseFloat(v);
            return isNaN(num) ? '0.0' : num.toFixed(1);
        },
        secondary: {
            label: '',
            key: 'gas_type',
        }
    },
    eis_galvanostatic: {
        label: '直流',
        key: 'eis_current',
        unit: '', // 单位由 format 函数动态决定
        format: formatCurrent,
        secondary: {
            label: '扰动',
            key: 'eis_amplitude',
            unit: '', // 单位由 format 函数动态决定
            format: formatCurrent
        }
    },
    eis_potentiostatic: {
        label: '直流',
        key: 'eis_potential',
        unit: 'V',
        // 特殊处理：如果 enable_dc_bias 为 false 且 eis_potential 为 0，显示 OCV
        format: (v, params) => {
            if (params && !params.enable_dc_bias && (v === 0 || v === undefined)) {
                return 'OC';
            }
            return `${v || 0}`;
        },
        secondary: {
            label: '扰动',
            key: 'eis_amplitude',
            unit: 'V'
        }
    },
    wait_delay: {
        label: '时间',
        key: 'duration',
        unit: 's'
    },
    loop_start: {
        label: '循环',
        key: 'loop_count',
        unit: '次'
    },
    ocp_measurement: {
        label: '时长',
        key: 'measurement_duration',
        unit: 's'
    },
    chronoamperometry: {
        label: '电压',
        key: 'polarization_voltage',
        unit: 'V',
        secondary: {
            label: '时长',
            key: 'measurement_duration',
            unit: 's'
        }
    },
    chronopotentiometry: {
        label: '电流',
        key: 'polarization_current',
        unit: '', // 单位由 format 函数动态决定
        format: formatCurrent,
        secondary: {
            label: '时长',
            key: 'measurement_duration',
            unit: 's'
        }
    },
    voltage_ramp: {
        label: '电压',
        key: 'start_voltage', // 主 key 仅用于存在性检查
        unit: '',
        // 特殊格式化：显示 起点电压 → 终点电压
        format: (_v, params) => {
            if (!params) return '';

            const startV = params.start_voltage ?? 0;
            const endV = params.end_voltage ?? 0;
            const startRef = params.start_voltage_reference || 'absolute';
            const endRef = params.end_voltage_reference || 'absolute';

            // 格式化单个电压值
            const formatVoltage = (voltage: number, reference: string): string => {
                if (reference === 'ocv') {
                    if (voltage === 0) {
                        return 'OCV';
                    } else if (voltage > 0) {
                        return `OCV+${voltage}V`;
                    } else {
                        return `OCV${voltage}V`;
                    }
                } else {
                    return `${voltage}V`;
                }
            };

            const startStr = formatVoltage(startV, startRef);
            const endStr = formatVoltage(endV, endRef);

            return `${startStr} → ${endStr}`;
        },
        secondary: {
            label: '时间',
            key: 'measurement_duration',
            unit: 's'
        }
    },
    current_ramp: {
        label: '电流',
        key: 'start_current', // 主 key 仅用于存在性检查
        unit: '',
        // 特殊格式化：显示 起始电流 → 结束电流
        format: (_v, params) => {
            if (!params) return '';

            const startI = params.start_current ?? 0;
            const endI = params.end_current ?? 0;

            return `${formatCurrent(startI)} → ${formatCurrent(endI)}`;
        },
        secondary: {
            label: '时间',
            key: 'measurement_duration',
            unit: 's'
        }
    }
};

interface NodeParameterDisplayProps {
    nodeType: string;
    params: Record<string, any>;
}

export const NodeParameterDisplay: React.FC<NodeParameterDisplayProps> = ({
    nodeType,
    params
}) => {
    const config = NODE_PARAM_CONFIG[nodeType];

    if (!config) return null;

    const formatValue = (value: any, cfg: ParamDisplayConfig | ParamDisplayConfig['secondary']) => {
        if (!cfg) return '';
        const formatted = cfg.format
            ? cfg.format(value, params)
            : String(value ?? '');
        return cfg.unit ? `${formatted}${cfg.unit}` : formatted;
    };

    const primaryValue = params[config.key];

    return (
        <div className="eis-parameters">
            <div className="eis-current">
                {config.label}：{formatValue(primaryValue, config)}
            </div>
            {config.secondary && (
                <div className="eis-frequency">
                    {config.secondary.label ? `${config.secondary.label}：` : '('}
                    {formatValue(params[config.secondary.key], config.secondary)}
                    {!config.secondary.label && ')'}
                </div>
            )}
        </div>
    );
};
