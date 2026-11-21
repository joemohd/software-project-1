import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CabinType, FlightStatus } from '../../database/schemas/flight.schema.js';

// FLT-03: departure or arrival, in UTC and in the airport's local time
export class FlightStopResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a001234567a' })
  airportId: string;

  @ApiProperty({ description: 'Stored UTC instant', example: '2026-12-01T08:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ description: "Local time at the airport", example: '2026-12-01T10:00' })
  localTime: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  timeZone: string;
}

// FLT-04: cabin summary (the full seat map is not returned here)
export class CabinSummaryDto {
  @ApiProperty({ enum: CabinType })
  name: CabinType;

  @ApiProperty({ description: 'Cents', example: 45000 })
  seatPrice: number;

  @ApiPropertyOptional({ description: 'Free baggage allowance in number of bags (FLT-04)', example: 1, minimum: 0 })
  freeBagCount?: number;

  @ApiProperty({ description: 'Max weight per bag in kg (free and extra bags, FLT-04, FLT-08)', example: 23 })
  freeBagWeight: number;

  @ApiProperty({ example: 156 })
  seatCount: number;

  @ApiProperty({ example: 156 })
  availableSeats: number;
}

export class FlightResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345680' })
  id: string;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  airlineId: string;

  @ApiProperty({ example: '123' })
  number: string;

  @ApiProperty({ enum: FlightStatus, example: FlightStatus.SCHEDULED })
  status: FlightStatus;

  @ApiProperty({ type: FlightStopResponseDto })
  departure: FlightStopResponseDto;

  @ApiProperty({ type: FlightStopResponseDto })
  arrival: FlightStopResponseDto;

  @ApiProperty({ description: 'kg', example: 32 })
  maxBagWeight: number;

  @ApiProperty({ type: [CabinSummaryDto] })
  cabins: CabinSummaryDto[];
}
