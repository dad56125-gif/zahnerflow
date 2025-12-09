import React, { useState, useRef } from 'react';
import { useUser } from '../shared/UserContext';
import { Portal } from './Portal';
import { useDropdownPosition } from '../shared/useDropdownPosition';

interface UserSelectorProps {
  currentUser: string;
  onUserChange: (user: string) => void;
}

export const UserSelector: React.FC<UserSelectorProps> = ({
  currentUser,
  onUserChange
}) => {
  const { users, createUser, deleteUser } = useUser();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string>('');
  const [newUserName, setNewUserName] = useState('');
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);

  // 使用提取的 dropdown hook
  const dropdown = useDropdownPosition({
    triggerRef: buttonRef,
    dropdownRef: dropdownRef,
    offset: 18,
    minWidth: 280
  });


  const handleCreateUser = async () => {
    if (!newUserName.trim()) return;

    setError('');
    try {
      await createUser({ user: newUserName.trim() });
      // 创建用户后不自动选择，让用户手动选择
      setShowCreateDialog(false);
      setNewUserName('');
      dropdown.startClose();
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
        className="btn_base btn_layout btn_style_common btn_medium glass btn_primary"
        onClick={() => dropdown.toggle()}
      >
        <span className="btn-icon">👤</span>
        <span className="btn-text">{currentUser || '选择用户'}</span>
        <svg className={`dropdown-arrow ${dropdown.isOpen ? 'rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
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
        isOpen={dropdown.isOpen || dropdown.isHiding}
        onClose={() => dropdown.startClose()}
        pointerEvents="none"
      >
        <div
          ref={dropdownRef}
          className={`dropdown_base overlay_base ${dropdown.isHiding ? 'hiding' : 'show'}`}
          style={{
            top: `${dropdown.position.top}px`,
            left: `${dropdown.position.left}px`,
            width: `${dropdown.position.width}px`
          } as React.CSSProperties}
        >
          <div className="dropdown_list">
            {users.length > 0 ? (
              users.map(user => (
                <div
                  key={user.user}
                  className={`dropdown_option ${user.user === currentUser ? 'selected' : ''}`}
                >
                  <span
                    onClick={() => {
                      onUserChange(user.user);
                      dropdown.startClose();
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
              <div className="dropdown_empty">暂无用户</div>
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
                  className="btn btn_secondary"
                  onClick={() => {
                    setShowCreateDialog(false);
                    setNewUserName('');
                    setError('');
                  }}
                >
                  取消
                </button>
                <button
                  className="btn btn_primary"
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
                  className="btn btn_secondary"
                  onClick={cancelDeleteUser}
                >
                  取消
                </button>
                <button
                  className="btn btn_danger"
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





