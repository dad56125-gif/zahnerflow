import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Query
} from '@nestjs/common';
import { MeasurementService } from './measurement.service';
import { EISMeasurementDto } from './dto/eis-measurement.dto';

@Controller('api/measurement')
export class MeasurementController {
  constructor(private readonly measurementService: MeasurementService) {}

  @Post('eis')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true }))
  async performEISMeasurement(@Body() measurementDto: EISMeasurementDto) {
    try {
      const result = await this.measurementService.performEISMeasurement(measurementDto);
      return {
        success: true,
        data: result,
        message: 'EIS measurement started successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.constructor.name
      };
    }
  }

  @Get('status/:measurementId')
  async getMeasurementStatus(@Param('measurementId') measurementId: string) {
    try {
      const status = await this.measurementService.getMeasurementStatus(measurementId);
      return {
        success: true,
        data: status
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get('list')
  async listMeasurements(
    @Query('user') user: string,
    @Query('project_name') project_name?: string
  ) {
    try {
      const measurements = await this.measurementService.listMeasurements(user, project_name);
      return {
        success: true,
        data: measurements
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  @Get('health')
  async healthCheck() {
    return {
      success: true,
      service: 'measurement',
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
  }
}