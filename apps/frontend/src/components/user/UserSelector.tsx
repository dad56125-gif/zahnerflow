import React, { useState, useRef } from 'react';
import { useUser } from '../shared/UserContext';
import { UserSettingsModal } from './UserSettingsModal';
import { useDropdownPosition } from '../shared/useDropdownPosition';
import { Dropdown } from '../shared/Dropdown';
import { ModalLayer } from '../shared/OverlayLayer';
import { renderCjkText, SpacedCjkText } from '../common/SpacedCjkText';
import { UiIconSvg } from '../shared/UiIconSvg';

interface UserSelectorProps {
  currentUser: string;
  onUserChange: (user: string) => void;
  developerControls?: React.ReactNode;
  hasRunMetadataWarning?: boolean;
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
  onUserChange,
  developerControls,
  hasRunMetadataWarning
}) => {
  const { users, createUser, deleteUser, filePathConfig, currentUserAvatar } = useUser();

  // 根据缺失情况确定应该高亮提醒哪一个按钮
  const getHighlightType = () => {
    if (!hasRunMetadataWarning) return null;
    if (users.length === 0) {
      return 'create'; // 优先级 1：没有用户，提醒添加用户
    }
    if (!currentUser) {
      return 'select'; // 优先级 2：有用户但没选，提醒选择下拉
    }
    if (!filePathConfig.projectName || !filePathConfig.individualName) {
      return 'settings'; // 优先级 3：选了用户但没填项目/样品名，提醒配置按钮
    }
    return null;
  };

  const highlightType = getHighlightType();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string>('');
  const [newUserName, setNewUserName] = useState('');
  const [error, setError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const dropdown = useDropdownPosition({
    triggerRef: buttonRef,
    dropdownRef: dropdownRef,
    offset: 8,
    minWidth: 200,
  });

  const handleCreateUser = async () => {
    if (!newUserName.trim()) return;

    setError('');
    try {
      await createUser({ user: newUserName.trim() });
      setShowCreateDialog(false);
      setNewUserName('');
    } catch (err: any) {
      setError(err.message || '创建用户失败');
    }
  };

  const handleDeleteUser = (username: string) => {
    setUserToDelete(username);
    setShowDeleteDialog(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      const success = await deleteUser(userToDelete);
      if (success) {
        setShowDeleteDialog(false);
        setUserToDelete('');
      } else {
        alert('删除用户失败');
      }
    } catch (err: any) {
      alert(`删除用户失败: ${err.message}`);
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
        className={`btn btn--md btn--primary ${highlightType === 'select' ? 'user-selector__highlight--active' : ''}`}
        onClick={() => dropdown.toggle()}
      >
        {currentUserAvatar ? (
          <img
            src={currentUserAvatar}
            alt=""
            className="user-selector__avatar"
            style={{
              borderRadius: '50%',
              objectFit: 'cover'
            }}
          />
        ) : (
          <span className="btn-icon">
            <UiIconSvg name="user" />
          </span>
        )}
        <span className="btn-text">{renderCjkText(currentUser || '选择用户')}</span>
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
        className={`btn btn--md btn--secondary btn--icon btn--round user-selector__action-btn ${highlightType === 'settings' ? 'user-selector__highlight--active' : ''}`}
        onClick={() => setShowSettingsModal(true)}
        title="用户配置"
        disabled={!currentUser}
      >
        <span className="btn-icon"><UserActionIcon name="userSettings" /></span>
      </button>

      {/* 新建用户按钮 - 圆形 + 号，位于选择器右侧 */}
      <button
        className={`btn btn--md btn--secondary btn--icon btn--round user-selector__action-btn ${highlightType === 'create' ? 'user-selector__highlight--active' : ''}`}
        onClick={() => {
          setShowCreateDialog(true);
          setError('');
          setNewUserName('');
        }}
        title="新建用户"
      >
        <span className="btn-icon"><UserActionIcon name="createUser" /></span>
      </button>

      {developerControls && (
        <div className="user-selector__developer-controls">
          {developerControls}
        </div>
      )}

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
            {currentUser && (
              <div
                className="dropdown__option"
                onClick={() => {
                  onUserChange('');
                  dropdown.startClose();
                }}
                style={{
                  fontStyle: 'italic',
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--glass-border)',
                  minHeight: '20px',
                  height: '20px',
                  paddingTop: 0,
                  paddingBottom: 0,
                  fontSize: '11px'
                }}
              >
                <span><SpacedCjkText text="清除选择" /></span>
              </div>
            )}
            {users.length > 0 ? (
              users.map(user => (
                <div
                  key={user.user}
                  className={`dropdown__option ${user.user === currentUser ? 'is-selected' : ''}`}
                  onClick={() => {
                    onUserChange(user.user);
                    dropdown.startClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--size-xs)'
                  }}
                >
                  {/* 用户下拉项的小头像预览 */}
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      background: 'rgba(255, 255, 255, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      <UiIconSvg name="user" style={{ width: '12px', height: '12px', opacity: 0.4 }} />
                    )}
                  </div>
                  
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              <div className="dropdown__empty"><SpacedCjkText text="暂无用户" /></div>
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
              <h3><SpacedCjkText text="创建新用户" /></h3>
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
                  <SpacedCjkText text="取消" />
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
                  <SpacedCjkText text="确认" />
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
              <div className="delete-confirm__icon"><UiIconSvg name="warning" /></div>
              <h3><SpacedCjkText text="确认删除用户" /></h3>
              <p className="delete-confirm__text">
                <SpacedCjkText text="确定要删除用户" /> <strong>"{userToDelete}"</strong> <SpacedCjkText text="吗" />？
              </p>
              <p className="delete-confirm__subtext">
                <SpacedCjkText text="此操作无法撤销，用户相关数据将被永久删除。" />
              </p>
              <div className="dialog__buttons">
                <button
                  className="btn btn--sm btn--secondary"
                  onClick={close}
                >
                  <SpacedCjkText text="取消" />
                </button>
                <button
                  className="btn btn--sm btn--danger"
                  onClick={confirmDeleteUser}
                >
                  <SpacedCjkText text="删除用户" />
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
