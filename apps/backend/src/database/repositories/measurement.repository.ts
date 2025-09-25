import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan } from 'typeorm';
import { MeasurementData, MeasurementType } from '../entities';

@Injectable()
export class MeasurementRepository {
  constructor(
    @InjectRepository(MeasurementData)
    private readonly repository: Repository<MeasurementData>,
  ) {}

  async create(measurementData: Partial<MeasurementData>): Promise<MeasurementData> {
    const measurement = this.repository.create(measurementData);
    return await this.repository.save(measurement);
  }

  async findAll(
    deviceId?: string,
    measurementType?: MeasurementType,
    startDate?: Date,
    endDate?: Date,
    tags?: string[],
    page = 1,
    limit = 100,
  ): Promise<{ data: MeasurementData[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('measurement')
      .leftJoinAndSelect('measurement.device', 'device')
      .leftJoinAndSelect('measurement.executionNode', 'executionNode')
      .orderBy('measurement.timestamp', 'DESC');

    if (deviceId) {
      queryBuilder.andWhere('measurement.deviceId = :deviceId', { deviceId });
    }

    if (measurementType) {
      queryBuilder.andWhere('measurement.measurementType = :measurementType', { measurementType });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('measurement.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    if (tags && tags.length > 0) {
      queryBuilder.andWhere('measurement.tags && :tags', { tags });
    }

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<MeasurementData> {
    return await this.repository.findOne({
      where: { id },
      relations: ['device', 'executionNode'],
    });
  }

  async findByTimeRange(
    deviceId: string,
    startDate: Date,
    endDate: Date,
    measurementType?: MeasurementType,
  ): Promise<MeasurementData[]> {
    const queryBuilder = this.repository.createQueryBuilder('measurement')
      .where('measurement.deviceId = :deviceId', { deviceId })
      .andWhere('measurement.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    if (measurementType) {
      queryBuilder.andWhere('measurement.measurementType = :measurementType', { measurementType });
    }

    return await queryBuilder.orderBy('measurement.timestamp', 'ASC').getMany();
  }

  async getAggregatedData(
    deviceId: string,
    timeRange: 'hour' | 'day' | 'week' | 'month',
    startDate?: Date,
    endDate?: Date,
  ): Promise<any[]> {
    // TimescaleDB time_bucket 函数
    const timeBucket = {
      hour: '1 hour',
      day: '1 day',
      week: '1 week',
      month: '1 month',
    }[timeRange];

    const query = `
      SELECT
        time_bucket('${timeBucket}', timestamp) AS time_period,
        measurement_type,
        COUNT(*) AS measurement_count,
        AVG(quality) AS avg_quality,
        MIN(quality) AS min_quality,
        MAX(quality) AS max_quality
      FROM measurement_data
      WHERE device_id = $1
        ${startDate && endDate ? 'AND timestamp BETWEEN $2 AND $3' : ''}
      GROUP BY time_period, measurement_type
      ORDER BY time_period ASC;
    `;

    const parameters = [deviceId];
    if (startDate && endDate) {
      parameters.push(startDate, endDate);
    }

    return await this.repository.query(query, parameters);
  }

  async getDataQualityStats(
    deviceId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalMeasurements: number;
    averageQuality: number;
    qualityDistribution: { excellent: number; good: number; fair: number; poor: number };
  }> {
    const queryBuilder = this.repository.createQueryBuilder('measurement');

    if (deviceId) {
      queryBuilder.where('measurement.deviceId = :deviceId', { deviceId });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('measurement.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const result = await queryBuilder
      .select('COUNT(*)', 'totalMeasurements')
      .addSelect('AVG(quality)', 'averageQuality')
      .addSelect('SUM(CASE WHEN quality >= 0.9 THEN 1 ELSE 0 END)', 'excellent')
      .addSelect('SUM(CASE WHEN quality >= 0.7 AND quality < 0.9 THEN 1 ELSE 0 END)', 'good')
      .addSelect('SUM(CASE WHEN quality >= 0.5 AND quality < 0.7 THEN 1 ELSE 0 END)', 'fair')
      .addSelect('SUM(CASE WHEN quality < 0.5 THEN 1 ELSE 0 END)', 'poor')
      .getRawOne();

    return {
      totalMeasurements: parseInt(result.totalMeasurements) || 0,
      averageQuality: parseFloat(result.averageQuality) || 0,
      qualityDistribution: {
        excellent: parseInt(result.excellent) || 0,
        good: parseInt(result.good) || 0,
        fair: parseInt(result.fair) || 0,
        poor: parseInt(result.poor) || 0,
      },
    };
  }

  async exportData(
    format: 'json' | 'csv',
    filters?: {
      deviceId?: string;
      measurementType?: MeasurementType;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<string> {
    const queryBuilder = this.repository.createQueryBuilder('measurement')
      .leftJoinAndSelect('measurement.device', 'device');

    if (filters) {
      if (filters.deviceId) {
        queryBuilder.andWhere('measurement.deviceId = :deviceId', { deviceId: filters.deviceId });
      }
      if (filters.measurementType) {
        queryBuilder.andWhere('measurement.measurementType = :measurementType', {
          measurementType: filters.measurementType
        });
      }
      if (filters.startDate && filters.endDate) {
        queryBuilder.andWhere('measurement.timestamp BETWEEN :startDate AND :endDate', {
          startDate: filters.startDate,
          endDate: filters.endDate,
        });
      }
    }

    const data = await queryBuilder.getMany();

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // CSV format
      const headers = [
        'id', 'timestamp', 'deviceName', 'measurementType',
        'quality', 'tags', 'metadata'
      ];
      const rows = data.map(m => [
        m.id,
        m.timestamp.toISOString(),
        m.device?.name || '',
        m.measurementType,
        m.quality?.toString() || '',
        m.tags?.join(';') || '',
        JSON.stringify(m.metadata || {}),
      ]);

      return [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    }
  }

  async cleanupOldData(retentionDays = 180): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.repository.delete({
      timestamp: LessThan(cutoffDate),
    });

    return result.affected || 0;
  }
}