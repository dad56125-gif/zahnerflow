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
  const { users, createUser, deleteUser } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string>('');
  const [newUserName, setNewUserName] = useState('');
  const [error, setError] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);

  
  // 处理动画结束事件
  useEffect(() => {
    if (!isHiding) return;

    const dropdown = dropdownRef.current;
    if (!dropdown) return;

    let animationCompleted = false;
    const fallbackTimer = setTimeout(() => {
      // 备用方案：如果动画事件没有触发，在300ms后强制关闭
      if (!animationCompleted) {
        setIsOpen(false);
        setIsHiding(false);
      }
    }, 300);

    const handleAnimationEnd = (e: AnimationEvent) => {
      // 如果是关闭动画结束，完全关闭
      if (e.animationName === 'dropdownOut') {
        animationCompleted = true;
        clearTimeout(fallbackTimer);
        setIsOpen(false);
        setIsHiding(false);
      }
    };

    // 延迟添加事件监听器，确保DOM已更新
    const timer = setTimeout(() => {
      dropdown.addEventListener('animationend', handleAnimationEnd);
    }, 0);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
      dropdown.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [isHiding]);

  // 计算下拉菜单位置（相对于视口）
  const updateDropdownPosition = () => {
    if (!buttonRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: buttonRect.bottom + 18, // 按钮底部 + 间距（下移18px，比之前多5px）
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

  const handleDeleteUser = async (userToDelete: string) => {
    setUserToDelete(userToDelete);
    setShowDeleteDialog(true);
  };

  const confirmDeleteUser = async () => {
    try {
      const success = await deleteUser(userToDelete);
      if (success) {
        console.log(`用户 ${userToDelete} 已删除`);
      } else {
        console.error(`删除用户 ${userToDelete} 失败`);
      }
    } catch (error) {
      console.error('Failed to delete user:', error);
    } finally {
      setShowDeleteDialog(false);
      setUserToDelete('');
    }
  };

  const cancelDeleteUser = () => {
    setShowDeleteDialog(false);
    setUserToDelete('');
  };

  return (
    <div className="user-selector-container" ref={containerRef}>
      {/* 用户选择器按钮 - 使用统一按钮系统样式 */}
      <button
        ref={buttonRef}
        className="btn_base btn_layout btn_style_common btn_medium glass btn-primary"
        onClick={() => {
          if (isOpen) {
            // 如果在打开状态，立即重置箭头状态，开始关闭动画
            setIsOpen(false);
            setIsHiding(true);
          } else {
            // 如果在关闭状态，直接打开
            setIsOpen(true);
          }
        }}
      >
        <span className="btn-icon">👤</span>
        <span className="btn-text">{currentUser || '选择用户'}</span>
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
      <Portal
        isOpen={isOpen || isHiding}
        onClose={() => setIsHiding(true)}
        pointerEvents="none"
      >
        <div
          ref={dropdownRef}
          className={`user-dropdown overlay_base ${isHiding ? 'hiding' : 'show'}`}
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`
          } as React.CSSProperties}
        >
          <div className="user-list">
            {users.length > 0 ? (
              users.map(user => (
                <div
                  key={user.user}
                  className={`user-option ${user.user === currentUser ? 'selected' : ''}`}
                >
                  <span
                    className="user-name"
                    onClick={() => {
                      onUserChange(user.user);
                      setIsHiding(true);
                    }}
                  >
                    {user.user}
                  </span>
                  <button
                    className="delete-user-btn"
                    onClick={(e) => {
                      e.stopPropagation(); // 防止触发用户选择
                      handleDeleteUser(user.user);
                    }}
                    title="删除用户"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="empty-users">暂无用户</div>
            )}
          </div>
        </div>
      </Portal>

      {/* 新建用户弹窗 */}
      <Portal
        isOpen={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          setNewUserName('');
          setError('');
        }}
        pointerEvents="none"
      >
        {showCreateDialog && (
          <div className="create-user-dialog overlay_base" onClick={(e) => {
            // 点击遮罩层（外部）
            if (e.target === e.currentTarget) {
              setShowCreateDialog(false);
              setNewUserName('');
              setError('');
            }
          }}>
            <div className="dialog-content" onClick={e => e.stopPropagation()}>
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
      </Portal>

      {/* 删除用户确认弹窗 */}
      <Portal
        isOpen={showDeleteDialog}
        onClose={cancelDeleteUser}
        pointerEvents="none"
      >
        {showDeleteDialog && (
          <div className="create-user-dialog overlay_base" onClick={(e) => {
            if (e.target === e.currentTarget) cancelDeleteUser();
          }}>
            <div className="dialog-content" onClick={e => e.stopPropagation()}>
              <div className="delete-warning-icon">⚠️</div>
              <h3>确认删除用户</h3>
              <p className="delete-warning-text">
                确定要删除用户 <strong>"{userToDelete}"</strong> 吗？
              </p>
              <p className="delete-warning-subtext">
                此操作无法撤销，用户相关数据将被永久删除。
              </p>
              <div className="dialog-buttons">
                <button
                  className="btn btn-secondary"
                  onClick={cancelDeleteUser}
                >
                  取消
                </button>
                <button
                  className="btn btn-danger"
                  onClick={confirmDeleteUser}
                >
                  删除用户
                </button>
              </div>
            </div>
          </div>
        )}
      </Portal>
    </div>
  );
};





