import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, Min, Max } from 'class-validator';

export class EISMeasurementDto {
  @IsString()
  @IsNotEmpty()
  user: string;

  @IsString()
  @IsNotEmpty()
  project_name: string;

  @IsString()
  @IsNotEmpty()
  individual_name: string;

  @IsString()
  @IsNotEmpty()
  test_type: string;

  @IsString()
  @IsOptional()
  base_path?: string;

  @IsArray()
  @IsNumber({}, { each: true })
  frequency_range: [number, number];

  @IsNumber()
  @Min(0.001)
  @Max(1.0)
  amplitude: number;

  @IsNumber()
  @Min(1)
  @Max(1000)
  points_per_decade: number;

  @IsNumber()
  @Min(0.1)
  @Max(100)
  ac_amplitude: number;

  @IsString()
  @IsOptional()
  description?: string;
}