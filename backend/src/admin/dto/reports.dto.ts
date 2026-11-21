import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ModeratedContentType, ReportResolution, ReportStatus } from '../../database/schemas/report.schema.js';
import { AuditActorDto } from './list-audit-logs.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// GEN-09: body for POST /api/reports
export class CreateReportDto {
  @ApiProperty({
    enum: ModeratedContentType,
    example: ModeratedContentType.POST,
    description: 'Type of content being reported (post, comment, review or itinerary, GEN-09)',
  })
  @IsEnum(ModeratedContentType)
  targetType: ModeratedContentType;

  @ApiProperty({
    description: 'Id of the post, comment, review or itinerary being reported (GEN-09)',
    example: '665f1c2e9b1e8a0012345682',
  })
  @IsMongoId()
  targetId: string;

  @ApiProperty({
    description: 'Reason for reporting the content (non-empty, max 1000 characters, GEN-09)',
    example: 'Contains spam and misleading links.',
    minLength: 1,
    maxLength: 1000,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;
}

// GEN-09, GEN-10: query for GET /api/admin/reports (defaults to open reports)
export class ListReportsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (10 items per page)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    enum: ReportStatus,
    default: ReportStatus.OPEN,
    description: 'Report status filter (defaults to open reports per GEN-10)',
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status: ReportStatus = ReportStatus.OPEN;

  @ApiPropertyOptional({ enum: ModeratedContentType, description: 'Filter by reported content type' })
  @IsOptional()
  @IsEnum(ModeratedContentType)
  targetType?: ModeratedContentType;
}

// GEN-10: route param for PATCH /api/admin/reports/:id
export class ReportIdParamDto {
  @ApiProperty({ description: 'Id of the report to resolve', example: '665f1c2e9b1e8a0012345681' })
  @IsMongoId()
  id: string;
}

// GEN-10: body for PATCH /api/admin/reports/:id
export class ResolveReportDto {
  @ApiProperty({
    enum: ReportResolution,
    example: ReportResolution.HIDE,
    description: 'How to resolve the open report: dismiss it, hide the content, or delete the content',
  })
  @IsEnum(ReportResolution)
  action: ReportResolution;

  @ApiPropertyOptional({
    description: 'Optional admin resolution note recorded on the report and audit log',
    maxLength: 1000,
    example: 'Violates community guidelines.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

// GEN-10: route params for DELETE /api/admin/content/:type/:id
export class ContentParamDto {
  @ApiProperty({
    enum: ModeratedContentType,
    example: ModeratedContentType.POST,
    description: 'Type of content to delete (post, comment, review or itinerary)',
  })
  @IsEnum(ModeratedContentType)
  type: ModeratedContentType;

  @ApiProperty({ description: 'Id of the content item to delete', example: '665f1c2e9b1e8a0012345682' })
  @IsMongoId()
  id: string;
}

// GEN-10: optional query for DELETE /api/admin/content/:type/:id
export class DeleteContentQueryDto {
  @ApiPropertyOptional({
    description: 'Optional reason recorded in the admin audit log',
    maxLength: 1000,
    example: 'Abusive content removed by admin.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ReportedContentPreviewDto {
  @ApiProperty({ example: true })
  exists: boolean;

  @ApiProperty({ nullable: true, type: String, example: '665f1c2e9b1e8a0012345675' })
  authorId: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'My Trip to Cairo' })
  summary: string | null;

  @ApiProperty({ example: false })
  isHidden: boolean;
}

// GEN-09, GEN-10: one report item returned to admins
export class ReportEntryDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345681' })
  id: string;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345674' })
  reporterId: string;

  @ApiProperty({ type: AuditActorDto, nullable: true })
  reporter: AuditActorDto | null;

  @ApiProperty({ enum: ModeratedContentType, example: ModeratedContentType.POST })
  targetType: ModeratedContentType;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345682' })
  targetId: string;

  @ApiProperty({ type: ReportedContentPreviewDto })
  target: ReportedContentPreviewDto;

  @ApiProperty({ example: 'Spam or misleading content' })
  reason: string;

  @ApiProperty({ enum: ReportStatus, example: ReportStatus.OPEN })
  status: ReportStatus;

  @ApiProperty({ nullable: true, type: String, example: null })
  resolvedBy: string | null;

  @ApiProperty({ nullable: true, type: Date, example: null })
  resolvedAt: Date | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  resolutionNote: string | null;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  createdAt: Date;
}

// GEN-05, GEN-10: paginated list of reports (page size 10)
export class ReportsPageDto {
  @ApiProperty({ type: [ReportEntryDto] })
  items: ReportEntryDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class DeleteContentResponseDto {
  @ApiProperty({ example: true })
  deleted: boolean;

  @ApiProperty({ enum: ModeratedContentType, example: ModeratedContentType.POST })
  type: ModeratedContentType;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345682' })
  id: string;

  @ApiProperty({ example: 'Post deleted and action recorded in the audit log.' })
  message: string;
}
