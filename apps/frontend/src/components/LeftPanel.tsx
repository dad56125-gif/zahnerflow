import React from 'react';
import type { NodeCategory, WorkstationType } from '@zahnerflow/types';
import { useCanvasStore } from '../state/canvasStore';
import { getNodeConfigByWorkstation, getNodeCategoryName } from '../utils/nodeUtilities'
import { NodeIconSvg } from './NodeIconSvg';
const HIDDEN_NODE_LIBRARY_TYPES = new Set(['startup', 'shutdown']);

interface LeftPanelProps {
  activePanel: 'nodes';
  onPanelChange: (panel: 'nodes') => void;
  nodeGroups: Record<NodeCategory, string[]>;
  selectedWorkstation: WorkstationType | null;
  furnaceConnected?: boolean;
  mfcConnected?: boolean;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({ nodeGroups, selectedWorkstation, furnaceConnected = false, mfcConnected = false }) => {
  const addNode = useCanvasStore((state) => state.addNode);

  // 判断节点是否禁用
  const isNodeDisabled = (nodeType: string): boolean => {
    if (nodeType === 'change_temperature' && !furnaceConnected) return true;
    if (nodeType === 'change_gas_flow' && !mfcConnected) return true;
    return false;
  };

  const handleCreateNode = (nodeType: string) => {
    if (selectedWorkstation) {
      if (HIDDEN_NODE_LIBRARY_TYPES.has(nodeType)) {
        return;
      }
      addNode(nodeType as any);
    }
  };

  const getNodeConfig = (nodeType: string) => {
    if (selectedWorkstation) {
      return getNodeConfigByWorkstation(nodeType, selectedWorkstation);
    }
    return null;
  };

  return (
    <div className="left-panel glass-layout">
      <div className="left-panel__header">
        <h3 className="bar-header-title">
          <span className="left-panel-text">节点</span>
          {selectedWorkstation && (
            <span className="workstation-indicator">
              ({selectedWorkstation === 'zahner-zennium' ? 'Zahner Zennium' : 'PP242'})
            </span>
          )}
        </h3>
      </div>

      <div className="left-panel__content">

        <div className="node-categories">
          {!selectedWorkstation ? (
            <div className="no-workstation-message">
              <div className="no-workstation-text">请先选择工作站以查看可用节点</div>
            </div>
          ) : (
            Object.entries(nodeGroups).map(([category, types]) => {
              const categoryNodes = types.filter((type) => {
                if (HIDDEN_NODE_LIBRARY_TYPES.has(type)) return false;
                const config = getNodeConfig(type);
                return config !== undefined;
              });
              if (categoryNodes.length === 0) return null;

              return (
                <div key={category} className="node-category">
                  <h4 className="category-title">{getNodeCategoryName(category as NodeCategory)}</h4>
                  <div className="node-grid">
                    {categoryNodes.map((nodeType) => {
                      const config = getNodeConfig(nodeType);
                      if (!config) return null;
                      const disabled = isNodeDisabled(nodeType);
                      return (
                        <div
                          key={nodeType}
                          className={`node-item glass ${disabled ? 'disabled' : ''}`}
                          draggable={!disabled}
                          onDragStart={(e) => {
                            if (disabled) { e.preventDefault(); return; }
                            try {
                              e.dataTransfer.setData('nodeType', nodeType);
                              e.dataTransfer.effectAllowed = 'copy';
                              e.dataTransfer.dropEffect = 'copy';
                            } catch { }
                          }}
                          onClick={() => !disabled && handleCreateNode(nodeType)}
                          title={disabled ? `请先连接${nodeType === 'change_temperature' ? 'Furnace' : 'MFC'}设备` : config.description}
                        >
                          <div className="node-icon">
                            <NodeIconSvg nodeType={nodeType} fallback={config.icon} />
                          </div>
                          <div className="node-name">{config.name}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
