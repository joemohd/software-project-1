import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsMongoId, IsOptional, IsString, Matches, Min } from 'class-validator';
import { AdminAction, AuditTargetType } from '../../database/schemas/audit-log.schema.js';

const ISO_DATE_OR_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

// GEN-07: query for GET /api/admin/audit-logs
export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (10 items per page)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ enum: AdminAction, description: 'Filter by admin action type' })
  @IsOptional()
  @IsEnum(AdminAction)
  action?: AdminAction;

  @ApiPropertyOptional({ enum: AuditTargetType, description: 'Filter by target entity type' })
  @IsOptional()
  @IsEnum(AuditTargetType)
  targetType?: AuditTargetType;

  @ApiPropertyOptional({ description: 'Filter by admin account id', example: '665f1c2e9b1e8a0012345671' })
  @IsOptional()
  @IsMongoId()
  adminId?: string;

  @ApiPropertyOptional({ description: 'Filter by target entity id', example: '665f1c2e9b1e8a0012345672' })
  @IsOptional()
  @IsMongoId()
  targetId?: string;

  @ApiPropertyOptional({ description: 'Inclusive start date (YYYY-MM-DD or ISO-8601)', example: '2026-11-01' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_OR_DATETIME, { message: 'from must be a valid YYYY-MM-DD date or ISO-8601 timestamp.' })
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date (YYYY-MM-DD or ISO-8601)', example: '2026-11-30' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_OR_DATETIME, { message: 'to must be a valid YYYY-MM-DD date or ISO-8601 timestamp.' })
  to?: string;
}

export class AuditActorDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345671' })
  id: string;

  @ApiProperty({ example: 'System Admin' })
  fullName: string;

  @ApiProperty({ example: 'admin@example.com' })
  email: string;
}

// GEN-07: one audit log record
export class AuditLogEntryDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345690' })
  id: string;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345671' })
  adminId: string;

  @ApiProperty({ type: AuditActorDto, nullable: true })
  admin: AuditActorDto | null;

  @ApiProperty({ enum: AdminAction, example: AdminAction.DELETE_CONTENT })
  action: AdminAction;

  @ApiProperty({ enum: AuditTargetType, example: AuditTargetType.POST })
  targetType: AuditTargetType;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345672' })
  targetId: string;

  @ApiProperty({ nullable: true, type: String, example: 'Spam content removed' })
  reason: string | null;

  @ApiProperty({ type: Object, example: {} })
  metadata: Record<string, unknown>;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  createdAt: Date;
}

// GEN-05, GEN-07: paginated list of audit logs (page size 10)
export class AuditLogsPageDto {
  @ApiProperty({ type: [AuditLogEntryDto] })
  items: AuditLogEntryDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}
