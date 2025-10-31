import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FilesService } from '../files/files.service';
import { EISMeasurementDto } from './dto/eis-measurement.dto';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class MeasurementService {
  private readonly logger = new Logger(MeasurementService.name);

  constructor(private readonly filesService: FilesService) {}

  async performEISMeasurement(params: EISMeasurementDto) {
    this.logger.log(`Starting EIS measurement for user: ${params.user}, project: ${params.project_name}`);

    try {
      // 1. Register file path using FilesService
      const filename = `eis_${Date.now()}.csv`;
      const pathResult = this.filesService.registerFile({
        user: params.user,
        project_name: params.project_name,
        individual_name: params.individual_name,
        test_type: params.test_type.toLowerCase(),
        base_path: params.base_path,
        filename
      });

      // Construct full file path
      const fullFilePath = path.join(pathResult.dir_path, filename);
      this.logger.log(`File path registered: ${fullFilePath}`);

      // 2. Ensure directory exists
      const fs = require('fs');
      if (!fs.existsSync(pathResult.dir_path)) {
        fs.mkdirSync(pathResult.dir_path, { recursive: true });
        this.logger.log(`Created directory: ${pathResult.dir_path}`);
      }

      // 3. Call Python device API with the structured path
      const pythonScript = path.join(
        process.cwd(),
        'apps/backend/src/modules/zahner-zennium/fastapi/zahner_device.py'
      );

      const command = [
        `python "${pythonScript}"`,
        'eis',
        `"${pathResult.dir_path}"`,
        params.frequency_range[0],
        params.frequency_range[1],
        params.amplitude,
        params.points_per_decade,
        params.ac_amplitude
      ].join(' ');

      this.logger.log(`Executing command: ${command}`);

      // 4. Execute measurement
      const { stdout, stderr } = await execAsync(command, {
        timeout: 300000, // 5 minutes timeout
        cwd: pathResult.dir_path
      });

      if (stderr) {
        this.logger.warn(`Device warning: ${stderr}`);
      }

      this.logger.log(`EIS measurement completed successfully`);

      // 5. Return results
      return {
        success: true,
        file_path: fullFilePath,
        dir_path: pathResult.dir_path,
        message: 'EIS measurement completed successfully',
        output: stdout.trim(),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error(`EIS measurement failed: ${error.message}`, error.stack);
      throw new BadRequestException(`EIS measurement failed: ${error.message}`);
    }
  }

  async getMeasurementStatus(measurementId: string) {
    // This could be implemented to check the status of ongoing measurements
    return {
      measurement_id: measurementId,
      status: 'completed',
      timestamp: new Date().toISOString()
    };
  }

  async listMeasurements(user: string, project_name?: string) {
    // List existing measurements for a user/project
    return {
      user,
      project_name,
      measurements: [],
      total: 0
    };
  }
}