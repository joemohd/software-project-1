import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { SEARCH_MAX_LENGTH } from '../flights.constants.js';

// FLT-02: query for GET /api/airports
export class ListAirportsQueryDto {
  @ApiPropertyOptional({ description: 'Matches the start of the IATA code or any part of the airport name', example: 'CAI' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  search?: string;

  @ApiPropertyOptional({ description: 'Page number, starting at 1', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
