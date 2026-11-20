import { ApiProperty } from '@nestjs/swagger';
import { UserProfileDto } from '../../auth/dto/auth-response.dto.js';
import { UserActivityStatus } from '../../database/schemas/user.schema.js';

// ACC-09, ACC-11: returned only for the authenticated account.
export class MyProfileDto extends UserProfileDto {
  @ApiProperty({ type: String, nullable: true })
  phoneNumber: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'USD' })
  preferredCurrency: string | null;

  @ApiProperty()
  countryOfOriginId: string;

  @ApiProperty()
  profileImageUrl: string;

  @ApiProperty({ enum: UserActivityStatus })
  status: UserActivityStatus;
}
