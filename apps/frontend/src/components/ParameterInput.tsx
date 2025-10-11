import React from 'react';

// This interface is a combination of props used across different node files.
interface ParameterInputProps {
  label: string;
  type: 'number' | 'text' | 'select' | 'boolean';
  value: any;
  onChange: (value: any) => void;
  step?: number;
  min?: number;
  max?: number;
  options?: { value: string | boolean; label: string }[];
  placeholder?: string;
  unit?: string;
  required?: boolean;
  maxLength?: number;
}

export const ParameterInput: React.FC<ParameterInputProps> = ({
  label,
  type,
  value,
  onChange,
  step,
  min,
  max,
  options,
  placeholder,
  unit,
  required = false,
  maxLength
}) => {
  const inputId = `param-input-${label.replace(/\s+/g, '-').toLowerCase()}`;

  if (type === 'select' && options) {
    return (
      <div className="parameter-group">
        <label htmlFor={inputId} className="parameter-label">
          {label}
          {required && <span className="required-mark">*</span>}
        </label>
        <select
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="parameter-select"
          required={required}
        >
          {options.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (type === 'boolean') {
    return (
        <div className="parameter-group">
            <label htmlFor={inputId} className="parameter-label">
                {label}
                {unit && <span className="parameter-unit">({unit})</span>}
                {required && <span className="required-mark">*</span>}
            </label>
            <div className="parameter-checkbox">
                <input
                    id={inputId}
                    type="checkbox"
                    checked={value}
                    onChange={(e) => onChange(e.target.checked)}
                    className="parameter-checkbox-input"
                />
                <span className="parameter-checkbox-label">{value ? '是' : '否'}</span>
            </div>
        </div>
    );
  }

  return (
    <div className="parameter-group">
      <label htmlFor={inputId} className="parameter-label">
        {label}
        {required && <span className="required-mark">*</span>}
        {unit && <span className="parameter-unit">({unit})</span>}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        className="parameter-input"
        onWheel={(e) => (e.target as HTMLInputElement).blur()} // Prevent scroll wheel changes
        required={required}
        maxLength={maxLength}
      />
    </div>
  );
};
