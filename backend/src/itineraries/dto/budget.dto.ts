import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { BudgetCategory } from '../../database/schemas/itinerary.schema.js';
import { TrimString, UpperCode } from './transforms.js';

// ITN-14: non-negative budget entry for a day, in a selected currency
export class CreateBudgetDto {
  @ApiProperty({ enum: BudgetCategory, example: BudgetCategory.FOOD })
  @IsEnum(BudgetCategory)
  category: BudgetCategory;

  @ApiProperty({ example: 40, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'EGP', description: 'A supported currency code.' })
  @UpperCode()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter currency code' })
  currency: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(200)
  note?: string;
}

// ITN-14
export class UpdateBudgetDto extends PartialType(CreateBudgetDto) {}
