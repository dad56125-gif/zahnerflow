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

  const loadUsers = async () => {
    try {
      const response = await api.get('/api/users');
      if (response.success) {
        setUsers(response.users);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim()) return;

    try {
      const response = await api.post('/api/users', {
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
    <div className="user-selector" ref={dropdownRef}>
      <button
        className="btn btn-secondary user-selector-button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="user-display">{currentUser || '选择用户'}</span>
        <span className="dropdown-arrow">▼</span>
      </button>

      {isOpen && (
        <div className="user-dropdown">
          <div className="dropdown-section">
            <button
              className="create-user-btn"
              onClick={() => setShowCreateDialog(true)}
            >
              <span className="icon">+</span>
              新建用户
            </button>
          </div>

          <div className="dropdown-divider"></div>

          <div className="dropdown-section user-list">
            {users.map(user => (
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
            ))}
          </div>
        </div>
      )}

      {showCreateDialog && (
        <div className="create-user-dialog">
          <div className="dialog-content">
            <h3>创建新用户</h3>
            <input
              type="text"
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