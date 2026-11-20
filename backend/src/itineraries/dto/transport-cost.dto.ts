import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsNumber, IsString, Matches, MaxLength, Min } from 'class-validator';
import { TrimString, UpperCode } from './transforms.js';

// ITN-16: mode, from-city, to-city, amount, currency, day
export class CreateTransportCostDto {
  @ApiProperty({ example: 'train', maxLength: 50 })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  mode: string;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60718' })
  @IsMongoId()
  fromCityId: string;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60719' })
  @IsMongoId()
  toCityId: string;

  @ApiProperty({ example: 30, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'USD' })
  @UpperCode()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter currency code' })
  currency: string;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60720', description: 'A day of this itinerary.' })
  @IsMongoId()
  dayId: string;
}

// ITN-16
export class UpdateTransportCostDto extends PartialType(CreateTransportCostDto) {}
