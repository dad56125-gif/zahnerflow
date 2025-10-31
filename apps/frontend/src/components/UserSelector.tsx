import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';

interface UserSelectorProps {
  currentUser: string;
  onUserChange: (user: string) => void;
}

export const UserSelector: React.FC<UserSelectorProps> = ({
  currentUser,
  onUserChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<string[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 动态定位下拉菜单
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const button = dropdownRef.current.querySelector('.user-selector-button') as HTMLElement;
      const dropdown = dropdownRef.current.querySelector('.user-dropdown') as HTMLElement;

      if (button && dropdown) {
        const buttonRect = button.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${buttonRect.bottom + 8}px`;
        dropdown.style.left = `${buttonRect.left}px`;
        dropdown.style.width = `${Math.max(280, buttonRect.width)}px`;
      }
    }
  }, [isOpen]);

  // 动态定位新建用户对话框到 app-root 中心
  useEffect(() => {
    if (!showCreateDialog || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const appRoot = document.querySelector('.app-root') as HTMLElement | null;

    const positionDialog = () => {
      const rect = appRoot?.getBoundingClientRect();

      dialog.style.position = 'fixed';
      dialog.style.zIndex = '3000';
      dialog.style.display = 'flex';
      dialog.style.alignItems = 'center';
      dialog.style.justifyContent = 'center';

      if (rect) {
        dialog.style.top = `${rect.top}px`;
        dialog.style.left = `${rect.left}px`;
        dialog.style.width = `${rect.width}px`;
        dialog.style.height = `${rect.height}px`;
      } else {
        dialog.style.top = '0';
        dialog.style.left = '0';
        dialog.style.width = '100vw';
        dialog.style.height = '100vh';
      }
    };

    positionDialog();

    window.addEventListener('resize', positionDialog);
    window.addEventListener('scroll', positionDialog, true);

    return () => {
      window.removeEventListener('resize', positionDialog);
      window.removeEventListener('scroll', positionDialog, true);
    };
  }, [showCreateDialog]);

  const loadUsers = async () => {
    try {
            const response = await api.get('/users');
      if (Array.isArray((response as any).users)) {
        setUsers((response as any).users);
      } else if (response && (response as any).success && Array.isArray((response as any).data)) {
        setUsers((response as any).data);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim()) return;

    try {
      const response = await api.post('/users', {
        user: newUserName.trim()
      });

      if (response.success) {
        setUsers([...users, newUserName.trim()]);
        onUserChange(newUserName.trim());
        setShowCreateDialog(false);
        setNewUserName('');
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to create user:', error);
    }
  };

  return (
    <div className="user-selector-container" ref={dropdownRef}>
      {/* 用户选择器按钮 - 仿工作站样式但不复用其 class */}
      <button
        className="user-selector-button glass"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="user-display">{currentUser || '选择用户'}</span>
        <span className="dropdown-arrow">▼</span>
      </button>

      {/* 新建用户按钮 - 圆形 + 号，位于选择器右侧 */}
      <button
        className="create-user-btn-circle glass"
        onClick={() => setShowCreateDialog(true)}
        title="新建用户"
      >
        +
      </button>

      {/* 用户下拉菜单 - 仅包含用户列表 */}
      {isOpen && (
        <div className="user-dropdown">
          <div className="user-list">
            {users.length > 0 ? (
              users.map(user => (
                <button
                  key={user}
                  className={`user-option ${user === currentUser ? 'selected' : ''}`}
                  onClick={() => {
                    onUserChange(user);
                    setIsOpen(false);
                  }}
                >
                  {user}
                </button>
              ))
            ) : (
              <div className="empty-users">暂无用户</div>
            )}
          </div>
        </div>
      )}

      {/* 新建用户弹窗 */}
      {showCreateDialog && (
        <div className="create-user-dialog" ref={dialogRef}>
          <div className="dialog-content" onMouseDown={(e) => e.stopPropagation()}>
            <h3>创建新用户</h3>
            <input
              type="text" autoComplete="off" spellCheck={false}
              placeholder="输入用户名"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              autoFocus
            />
            <div className="dialog-buttons">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewUserName('');
                }}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateUser}
                disabled={!newUserName.trim()}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};





