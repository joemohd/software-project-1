import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({
    example: 205,
    description: 'A number unique within this hotel.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  number: number;

  @ApiProperty({ example: 'Deluxe Double' })
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  type: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bedCount: number;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxOccupancy: number;

  @ApiProperty({
    example: 14550,
    minimum: 1,
    description: 'Price per night in minor currency units (cents, > 0, HTL-03, PAY-04).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pricePerNight: number;
}
