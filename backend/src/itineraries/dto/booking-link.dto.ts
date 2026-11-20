import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

// ITN-27: link one of the user's confirmed flight / hotel bookings to a day of the itinerary
export class LinkBookingDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60730', description: 'Id of your Confirmed or Completed flight booking or hotel reservation.' })
  @IsMongoId()
  bookingId: string;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60720', description: 'Day of this itinerary to link it to.' })
  @IsMongoId()
  dayId: string;
}
