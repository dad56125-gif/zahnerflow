# File System Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a comprehensive file system overhaul with reliable data saving, user management, and project-based data organization.

**Architecture:** Three-tier separation architecture - Frontend UI for user interaction, Backend for business logic and path management, Device layer for measurement execution.

**Tech Stack:** Node.js/Express backend, React frontend, Python device APIs, SQLite database.

---

## Phase 1: Data Saving Reliability Improvement

### Task 1: Implement Auto-Save Mechanism in Python Device Layer

**Files:**
- Modify: `apps/backend/src/modules/zahner-zennium/fastapi/zahner_device.py`

**Step 1: Write test for auto-save functionality**

```python
def test_auto_save_mechanism():
    import tempfile
    import os
    import csv
    import time
    from unittest.mock import patch, MagicMock

    # Create temp file for testing
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
        temp_file = f.name

    try:
        # Mock device and timer
        mock_device = MagicMock()
        mock_device.getCurrent.return_value = 0.001

        measurement_data = []
        last_save_time = time.monotonic()

        # Simulate measurement loop with auto-save
        for i in range(10):
            current = mock_device.getCurrent()
            measurement_data.append({"time": i * 0.1, "current": current})

            # Test save trigger after 5 minutes (simulate)
            if i == 5:  # Simulate time trigger
                _save_data_to_csv(temp_file, ['time', 'current'], measurement_data)
                saved_data = measurement_data.copy()
                measurement_data.clear()
                break

        # Verify file exists and has correct data
        assert os.path.exists(temp_file)
        with open(temp_file, 'r') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            assert len(rows) == 6  # 0-5 index
            assert rows[0]['time'] == '0.0'
            assert rows[0]['current'] == '0.001'

    finally:
        if os.path.exists(temp_file):
            os.unlink(temp_file)
```

**Step 2: Run test to verify it fails**

Run: `python -m pytest test_auto_save.py -v`
Expected: FAIL with "_save_data_to_csv function not defined"

**Step 3: Implement minimal auto-save functionality**

Add to zahner_device.py:

```python
def _save_data_to_csv(filename, fieldnames, data):
    import csv, os
    with open(filename, 'a', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        if not os.path.exists(filename) or os.path.getsize(filename) == 0:
            w.writeheader()
        w.writerows(data)

# Modified measurement loop example for one function
def measure_ocp_with_autosave(device_wrapper, polarization_time, sampling_time,
                            min_current, max_current, output_file):
    import time

    measurement_data = []
    last_save_time = time.monotonic()

    for _ in accurate_timer(duration=polarization_time, interval=sampling_time):
        current = device_wrapper.getCurrent()
        elapsed_time = time.monotonic() - last_save_time
        measurement_data.append({"time": elapsed_time, "current": current})

        # Auto-save every 5 minutes
        if time.monotonic() - last_save_time >= 300:
            _save_data_to_csv(output_file, ['time', 'current'], measurement_data)
            last_save_time = time.monotonic()
            measurement_data.clear()
            print("[自动保存] 已保存数据")

        # Early exit on abnormal current
        if not (min_current <= current <= max_current):
            break

    # Final save
    if measurement_data:
        _save_data_to_csv(output_file, ['time', 'current'], measurement_data)

    # Read from CSV for statistics (instead of memory)
    return _calculate_statistics_from_csv(output_file)

def _calculate_statistics_from_csv(filename):
    import csv
    import statistics

    currents = []
    with open(filename, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('current'):
                currents.append(float(row['current']))

    if not currents:
        return {"count": 0, "avg": 0, "min": 0, "max": 0}

    return {
        "count": len(currents),
        "avg": statistics.mean(currents),
        "min": min(currents),
        "max": max(currents)
    }
```

**Step 4: Run test to verify it passes**

Run: `python -m pytest test_auto_save.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/backend/src/modules/zahner-zennium/fastapi/zahner_device.py
git commit -m "feat: implement auto-save mechanism every 5 minutes"
```

---

## Phase 2: Database Structure Update

### Task 2: Update Database Schema for New Architecture

**Files:**
- Modify: `apps/backend/src/db/db.service.ts`

**Step 1: Write failing test for new database structure**

```typescript
// test/db.service.test.ts
import { DbService } from '../src/db/db.service';

describe('Database Service - New Schema', () => {
  let dbService: DbService;

  beforeEach(() => {
    dbService = new DbService();
  });

  test('should create user with correct structure', () => {
    const user = dbService.createUser({
      user: 'test_user',
      email: 'test@example.com'
    });

    expect(user.id).toMatch(/^user_\d+$/);
    expect(user.user).toBe('test_user');
    expect(user.email).toBe('test@example.com');
    expect(user.created_at).toBeDefined();
  });

  test('should create workflow with project_name and user fields', () => {
    const user = dbService.createUser({ user: 'test_user' });
    const workflow = dbService.createWorkflow({
      user: 'test_user',
      project_name: 'Test Project',
      title: 'Test Workflow'
    });

    expect(workflow.user).toBe('test_user');
    expect(workflow.project_name).toBe('Test Project');
    expect(workflow.title).toBe('Test Workflow');
    expect(workflow.created_at).toBeDefined();
  });

  test('should create data file path record', () => {
    const pathRecord = dbService.createDataFilePath({
      user: 'test_user',
      project_name: 'Test Project',
      individual_name: 'sample001',
      test_type: 'eis',
      base_path: 'C:\\data\\archive'
    });

    expect(pathRecord.user).toBe('test_user');
    expect(pathRecord.project_name).toBe('Test Project');
    expect(pathRecord.individual_name).toBe('sample001');
    expect(pathRecord.test_type).toBe('eis');
    expect(pathRecord.base_path).toBe('C:\\data\\archive');
    expect(pathRecord.dir_path).toContain('Test Project/sample001/eis');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/db.service.test.ts`
