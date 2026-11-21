import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus, Payment } from '../../database/schemas/expense.schema.js';
import { RefundResponseDto } from '../../payments/dto/payment.dto.js';

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

export class HotelReservationRoomSummaryDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345680' })
  roomId: string;

  @ApiProperty({ example: 2 })
  guests: number;
}

export class HotelReservationGuestCountsDto {
  @ApiProperty({ example: 2 })
  adults: number;

  @ApiProperty({ example: 1 })
  children: number;

  @ApiProperty({ example: 3 })
  total: number;
}

export class HotelReservationSummaryDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345699' })
  id: string;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345699' })
  reference: string;

  @ApiProperty({ type: HotelBookingHotelDto, nullable: true })
  hotel: HotelBookingHotelDto | null;

  @ApiProperty({ type: [HotelReservationRoomSummaryDto] })
  rooms: HotelReservationRoomSummaryDto[];

  @ApiProperty({ type: Date })
  checkIn: Date;

  @ApiProperty({ type: Date })
  checkOut: Date;

  @ApiProperty({ example: 3 })
  nights: number;

  @ApiProperty({ type: HotelReservationGuestCountsDto })
  guests: HotelReservationGuestCountsDto;

  @ApiProperty({ type: Number, nullable: true, example: 36000 })
  total: number | null;

  @ApiProperty({ example: BookingStatus.CONFIRMED })
  status: string;
}

export class HotelReservationGroupsResponseDto {
  @ApiProperty({ type: [HotelReservationSummaryDto] })
  upcoming: HotelReservationSummaryDto[];

  @ApiProperty({ type: [HotelReservationSummaryDto] })
  past: HotelReservationSummaryDto[];

  @ApiProperty({ type: [HotelReservationSummaryDto] })
  cancelled: HotelReservationSummaryDto[];
}

export class ReviewReplyResponseDto {
  @ApiProperty({ example: 'Thank you for your feedback!' })
  text: string;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345671' })
  moderatorId: string;

  @ApiProperty({ type: Date })
  repliedAt: Date;
}

export class ReviewResponseDto {
  @ApiProperty({ type: String, nullable: true, example: '665f1c2e9b1e8a0012345690' })
  id: string | null;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345699' })
  bookingId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  rating: number;

  @ApiProperty({ example: 'Great hotel and friendly staff.' })
  comment: string;

  @ApiProperty({ type: ReviewReplyResponseDto, nullable: true })
  reply: ReviewReplyResponseDto | null;
}

export class HotelReservationDetailDto extends HotelReservationSummaryDto {
  @ApiProperty({ type: Date, nullable: true })
  policiesAcceptedAt: Date | null;

  @ApiProperty({ type: Payment, nullable: true })
  payment: Payment | null;

  @ApiProperty({ type: ReviewResponseDto, nullable: true })
  review: ReviewResponseDto | null;
}

export class HotelCancelRefundSummaryDto {
  @ApiProperty({ type: String, nullable: true, example: '665f1c2e9b1e8a0012345695' })
  id?: string | null;

  @ApiProperty({ example: 75 })
  percent: number;

  @ApiProperty({ example: 27000, description: 'Refund amount in cents.' })
  amount: number;

  @ApiProperty({ example: 'usd' })
  currency: string;

  @ApiProperty({ example: 'Pending', enum: ['Pending', 'Refunded', 'Failed', 'none'] })
  status: string;

  @ApiProperty({ type: RefundResponseDto, nullable: true })
  details?: RefundResponseDto | null;

  @ApiProperty({ type: String, nullable: true })
  error?: string | null;
}

export class CancelHotelBookingResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345699' })
  id: string;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CANCELLED })
  status: BookingStatus;

  @ApiProperty({ type: HotelCancelRefundSummaryDto })
  refund: HotelCancelRefundSummaryDto;
}

export class DeleteReviewResponseDto {
  @ApiProperty({ example: true })
  deleted: boolean;
}
