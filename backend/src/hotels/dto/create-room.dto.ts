import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsString, MaxLength, Min } from 'class-validator';

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

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bedCount: number;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxOccupancy: number;

  @ApiProperty({ example: 145.5, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  pricePerNight: number;
}
