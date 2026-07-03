/**
 * DataTable 通用实时数据表格组件
 * 
 * 用于显示实时数据流，新数据始终显示在最前面。
 * 支持 TIV 测量数据、管式炉监控数据等。
 */

import React, { useMemo } from 'react';

type TableVariant = 'default' | 'compact' | 'striped';
type TableSize = 'small' | 'medium' | 'large';

export interface TableColumn<T = any> {
    /** 列标识符，对应数据对象的 key */
    key: string;
    /** 列标题 */
    title: string;
    /** 自定义宽度 */
    width?: string | number;
    /** 对齐方式 */
    align?: 'left' | 'center' | 'right';
    /** 自定义渲染函数 */
    render?: (value: any, row: T, index: number) => React.ReactNode;
    /** 格式化函数（简单文本格式化） */
    format?: (value: any) => string;
}

interface DataTableProps<T = any> {
    /** 列定义 */
    columns: TableColumn<T>[];
    /** 数据源，新数据应在数组前面 */
    data: T[];
    /** 行唯一标识符字段 */
    rowKey?: string | ((row: T, index: number) => string);
    /** 样式变体 */
    variant?: TableVariant;
    /** 尺寸 */
    size?: TableSize;
    /** 最大显示行数 */
    maxRows?: number;
    /** 固定表头 */
    stickyHeader?: boolean;
    /** 表格高度（启用滚动） */
    height?: string | number;
    /** 空数据提示 */
    emptyText?: string;
    /** 加载状态 */
    loading?: boolean;
    /** 额外的 className */
    className?: string;
    /** 行点击事件 */
    onRowClick?: (row: T, index: number) => void;
}

/**
 * 通用实时数据表格组件
 * 
 * @example
 * // TIV 数据表
 * <DataTable
 *     columns={[
 *         { key: 't', title: '时间 (s)', format: v => v.toFixed(2) },
 *         { key: 'i', title: '电流 (A)', format: v => v.toExponential(3) },
 *         { key: 'v', title: '电压 (V)', format: v => v.toFixed(4) }
 *     ]}
 *     data={tivData}
 *     maxRows={50}
 *     stickyHeader
 *     height="300px"
 * />
 * 
 * @example
 * // 管式炉温度记录
 * <DataTable
 *     columns={[
 *         { key: 'timestamp', title: '时间' },
 *         { key: 'pv', title: 'PV (°C)', format: v => v.toFixed(1) },
 *         { key: 'sv', title: 'SV (°C)', format: v => v.toFixed(1) }
 *     ]}
 *     data={furnaceHistory}
 *     variant="striped"
 *     size="small"
 * />
 */
export const DataTable = <T extends Record<string, any>>({
    columns,
    data,
    rowKey = 'id',
    variant = 'default',
    size = 'medium',
    maxRows,
    stickyHeader = false,
    height,
    emptyText = '暂无数据',
    loading = false,
    className = '',
    onRowClick
}: DataTableProps<T>) => {
    // 限制显示行数
    const displayData = useMemo(() => {
        return maxRows ? data.slice(0, maxRows) : data;
    }, [data, maxRows]);

    // 生成行 key
    const getRowKey = (row: T, index: number): string => {
        if (typeof rowKey === 'function') return rowKey(row, index);
        return String(row[rowKey] ?? index);
    };

    // 渲染单元格内容
    const renderCellContent = (col: TableColumn<T>, row: T, index: number): React.ReactNode => {
        const value = row[col.key];

        if (col.render) {
            return col.render(value, row, index);
        }

        if (col.format) {
            return col.format(value);
        }

        return value ?? '-';
    };

    // 组合 CSS 类名
    const tableClasses = [
        'datatable',
        `datatable--${variant}`,
        `datatable--${size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'md'}`,
        stickyHeader && 'datatable--sticky-header',
        loading && 'is-loading',
        className
    ].filter(Boolean).join(' ');

    const wrapperStyle: React.CSSProperties = height
        ? { height, overflow: 'auto' }
        : {};

    return (
        <div className="datatable__wrapper" style={wrapperStyle}>
            <table className={tableClasses}>
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th
                                key={col.key}
                                style={{
                                    width: col.width,
                                    textAlign: col.align || 'left'
                                }}
                            >
                                {col.title}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {displayData.length === 0 ? (
                        <tr className="datatable__empty-row">
                            <td colSpan={columns.length}>{emptyText}</td>
                        </tr>
                    ) : (
                        displayData.map((row, index) => (
                            <tr
                                key={getRowKey(row, index)}
                                onClick={() => onRowClick?.(row, index)}
                                className={onRowClick ? 'datatable__row--clickable' : ''}
                            >
                                {columns.map(col => (
                                    <td
                                        key={col.key}
                                        style={{ textAlign: col.align || 'left' }}
                                    >
                                        {renderCellContent(col, row, index)}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
            {loading && (
                <div className="datatable__loading-overlay">
                    <span className="datatable__spinner" />
                </div>
            )}
        </div>
    );
};

export default DataTable;
