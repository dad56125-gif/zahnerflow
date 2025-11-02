/**
 * 节点渲染器
 *
 * 统一的节点渲染系统，从配置获取显示信息
 * 参数编辑功能完全转移到 PropertyPanel 中
 */

import React from 'react';
import { ElectrochemicalNode, getNodeConfig } from '../types/nodes';

export interface NodeRendererProps {
  node: ElectrochemicalNode;
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
 * 从配置获取节点的显示信息，统一处理所有节点类型
 */
export const NodeRenderer: React.FC<NodeRendererProps> = ({
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
  // 从配置获取节点信息
  const config = getNodeConfig(node.type);
  const displayName = config.name;
  const icon = config.icon;

  // 节点拖拽交换相关状态
  const [isDragOver, setIsDragOver] = React.useState(false);

  // 节点点击处理
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeClick?.(node);
  };

  // 节点双击处理
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onNodeDoubleClick?.(node);
  };

  // 节点右键菜单处理
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNodeContextMenu?.(node, e);
  };

  // 节点拖拽开始处理
  const handleDragStart = (e: React.DragEvent) => {
    console.log(`开始拖拽节点：${node.name}，当前索引：${index}`);
    onNodeDragStart?.(node, e);
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  };

  // 节点拖拽结束处理
  const handleDragEnd = (e: React.DragEvent) => {
    console.log('拖拽结束');
    onNodeDragEnd?.(node, e);
    (e.currentTarget as HTMLElement).style.opacity = '1';
  };

  // 节点拖拽悬停处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  // 节点拖拽离开处理
  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // 节点放置处理
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    (e.currentTarget as HTMLElement).style.opacity = '1';
  };

  return (
    <div
      className={`node glass status-${node.status} ${
        isSelected ? 'selected' : ''
      } ${
        isConnecting ? 'connecting' : ''
      } ${
        isDragOver ? 'drag-over' : ''
      }`}
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: node.style.width || 140, // 与配置文件保持一致
        height: node.style.height || 60, // 与配置文件保持一致
        cursor: 'grab',
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
  
      {/* 节点图标 - 左侧 */}
      <div className="node-icon-large">
        {icon}
      </div>

      {/* 节点内容容器 - 包含标题和特殊显示 */}
      <div className="node-content">
        {/* 节点标题 */}
        <div className="node-title">
          {displayName}
        </div>

        {/* change_temperature节点的特殊显示 */}
        {node.type === 'change_temperature' && (
          <div className="eis-parameters">
            {node.data.parameters?.current_temperature && node.data.parameters?.target_temperature ? (
              <>
                {/* 执行后显示温度区间 */}
                <div className="eis-current">
                  温度：{Math.round(node.data.parameters.current_temperature / 10)}→{Math.round(node.data.parameters.target_temperature / 10)}°C
                </div>
                {/* 执行后显示计算时间 */}
                {node.data.parameters?.calculated_duration && (
                  <div className="eis-frequency">
                    时间：{node.data.parameters.calculated_duration}分钟
                  </div>
                )}
              </>
            ) : (
              /* 执行前显示目标温度 */
              <div className="eis-current">
                温度：{Math.round((node.data.parameters?.target_temperature || 25) / 10)}°C
              </div>
            )}
          </div>
        )}

        {/* change_gas_flow节点的特殊显示 */}
        {node.type === 'change_gas_flow' && (
          <div className="eis-parameters">
            {node.data.parameters?.current_flow_rate !== undefined && node.data.parameters?.target_flow_rate ? (
              <>
                {/* 执行后显示流量区间 */}
                <div className="eis-current">
                  流量：{node.data.parameters.current_flow_rate.toFixed(1)}→{node.data.parameters.target_flow_rate.toFixed(1)} sccm
                </div>
                {/* 执行后显示设备信息 */}
                <div className="eis-frequency">
                  地址{node.data.parameters.device_address} ({node.data.parameters.gas_type})
                </div>
              </>
            ) : (
              /* 执行前显示目标流量 */
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
                {/* 显示直流偏置电流 */}
                <div className="eis-current">
                  直流：{node.data.parameters.eis_current}A
                </div>
                {/* 显示交流扰动幅值 */}
                <div className="eis-frequency">
                  扰动：{node.data.parameters.eis_amplitude}A
                </div>
              </>
            ) : (
              /* 参数未设置时显示默认信息 */
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
                {/* 显示直流偏置电位 */}
                <div className="eis-current">
                  直流：{node.data.parameters.eis_potential}V
                </div>
                {/* 显示交流扰动幅值 */}
                <div className="eis-frequency">
                  扰动：{node.data.parameters.eis_amplitude}V
                </div>
              </>
            ) : (
              /* 参数未设置时显示默认信息 */
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
                {/* 显示测量时间 */}
                <div className="eis-current">
                  时间：{node.data.parameters.measurement_duration}s
                </div>
              </>
            ) : (
              /* 参数未设置时显示默认信息 */
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
                {/* 显示直流电压 */}
                <div className="eis-current">
                  直流：{node.data.parameters.polarization_voltage}V
                </div>
                {/* 显示测量时间 */}
                <div className="eis-frequency">
                  时间：{node.data.parameters.measurement_duration}s
                </div>
              </>
            ) : (
              /* 参数未设置时显示默认信息 */
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
                {/* 显示直流电流 */}
                <div className="eis-current">
                  直流：{Math.round(node.data.parameters.polarization_current * 1000)}mA
                </div>
                {/* 显示测量时间 */}
                <div className="eis-frequency">
                  时间：{node.data.parameters.measurement_duration}s
                </div>
              </>
            ) : (
              /* 参数未设置时显示默认信息 */
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
                {/* 显示电压范围 */}
                <div className="eis-current">
                  范围：{node.data.parameters.start_voltage}→{node.data.parameters.end_voltage}V
                </div>
              </>
            ) : (
              /* 参数未设置时显示默认信息 */
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
                {/* 显示电流范围 */}
                <div className="eis-current">
                  范围：{Math.round(node.data.parameters.start_current * 1000)}→{Math.round(node.data.parameters.end_current * 1000)}mA
                </div>
              </>
            ) : (
              /* 参数未设置时显示默认信息 */
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
                {/* 显示电压范围 */}
                <div className="eis-current">
                  范围：{node.data.parameters.start_voltage}→{node.data.parameters.end_voltage}V
                </div>
              </>
            ) : (
              /* 参数未设置时显示默认信息 */
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
                {/* 显示等待时间 */}
                <div className="eis-current">
                  时间：{node.data.parameters.duration}s
                </div>
              </>
            ) : (
              /* 参数未设置时显示默认信息 */
              <div className="eis-empty">
                --
              </div>
            )}
          </div>
        )}
      </div>

      {/* 节点端口（占位，后续在端口系统中实现） */}
      <div className="node-port-placeholder input" />
      <div className="node-port-placeholder output" />

      {/* 选中边框 */}
      {isSelected && (
        <div className="node-selection-border" />
      )}

      {/* 连接模式指示器 */}
      {isConnecting && connectionStart === node.id && (
        <div className="connection-start-indicator">
          🔗
        </div>
      )}
    </div>
  );
};

