import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../contexts/UserContext';
import { Portal } from './common/Portal';

interface UserSelectorProps {
  currentUser: string;
  onUserChange: (user: string) => void;
}

export const UserSelector: React.FC<UserSelectorProps> = ({
  currentUser,
  onUserChange
}) => {
  const { users, createUser } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [error, setError] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 手动处理点击外部关闭（替代useOnClickOutside）
  // 因为下拉菜单在Portal中，无法被containerRef捕获
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // 如果点击在按钮上，不关闭（按钮会自己处理toggle）
      if (buttonRef.current?.contains(target)) return;

      // 如果点击在下拉菜单上，不关闭
      if (dropdownRef.current?.contains(target)) return;

      // 点击在其他地方，关闭下拉菜单
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 计算下拉菜单位置（相对于视口）
  const updateDropdownPosition = () => {
    if (!buttonRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: buttonRect.bottom + 13, // 按钮底部 + 间距（下移13px，比之前多5px）
      left: buttonRect.left,
      width: Math.max(280, buttonRect.width)
    });
  };

  // 打开下拉菜单时更新位置
  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();

      // 监听窗口变化，实时更新位置
      const handleResize = () => updateDropdownPosition();
      const handleScroll = () => updateDropdownPosition();

      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen]);

  // 手动处理新建用户对话框点击外部关闭
  useEffect(() => {
    if (!showCreateDialog) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // 如果点击在对话框内容区域，不关闭
      const dialogContent = dialogRef.current?.querySelector('.dialog-content');
      if (dialogContent?.contains(target)) return;

      // 点击遮罩层，关闭对话框
      setShowCreateDialog(false);
      setNewUserName('');
      setError('');
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCreateDialog]);

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
      // 创建用户后不自动选择，让用户手动选择
      setShowCreateDialog(false);
      setNewUserName('');
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to create user:', error);
      setError((error as Error).message || '创建用户失败');
    }
  };

  return (
    <div className="user-selector-container" ref={containerRef}>
      {/* 用户选择器按钮 - 移除glass类以避免transform隔离 */}
      <button
        ref={buttonRef}
        className="user-selector-button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="user-display">{currentUser || '选择用户'}</span>
        <svg className={`dropdown-arrow ${isOpen ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
                  <path
                    d="M -8 -3 L 0 5 L 8 -3"
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

      {/* 用户下拉菜单 - 使用Portal渲染到body下，绕过层叠上下文限制 */}
      <Portal>
        {isOpen && (
          <div
            ref={dropdownRef}
            className="user-dropdown show"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`
            } as React.CSSProperties}
          >
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
      </Portal>

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





