import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { COMMENT_MAX_LENGTH } from '../blog.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// BLG-05 (create), BLG-07 (edit): same body for both
export class CommentDto {
  @ApiProperty({
    example: 'Great tips, thanks!',
    minLength: 1,
    maxLength: COMMENT_MAX_LENGTH,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(COMMENT_MAX_LENGTH)
  text: string;
}
