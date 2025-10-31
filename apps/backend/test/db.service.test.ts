// test/db.service.test.ts
import { test, run } from './run-tests';
import { DbService } from '../src/db/db.service';

test('should create user with correct structure', () => {
  const dbService = new DbService();
  const user = dbService.createUser({
    user: 'test_user',
    email: 'test@example.com'
  });

  if (!user.id.match(/^user_\d+_[a-z0-9]+$/)) {
    throw new Error(`Expected user id to match pattern, got: ${user.id}`);
  }
  if (user.user !== 'test_user') {
    throw new Error(`Expected user to be 'test_user', got: ${user.user}`);
  }
  if (user.email !== 'test@example.com') {
    throw new Error(`Expected email to be 'test@example.com', got: ${user.email}`);
  }
  if (!user.created_at) {
    throw new Error('Expected created_at to be defined');
  }
});

test('should create workflow with project_name and user fields', () => {
  const dbService = new DbService();
  const user = dbService.createUser({ user: 'test_user' });
  const workflow = dbService.createWorkflow({
    user: 'test_user',
    project_name: 'Test Project',
    title: 'Test Workflow'
  });

  if (workflow.user !== 'test_user') {
    throw new Error(`Expected workflow user to be 'test_user', got: ${workflow.user}`);
  }
  if (workflow.project_name !== 'Test Project') {
    throw new Error(`Expected project_name to be 'Test Project', got: ${workflow.project_name}`);
  }
  if (workflow.title !== 'Test Workflow') {
    throw new Error(`Expected title to be 'Test Workflow', got: ${workflow.title}`);
  }
  if (!workflow.created_at) {
    throw new Error('Expected created_at to be defined');
  }
});

test('should create data file path record', () => {
  const dbService = new DbService();
  const pathRecord = dbService.createDataFilePath({
    user: 'test_user',
    project_name: 'Test Project',
    individual_name: 'sample001',
    test_type: 'eis',
    base_path: 'C:\\data\\archive'
  });

  if (pathRecord.user !== 'test_user') {
    throw new Error(`Expected user to be 'test_user', got: ${pathRecord.user}`);
  }
  if (pathRecord.project_name !== 'Test Project') {
    throw new Error(`Expected project_name to be 'Test Project', got: ${pathRecord.project_name}`);
  }
  if (pathRecord.individual_name !== 'sample001') {
    throw new Error(`Expected individual_name to be 'sample001', got: ${pathRecord.individual_name}`);
  }
  if (pathRecord.test_type !== 'eis') {
    throw new Error(`Expected test_type to be 'eis', got: ${pathRecord.test_type}`);
  }
  if (pathRecord.base_path !== 'C:\\data\\archive') {
    throw new Error(`Expected base_path to be 'C:\\data\\archive', got: ${pathRecord.base_path}`);
  }
  if (!pathRecord.dir_path.includes('Test Project\\sample001\\eis') && !pathRecord.dir_path.includes('Test Project/sample001/eis')) {
    throw new Error(`Expected dir_path to contain 'Test Project/sample001/eis' (with either / or \\), got: ${pathRecord.dir_path}`);
  }
});

if (require.main === module) run();