import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsMongoId, IsNotEmpty, IsString, IsUrl, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Trim } from '../../auth/dto/trim.transform.js';
import { IMAGE_URL_OPTIONS, PROFILE_LIMITS } from '../../common/providers/profile.rules.js';

// HTL-01, GEN-08
export class CreateHotelDto {
  @ApiProperty({ maxLength: PROFILE_LIMITS.name })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROFILE_LIMITS.name)
  name: string;

  @ApiProperty({ maxLength: PROFILE_LIMITS.address })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROFILE_LIMITS.address)
  address: string;

  @ApiProperty({ description: 'Existing city from the selected country' })
  @IsMongoId()
  cityId: string;

  @ApiProperty({ description: 'Existing country; must match the selected city' })
  @IsMongoId()
  countryId: string;

  @ApiProperty({ description: 'Existing hotel moderator, assigned to at most one provider' })
  @IsMongoId()
  moderatorId: string;

  @ApiPropertyOptional({ maxLength: PROFILE_LIMITS.description })
  @Trim()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(PROFILE_LIMITS.description)
  description?: string;

  @ApiPropertyOptional({ type: [String], maxItems: PROFILE_LIMITS.images, description: 'JPG/PNG URLs returned by the shared image upload endpoint' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(PROFILE_LIMITS.images)
  @ArrayUnique()
  @IsUrl(IMAGE_URL_OPTIONS, { each: true })
  imageUrls?: string[];

  @ApiProperty({ minimum: PROFILE_LIMITS.minStarClass, maximum: PROFILE_LIMITS.maxStarClass })
  @IsInt()
  @Min(PROFILE_LIMITS.minStarClass)
  @Max(PROFILE_LIMITS.maxStarClass)
  starClass: number;

  @ApiPropertyOptional({ type: [String], maxItems: PROFILE_LIMITS.amenities })
  @Transform(({ value }) => Array.isArray(value) ? value.map((item: unknown) => typeof item === 'string' ? item.trim() : item) : value)
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(PROFILE_LIMITS.amenities)
  @ArrayUnique((value: unknown) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(PROFILE_LIMITS.amenity, { each: true })
  amenities?: string[];
}
