import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { UserSelector } from '../UserSelector';

// Mock API with inline factory
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ success: true, users: [] }),
    post: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn()
  }
}));

describe('UserSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should display current user name', () => {
    render(<UserSelector currentUser="test_user" onUserChange={() => {}} />);

    expect(screen.getByText('test_user')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('should show placeholder when no current user', () => {
    render(<UserSelector currentUser="" onUserChange={() => {}} />);

    expect(screen.getByText('选择用户')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('should open dropdown when button clicked', async () => {
    render(<UserSelector currentUser="test_user" onUserChange={() => {}} />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Should show create user option
    expect(screen.getByText('新建用户')).toBeInTheDocument();
  });

  test('should show create dialog when create user clicked', async () => {
    render(<UserSelector currentUser="" onUserChange={() => {}} />);

    // Open dropdown
    fireEvent.click(screen.getByRole('button'));

    // Click create user
    fireEvent.click(screen.getByText('新建用户'));

    // Should show dialog
    expect(screen.getByText('创建新用户')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('输入用户名')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
    expect(screen.getByText('确认')).toBeInTheDocument();
  });

  test('should handle user input in create dialog', async () => {
    render(<UserSelector currentUser="" onUserChange={() => {}} />);

    // Open dropdown and create dialog
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('新建用户'));

    // Type username
    const input = screen.getByPlaceholderText('输入用户名');
    fireEvent.change(input, { target: { value: 'new_user' } });

    expect(input).toHaveValue('new_user');
  });

  test('should call onUserChange when user is created', async () => {
    const { api } = await import('../../services/api');
    api.post.mockResolvedValue({ success: true });
    api.get.mockResolvedValue({ success: true, users: [] });

    const onUserChange = vi.fn();
    render(<UserSelector currentUser="" onUserChange={onUserChange} />);

    // Open dropdown and create dialog
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('新建用户'));

    // Type username and submit
    const input = screen.getByPlaceholderText('输入用户名');
    fireEvent.change(input, { target: { value: 'new_user' } });
    fireEvent.click(screen.getByText('确认'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/users', { user: 'new_user' });
      expect(onUserChange).toHaveBeenCalledWith('new_user');
    });
  });
});