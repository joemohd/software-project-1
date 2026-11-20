import { PartialType, PickType } from '@nestjs/swagger';
import { CreateCabinDto } from './create-flight.dto.js';

// FLT-05: body for PATCH /api/flights/:id/cabins/:cabinId. Send at least one field.
// Same rules as on creation; new rows reuse the cabin's existing seat layout.
export class UpdateCabinDto extends PartialType(PickType(CreateCabinDto, ['seatPrice', 'firstRow', 'lastRow'] as const)) {}
