import { ApiProperty } from '@nestjs/swagger';

// FLT-02: one airport in the read-only list
export class AirportCityDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  id: string;

  @ApiProperty({ example: 'Cairo' })
  name: string;
}

export class AirportCountryDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345679' })
  id: string;

  @ApiProperty({ example: 'EG', description: 'ISO 3166-1 alpha-2 code' })
  code: string;

  @ApiProperty({ example: 'Egypt' })
  name: string;
}

export class AirportResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a001234567a' })
  id: string;

  @ApiProperty({ example: 'CAI' })
  iataCode: string;

  @ApiProperty({ example: 'Cairo International Airport' })
  name: string;

  @ApiProperty({ type: AirportCityDto, nullable: true })
  city: AirportCityDto | null;

  @ApiProperty({ type: AirportCountryDto, nullable: true })
  country: AirportCountryDto | null;

  @ApiProperty({
    example: 'Africa/Cairo',
    nullable: true,
    description: "IANA time zone. Null when it can't be determined yet (see the TODO in AirportsService).",
  })
  timeZone: string | null;
}

export class AirportListResponseDto {
  @ApiProperty({ type: [AirportResponseDto] })
  items: AirportResponseDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 42 })
  total: number;
}
