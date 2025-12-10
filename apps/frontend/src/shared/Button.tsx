/**
 * Button 统一按钮组件
 * 
 * 参考 Dropdown 组件思路，封装按钮样式类的组合逻辑
 * 通过 props 控制样式，无需手动组合 CSS 类名
 */

import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'neutral';
export type ButtonSize = 'mini' | 'small' | 'medium' | 'large';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** 颜色变体 */
    variant?: ButtonVariant;
    /** 尺寸 */
    size?: ButtonSize;
    /** 加载状态 */
    loading?: boolean;
    /** 全宽显示 */
    block?: boolean;
    /** 轮廓样式 */
    outline?: boolean;
    /** 左侧图标 */
    leftIcon?: React.ReactNode;
    /** 右侧图标 */
    rightIcon?: React.ReactNode;
}

/**
 * 统一按钮组件
 * 
 * @example
 * // 基础用法
 * <Button variant="primary">提交</Button>
 * 
 * // 带图标
 * <Button variant="success" leftIcon="✓">保存成功</Button>
 * 
 * // 加载状态
 * <Button variant="danger" loading>删除中...</Button>
 * 
 * // 全宽按钮
 * <Button variant="secondary" block>全宽按钮</Button>
 */
export const Button: React.FC<ButtonProps> = ({
    variant = 'secondary',
    size = 'medium',
    loading = false,
    block = false,
    outline = false,
    leftIcon,
    rightIcon,
    className = '',
    children,
    disabled,
    type = 'button',
    ...props
}) => {
    // 组合 CSS 类名
    const classes = [
        'btn_base',
        'btn_layout',
        'btn_style_common',
        `btn_${size}`,
        `btn_${variant}`,
        block && 'btn_block',
        outline && 'btn_outline',
        loading && 'btn_loading',
        className
    ].filter(Boolean).join(' ');

    return (
        <button
            type={type}
            className={classes}
            disabled={disabled || loading}
            {...props}
        >
            {leftIcon && <span className="btn-icon-left">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="btn-icon-right">{rightIcon}</span>}
        </button>
    );
};

export default Button;
