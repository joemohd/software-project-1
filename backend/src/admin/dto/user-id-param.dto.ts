import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

// ACC-07a
export class UserIdParamDto {
  @ApiProperty({ description: 'Id of a registered user or moderator' })
  @IsMongoId()
  id: string;
}
