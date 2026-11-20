import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import { Trim } from '../../auth/dto/trim.transform.js';
import { IMAGE_URL_OPTIONS, PROFILE_LIMITS } from '../../common/providers/profile.rules.js';

// FLT-01
export class CreateAirlineDto {
  @ApiProperty({ maxLength: PROFILE_LIMITS.name })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PROFILE_LIMITS.name)
  name: string;

  @ApiProperty({ description: 'Two alphanumeric characters or three letters; stored uppercase', example: 'MS' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @Matches(/^(?:[A-Z0-9]{2}|[A-Z]{3})$/)
  iataCode: string;

  @ApiProperty({ description: 'One JPG/PNG logo URL returned by the shared image upload endpoint' })
  @Trim()
  @IsUrl(IMAGE_URL_OPTIONS)
  logoUrl: string;

  @ApiProperty({ description: 'Existing airline moderator, assigned to at most one provider' })
  @IsMongoId()
  moderatorId: string;
}
