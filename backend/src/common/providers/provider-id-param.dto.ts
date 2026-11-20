import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

// HTL-01, FLT-01
export class ProviderIdParamDto {
  @ApiProperty({ description: 'Hotel or airline ObjectId' })
  @IsMongoId()
  id: string;
}
