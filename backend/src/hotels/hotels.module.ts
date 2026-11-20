import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from '../database/database.module.js';
import { City, CitySchema } from '../database/schemas/city.schema.js';
import { Country, CountrySchema } from '../database/schemas/country.schema.js';
import { Hotel, HotelSchema, Room, RoomSchema, RoomType, RoomTypeSchema } from '../database/schemas/provider.schema.js';
import { HotelBooking, HotelBookingSchema } from '../database/schemas/expense.schema.js';
import { User, UserSchema } from '../database/schemas/user.schema.js';
import { HotelsController } from './hotels.controller.js';
import { HotelsService } from './hotels.service.js';

@Module({
  imports: [DatabaseModule, MongooseModule.forFeature([
    { name: Hotel.name, schema: HotelSchema }, { name: Room.name, schema: RoomSchema },
    { name: RoomType.name, schema: RoomTypeSchema }, { name: HotelBooking.name, schema: HotelBookingSchema },
    { name: User.name, schema: UserSchema }, { name: City.name, schema: CitySchema }, { name: Country.name, schema: CountrySchema },
  ])],
  controllers: [HotelsController],
  providers: [HotelsService],
  exports: [HotelsService],
})
export class HotelsModule {}
