import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { AdminAction, AuditLog } from '../admin/schemas/audit-log.schema.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { rethrowProviderError } from '../common/providers/profile.rules.js';
import { City } from '../database/schemas/city.schema.js';
import { Country } from '../database/schemas/country.schema.js';
import { Hotel } from '../database/schemas/provider.schema.js';
import { User, UserRole } from '../database/schemas/user.schema.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { HotelProfileDto } from './dto/hotel-profile.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';

type HotelRecord = Hotel & { _id: Types.ObjectId };

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    @InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLog>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // HTL-01, GEN-07
  async create(admin: AuthenticatedUser, dto: CreateHotelDto): Promise<HotelProfileDto> {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException('Administrator access is required.');
    try {
      return await this.connection.transaction(async (session) => {
        const moderatorId = new Types.ObjectId(dto.moderatorId);
        const moderator = await this.userModel.exists({ _id: moderatorId, role: UserRole.HOTEL_MODERATOR }).session(session).exec();
        if (!moderator) throw new BadRequestException('moderatorId must refer to a hotel moderator.');
        const countryId = await this.countryForCity(dto.cityId, dto.countryId, session);
        const [hotel] = await this.hotelModel.create([{
          name: dto.name, address: dto.address, cityId: new Types.ObjectId(dto.cityId), moderatorId,
          description: dto.description, imageUrls: dto.imageUrls ?? [], starClass: dto.starClass, amenities: dto.amenities ?? [],
        }], { session });
        await this.auditModel.create([{
          adminId: new Types.ObjectId(admin.id), targetProviderId: hotel._id, action: AdminAction.CREATE_HOTEL,
        }], { session });
        return this.toProfile(hotel, countryId);
      });
    } catch (error) {
      rethrowProviderError(error);
    }
  }

  // HTL-01, ACC-11
  async update(user: AuthenticatedUser, id: string, dto: UpdateHotelDto): Promise<HotelProfileDto> {
    if (user.role !== UserRole.HOTEL_MODERATOR) throw new ForbiddenException('Hotel moderator access is required.');
    if (Object.keys(dto).length === 0) throw new BadRequestException('Provide at least one profile field to update.');
    if (dto.countryId !== undefined && dto.cityId === undefined) throw new BadRequestException('Provide cityId when changing countryId.');
    const ownerFilter = { _id: id, moderatorId: new Types.ObjectId(user.id) };
    const existing = await this.hotelModel.findOne(ownerFilter).lean<HotelRecord>().exec();
    if (!existing) throw new NotFoundException('Hotel not found or not assigned to you.');
    const countryId = await this.countryForCity(dto.cityId ?? existing.cityId.toString(), dto.countryId);
    const fields: Partial<Hotel> = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.address !== undefined) fields.address = dto.address;
    if (dto.cityId !== undefined) fields.cityId = new Types.ObjectId(dto.cityId);
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.imageUrls !== undefined) fields.imageUrls = dto.imageUrls;
    if (dto.starClass !== undefined) fields.starClass = dto.starClass;
    if (dto.amenities !== undefined) fields.amenities = dto.amenities;
    const hotel = await this.hotelModel.findOneAndUpdate(ownerFilter, { $set: fields }, {
      returnDocument: 'after', runValidators: true,
    }).lean<HotelRecord>().exec();
    if (!hotel) throw new NotFoundException('Hotel not found or not assigned to you.');
    return this.toProfile(hotel, countryId);
  }

  private async countryForCity(cityId: string, expectedCountryId?: string, session: ClientSession | null = null): Promise<string> {
    const city = await this.cityModel.findById(cityId).session(session).lean<{ countryId: Types.ObjectId }>().exec();
    if (!city) throw new BadRequestException('cityId does not match a known city.');
    const countryId = city.countryId.toString();
    if (expectedCountryId !== undefined && !city.countryId.equals(expectedCountryId)) throw new BadRequestException('The city does not belong to the selected country.');
    const country = await this.countryModel.exists({ _id: city.countryId }).session(session).exec();
    if (!country) throw new BadRequestException('countryId does not match a known country.');
    return countryId;
  }

  private toProfile(hotel: HotelRecord, countryId: string): HotelProfileDto {
    return {
      id: hotel._id.toString(), name: hotel.name, address: hotel.address, cityId: hotel.cityId.toString(), countryId,
      description: hotel.description ?? '', imageUrls: hotel.imageUrls, starClass: hotel.starClass, amenities: hotel.amenities,
    };
  }
}
