import React from 'react';
import { NodeCategory, WorkstationType, } from '../types/Interfaces';
import { useCanvasStore } from '../state/canvasStore';
import { getNodeConfigByWorkstation, getNodeCategoryName } from '../types/NodeUtilities'
interface SidebarProps {
  activePanel: 'nodes';
  onPanelChange: (panel: 'nodes') => void;
  nodeGroups: Record<NodeCategory, string[]>;
  selectedWorkstation: WorkstationType | null;
}

export const Sidebar: React.FC<SidebarProps> = ({ nodeGroups, selectedWorkstation }) => {
  const addNode = useCanvasStore((state) => state.addNode);

  const handleCreateNode = (nodeType: string) => {
    if (selectedWorkstation) {
      const { nodes } = useCanvasStore.getState();
      if (nodeType === 'startup' && nodes.some((n) => n.type === 'startup')) {
        alert('工作流中已存在一个启动程序节点');
        return;
      }
      if (nodeType === 'shutdown' && nodes.some((n) => n.type === 'shutdown')) {
        alert('工作流中已存在一个停止程序节点');
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
    <div className="node-library glass">
      <div className="node-library-header">
        <h3 className="bar-header-title">
          <span className="node-library-icon">📦</span>
          <span className="node-library-text">节点</span>
          {selectedWorkstation && (
            <span className="workstation-indicator">
              ({selectedWorkstation === 'zahner-zennium' ? 'Zahner Zennium' : 'PP242'})
            </span>
          )}
        </h3>
      </div>

      <div className="node-library-content">

        <div className="node-categories">
          {!selectedWorkstation ? (
            <div className="no-workstation-message">
              <div className="no-workstation-text">请先选择工作站以查看可用节点</div>
            </div>
          ) : (
            Object.entries(nodeGroups).map(([category, types]) => {
              const categoryNodes = types.filter((type) => {
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
                      return (
                        <div
                          key={nodeType}
                          className="node-item glass"
                          draggable
                          onDragStart={(e) => {
                            try {
                              e.dataTransfer.setData('nodeType', nodeType);
                              e.dataTransfer.effectAllowed = 'copy';
                              e.dataTransfer.dropEffect = 'copy';
                            } catch { }
                          }}
                          onClick={() => handleCreateNode(nodeType)}
                          title={config.description}
                        >
                          <div className="node-icon">{config.icon}</div>
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
