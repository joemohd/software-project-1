import { ApiProperty } from '@nestjs/swagger';

// HTL-01
export class HotelProfileDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  address: string;
  @ApiProperty()
  cityId: string;
  @ApiProperty()
  countryId: string;
  @ApiProperty()
  description: string;
  @ApiProperty({ type: [String] })
  imageUrls: string[];
  @ApiProperty()
  starClass: number;
  @ApiProperty({ type: [String] })
  amenities: string[];
}
