import { PartialType, PickType } from '@nestjs/swagger';
import { CreateFlightDto } from './create-flight.dto.js';

// FLT-05: body for PATCH /api/flights/:id. Send at least one field; same formats and rules as on creation.
// Changing an airport also needs that side's local time, and is refused once any seat is held or booked.
export class UpdateFlightDto extends PartialType(
  PickType(CreateFlightDto, ['departureAirportId', 'departureLocalTime', 'arrivalAirportId', 'arrivalLocalTime'] as const),
) {}
