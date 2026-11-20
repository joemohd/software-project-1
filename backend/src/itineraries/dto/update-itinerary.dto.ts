import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ItineraryVisibility } from '../../database/schemas/itinerary.schema.js';
import { ITINERARY_TITLE_MAX_LENGTH } from '../itineraries.constants.js';
import { TrimString, UpperCodes } from './transforms.js';

// ITN-01 (edit title, countries, start date), ITN-20 (visibility)
export class UpdateItineraryDto {
  @ApiPropertyOptional({ maxLength: ITINERARY_TITLE_MAX_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ITINERARY_TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({ type: [String], example: ['EG'] })
  @IsOptional()
  @UpperCodes()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'each country must be a 2-letter country code' })
  countries?: string[];

  @ApiPropertyOptional({ example: '2026-12-22', description: 'Changing it shifts every day date.' })
  @IsOptional()
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ enum: ItineraryVisibility, description: 'ITN-20: public itineraries appear in shared search.' })
  @IsOptional()
  @IsEnum(ItineraryVisibility)
  visibility?: ItineraryVisibility;
}
