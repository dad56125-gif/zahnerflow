import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../contexts/UserContext';
import { useOnClickOutside } from '../services/hooks/useOnClickOutside';

interface UserSelectorProps {
  currentUser: string;
  onUserChange: (user: string) => void;
}

export const UserSelector: React.FC<UserSelectorProps> = ({
  currentUser,
  onUserChange
}) => {
  const { users, loadUsers, createUser } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [error, setError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  // 使用 useOnClickOutside Hook 实现下拉菜单点击外部关闭
  useOnClickOutside(dropdownRef, () => {
    setIsOpen(false);
  }, isOpen);

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

  // 使用 useOnClickOutside Hook 实现新建用户对话框点击外部关闭
  useOnClickOutside(dialogRef, () => {
    setShowCreateDialog(false);
    setNewUserName('');
    setError('');
  }, showCreateDialog);

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

  const handleCreateUser = async () => {
    if (!newUserName.trim()) return;

    setError('');
    try {
      await createUser({ user: newUserName.trim() });
      onUserChange(newUserName.trim());
      setShowCreateDialog(false);
      setNewUserName('');
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to create user:', error);
      setError((error as Error).message || '创建用户失败');
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
        <svg className="dropdown-arrow" viewBox="-10 -12 20 24" width="12" height="12">
                  <path
                    d="M -10 -12 L 0 0 L -10 12"
                    fill="none"
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
      </button>

      {/* 新建用户按钮 - 圆形 + 号，位于选择器右侧 */}
      <button
        className="create-user-btn-circle glass"
        onClick={() => {
          setShowCreateDialog(true);
          setError('');
          setNewUserName('');
        }}
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
                  key={user.user}
                  className={`user-option ${user.user === currentUser ? 'selected' : ''}`}
                  onClick={() => {
                    onUserChange(user.user);
                    setIsOpen(false);
                  }}
                >
                  {user.user}
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
              onChange={(e) => {
                setNewUserName(e.target.value);
                if (error) setError(''); // 清除之前的错误
              }}
              autoFocus
            />
            {error && (
              <div className="error-message" style={{ color: 'red', fontSize: '12px', marginTop: '8px' }}>
                {error}
              </div>
            )}
            <div className="dialog-buttons">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewUserName('');
                  setError('');
                }}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateUser}
                disabled={!newUserName.trim() || !!error}
                title={
                  !newUserName.trim() ? '请输入用户名' :
                  !!error ? error :
                  '创建新用户'
                }
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





