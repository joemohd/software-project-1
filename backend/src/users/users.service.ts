import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type Connection, type Model, Types } from 'mongoose';
import { toProfile } from '../auth/auth.helper.js';
import type { AuthenticatedUser, UserRecord } from '../auth/auth.types.js';
import { MessageResponseDto } from '../auth/dto/auth-response.dto.js';
import { RefreshToken } from '../auth/schemas/refresh-token.schema.js';
import { BlogPost, PostStatus } from '../database/schemas/blog-post.schema.js';
import { Currency } from '../database/schemas/currency.schema.js';
import { BookingStatus, FlightBooking, HotelBooking } from '../database/schemas/expense.schema.js';
import { Flight } from '../database/schemas/flight.schema.js';
import { Itinerary, ItineraryVisibility } from '../database/schemas/itinerary.schema.js';
import { PasswordResetToken } from '../database/schemas/password-reset-token.schema.js';
import { User, UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { DeactivateAccountDto } from './dto/deactivate-account.dto.js';
import { MyProfileDto } from './dto/my-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Currency.name) private readonly currencyModel: Model<Currency>,
    @InjectModel(HotelBooking.name) private readonly hotelBookingModel: Model<HotelBooking>,
    @InjectModel(FlightBooking.name) private readonly flightBookingModel: Model<FlightBooking>,
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(BlogPost.name) private readonly postModel: Model<BlogPost>,
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<Itinerary>,
    @InjectModel(PasswordResetToken.name) private readonly passwordResetTokenModel: Model<PasswordResetToken>,
    @InjectModel(RefreshToken.name) private readonly refreshTokenModel: Model<RefreshToken>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ACC-11: ownership comes from the authenticated user, never a request parameter.
  async me(user: AuthenticatedUser): Promise<MyProfileDto> {
    const record = await this.userModel.findById(user.id).lean<UserRecord>().exec();
    if (!record) throw new UnauthorizedException('Account no longer exists.');
    return this.toMyProfile(record);
  }

  // ACC-09
  async updateMe(user: AuthenticatedUser, dto: UpdateProfileDto): Promise<MyProfileDto> {
    const fields: Partial<User> = {};
    if (dto.fullName !== undefined) fields.fullName = dto.fullName;
    if (dto.phoneNumber !== undefined) fields.phoneNumber = dto.phoneNumber;
    if (dto.preferredCurrency !== undefined) {
      const currencyExists = await this.currencyModel.exists({ currency: dto.preferredCurrency }).exec();
      if (!currencyExists) throw new BadRequestException('preferredCurrency does not match a known currency.');
      fields.preferredCurrency = dto.preferredCurrency;
    }
    if (Object.keys(fields).length === 0) throw new BadRequestException('Provide at least one profile field to update.');

    const updated = await this.userModel
      .findByIdAndUpdate(user.id, { $set: fields }, { returnDocument: 'after', runValidators: true })
      .lean<UserRecord>()
      .exec();
    if (!updated) throw new UnauthorizedException('Account no longer exists.');
    return this.toMyProfile(updated);
  }

  // ACC-12: all account/content/session changes commit together.
  async deactivateMe(user: AuthenticatedUser, dto: DeactivateAccountDto): Promise<MessageResponseDto> {
    if (user.role !== UserRole.USER) throw new ForbiddenException('Only registered users can deactivate their account.');
    if (dto.confirm !== true) throw new BadRequestException('Account deactivation must be confirmed.');

    return this.connection.transaction(async (session) => {
      const userId = new Types.ObjectId(user.id);
      const record = await this.userModel.findById(userId).session(session).lean<UserRecord>().exec();
      if (!record) throw new UnauthorizedException('Account no longer exists.');
      if (record.role !== UserRole.USER) throw new ForbiddenException('Only registered users can deactivate their account.');

      const now = new Date();
      // Include stays already in progress, until their checkout date.
      const hotelBooking = await this.hotelBookingModel.exists({
        userId,
        status: BookingStatus.CONFIRMED,
        $expr: { $gt: [{ $dateAdd: { startDate: '$startDate', unit: 'day', amount: '$nightsCount' } }, now] },
      }).session(session).exec();
      if (hotelBooking) throw new ConflictException('Cannot deactivate an account with upcoming confirmed bookings.');

      const flightBookings = await this.flightBookingModel.aggregate([
        { $match: { userId, status: BookingStatus.CONFIRMED } },
        { $lookup: { from: this.flightModel.collection.name, localField: 'flightId', foreignField: '_id', as: 'flight' } },
        { $match: { $or: [{ 'flight.arrival.timestamp': { $gt: now } }, { flight: { $size: 0 } }] } },
        { $limit: 1 },
        { $project: { _id: 1 } },
      ]).session(session).exec();
      if (flightBookings.length) throw new ConflictException('Cannot deactivate an account with upcoming confirmed bookings.');

      await this.userModel.updateOne({ _id: userId }, {
        // Retained comments and booking reviews still reference this account and display its anonymized name.
        $set: { status: UserActivityStatus.INACTIVE, fullName: 'Deleted user', profileImageUrl: '' },
        $inc: { sessionVersion: 1 },
      }, { session }).exec();
      await this.postModel.updateMany({ userId, status: PostStatus.PUBLISHED }, { $set: { status: PostStatus.ARCHIVED } }, { session }).exec();
      await this.itineraryModel.updateMany({ userId, visibility: ItineraryVisibility.PUBLIC }, { $set: { visibility: ItineraryVisibility.PRIVATE } }, { session }).exec();
      await this.refreshTokenModel.deleteMany({ userId }, { session }).exec();
      await this.passwordResetTokenModel.deleteMany({ userId }, { session }).exec();

      return { message: 'Your account has been deactivated.' };
    });
  }

  private toMyProfile(record: UserRecord): MyProfileDto {
    return Object.assign(new MyProfileDto(), toProfile(record), {
      phoneNumber: record.phoneNumber ?? null,
      preferredCurrency: record.preferredCurrency ?? null,
      countryOfOriginId: record.countryOfOriginId.toString(),
      profileImageUrl: record.profileImageUrl ?? '',
      status: record.status,
    });
  }
}
