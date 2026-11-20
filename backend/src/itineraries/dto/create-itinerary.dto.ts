import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ITINERARY_TITLE_MAX_LENGTH } from '../itineraries.constants.js';
import { TrimString, UpperCodes } from './transforms.js';

// ITN-01
export class CreateItineraryDto {
  @ApiProperty({ maxLength: ITINERARY_TITLE_MAX_LENGTH, example: 'Two weeks in Egypt and Dubai' })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(ITINERARY_TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({
    type: [String],
    example: ['EG', 'AE'],
    description: 'One or more ISO 3166-1 alpha-2 codes from the seeded country list.',
  })
  @UpperCodes()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'each country must be a 2-letter country code' })
  countries: string[];

  @ApiProperty({ example: '2026-12-20', description: 'Start date (YYYY-MM-DD). Day dates derive from it.' })
  @IsDateString({ strict: true })
  startDate: string;
}
