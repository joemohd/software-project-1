import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateAirlineDto } from './create-airline.dto.js';

// FLT-01: ownership cannot be changed through a profile edit.
export class UpdateAirlineDto extends PartialType(
  OmitType(CreateAirlineDto, ['moderatorId'] as const), { skipNullProperties: false },
) {}
