import React, { useState, useRef } from 'react';
import { useUser } from '../shared/UserContext';
import { UserSettingsModal } from './UserSettingsModal';
import { useDropdownPosition } from '../shared/useDropdownPosition';
import { Dropdown } from '../shared/Dropdown';
import { ModalLayer } from '../shared/OverlayLayer';

interface UserSelectorProps {
  currentUser: string;
  onUserChange: (user: string) => void;
}

type UserActionIconName = 'createUser' | 'userSettings';

const UserActionIcon: React.FC<{ name: UserActionIconName }> = ({ name }) => {
  const commonProps = {
    className: 'btn-svg-icon',
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    focusable: false,
  } as const;

  switch (name) {
    case 'userSettings':
      return (
        <svg {...commonProps}>
          <path className="btn-svg-icon__primary" d="M14,6.5A3.44,3.44,0,0,0,15.06,9H5.5a2.5,2.5,0,1,1,0-5h9.56A3.44,3.44,0,0,0,14,6.5Z" />
          <path className="btn-svg-icon__secondary" d="M21,6.2A3.49,3.49,0,0,0,15.06,4a3.5,3.5,0,0,0,2.44,6A3.49,3.49,0,0,0,21,6.8a1.51,1.51,0,0,0,0-.3A1.51,1.51,0,0,0,21,6.2Z" />
          <path className="btn-svg-icon__primary" d="M10,17.5A3.44,3.44,0,0,0,8.94,15H18.5a2.5,2.5,0,1,1,0,5H8.94A3.44,3.44,0,0,0,10,17.5Z" />
          <path className="btn-svg-icon__secondary" d="M3,17.8A3.49,3.49,0,0,0,8.94,20,3.5,3.5,0,0,0,6.5,14,3.49,3.49,0,0,0,3,17.2a2.26,2.26,0,0,0,0,.6Z" />
        </svg>
      );
    case 'createUser':
      return (
        <svg {...commonProps}>
          <path className="btn-svg-icon__secondary" d="M17,5h4M19,3V7" />
          <path className="btn-svg-icon__primary" d="M13,3.35A5.8,5.8,0,0,0,11,3a6,6,0,1,0,5.65,8" />
          <path className="btn-svg-icon__primary" d="M15.29,13.19A5,5,0,0,1,19,18v1s-2,2-8,2-8-2-8-2V18a5,5,0,0,1,3.71-4.81" />
        </svg>
      );
  }
};

export const UserSelector: React.FC<UserSelectorProps> = ({
  currentUser,
  onUserChange
}) => {
  const { users, createUser, deleteUser } = useUser();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string>('');
  const [newUserName, setNewUserName] = useState('');
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      if (!success) {
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
    <div className="user-selector__container" ref={containerRef}>
      {/* 用户选择器按钮 - 使用统一按钮系统样式 */}
      <button
        ref={buttonRef}
        className="btn btn--md btn--primary"
        onClick={() => dropdown.toggle()}
      >
        <span className="btn-icon">👤</span>
        <span className="btn-text">{currentUser || '选择用户'}</span>
        <svg className={`dropdown__arrow ${dropdown.isOpen ? 'is-rotated' : ''}`} viewBox="-10 -6 20 12" width="12" height="12">
          <path
            d="M -8 -3 L 0 5 L 8 -3"
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* 配置按钮 - 圆形齿轮，位于选择器右侧 */}
      <button
        className="btn btn--md btn--secondary btn--icon btn--round user-selector__action-btn"
        onClick={() => setShowSettingsModal(true)}
        title="用户配置"
        disabled={!currentUser}
      >
        <span className="btn-icon"><UserActionIcon name="userSettings" /></span>
      </button>

      {/* 新建用户按钮 - 圆形 + 号，位于选择器右侧 */}
      <button
        className="btn btn--md btn--secondary btn--icon btn--round user-selector__action-btn"
        onClick={() => {
          setShowCreateDialog(true);
          setError('');
          setNewUserName('');
        }}
        title="新建用户"
      >
        <span className="btn-icon"><UserActionIcon name="createUser" /></span>
      </button>

      {/* 用户下拉菜单 - 使用Portal渲染到body下，绕过层叠上下文限制 */}
      <Dropdown
        isOpen={dropdown.isOpen}
        isHiding={dropdown.isHiding}
        onClose={() => dropdown.startClose()}
        position={{ ...dropdown.position, id: 'user-selector-dropdown' }}
        pointerEvents="none"
        triggerRef={buttonRef}
      >
        <div
          ref={dropdownRef}
        >
            {users.length > 0 ? (
              users.map(user => (
                <div
                  key={user.user}
                  className={`dropdown__option ${user.user === currentUser ? 'is-selected' : ''}`}
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
                    className="btn btn--xs btn--ghost btn--icon btn--rounded user-selector__delete-btn"
                    onClick={(e) => {
                      e.stopPropagation(); // 防止触发用户选择
                      handleDeleteUser(user.user);
                    }}
                    title="删除用户"
                  >
                    <span className="btn-icon">✕</span>
                  </button>
                </div>
              ))
            ) : (
              <div className="dropdown__empty">暂无用户</div>
            )}
        </div>
      </Dropdown>

      {/* 新建用户弹窗 */}
      <ModalLayer
        open={showCreateDialog}
        onOpenChange={(open) => {
          if (!open) setShowCreateDialog(false);
        }}
        id="create-user-dialog-overlay"
      >
        {({ close }) => (
          <div className="create-user__dialog overlay-base">
            <div className="dialog__content">
              <h3>创建新用户</h3>
              <input
                type="text" autoComplete="off" spellCheck={false}
                className="input"
                placeholder="输入用户名"
                value={newUserName}
                onChange={(e) => {
                  setNewUserName(e.target.value);
                  if (error) setError(''); // 清除之前的错误
                }}
                autoFocus
              />
              {error && (
                <div className="error__message" style={{ color: 'var(--color-danger)', fontSize: 'var(--size-xs)', marginTop: 'var(--space-2)' }}>
                  {error}
                </div>
              )}
              <div className="dialog__buttons">
                <button
                  className="btn btn--sm btn--secondary"
                  onClick={close}
                >
                  取消
                </button>
                <button
                  className="btn btn--sm btn--primary"
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
      </ModalLayer>

      {/* 删除用户确认弹窗 */}
      <ModalLayer
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) cancelDeleteUser();
        }}
        id="delete-user-dialog-overlay"
      >
        {({ close }) => (
          <div className="create-user__dialog overlay-base">
            <div className="dialog__content">
              <div className="delete-confirm__icon">⚠️</div>
              <h3>确认删除用户</h3>
              <p className="delete-confirm__text">
                确定要删除用户 <strong>"{userToDelete}"</strong> 吗？
              </p>
              <p className="delete-confirm__subtext">
                此操作无法撤销，用户相关数据将被永久删除。
              </p>
              <div className="dialog__buttons">
                <button
                  className="btn btn--sm btn--secondary"
                  onClick={close}
                >
                  取消
                </button>
                <button
                  className="btn btn--sm btn--danger"
                  onClick={confirmDeleteUser}
                >
                  删除用户
                </button>
              </div>
            </div>
          </div>
        )}
      </ModalLayer>

      {/* 用户配置 Modal */}
      <UserSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  );
};