Expected: FAIL with missing methods

**Step 3: Implement updated database service**

```typescript
// apps/backend/src/db/db.service.ts (modified sections)
export interface User {
  id: string;
  user: string;
  email: string | null;
  created_at: string;
}

export interface Workflow {
  id: string;
  user: string;
  project_name: string;
  title: string;
  description: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface DataFilePath {
  id: string;
  user: string;
  project_name: string;
  individual_name: string;
  test_type: string;
  base_path: string;
  dir_path: string;
  created_at: string;
}

@Injectable()
export class DbService {
  private users: User[] = [];
  private workflows: Workflow[] = [];
  private dataFilePaths: DataFilePath[] = [];

  // User management methods
  createUser(userData: { user: string; email?: string }): User {
    const existingUser = this.users.find(u => u.user === userData.user);
    if (existingUser) {
      throw new Error(`User ${userData.user} already exists`);
    }

    const user: User = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user: userData.user,
      email: userData.email || null,
      created_at: new Date().toISOString()
    };

    this.users.push(user);
    return user;
  }

  getUsers(): User[] {
    return this.users;
  }

  deleteUser(user: string): boolean {
    const index = this.users.findIndex(u => u.user === user);
    if (index === -1) return false;

    this.users.splice(index, 1);
    return true;
  }

  // Updated workflow methods
  createWorkflow(workflowData: {
    user: string;
    project_name: string;
    title: string;
    description?: string;
    tags?: string;
  }): Workflow {
    const workflow: Workflow = {
      id: `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user: workflowData.user,
      project_name: workflowData.project_name,
      title: workflowData.title,
      description: workflowData.description || null,
      tags: workflowData.tags || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.workflows.push(workflow);
    return workflow;
  }

  // Data file path management
  createDataFilePath(pathData: {
    user: string;
    project_name: string;
    individual_name: string;
    test_type: string;
    base_path: string;
  }): DataFilePath {
    // Normalize Windows path
    const normalizedPath = pathData.base_path.replace(/\//g, '\\');
    const dirPath = path.join(
      normalizedPath,
      pathData.project_name,
      pathData.individual_name,
      pathData.test_type
    );

    const record: DataFilePath = {
      id: `path_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user: pathData.user,
      project_name: pathData.project_name,
      individual_name: pathData.individual_name,
      test_type: pathData.test_type,
      base_path: normalizedPath,
      dir_path: dirPath,
      created_at: new Date().toISOString()
    };

    this.dataFilePaths.push(record);
    return record;
  }

  getDataFilePaths(user?: string): DataFilePath[] {
    if (user) {
      return this.dataFilePaths.filter(p => p.user === user);
    }
    return this.dataFilePaths;
  }

  getProjects(user: string): string[] {
    const projects = new Set<string>();
    this.dataFilePaths
      .filter(p => p.user === user)
      .forEach(p => projects.add(p.project_name));
    return Array.from(projects);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- test/db.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/backend/src/db/db.service.ts test/db.service.test.ts
git commit -m "feat: update database schema for user and project management"
```

---

## Phase 3: Users Module Implementation

### Task 3: Create Users Module

**Files:**
- Create: `apps/backend/src/modules/users/users.service.ts`
- Create: `apps/backend/src/modules/users/users.controller.ts`
- Create: `apps/backend/src/modules/users/users.module.ts`
- Modify: `apps/backend/src/app.module.ts`

**Step 1: Write failing test for users controller**

```typescript
// test/users.controller.test.ts
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('Users Controller', () => {
  let app;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  test('POST /api/users should create new user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/users')
      .send({ user: 'test_user', email: 'test@example.com' })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('created');
  });

  test('GET /api/users should return user list', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/users')
      .expect(200);

    expect(Array.isArray(response.body.users)).toBe(true);
    expect(response.body.users).toContain('test_user');
  });

  test('DELETE /api/users/:user should delete user', async () => {
    const response = await request(app.getHttpServer())
      .delete('/api/users/test_user')
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/users.controller.test.ts`
Expected: FAIL with "Cannot GET /api/users"

**Step 3: Implement users module**

Create users.service.ts:

```typescript
import { Injectable } from '@nestjs/common';
import { DbService, User } from '../../db/db.service';

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DbService) {}

  createUser(userData: { user: string; email?: string }): User {
    try {
      return this.dbService.createUser(userData);
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  getUsers(): User[] {
    return this.dbService.getUsers();
  }

  deleteUser(user: string): boolean {
    return this.dbService.deleteUser(user);
  }
}
```

Create users.controller.ts:

```typescript
import { Controller, Get, Post, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';

export interface CreateUserDto {
  user: string;
  email?: string;
}

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() createUserDto: CreateUserDto) {
    try {
      this.usersService.createUser(createUserDto);
      return {
        success: true,
        message: `User ${createUserDto.user} created successfully`
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get()
  getUsers() {
    const users = this.usersService.getUsers();
    return {
      users: users.map(u => u.user)
    };
  }

  @Delete(':user')
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('user') user: string) {
    const success = this.usersService.deleteUser(user);
    return {
      success,
      message: success ? `User ${user} deleted` : `User ${user} not found`
    };
  }
}
```

Create users.module.ts:

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DbService } from '../../db/db.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, DbService],
  exports: [UsersService],
})
export class UsersModule {}
```

**Step 4: Update app.module.ts**

```typescript
// Add to imports array
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    // ... existing imports
    UsersModule,
  ],
  // ... rest of module
})
```

**Step 5: Run test to verify it passes**

Run: `npm test -- test/users.controller.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/backend/src/modules/users/ apps/backend/src/app.module.ts test/users.controller.test.ts
git commit -m "feat: implement users module with CRUD operations"
```

---

## Phase 4: Files Service Refactoring

### Task 4: Refactor Files Service for Project-Based Structure

**Files:**
- Modify: `apps/backend/src/modules/files/files.service.ts`
- Modify: `apps/backend/src/modules/files/files.controller.ts`

**Step 1: Write failing test for files service refactoring**

```typescript
// test/files.service.test.ts
import { FilesService } from '../src/modules/files/files.service';
import { DbService } from '../src/db/db.service';

