import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateHotelDto } from './create-hotel.dto.js';

// HTL-01: moderator assignment can only be changed by an admin workflow.
export class UpdateHotelDto extends PartialType(
  OmitType(CreateHotelDto, ['moderatorId'] as const), { skipNullProperties: false },
) {}
