import { ApiProperty } from '@nestjs/swagger';

// FLT-01: public profile; no moderator account or private configuration.
export class AirlineProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  iataCode: string;

  @ApiProperty()
  logoUrl: string;
}
