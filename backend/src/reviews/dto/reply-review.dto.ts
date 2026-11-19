import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body for POST /api/reviews/:id/reply (HTL-26). */
export class ReplyReviewDto {
  @ApiProperty({ maxLength: 1000, description: "Moderator's reply text." })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;
}
