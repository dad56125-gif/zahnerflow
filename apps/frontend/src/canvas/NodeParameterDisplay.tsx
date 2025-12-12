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
    };
}

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
        unit: 'A',
        secondary: {
            label: '扰动',
            key: 'eis_amplitude',
            unit: 'A'
        }
    },
    eis_potentiostatic: {
        label: '直流',
        key: 'eis_potential',
        unit: 'V',
        // 特殊处理：如果 enable_dc_bias 为 false 且 eis_potential 为 0，显示 OCV
        format: (v, params) => {
            if (params && !params.enable_dc_bias && (v === 0 || v === undefined)) {
                return 'OCV';
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
        unit: 'mA', // 显示毫安单位
        format: (v) => ((v || 0) * 1000).toFixed(1), // 转换为 mA
        secondary: {
            label: '时长',
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
        const formatted = (cfg as ParamDisplayConfig).format
            ? (cfg as ParamDisplayConfig).format!(value, params)
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
