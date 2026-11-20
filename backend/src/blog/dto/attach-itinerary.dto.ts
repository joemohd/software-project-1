import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, ValidateIf } from 'class-validator';

// BLG-13
export class AttachItineraryDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '6650f1c2a1b2c3d4e5f60718',
    description:
      'One of your own itineraries, or null to detach the current one.',
  })
  @ValidateIf((dto: AttachItineraryDto) => dto.itineraryId !== null)
  @IsMongoId()
  itineraryId: string | null;
}
