import React, { memo, useCallback, useMemo } from 'react';
import { ElectrochemicalNode, getNodeConfig } from '../types/nodes';

export interface NodeRendererProps {
  node: ElectrochemicalNode & {
    layoutMeta?: {
      index: number;
      row: number;
      col: number;
      isLeftToRight: boolean;
      isFirstInRow: boolean;
      isLastInRow: boolean;
      isInOddRow: boolean;
      width: number;
      columns: number;
      zoomLevel?: number;
      [key: string]: any;
    };
  };
  index?: number;
  isSelected?: boolean;
  isConnecting?: boolean;
  connectionStart?: string | null;
  onNodeClick?: (node: ElectrochemicalNode) => void;
  onNodeDoubleClick?: (node: ElectrochemicalNode) => void;
  onNodeContextMenu?: (node: ElectrochemicalNode, event: React.MouseEvent) => void;
  onNodeDragStart?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
  onNodeDragEnd?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
}

/**
 * 节点渲染器组件
 */
export const NodeRenderer: React.FC<NodeRendererProps> = memo(({
  node,
  index,
  isSelected = false,
  isConnecting = false,
  connectionStart = null,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onNodeDragStart,
  onNodeDragEnd
}) => {
  const config = getNodeConfig(node.type);
  const displayName = config.name;
  const icon = config.icon;
  const remountKey = (node.data as any)?._force_reset_key || 'initial';
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeClick?.(node);
  }, [node.id, onNodeClick]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeDoubleClick?.(node);
  }, [node.id, onNodeDoubleClick]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeContextMenu?.(node, e);
  }, [node.id, onNodeContextMenu]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    onNodeDragStart?.(node, e);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, [node.id, index, onNodeDragStart]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    onNodeDragEnd?.(node, e);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  }, [node.id, index, onNodeDragEnd]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    (e.currentTarget as HTMLElement).style.opacity = '1';
  }, []);

  const nodeStyle = useMemo(() => {
    const style = {
      position: 'absolute' as const,
      left: node.position.x,
      top: node.position.y,
      width: node.style.width || 140,
      height: node.style.height || 60,
      cursor: 'grab',
    };
    return style;
  }, [node.position.x, node.position.y, node.style.width, node.style.height, node.layoutMeta?.zoomLevel]);

  const nodeClassName = useMemo(() =>
    `node glass status-${node.status} ${
      isSelected ? 'selected' : ''
    } ${
      isConnecting ? 'connecting' : ''
    } ${
      isDragOver ? 'drag-over' : ''
    }`,
    [node.status, isSelected, isConnecting, isDragOver]
  );

  return (
    <div
      className={nodeClassName}
      style={nodeStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      key={`${node.id}-${remountKey}`}
    >
      <div className="node-index-badge">
        [{index}]
      </div>

      <div className="node-icon-large">
        {icon}
      </div>

      <div className="node-content">
        <div className="node-title">
          {displayName}
        </div>

        {/* change_temperature节点的特殊显示 */}
        {node.type === 'change_temperature' && (
          <div className="eis-parameters">
            {node.data.parameters?.current_temperature && node.data.parameters?.target_temperature ? (
              <>
                <div className="eis-current">
                  温度：{Math.round(node.data.parameters.current_temperature)}→{Math.round(node.data.parameters.target_temperature)}°C
                </div>
                {node.data.parameters?.calculated_duration && (
                  <div className="eis-frequency">
                    时间：{node.data.parameters.calculated_duration}分钟
                  </div>
                )}
              </>
            ) : (
              <div className="eis-current">
                温度：{Math.round(node.data.parameters?.target_temperature || 25)}°C
              </div>
            )}
          </div>
        )}

        {/* change_gas_flow节点的特殊显示 */}
        {node.type === 'change_gas_flow' && (
          <div className="eis-parameters">
            {node.data.parameters?.current_flow_rate !== undefined && node.data.parameters?.target_flow_rate ? (
              <>
                <div className="eis-current">
                  流量：{node.data.parameters.current_flow_rate.toFixed(1)}→{node.data.parameters.target_flow_rate.toFixed(1)} sccm
                </div>
                <div className="eis-frequency">
                  地址{node.data.parameters.device_address} ({node.data.parameters.gas_type})
                </div>
              </>
            ) : (
              <div className="eis-current">
                流量：{(node.data.parameters?.target_flow_rate || 0).toFixed(1)} sccm
              </div>
            )}
          </div>
        )}

        {/* eis_galvanostatic节点的特殊显示 */}
        {node.type === 'eis_galvanostatic' && (
          <div className="eis-parameters">
            {node.data.parameters?.eis_current && node.data.parameters?.eis_amplitude ? (
              <>
                <div className="eis-current">
                  直流：{node.data.parameters.eis_current}A
                </div>
                <div className="eis-frequency">
                  扰动：{node.data.parameters.eis_amplitude}A
                </div>
              </>
            ) : (
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}

        {/* eis_potentiostatic节点的特殊显示 */}
        {node.type === 'eis_potentiostatic' && (
          <div className="eis-parameters">
            {node.data.parameters?.eis_potential && node.data.parameters?.eis_amplitude ? (
              <>
                <div className="eis-current">
                  直流：{node.data.parameters.eis_potential}V
                </div>
                <div className="eis-frequency">
                  扰动：{node.data.parameters.eis_amplitude}V
                </div>
              </>
            ) : (
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}

        {/* ocp_measurement节点的特殊显示 */}
        {node.type === 'ocp_measurement' && (
          <div className="eis-parameters">
            {node.data.parameters?.measurement_duration ? (
              <>
                <div className="eis-current">
                  时间：{node.data.parameters.measurement_duration}s
                </div>
              </>
            ) : (
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}

        {/* chronoamperometry节点的特殊显示 */}
        {node.type === 'chronoamperometry' && (
          <div className="eis-parameters">
            {node.data.parameters?.polarization_voltage && node.data.parameters?.measurement_duration ? (
              <>
                <div className="eis-current">
                  直流：{node.data.parameters.polarization_voltage}V
                </div>
                <div className="eis-frequency">
                  时间：{node.data.parameters.measurement_duration}s
                </div>
              </>
            ) : (
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}

        {/* chronopotentiometry节点的特殊显示 */}
        {node.type === 'chronopotentiometry' && (
          <div className="eis-parameters">
            {node.data.parameters?.polarization_current && node.data.parameters?.measurement_duration ? (
              <>
                <div className="eis-current">
                  直流：{Math.round(node.data.parameters.polarization_current * 1000)}mA
                </div>
                <div className="eis-frequency">
                  时间：{node.data.parameters.measurement_duration}s
                </div>
              </>
            ) : (
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}

        {/* voltage_ramp节点的特殊显示 */}
        {node.type === 'voltage_ramp' && (
          <div className="eis-parameters">
            {node.data.parameters?.start_voltage !== undefined && node.data.parameters?.end_voltage !== undefined ? (
              <>
                <div className="eis-current">
                  范围：{node.data.parameters.start_voltage}→{node.data.parameters.end_voltage}V
                </div>
              </>
            ) : (
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}

        {/* current_ramp节点的特殊显示 */}
        {node.type === 'current_ramp' && (
          <div className="eis-parameters">
            {node.data.parameters?.start_current !== undefined && node.data.parameters?.end_current !== undefined ? (
              <>
                <div className="eis-current">
                  范围：{Math.round(node.data.parameters.start_current * 1000)}→{Math.round(node.data.parameters.end_current * 1000)}mA
                </div>
              </>
            ) : (
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}

        {/* lsv_measurement节点的特殊显示 */}
        {node.type === 'lsv_measurement' && (
          <div className="eis-parameters">
            {node.data.parameters?.start_voltage !== undefined && node.data.parameters?.end_voltage !== undefined ? (
              <>
                <div className="eis-current">
                  范围：{node.data.parameters.start_voltage}→{node.data.parameters.end_voltage}V
                </div>
              </>
            ) : (
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}

        {/* wait_delay节点的特殊显示 */}
        {node.type === 'wait_delay' && (
          <div className="eis-parameters">
            {node.data.parameters?.duration ? (
              <>
                <div className="eis-current">
                  时间：{node.data.parameters.duration}s
                </div>
              </>
            ) : (
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}
      </div>

      {isSelected && (
        <div className="node-selection-border" />
      )}

      {isConnecting && connectionStart === node.id && (
        <div className="connection-start-indicator">
          🔗
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // 🎯 优化比较逻辑：包括 onNodeDragEnd 的检查，防止闭包过期的额外保障
  return (
    prevProps.node.id === nextProps.node.id &&
    prevProps.node.status === nextProps.node.status &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isConnecting === nextProps.isConnecting &&
    prevProps.connectionStart === nextProps.connectionStart &&
    prevProps.onNodeDragEnd === nextProps.onNodeDragEnd && // 👈 关键：检查事件处理函数是否变化
    JSON.stringify(prevProps.node.data) === JSON.stringify(nextProps.node.data)
  );
});