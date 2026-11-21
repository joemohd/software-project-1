import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PostStatus } from '../../database/schemas/blog-post.schema.js';
import {
  POST_MAX_TAGS,
  POST_TITLE_MAX_LENGTH,
  TAG_MAX_LENGTH,
} from '../blog.constants.js';

// Authors may only choose Draft or Published (BLG-01); "archived" is not set through this API
export const EDITABLE_POST_STATUSES = [
  PostStatus.DRAFT,
  PostStatus.PUBLISHED,
] as const;
export type EditablePostStatus = (typeof EDITABLE_POST_STATUSES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;

// BLG-01, BLG-08
export class CreatePostDto {
  @ApiProperty({
    example: 'Three days in Cairo',
    maxLength: POST_TITLE_MAX_LENGTH,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(POST_TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({ example: 'We started our trip at the Egyptian Museum...' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['egypt', 'museums'],
    maxItems: POST_MAX_TAGS,
    items: { type: 'string', minLength: 1, maxLength: TAG_MAX_LENGTH },
    description: `Up to ${POST_MAX_TAGS} tags, each at most ${TAG_MAX_LENGTH} characters. Stored in lowercase; duplicates are merged.`,
  })
  @IsOptional()
  @Transform(trimEach)
  @IsArray()
  @ArrayMaxSize(POST_MAX_TAGS)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(TAG_MAX_LENGTH, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    enum: EDITABLE_POST_STATUSES,
    default: PostStatus.DRAFT,
  })
  @IsOptional()
  @IsIn(EDITABLE_POST_STATUSES)
  status?: EditablePostStatus;
}
