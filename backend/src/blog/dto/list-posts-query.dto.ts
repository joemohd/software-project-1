import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SEARCH_MAX_LENGTH, TAG_MAX_LENGTH } from '../blog.constants.js';
import { PaginationQueryDto } from './pagination-query.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// BLG-02 (browse, filter by tag), BLG-09 (keyword search)
export class ListPostsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Keyword matched against the title, tags and author name. Results are ordered by likes + comments, newest first on ties.',
    maxLength: SEARCH_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    description: 'Only posts with this tag.',
    maxLength: TAG_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(TAG_MAX_LENGTH)
  tag?: string;
}
