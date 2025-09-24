import React, { useState } from 'react';
import { ElectrochemicalNode, NodeCategory, WorkstationType, getNodeConfigByWorkstation, getNodeCategoryName } from '../nodes/types';

interface SidebarProps {
  activePanel: 'nodes';
  onPanelChange: (panel: 'nodes') => void;
  onNodeCreate: (type: any) => void;
  nodeGroups: Record<NodeCategory, string[]>;
  selectedNode: ElectrochemicalNode | null;
  selectedWorkstation: WorkstationType | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePanel,
  onPanelChange,
  onNodeCreate,
  nodeGroups,
  selectedNode,
  selectedWorkstation
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleNodeDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('nodeType', nodeType);
  };

  const handleCanvasDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const nodeType = event.dataTransfer.getData('nodeType');
    if (nodeType) {
      onNodeCreate(nodeType);
    }
  };

  const handleCanvasDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  // 获取节点配置（带工作站支持）
  const getNodeConfig = (nodeType: string) => {
    if (selectedWorkstation) {
      return getNodeConfigByWorkstation(nodeType, selectedWorkstation);
    }
    return null;
  };

  return (
    <div className="sidebar glass">
      {/* 标题 */}
      <div className="sidebar-header">
        <h2 className="sidebar-title">
          <span className="sidebar-icon">📦</span>
          <span className="sidebar-text">节点库</span>
          {selectedWorkstation && (
            <span className="workstation-indicator">
              ({selectedWorkstation === 'zahner-zennium' ? 'Zahner Zennium' : 'PP242'})
            </span>
          )}
        </h2>
      </div>

      {/* 节点面板 */}
      <div className="sidebar-content">
        {/* 搜索框 */}
        <div className="search-section">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="搜索节点..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input glass"
            />
          </div>
        </div>

        {/* 节点分类 */}
        <div className="node-categories">
          {!selectedWorkstation ? (
            <div className="no-workstation-message">
              <div className="no-workstation-icon">🔬</div>
              <div className="no-workstation-text">
                请先选择工作站以查看可用节点
              </div>
            </div>
          ) : (
            Object.entries(nodeGroups).map(([category, types]) => {
              const categoryNodes = types.filter(type => {
                const config = getNodeConfig(type);
                return config?.name.toLowerCase().includes(searchTerm.toLowerCase());
              });
              
              if (categoryNodes.length === 0) return null;

              return (
                <div key={category} className="node-category">
                  <h3 className="category-title">
                    {getNodeCategoryName(category as NodeCategory)}
                  </h3>
                  
                  <div className="node-grid">
                    {categoryNodes.map((nodeType) => {
                      const config = getNodeConfig(nodeType);
                      if (!config) return null;
                      
                      return (
                        <div
                          key={nodeType}
                          className="node-item glass"
                          draggable
                          onDragStart={(e) => handleNodeDragStart(e, nodeType)}
                          onClick={() => {
                            onNodeCreate(nodeType);
                          }}
                        >
                          <div className="node-icon">
                            {config.icon}
                          </div>
                          <div className="node-name">
                            {config.name}
                          </div>
                          <div className="node-description">
                            {config.description}
                          </div>
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

      
      {/* 拖放区域 */}
      <div
        className="canvas-drop-zone"
        onDrop={handleCanvasDrop}
        onDragOver={handleCanvasDragOver}
      />
    </div>
  );
};