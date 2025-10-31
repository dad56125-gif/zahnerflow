import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { FilePathManagerUI } from '../FilePathManagerUI';

// Mock API with inline factory
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ success: true, projects: [] }),
    post: vi.fn().mockResolvedValue({ success: true, id: '123', dir_path: 'C:\\data\\test' })
  }
}));

describe('FilePathManagerUI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should display file path configuration form', () => {
    render(<FilePathManagerUI currentUser="" onClose={() => {}} onSave={() => {}} />);

    expect(screen.getByText('文件路径配置')).toBeInTheDocument();
    expect(screen.getByLabelText('基础路径:')).toBeInTheDocument();
    expect(screen.getByLabelText('项目名:')).toBeInTheDocument();
    expect(screen.getByLabelText('样品编号:')).toBeInTheDocument();
  });

  test('should save configuration when form submitted', async () => {
    const { api } = await import('../../services/api');
    const mockPost = vi.spyOn(api, 'post').mockResolvedValue({ success: true, id: '123', dir_path: 'C:\\data\\test' });

    const onSave = vi.fn();
    render(<FilePathManagerUI currentUser="" onClose={() => {}} onSave={onSave} />);

    // Fill form
    fireEvent.change(screen.getByLabelText('基础路径:'), {
      target: { value: 'C:\\data\\archive' }
    });
    // Fill the project input field (not the select)
    const projectInput = screen.getByPlaceholderText('或输入新项目名');
    fireEvent.change(projectInput, {
      target: { value: 'Test Project' }
    });
    fireEvent.change(screen.getByLabelText('样品编号:'), {
      target: { value: 'sample001' }
    });

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText('确定'));
    });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/files/path-config', {
        user: '',
        base_path: 'C:\\data\\archive',
        project_name: 'Test Project',
        individual_name: 'sample001',
        test_type: 'eis' // default test type
      });
    });

    expect(onSave).toHaveBeenCalledWith({
      base_path: 'C:\\data\\archive',
      project_name: 'Test Project',
      individual_name: 'sample001'
    });
  });
});