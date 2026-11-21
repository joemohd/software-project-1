import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '../../database/schemas/expense.schema.js';
import { RoomStatus } from '../../database/schemas/provider.schema.js';
import { DateRangeDto } from './date-range.dto.js';
import { CancellationTierDto } from './update-hotel-policies.dto.js';

export class RoomResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345680' })
  id: string;

  @ApiProperty({ example: 101 })
  number: number;

  @ApiProperty({ type: String, nullable: true, example: 'Deluxe Double' })
  type: string | null;

  @ApiProperty({ example: 2 })
  bedCount: number;

  @ApiProperty({ example: 2 })
  maxOccupancy: number;

  @ApiProperty({ example: 14550, description: 'Price per night in cents.' })
  pricePerNight: number;

  @ApiProperty({ enum: RoomStatus, example: RoomStatus.ACTIVE })
  status: RoomStatus;

  @ApiProperty({ type: [DateRangeDto] })
  availability: DateRangeDto[];

  @ApiProperty({ type: [DateRangeDto] })
  blockedDates: DateRangeDto[];
}

export class AvailableRoomItemDto extends RoomResponseDto {
  @ApiProperty({ example: 58200, description: 'Total price for the stay in cents (nights x pricePerNight).' })
  totalStayPrice: number;
}

export class HotelDetailsResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  id: string;

  @ApiProperty({ example: 'Nile View Hotel' })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: 'Overlooking the Nile in central Cairo.' })
  description: string | null;

  @ApiProperty({ example: '12 Corniche El Nil' })
  address: string;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345670' })
  cityId: string;

  @ApiProperty({ type: [String] })
  imageUrls: string[];

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  starClass: number;

  @ApiProperty({ type: [String], example: ['Pool', 'Wi-Fi'] })
  amenities: string[];

  @ApiProperty({ type: String, nullable: true, example: '14:00' })
  checkInTime: string | null;

  @ApiProperty({ type: String, nullable: true, example: '11:00' })
  checkOutTime: string | null;

  @ApiProperty({ type: [CancellationTierDto] })
  cancellationTiers: CancellationTierDto[];

  @ApiProperty({ example: 4.5 })
  averageRating: number;

  @ApiPropertyOptional({ type: Date })
  checkIn?: Date;

  @ApiPropertyOptional({ type: Date })
  checkOut?: Date;

  @ApiPropertyOptional({ type: [RoomResponseDto] })
  availableRooms?: RoomResponseDto[];
}

export class AvailableRoomsResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  hotelId: string;

  @ApiProperty({ type: Date })
  checkIn: Date;

  @ApiProperty({ type: Date })
  checkOut: Date;

  @ApiProperty({ example: 4 })
  nights: number;

  @ApiProperty({ type: [AvailableRoomItemDto] })
  rooms: AvailableRoomItemDto[];
}

export class HotelSearchResultItemDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  id: string;

  @ApiProperty({ example: 'Nile View Hotel' })
  name: string;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345670' })
  cityId: string;

  @ApiProperty({ type: String, nullable: true, example: 'Cairo' })
  city: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Egypt' })
  country: string | null;

  @ApiProperty({ example: 5 })
  starClass: number;

  @ApiProperty({ example: 4.5 })
  averageRating: number;

  @ApiProperty({ type: [String] })
  imageUrls: string[];

  @ApiProperty({ example: 12000, description: 'Cheapest qualifying room price per night in cents.' })
  cheapestRoomPrice: number;

  @ApiProperty({ example: 48000, description: 'Cheapest qualifying room total stay price in cents.' })
  totalStayPrice: number;

  @ApiProperty({ example: 3 })
  freeRoomsCount: number;

  @ApiProperty({ example: 4 })
  nights: number;
}

export class SearchHotelsResponseDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;

  @ApiProperty({ type: [HotelSearchResultItemDto] })
  items: HotelSearchResultItemDto[];
}

export class HotelReviewReplySummaryDto {
  @ApiProperty({ example: 'Thank you for staying with us!' })
  text: string;

  @ApiProperty({ type: Date })
  repliedAt: Date;
}

export class HotelReviewItemDto {
  @ApiProperty({ type: String, nullable: true, example: '665f1c2e9b1e8a0012345690' })
  id: string | null;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  rating: number;

  @ApiProperty({ example: 'Wonderful stay!' })
  comment: string;

  @ApiProperty({ type: HotelReviewReplySummaryDto, nullable: true })
  reply: HotelReviewReplySummaryDto | null;

  @ApiProperty({ type: Date, nullable: true })
  createdAt: Date | null;

  @ApiProperty({ type: Object, nullable: true })
  user: unknown;
}

export class HotelReviewsPageDto {
  @ApiProperty({ example: 4.5 })
  averageRating: number;

  @ApiProperty({ example: 12 })
  ratingsCount: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({ example: 2 })
  totalPages: number;

  @ApiProperty({ type: [HotelReviewItemDto] })
  items: HotelReviewItemDto[];
}

export class ModeratorReservationRoomDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345680' })
  roomId: string;

  @ApiProperty({ example: 2 })
  guests: number;
}

export class ModeratorReservationItemDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345699' })
  id: string;

  @ApiProperty({ type: Object, nullable: true })
  guest: unknown;

  @ApiProperty({ type: [ModeratorReservationRoomDto] })
  rooms: ModeratorReservationRoomDto[];

  @ApiProperty({ type: Date })
  checkIn: Date;

  @ApiProperty({ type: Date })
  checkOut: Date;

  @ApiProperty({ example: 3 })
  nights: number;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CONFIRMED })
  status: BookingStatus;

  @ApiProperty({ type: Number, nullable: true, example: 36000 })
  total: number | null;
}

export class ModeratorReservationsPageDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;

  @ApiProperty({ type: [ModeratorReservationItemDto] })
  items: ModeratorReservationItemDto[];
}

export class RoomAvailabilityStatusItemDto extends RoomResponseDto {
  @ApiProperty({ enum: ['available', 'booked', 'blocked'], example: 'available' })
  availabilityStatus: 'available' | 'booked' | 'blocked';

  @ApiProperty({ type: String, nullable: true, example: null })
  reservationReference: string | null;

  @ApiProperty({ example: false })
  deactivated: boolean;
}

export class HotelAvailabilityResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  hotelId: string;

  @ApiProperty({ type: Date })
  startDate: Date;

  @ApiProperty({ type: Date })
  endDate: Date;

  @ApiProperty({ type: [RoomAvailabilityStatusItemDto] })
  rooms: RoomAvailabilityStatusItemDto[];
}

export class HotelPoliciesResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  hotelId: string;

  @ApiProperty({ type: String, nullable: true, example: '14:00' })
  checkInTime: string | null;

  @ApiProperty({ type: String, nullable: true, example: '11:00' })
  checkOutTime: string | null;

  @ApiProperty({ type: [CancellationTierDto] })
  cancellationTiers: CancellationTierDto[];
}

export class DeleteRoomResponseDto {
  @ApiProperty({ example: 'Room deleted.' })
  message: string;
}
