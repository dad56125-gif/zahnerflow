// test/files.service.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { FilesService } from '../apps/backend/src/modules/files/files.service';
import { DbService } from '../apps/backend/src/db/db.service';

describe('Files Service - Project Structure', () => {
  let filesService: FilesService;
  let dbService: DbService;

  beforeEach(() => {
    dbService = new DbService();
    filesService = new FilesService(dbService);
  });

  test('should register file with project structure', () => {
    const result = filesService.registerFile({
      user: 'test_user',
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