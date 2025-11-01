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

  async registerFile(payload: RegisterFilePayload): Promise<RegisterFileResult> {
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

    const record = await this.dbService.createDataFilePath({
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
