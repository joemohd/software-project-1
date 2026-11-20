import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus } from '../../database/schemas/expense.schema.js';

// HTL-16: one booked room with its guests and price
export class HotelBookingRoomResponseDto {
  @ApiProperty() roomId: string;
  @ApiProperty({ example: 101 }) number: number;
  @ApiProperty({ nullable: true, type: String, example: 'Double' }) type: string | null;
  @ApiProperty({ description: 'Price per night in cents, at booking time', example: 12000 }) pricePerNight: number;
  @ApiProperty({ example: 2 }) adults: number;
  @ApiProperty({ type: [Number], example: [7] }) childAges: number[];
  @ApiProperty({ description: 'nights x pricePerNight in cents', example: 36000 }) price: number;
}

export class HotelBookingHotelDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'Nile View Hotel' }) name: string;
}

// HTL-16, HTL-18: the booking held for payment
export class HotelBookingResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: BookingStatus, example: BookingStatus.PENDING_PAYMENT }) status: BookingStatus;
  @ApiProperty({ type: HotelBookingHotelDto }) hotel: HotelBookingHotelDto;
  @ApiProperty({ example: '2026-12-01' }) checkIn: string;
  @ApiProperty({ example: '2026-12-04' }) checkOut: string;
  @ApiProperty({ example: 3 }) nights: number;
  @ApiProperty({ type: [HotelBookingRoomResponseDto] }) rooms: HotelBookingRoomResponseDto[];
  @ApiProperty({ example: 3 }) adults: number;
  @ApiProperty({ example: 1 }) children: number;
  @ApiProperty({ description: 'Sum of the room prices in cents', example: 36000 }) total: number;
  @ApiProperty({ nullable: true, type: String, description: 'Pay before this (UTC), or the rooms are released', example: '2026-11-20T12:10:00.000Z' })
  holdExpiresAt: string | null;
}