/**
 * 批量节点渲染器
 */
export interface NodeListRendererProps {
  nodes: ElectrochemicalNode[];
  selectedNodeId?: string | null;
  isConnecting?: boolean;
  connectionStart?: string | null;
  onNodeClick?: (node: ElectrochemicalNode) => void;
  onNodeDoubleClick?: (node: ElectrochemicalNode) => void;
  onNodeContextMenu?: (node: ElectrochemicalNode, event: React.MouseEvent) => void;
  onNodeDragStart?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
  onNodeDragEnd?: (node: ElectrochemicalNode, event: React.DragEvent) => void;
}

export const NodeListRenderer: React.FC<NodeListRendererProps> = ({
  nodes,
  selectedNodeId,
  isConnecting = false,
  connectionStart = null,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onNodeDragStart,
  onNodeDragEnd
}) => {
  return (
    <>
      {nodes.map((node, index) => (
        <NodeRenderer
          key={node.id}
          node={node}
          index={index}
          isSelected={selectedNodeId === node.id}
          isConnecting={isConnecting}
          connectionStart={connectionStart}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDragStart={onNodeDragStart}
          onNodeDragEnd={onNodeDragEnd}
        />
      ))}
    </>
  );
};

/**
 * 简化的节点渲染器（用于特殊场景）
 */
export const SimpleNodeRenderer: React.FC<{
  node: ElectrochemicalNode;
  isSelected?: boolean;
  onClick?: () => void;
}> = ({ node, isSelected = false, onClick }) => {
  return (
    <div
      className={`node glass status-${node.status} ${
        isSelected ? 'selected' : ''
      }`}
      style={{
        position: 'absolute',
        left: node.position.x,
        top: node.position.y,
        width: node.style.width || 140, // 与配置文件保持一致
        height: node.style.height || 60, // 与配置文件保持一致
      }}
      onClick={onClick}
    >
  
      {/* 节点图标 - 左侧 */}
      <div className="node-icon-large">
        {node.style.icon || '🔧'}
      </div>

      {/* 节点标题 - 右上角 */}
      <div className="node-title">
        {node.name}
      </div>

      {/* 选中边框 */}
      {isSelected && (
        <div className="node-selection-border" />
      )}
    </div>
  );
};

export default NodeRenderer;