describe('Files Service - Project Structure', () => {
  let filesService: FilesService;
  let dbService: DbService;

  beforeEach(() => {
    dbService = new DbService();
    filesService = new FilesService(dbService);
  });

  test('should register file with project structure', () => {
    const result = filesService.registerFile({
      project_name: 'Test Project',
      individual_name: 'sample001',
      test_type: 'eis',
      base_path: 'C:\\data\\archive',
      filename: 'measurement.csv'
    });

    expect(result.dir_path).toBe('C:\\data\\archive\\Test Project\\sample001\\eis');
    expect(result.project_name).toBe('Test Project');
    expect(result.individual_name).toBe('sample001');
    expect(result.test_type).toBe('eis');
  });

  test('should return unique project names for user', () => {
    // Create test data
    dbService.createDataFilePath({
      user: 'test_user',
      project_name: 'Project A',
      individual_name: 'sample001',
      test_type: 'eis',
      base_path: 'C:\\data'
    });

    dbService.createDataFilePath({
      user: 'test_user',
      project_name: 'Project B',
      individual_name: 'sample002',
      test_type: 'iv',
      base_path: 'C:\\data'
    });

    const projects = filesService.getProjects('test_user');
    expect(projects).toEqual(['Project A', 'Project B']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/files.service.test.ts`
Expected: FAIL with missing methods

**Step 3: Implement refactored files service**

```typescript
// apps/backend/src/modules/files/files.service.ts (complete rewrite)
import { Injectable } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import * as path from 'path';

export interface RegisterFilePayload {
  user: string;
  project_name: string;
  individual_name: string;
  test_type: string;
  base_path?: string;
  filename: string;
}

export interface RegisterFileResult {
  id: string;
  dir_path: string;
  project_name: string;
  individual_name: string;
  test_type: string;
}

@Injectable()
export class FilesService {
  constructor(private readonly dbService: DbService) {}

  registerFile(payload: RegisterFilePayload): RegisterFileResult {
    const basePath = payload.base_path || 'C:\\data\\archive';

    // Normalize Windows path
    const normalizedBasePath = basePath.replace(/\//g, '\\');

    // Create directory structure: basePath/projectName/individualName/testType/
    const dirPath = path.join(
      normalizedBasePath,
      payload.project_name,
      payload.individual_name,
      payload.test_type
    );

    const record = this.dbService.createDataFilePath({
      user: payload.user,
      project_name: payload.project_name,
      individual_name: payload.individual_name,
      test_type: payload.test_type,
      base_path: normalizedBasePath
    });

    return {
      id: record.id,
      dir_path: record.dir_path,
      project_name: payload.project_name,
      individual_name: payload.individual_name,
      test_type: payload.test_type
    };
  }

  getProjects(user: string): string[] {
    return this.dbService.getProjects(user);
  }

  getProjectConfig(user: string, project_name: string, individual_name: string) {
    const paths = this.dbService.getDataFilePaths(user)
      .filter(p => p.project_name === project_name && p.individual_name === individual_name);

    if (paths.length === 0) {
      return null;
    }

    const firstPath = paths[0];
    return {
      base_path: firstPath.base_path,
      project_name: firstPath.project_name,
      individual_name: firstPath.individual_name
    };
  }
}
```

**Step 4: Update files controller**

```typescript
// apps/backend/src/modules/files/files.controller.ts
import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { FilesService, RegisterFilePayload } from './files.service';

@Controller('api/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  registerFile(@Body() payload: RegisterFilePayload) {
    try {
      const result = this.filesService.registerFile(payload);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get('projects')
  getProjects(@Query('user') user: string) {
    if (!user) {
      return {
        success: false,
        message: 'User parameter is required'
      };
    }

    const projects = this.filesService.getProjects(user);
    return {
      success: true,
      projects
    };
  }

  @Post('path-config')
  savePathConfig(@Body() config: {
    user: string;
    base_path: string;
    project_name: string;
    individual_name: string;
    test_type: string;
  }) {
    try {
      const result = this.filesService.registerFile({
        ...config,
        filename: 'placeholder.csv' // Will be replaced by device layer
      });

      return {
        success: true,
        id: result.id,
        dir_path: result.dir_path
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- test/files.service.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/backend/src/modules/files/ test/files.service.test.ts
git commit -m "feat: refactor files service for project-based structure"
```

---

## Phase 5: Frontend User Selector

### Task 5: Implement User Selector in TopNavbar

**Files:**
- Modify: `apps/frontend/src/components/TopNavbar.tsx`
- Create: `apps/frontend/src/components/UserSelector.tsx`

**Step 1: Write failing test for user selector**

```typescript
// test/UserSelector.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserSelector } from '../src/components/UserSelector';

// Mock API
jest.mock('../src/services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn()
  }
}));

describe('UserSelector', () => {
  test('should display user dropdown with create option', () => {
    render(<UserSelector currentUser="test_user" onUserChange={() => {}} />);

    expect(screen.getByText('test_user')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('should create new user when prompted', async () => {
    const mockPost = require('../src/services/api').api.post;
    mockPost.mockResolvedValue({ success: true });

    const onUserChange = jest.fn();
    render(<UserSelector currentUser="" onUserChange={onUserChange} />);

    // Click to open dropdown
    fireEvent.click(screen.getByRole('button'));

    // Click create user
    fireEvent.click(screen.getByText('新建用户'));

    // Enter username
    const input = screen.getByPlaceholderText('输入用户名');
    fireEvent.change(input, { target: { value: 'new_user' } });

    // Confirm
    fireEvent.click(screen.getByText('确认'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/users', { user: 'new_user' });
    });

    expect(onUserChange).toHaveBeenCalledWith('new_user');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/UserSelector.test.tsx`
Expected: FAIL with "UserSelector component not found"

**Step 3: Implement UserSelector component**

Create UserSelector.tsx:

```typescript
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
```

**Step 4: Add styles for UserSelector**

Create UserSelector.css:

```css
.user-selector {
  position: relative;
  display: inline-block;
}

.user-selector-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}

.user-display {
  font-weight: 500;
}

.dropdown-arrow {
  font-size: 12px;
  transition: transform 0.2s;
}

.user-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 1000;
  min-width: 280px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  overflow: hidden;
}

.dropdown-section {
  padding: 8px;
}

.create-user-btn {
  width: 100%;
  padding: 8px 12px;
  background: #f8f9fa;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.create-user-btn:hover {
  background: #e9ecef;
}

.dropdown-divider {
  height: 1px;
  background: #eee;
  margin: 0 8px;
}

.user-list {
  max-height: 200px;
  overflow-y: auto;
}

.user-option {
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
}

.user-option:hover {
  background: #f8f9fa;
}

.user-option.selected {
  background: #e3f2fd;
  border-left: 3px solid #2196f3;
}

.create-user-dialog {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dialog-content {
  background: white;
  padding: 24px;
  border-radius: 8px;
  min-width: 320px;
}

.dialog-content h3 {
  margin: 0 0 16px 0;
}

.dialog-content input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 16px;
}

.dialog-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .user-dropdown {
    min-width: 200px;
  }

  .user-display {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
```

**Step 5: Update TopNavbar to use UserSelector**

```typescript
// apps/frontend/src/components/TopNavbar.tsx (modify imports and usage)
import { UserSelector } from './UserSelector';
import './UserSelector.css';

// In the component, add UserSelector next to status
<div className="navbar-content">
  {/* ... existing content ... */}

  <div className="status-section">
    <div className="status-indicator ready">
      <span className="status-dot"></span>
      <span className="status-text">就绪</span>
    </div>

    <UserSelector
      currentUser={currentUser}
      onUserChange={setCurrentUser}
    />
  </div>
</div>
```

**Step 6: Run test to verify it passes**

Run: `npm test -- test/UserSelector.test.tsx`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/frontend/src/components/UserSelector.tsx apps/frontend/src/components/UserSelector.css apps/frontend/src/components/TopNavbar.tsx test/UserSelector.test.tsx
git commit -m "feat: implement user selector in TopNavbar"
```

---

## Phase 6: File Path Management UI

### Task 6: Implement Toolbar File Path Manager

**Files:**
- Modify: `apps/frontend/src/components/Toolbar.tsx`
- Create: `apps/frontend/src/components/FilePathManagerUI.tsx`
- Modify: `apps/frontend/src/components/Canvas.tsx`

**Step 1: Write failing test for FilePathManagerUI**

```typescript
// test/FilePathManagerUI.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FilePathManagerUI } from '../src/components/FilePathManagerUI';

// Mock API
jest.mock('../src/services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

describe('FilePathManagerUI', () => {
  test('should display file path configuration form', () => {
    render(<FilePathManagerUI onClose={() => {}} onSave={() => {}} />);

    expect(screen.getByText('文件路径配置')).toBeInTheDocument();
    expect(screen.getByLabelText('基础路径')).toBeInTheDocument();
    expect(screen.getByLabelText('项目名')).toBeInTheDocument();
    expect(screen.getByLabelText('样品编号')).toBeInTheDocument();
  });

  test('should save configuration when form submitted', async () => {
    const mockPost = require('../src/services/api').api.post;
    mockPost.mockResolvedValue({ success: true, id: '123', dir_path: 'C:\\data\\test' });

    const onSave = jest.fn();
    render(<FilePathManagerUI onClose={() => {}} onSave={onSave} />);

    // Fill form
    fireEvent.change(screen.getByLabelText('基础路径'), {
      target: { value: 'C:\\data\\archive' }
    });
    fireEvent.change(screen.getByLabelText('项目名'), {
      target: { value: 'Test Project' }
    });
    fireEvent.change(screen.getByLabelText('样品编号'), {
      target: { value: 'sample001' }
    });

    // Submit
    fireEvent.click(screen.getByText('确定'));

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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/FilePathManagerUI.test.tsx`
Expected: FAIL with "FilePathManagerUI component not found"

**Step 3: Implement FilePathManagerUI component**

Create FilePathManagerUI.tsx:

```typescript
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export interface FilePathConfig {
  base_path: string;
  project_name: string;
  individual_name: string;
}

interface FilePathManagerUIProps {
  currentUser: string;
  onClose: () => void;
  onSave: (config: FilePathConfig) => void;
}

export const FilePathManagerUI: React.FC<FilePathManagerUIProps> = ({
  currentUser,
  onClose,
  onSave
}) => {
  const [config, setConfig] = useState<FilePathConfig>({
    base_path: 'C:\\data\\archive',
    project_name: '',
    individual_name: ''
  });

  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentUser) {
      loadProjects();
    }
  }, [currentUser]);

  const loadProjects = async () => {
    try {
      const response = await api.get(`/api/files/projects?user=${currentUser}`);
      if (response.success) {
        setProjects(response.projects);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleSave = async () => {
    if (!config.project_name.trim() || !config.individual_name.trim()) {
      setError('项目名和样品编号不能为空');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/api/files/path-config', {
        user: currentUser,
        ...config,
        test_type: 'eis' // Default, will be overridden by actual measurement type
      });

      if (response.success) {
        onSave(config);
        onClose();
      } else {
        setError(response.message || '保存失败');
      }
    } catch (error) {
      setError('保存配置失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseDirectory = () => {
    // Create input element for directory selection
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;

    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        // Get the directory path from the first file
        const firstFile = files[0];
        const path = firstFile.webkitRelativePath.split('/')[0];
        setConfig({ ...config, base_path: path });
      }
    };

    input.click();
  };

  return (
    <div className="file-path-manager-overlay">
      <div className="file-path-manager-panel">
        <div className="panel-header">
          <h2>文件路径配置</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="panel-content">
          <div className="form-group">
            <label htmlFor="base_path">基础路径:</label>
            <div className="path-input-group">
              <input
                id="base_path"
                type="text"
                value={config.base_path}
                onChange={(e) => setConfig({ ...config, base_path: e.target.value })}
                placeholder="选择或输入基础路径"
              />
              <button
                type="button"
                className="browse-btn"
                onClick={handleBrowseDirectory}
                title="浏览文件夹"
              >
                📁
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="project_name">项目名:</label>
            <div className="project-input-group">
              <select
                value={config.project_name}
                onChange={(e) => setConfig({ ...config, project_name: e.target.value })}
                onFocus={(e) => {
                  if (!config.project_name && projects.length === 0) {
                    loadProjects();
                  }
                }}
              >
                <option value="">选择已有项目...</option>
                {projects.map(project => (
                  <option key={project} value={project}>{project}</option>
                ))}
              </select>
              <input
                type="text"
                value={config.project_name}
                onChange={(e) => setConfig({ ...config, project_name: e.target.value })}
                placeholder="或输入新项目名"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="individual_name">样品编号:</label>
            <input
              id="individual_name"
              type="text"
              value={config.individual_name}
              onChange={(e) => setConfig({ ...config, individual_name: e.target.value })}
              placeholder="输入样品编号"
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        <div className="panel-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? '保存中...' : '确定'}
          </button>
        </div>
      </div>
    </div>
  );
};
```

**Step 4: Add styles for FilePathManagerUI**

Create FilePathManagerUI.css:

```css
.file-path-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
}

.file-path-manager-panel {
  background: white;
  border-radius: 12px;
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.close-btn:hover {
  background: #f5f5f5;
}

.panel-content {
  padding: 24px;
  max-height: 400px;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
}

.path-input-group {
  display: flex;
  gap: 8px;
}

.path-input-group input {
  flex: 1;
}

.browse-btn {
  padding: 8px 12px;
  background: #f8f9fa;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.browse-btn:hover {
  background: #e9ecef;
}

.project-input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-input-group select,
.project-input-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.project-input-group select:focus,
.project-input-group input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #eee;
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #5a6268;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .file-path-manager-panel {
    width: 95vw;
    margin: 20px;
  }

  .panel-header,
  .panel-content,
  .panel-footer {
    padding: 16px;
  }

  .path-input-group {
    flex-direction: column;
  }
}
```

**Step 5: Update Toolbar to include file path button**

```typescript
// apps/frontend/src/components/Toolbar.tsx (modify)
import { FilePathManagerUI } from './FilePathManagerUI';
import './FilePathManagerUI.css';

// Add to props interface
interface ToolbarProps {
  // ... existing props
  showFilePathManager: boolean;
  onToggleFilePathManager: () => void;
  currentUser: string;
  onFilePathSave: (config: FilePathConfig) => void;
}

// In the component render, add file path button section
<div className="toolbar-section">
  {/* Left section */}
  <div className="toolbar-left">
    <button className="btn btn-secondary" onClick={onNew}>
      <span className="icon">📄</span> 新建
    </button>
    {/* ... other left buttons */}
  </div>

  {/* Middle section */}
  <div className="toolbar-middle">
    <button
      className="btn btn-secondary"
      onClick={onToggleFilePathManager}
    >
      <span className="icon">📁</span> 文件路径
    </button>
  </div>

  {/* Right section */}
  <div className="toolbar-right">
    {/* ... existing right buttons */}
  </div>
</div>

{/* Add overlay at the end */}
{showFilePathManager && (
  <FilePathManagerUI
    currentUser={currentUser}
    onClose={onToggleFilePathManager}
    onSave={onFilePathSave}
  />
)}
```

**Step 6: Update Canvas to handle overlay rendering**

```typescript
// apps/frontend/src/components/Canvas.tsx (modify)
// Add overlay rendering logic similar to workflow-manager-overlay
{showFilePathManager && (
  <div className="file-path-manager-overlay-container">
    {/* FilePathManagerUI will be rendered by Toolbar */}
  </div>
)}
```

**Step 7: Run test to verify it passes**

Run: `npm test -- test/FilePathManagerUI.test.tsx`
Expected: PASS

**Step 8: Commit**

```bash
git add apps/frontend/src/components/FilePathManagerUI.tsx apps/frontend/src/components/FilePathManagerUI.css apps/frontend/src/components/Toolbar.tsx apps/frontend/src/components/Canvas.tsx test/FilePathManagerUI.test.tsx
git commit -m "feat: implement file path manager UI with project configuration"
```

---

## Phase 7: Device API Integration

### Task 7: Modify Device APIs for Path Integration

**Files:**
- Modify: `apps/backend/src/modules/zahner-zennium/fastapi/zahner_device.py`
- Create: `apps/backend/src/modules/measurement/measurement.controller.ts`
- Create: `apps/backend/src/modules/measurement/measurement.service.ts`
- Create: `apps/backend/src/modules/measurement/measurement.module.ts`

**Step 1: Write failing test for measurement controller**

```typescript
// test/measurement.controller.test.ts
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';

describe('Measurement Controller', () => {
  let app;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  test('POST /api/measurement/eis should use file path config', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/measurement/eis')
      .send({
        user: 'test_user',
        project_name: 'Test Project',
        individual_name: 'sample001',
        base_path: 'C:\\data\\archive',
        // ... measurement parameters
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.file_path).toContain('Test Project\\sample001\\eis');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/measurement.controller.test.ts`
Expected: FAIL with "Cannot POST /api/measurement/eis"

**Step 3: Implement measurement module**

Create measurement.service.ts:

```typescript
import { Injectable } from '@nestjs/common';
import { FilesService } from '../files/files.service';
import { exec } from 'child_process';
import * as path from 'path';

export interface EISMeasurementParams {
  user: string;
  project_name: string;
  individual_name: string;
  base_path?: string;
  frequency_range: [number, number];
  amplitude: number;
  // ... other EIS parameters
}

@Injectable()
export class MeasurementService {
  constructor(private readonly filesService: FilesService) {}

  async performEISMeasurement(params: EISMeasurementParams) {
    // Get directory path from Files service
    const pathResult = this.filesService.registerFile({
      user: params.user,
      project_name: params.project_name,
      individual_name: params.individual_name,
      test_type: 'eis',
      base_path: params.base_path,
      filename: 'eis_measurement.csv'
    });

    // Create directory if it doesn't exist
    const fs = require('fs');
    if (!fs.existsSync(pathResult.dir_path)) {
      fs.mkdirSync(pathResult.dir_path, { recursive: true });
    }

    // Call Python device API with the path
    const pythonScript = path.join(
      process.cwd(),
      'apps/backend/src/modules/zahner-zennium/fastapi/zahner_device.py'
    );

    const command = `python "${pythonScript}" eis "${pathResult.dir_path}" ${params.frequency_range[0]} ${params.frequency_range[1]} ${params.amplitude}`;

    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve({
            success: true,
            data: result,
            file_path: path.join(pathResult.dir_path, 'eis_measurement.csv'),
            dir_path: pathResult.dir_path
          });
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  }

  // Similar methods for other measurement types (IV, OCP, etc.)
}
```

Create measurement.controller.ts:

```typescript
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { MeasurementService, EISMeasurementParams } from './measurement.service';

@Controller('api/measurement')
export class MeasurementController {
  constructor(private readonly measurementService: MeasurementService) {}

  @Post('eis')
  @HttpCode(HttpStatus.OK)
  async performEIS(@Body() params: EISMeasurementParams) {
    try {
      const result = await this.measurementService.performEISMeasurement(params);
      return result;
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.toString()
      };
    }
  }

  // Add other measurement endpoints (iv, ocp, etc.)
}
```

Create measurement.module.ts:

```typescript
import { Module } from '@nestjs/common';
import { MeasurementService } from './measurement.service';
import { MeasurementController } from './measurement.controller';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [MeasurementController],
  providers: [MeasurementService],
  exports: [MeasurementService],
})
export class MeasurementModule {}
```

**Step 4: Update app.module.ts to include MeasurementModule**

```typescript
// Add to imports array
import { MeasurementModule } from './modules/measurement/measurement.module';

@Module({
  imports: [
    // ... existing imports
    MeasurementModule,
  ],
  // ... rest of module
})
```

**Step 5: Update Python device API to accept path parameter**

```python
# apps/backend/src/modules/zahner-zennium/fastapi/zahner_device.py (modify)
import sys
import argparse
import json

def main():
    parser = argparse.ArgumentParser(description='Zahner Device Measurement')
    parser.add_argument('measurement_type', choices=['eis', 'iv', 'ocp', 'cv', 'ca', 'cp', 'lpr', 'lsv'])
    parser.add_argument('output_dir', help='Output directory for measurement files')
    parser.add_argument('--frequency_min', type=float, help='Minimum frequency for EIS')
    parser.add_argument('--frequency_max', type=float, help='Maximum frequency for EIS')
    parser.add_argument('--amplitude', type=float, help='Amplitude for EIS')
    # ... other parameters

    args = parser.parse_args()

    if args.measurement_type == 'eis':
        result = perform_eis_measurement(args.output_dir, args)
    elif args.measurement_type == 'iv':
        result = perform_iv_measurement(args.output_dir, args)
    # ... other measurement types

    print(json.dumps(result))

def perform_eis_measurement(output_dir, args):
    import time
    import os

    # Use provided output directory
    output_file = os.path.join(output_dir, 'eis_measurement.csv')

    # Simulate EIS measurement with auto-save
    measurement_data = []
    last_save_time = time.monotonic()

    # ... measurement implementation using _save_data_to_csv from Task 1

    return {
        'success': True,
        'file_path': output_file,
        'statistics': _calculate_statistics_from_csv(output_file)
    }

if __name__ == '__main__':
    main()
```

**Step 6: Run test to verify it passes**

Run: `npm test -- test/measurement.controller.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add apps/backend/src/modules/measurement/ apps/backend/src/app.module.ts test/measurement.controller.test.ts
git commit -m "feat: implement measurement controller with file path integration"
```

---

## Phase 8: Integration and Testing

### Task 8: End-to-End Integration Tests

**Files:**
- Create: `test/integration/file-system-workflow.test.ts`

**Step 1: Write comprehensive integration test**

```typescript
// test/integration/file-system-workflow.test.ts
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';

describe('File System Workflow Integration', () => {
  let app;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  test('complete workflow: user creation -> file path config -> measurement', async () => {
    // 1. Create user
    const userResponse = await request(app.getHttpServer())
      .post('/api/users')
      .send({ user: 'integration_test_user', email: 'test@example.com' })
      .expect(201);

    expect(userResponse.body.success).toBe(true);

    // 2. Configure file path
    const pathResponse = await request(app.getHttpServer())
      .post('/api/files/path-config')
      .send({
        user: 'integration_test_user',
        base_path: 'C:\\temp\\test_data',
        project_name: 'Integration Test Project',
        individual_name: 'test_sample',
        test_type: 'eis'
      })
      .expect(200);

    expect(pathResponse.body.success).toBe(true);
    expect(pathResponse.body.dir_path).toContain('Integration Test Project\\test_sample\\eis');

    // 3. Perform measurement
    const measurementResponse = await request(app.getHttpServer())
      .post('/api/measurement/eis')
      .send({
        user: 'integration_test_user',
        project_name: 'Integration Test Project',
        individual_name: 'test_sample',
        base_path: 'C:\\temp\\test_data',
        frequency_range: [1, 1000000],
        amplitude: 0.01
      })
      .expect(200);

    expect(measurementResponse.body.success).toBe(true);
    expect(measurementResponse.body.file_path).toContain('Integration Test Project\\test_sample\\eis');

    // 4. Verify project list includes new project
    const projectsResponse = await request(app.getHttpServer())
      .get('/api/files/projects?user=integration_test_user')
      .expect(200);

    expect(projectsResponse.body.projects).toContain('Integration Test Project');

    // 5. Cleanup
    await request(app.getHttpServer())
      .delete('/api/users/integration_test_user')
      .expect(200);
  });

  test('auto-save mechanism during measurement simulation', async () => {
    // This would test the actual Python auto-save functionality
    // Implementation would depend on how we mock or simulate long-running measurements
  });
});
```

**Step 2: Run integration tests**

Run: `npm test -- test/integration/file-system-workflow.test.ts`
Expected: PASS (may require mocking of Python device calls)

**Step 3: Performance and reliability tests**

```typescript
// test/integration/long-running-measurement.test.ts
describe('Long Running Measurement Tests', () => {
  test('should handle measurement simulation with auto-save', async () => {
    // Mock a long-running measurement that triggers auto-save
    // Verify data is saved periodically
    // Verify recovery after simulated crash
  });
});
```

**Step 4: Frontend integration tests**

```typescript
// test/integration/frontend-workflow.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../src/App';

describe('Frontend File Management Workflow', () => {
  test('complete user workflow: select user -> configure path -> see success', async () => {
    render(<App />);

    // 1. Create new user
    fireEvent.click(screen.getByRole('button', { name: /选择用户/ }));
    fireEvent.click(screen.getByText('新建用户'));

    fireEvent.change(screen.getByPlaceholderText('输入用户名'), {
      target: { value: 'workflow_test_user' }
    });
    fireEvent.click(screen.getByText('确认'));

    await waitFor(() => {
      expect(screen.getByText('workflow_test_user')).toBeInTheDocument();
    });

    // 2. Open file path manager
    fireEvent.click(screen.getByText('文件路径'));

    // 3. Configure file path
    fireEvent.change(screen.getByLabelText('项目名'), {
      target: { value: 'Workflow Test Project' }
    });
    fireEvent.change(screen.getByLabelText('样品编号'), {
      target: { value: 'test_sample_001' }
    });
    fireEvent.click(screen.getByText('确定'));

    await waitFor(() => {
      // Verify configuration saved (would need to check app state or API calls)
      expect(screen.queryByText('文件路径配置')).not.toBeInTheDocument();
    });
  });
});
```

**Step 5: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Manual testing checklist**

Create manual testing guide:
```markdown
# Manual Testing Checklist

## User Management
- [ ] Create new user via TopNavbar dropdown
- [ ] Switch between users
- [ ] Delete user (verify data remains)
- [ ] Duplicate user name prevention

## File Path Configuration
- [ ] Open file path manager from Toolbar
- [ ] Browse directory selection
- [ ] Create new project
- [ ] Select existing project
- [ ] Save configuration with validation
- [ ] Error handling for invalid inputs

## Measurement Integration
- [ ] EIS measurement with file path
- [ ] IV measurement with file path
- [ ] OCP measurement with file path
- [ ] Verify file creation in correct directory structure
- [ ] Verify CSV auto-save during long measurements

## Data Organization
- [ ] Files saved in correct project/sample/test structure
- [ ] Project names appear in dropdown correctly
- [ ] Path normalization works (forward/backward slashes)
- [ ] Special characters in names handled correctly
```

**Step 7: Commit integration tests**

```bash
git add test/integration/
git commit -m "feat: add comprehensive integration tests for file system overhaul"
```

---

## Phase 9: Documentation and Cleanup

### Task 9: Update Documentation and Final Code Review

**Files:**
- Modify: `README.md`
- Create: `docs/file-system-architecture.md`
- Update: `doc/保存文件方法讨论.md`

**Step 1: Update project README**

```markdown
# Add to README.md
## File Management System

This project includes a comprehensive file management system with the following features:

- **Auto-save**: Measurements are automatically saved every 5 minutes to prevent data loss
- **User Management**: Multi-user support with project-based data organization
- **Project Structure**: Files organized in `basePath/projectName/sampleName/testType/` hierarchy
- **Path Configuration**: Centralized file path management via Toolbar interface
- **Reliable Storage**: CSV-based storage with statistical analysis

### Quick Start

1. Create a user via the TopNavbar dropdown
2. Configure file paths using the Toolbar "文件路径" button
3. Run measurements - files will be automatically organized in the configured directory structure
```

**Step 2: Create architecture documentation**

Create docs/file-system-architecture.md:

```markdown
# File System Architecture

## Overview

The file system overhaul implements a three-tier architecture for reliable data management and organization.

## Components

### Backend Services
- **UsersModule**: User management and authentication
- **FilesService**: Project-based file path management
- **MeasurementService**: Integration with device APIs
- **DbService**: In-memory database with structured data models

### Frontend Components
- **UserSelector**: TopNavbar dropdown for user selection
- **FilePathManagerUI**: Overlay panel for path configuration
- **Toolbar**: Central access point for file management

### Device Integration
- **Python Device APIs**: Enhanced with auto-save and path parameters
- **Measurement Controllers**: Backend coordination layer

## Data Flow

```
User Selection → Path Configuration → Measurement Execution → File Organization
```

## Database Schema

- **users**: User accounts and metadata
- **workflow**: Workflow definitions with project association
- **data_file_path**: File path records and directory structure
```

**Step 3: Update existing documentation**

```markdown
# Update doc/保存文件方法讨论.md
## Implementation Status

✅ **COMPLETED** - Auto-save mechanism implemented
✅ **COMPLETED** - Files service refactoring
✅ **COMPLETED** - User system implementation
✅ **COMPLETED** - Frontend user selector
✅ **COMPLETED** - File path manager UI
✅ **COMPLETED** - Device API integration
✅ **COMPLETED** - Database structure update

## Usage Instructions

1. **User Selection**: Use TopNavbar dropdown to select or create users
2. **Path Configuration**: Click "文件路径" in Toolbar to configure project settings
3. **Measurement Execution**: Run measurements - files are automatically saved to configured paths
4. **Data Organization**: Files are organized in `project/sample/testType` structure
```

**Step 4: Code quality checks**

```bash
# Run linting
npm run lint

# Type checking
npm run type-check

# Build verification
npm run build

# Final test run
npm test
```

**Step 5: Final commit**

```bash
git add README.md docs/ doc/保存文件方法讨论.md
git commit -m "docs: update documentation for completed file system overhaul"

# Tag the release
git tag -a v1.0.0-file-system -m "Complete file system overhaul implementation"
```

## Summary

This comprehensive implementation plan addresses all the requirements from the保存文件方法讨论.md document:

✅ **Reliability**: 5-minute auto-save mechanism prevents data loss
✅ **Organization**: Project-based file structure with user management
✅ **Usability**: Centralized configuration via Toolbar interface
✅ **Integration**: Seamless connection between frontend, backend, and device APIs
✅ **Testing**: Comprehensive test coverage at unit and integration levels
✅ **Documentation**: Complete architectural and usage documentation

The implementation follows best practices with:
- TDD methodology
- Snake_case naming conventions throughout
- Modular architecture with clear separation of concerns
- Comprehensive error handling
- Responsive UI design
- Full automation capability

**Plan complete and saved to `docs/plans/2025-10-31-file-system-overhaul.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**