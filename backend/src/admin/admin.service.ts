import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, isValidObjectId, type Model, Types } from 'mongoose';
import {
  clearedLoginAttempts,
  duplicateKeyMessage,
  hashPassword,
  isDuplicateKeyError,
  MESSAGES,
  normalizeEmail,
  normalizeUsername,
} from '../auth/auth.helper.js';
import type { AuthenticatedUser, UserRecord } from '../auth/auth.types.js';
import { MessageResponseDto } from '../auth/dto/auth-response.dto.js';
import { MailService } from '../auth/mail.service.js';
import { RefreshToken } from '../auth/schemas/refresh-token.schema.js';
import { AdminAction, AuditLog, AuditTargetType } from '../database/schemas/audit-log.schema.js';
import { Country } from '../database/schemas/country.schema.js';
import { FlightBooking, HotelBooking } from '../database/schemas/expense.schema.js';
import { Flight } from '../database/schemas/flight.schema.js';
import { PasswordResetToken } from '../database/schemas/password-reset-token.schema.js';
import { Airline, Hotel, Provider, ProviderStatus, Room } from '../database/schemas/provider.schema.js';
import { User, UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { isReferenceVisible } from '../flight-bookings/booking-rules.js';
import { ADMIN_PAGE_SIZE } from './admin-moderation.service.js';
import {
  AccountsPageDto,
  AdminAccountDto,
  AdminProviderStatusResponseDto,
  AdminProviderType,
  AdminReasonDto,
  CreateModeratorDto,
  ListAccountsQueryDto,
} from './dto/admin-accounts.dto.js';
import {
  AdminBookingItemDto,
  AdminBookingsPageDto,
  AdminBookingType,
  ListAdminBookingsQueryDto,
} from './dto/admin-bookings.dto.js';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto.js';

type AccountRecord = UserRecord & {
  mustChangePassword?: boolean;
  createdAt?: Date;
};
type ProviderRecord = Provider & { _id: Types.ObjectId; providerType?: 'airline' | 'hotel' };
type FlightBookingRecord = FlightBooking & { _id: Types.ObjectId; createdAt?: Date };
type HotelBookingRecord = HotelBooking & { _id: Types.ObjectId; createdAt?: Date };
type FlightSummaryRecord = Pick<Flight, 'airlineId' | 'departure' | 'arrival'> & { _id: Types.ObjectId };
type AirlineSummaryRecord = Pick<Airline, 'name'> & { _id: Types.ObjectId };
type HotelSummaryRecord = Pick<Hotel, 'name'> & { _id: Types.ObjectId };
type RoomSummaryRecord = Pick<Room, 'hotelId'> & { _id: Types.ObjectId };

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(PasswordResetToken.name) private readonly passwordResetTokenModel: Model<PasswordResetToken>,
    @InjectModel(RefreshToken.name) private readonly refreshTokenModel: Model<RefreshToken>,
    @InjectConnection() private readonly connection: Connection,
    @Optional() @InjectModel(AuditLog.name) private readonly auditLogModel?: Model<AuditLog>,
    @Optional() @InjectModel(Provider.name) private readonly providerModel?: Model<Provider>,
    @Optional() @InjectModel(Airline.name) private readonly airlineModel?: Model<Airline>,
    @Optional() @InjectModel(Hotel.name) private readonly hotelModel?: Model<Hotel>,
    @Optional() @InjectModel(Room.name) private readonly roomModel?: Model<Room>,
    @Optional() @InjectModel(Flight.name) private readonly flightModel?: Model<Flight>,
    @Optional() @InjectModel(FlightBooking.name) private readonly flightBookingModel?: Model<FlightBooking>,
    @Optional() @InjectModel(HotelBooking.name) private readonly hotelBookingModel?: Model<HotelBooking>,
    @Optional() @InjectModel(Country.name) private readonly countryModel?: Model<Country>,
    @Optional() private readonly mailService?: MailService,
  ) {}

  // ACC-07a, GEN-07
  async resetUserPassword(admin: AuthenticatedUser, userId: string, dto: ResetUserPasswordDto): Promise<MessageResponseDto> {
    this.assertAdmin(admin);
    const passwordHash = await hashPassword(dto.temporaryPassword);

    return this.connection.transaction(async (session) => {
      const target = await this.userModel.findById(userId).session(session).lean<UserRecord>().exec();
      if (!target) throw new NotFoundException('Account not found.');
      if (target.role === UserRole.ADMIN) throw new ForbiddenException('Only user and moderator passwords can be reset.');

      await this.userModel
        .updateOne(
          { _id: target._id },
          {
            $set: { passwordHash, mustChangePassword: true, ...clearedLoginAttempts() },
            $inc: { sessionVersion: 1 },
          },
          { session },
        )
        .exec();
      await this.refreshTokenModel.deleteMany({ userId: target._id }, { session }).exec();
      await this.passwordResetTokenModel.deleteMany({ userId: target._id }, { session }).exec();
      await this.recordAudit(
        {
          adminId: new Types.ObjectId(admin.id),
          action: AdminAction.RESET_PASSWORD,
          targetType: AuditTargetType.USER,
          targetId: target._id,
          reason: null,
          metadata: { targetRole: target.role },
        },
        session,
      );
      return { message: 'Temporary password set. The account must choose a new password at its next login.' };
    });
  }

  // ACC-13, GEN-01-B, GEN-07: create a hotel or airline moderator account linked to one provider
  async createModerator(admin: AuthenticatedUser, dto: CreateModeratorDto): Promise<AdminAccountDto> {
    this.assertAdmin(admin);
    if (dto.role !== UserRole.HOTEL_MODERATOR && dto.role !== UserRole.AIRLINE_MODERATOR) {
      throw new BadRequestException('role must be either "hotel moderator" or "airline moderator".');
    }

    const emailAddress = normalizeEmail(dto.emailAddress);
    const passwordHash = await hashPassword(dto.temporaryPassword);
    const adminObjectId = new Types.ObjectId(admin.id);

    let createdAccount: AdminAccountDto;
    try {
      createdAccount = await this.connection.transaction(async (session) => {
        const emailTaken = await this.userModel.exists({ emailAddress }).session(session).exec();
        if (emailTaken) throw new ConflictException(MESSAGES.emailTaken);

        const username = await this.resolveModeratorUsername(dto.username, emailAddress, session);
        const countryOfOriginId = await this.resolveCountryId(dto.countryOfOriginId, session);
        const provider = dto.providerId
          ? await this.validateProviderForRole(dto.providerId, dto.role, session)
          : null;

        const [created] = await this.userModel.create(
          [
            {
              fullName: dto.fullName.trim(),
              emailAddress,
              username,
              passwordHash,
              mustChangePassword: true,
              role: dto.role,
              status: UserActivityStatus.ACTIVE,
              isVerified: true,
              adminId: adminObjectId,
              countryOfOriginId,
              ...(dto.phoneNumber ? { phoneNumber: dto.phoneNumber } : {}),
            },
          ],
          { session },
        );
        const record = (typeof created.toObject === 'function' ? created.toObject() : created) as AccountRecord;

        if (provider) {
          const providerModel = (
            (dto.role === UserRole.HOTEL_MODERATOR ? this.hotelModel : this.airlineModel) ?? this.providerModel
          ) as Model<Provider> | undefined;
          await providerModel?.updateOne({ _id: provider._id }, { $set: { moderatorId: record._id } }, { session }).exec();
        }

        await this.recordAudit(
          {
            adminId: adminObjectId,
            action: AdminAction.CREATE_MODERATOR,
            targetType: AuditTargetType.USER,
            targetId: record._id,
            reason: null,
            metadata: {
              role: dto.role,
              providerId: provider ? provider._id.toString() : null,
            },
          },
          session,
        );

        return this.toAdminAccount(record, provider ? provider._id.toString() : null);
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictException(duplicateKeyMessage(error));
      throw error;
    }

    // GEN-01-B: best-effort moderator invitation email
    await this.mailService?.send({
      to: createdAccount.emailAddress,
      subject: 'Your moderator account has been created',
      text: `Hello ${createdAccount.fullName},\n\nAn administrator has created a ${createdAccount.role} account for you. Please sign in with your temporary password and choose a new password on your first login.`,
      html: `<p>Hello ${createdAccount.fullName},</p><p>An administrator has created a <strong>${createdAccount.role}</strong> account for you. Please sign in with your temporary password and choose a new password on your first login.</p>`,
    });

    return createdAccount;
  }

  // ACC-14, GEN-05: paginated list of all accounts with search by name/email and filter by role/status
  async listAccounts(admin: AuthenticatedUser, query: ListAccountsQueryDto): Promise<AccountsPageDto> {
    this.assertAdmin(admin);
    const page = query.page ?? 1;
    const filter: Record<string, unknown> = {};

    if (query.role) filter.role = query.role;
    if (query.status) filter.status = query.status;
    if (query.search) {
      const escaped = escapeRegex(query.search.trim());
      if (escaped) {
        filter.$or = [
          { fullName: { $regex: escaped, $options: 'i' } },
          { emailAddress: { $regex: escaped, $options: 'i' } },
        ];
      }
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * ADMIN_PAGE_SIZE)
        .limit(ADMIN_PAGE_SIZE)
        .lean<AccountRecord[]>()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    const providerByModerator = await this.loadProviderIdsForModerators(users);
    const items = users.map((user) =>
      this.toAdminAccount(user, providerByModerator.get(user._id.toString()) ?? null),
    );

    return {
      items,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / ADMIN_PAGE_SIZE),
    };
  }

  // ACC-15, ACC-16, GEN-01, GEN-07: suspend a registered user or moderator account
  async suspendAccount(admin: AuthenticatedUser, userId: string, dto?: AdminReasonDto): Promise<AdminAccountDto> {
    this.assertAdmin(admin);
    if (!isValidObjectId(userId)) throw new NotFoundException('Account not found.');

    const account = await this.connection.transaction(async (session) => {
      const target = await this.userModel.findById(userId).session(session).lean<AccountRecord>().exec();
      if (!target) throw new NotFoundException('Account not found.');
      if (target.role === UserRole.ADMIN) {
        throw new ForbiddenException('Administrator accounts cannot be suspended.');
      }
      if (target.status === UserActivityStatus.SUSPENDED) {
        throw new ConflictException('Account is already suspended.');
      }
      if (target.status === UserActivityStatus.INACTIVE) {
        throw new ConflictException('Deactivated accounts cannot be suspended.');
      }

      await this.userModel
        .updateOne(
          { _id: target._id },
          {
            $set: { status: UserActivityStatus.SUSPENDED },
            $inc: { sessionVersion: 1 },
          },
          { session },
        )
        .exec();
      await this.refreshTokenModel.deleteMany({ userId: target._id }, { session }).exec();
      await this.passwordResetTokenModel.deleteMany({ userId: target._id }, { session }).exec();

      await this.recordAudit(
        {
          adminId: new Types.ObjectId(admin.id),
          action: AdminAction.SUSPEND_USER,
          targetType: AuditTargetType.USER,
          targetId: target._id,
          reason: dto?.reason ?? null,
          metadata: {
            targetRole: target.role,
            previousStatus: target.status,
            newStatus: UserActivityStatus.SUSPENDED,
          },
        },
        session,
      );

      const providerByModerator = await this.loadProviderIdsForModerators([target], session);
      return this.toAdminAccount(
        target,
        providerByModerator.get(target._id.toString()) ?? null,
        'Account has been suspended.',
        UserActivityStatus.SUSPENDED,
      );
    });

    // GEN-01-B: notify the suspended user/moderator by email
    await this.mailService?.send({
      to: account.emailAddress,
      subject: 'Your account has been suspended',
      text: `Hello ${account.fullName},\n\nYour account has been suspended by an administrator.${dto?.reason ? ` Reason: ${dto.reason}` : ''}`,
      html: `<p>Hello ${account.fullName},</p><p>Your account has been suspended by an administrator.${dto?.reason ? ` Reason: ${dto.reason}` : ''}</p>`,
    });

    return account;
  }

  // ACC-15, ACC-16, GEN-01, GEN-07: reactivate a suspended registered user or moderator account
  async reactivateAccount(admin: AuthenticatedUser, userId: string, dto?: AdminReasonDto): Promise<AdminAccountDto> {
    this.assertAdmin(admin);
    if (!isValidObjectId(userId)) throw new NotFoundException('Account not found.');

    const account = await this.connection.transaction(async (session) => {
      const target = await this.userModel.findById(userId).session(session).lean<AccountRecord>().exec();
      if (!target) throw new NotFoundException('Account not found.');
      if (target.role === UserRole.ADMIN) {
        throw new ForbiddenException('Administrator accounts cannot be modified.');
      }
      if (target.status === UserActivityStatus.ACTIVE) {
        throw new ConflictException('Account is already active.');
      }
      if (target.status === UserActivityStatus.INACTIVE) {
        throw new ConflictException('Self-deactivated accounts cannot be reactivated.');
      }

      await this.userModel
        .updateOne(
          { _id: target._id },
          {
            $set: { status: UserActivityStatus.ACTIVE, ...clearedLoginAttempts() },
          },
          { session },
        )
        .exec();

      await this.recordAudit(
        {
          adminId: new Types.ObjectId(admin.id),
          action: AdminAction.REACTIVATE_USER,
          targetType: AuditTargetType.USER,
          targetId: target._id,
          reason: dto?.reason ?? null,
          metadata: {
            targetRole: target.role,
            previousStatus: target.status,
            newStatus: UserActivityStatus.ACTIVE,
          },
        },
        session,
      );

      const providerByModerator = await this.loadProviderIdsForModerators([target], session);
      return this.toAdminAccount(
        target,
        providerByModerator.get(target._id.toString()) ?? null,
        'Account has been reactivated.',
        UserActivityStatus.ACTIVE,
      );
    });

    await this.mailService?.send({
      to: account.emailAddress,
      subject: 'Your account has been reactivated',
      text: `Hello ${account.fullName},\n\nYour account has been reactivated by an administrator. You may now sign in again.`,
      html: `<p>Hello ${account.fullName},</p><p>Your account has been reactivated by an administrator. You may now sign in again.</p>`,
    });

    return account;
  }

  // ACC-15, GEN-01, GEN-07: deactivate a hotel or airline
  async deactivateProvider(
    admin: AuthenticatedUser,
    type: AdminProviderType,
    providerId: string,
    dto?: AdminReasonDto,
  ): Promise<AdminProviderStatusResponseDto> {
    return this.changeProviderStatus(admin, type, providerId, ProviderStatus.DEACTIVATED, dto);
  }

  // ACC-15, GEN-01, GEN-07: reactivate a hotel or airline
  async reactivateProvider(
    admin: AuthenticatedUser,
    type: AdminProviderType,
    providerId: string,
    dto?: AdminReasonDto,
  ): Promise<AdminProviderStatusResponseDto> {
    return this.changeProviderStatus(admin, type, providerId, ProviderStatus.ACTIVE, dto);
  }

  // ACC-17, GEN-05: read-only paginated list of all flight and hotel bookings, filterable by type, status and date range
  async listBookings(admin: AuthenticatedUser, query: ListAdminBookingsQueryDto): Promise<AdminBookingsPageDto> {
    this.assertAdmin(admin);
    const page = query.page ?? 1;

    const fromDate = query.from ? parseDateBound(query.from, 'from', false) : undefined;
    const toDate = query.to ? parseDateBound(query.to, 'to', true) : undefined;
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from cannot be after to.');
    }

    const baseFilter: Record<string, unknown> = {};
    if (query.status) baseFilter.status = query.status;

    const includeFlights = !query.type || query.type === AdminBookingType.FLIGHT;
    const includeHotels = !query.type || query.type === AdminBookingType.HOTEL;

    const [flightBookings, hotelBookings] = await Promise.all([
      includeFlights && this.flightBookingModel
        ? this.flightBookingModel.find(baseFilter).sort({ createdAt: -1, _id: -1 }).lean<FlightBookingRecord[]>().exec()
        : Promise.resolve([] as FlightBookingRecord[]),
      includeHotels && this.hotelBookingModel
        ? this.hotelBookingModel.find(baseFilter).sort({ createdAt: -1, _id: -1 }).lean<HotelBookingRecord[]>().exec()
        : Promise.resolve([] as HotelBookingRecord[]),
    ]);

    const userIds = [
      ...new Set([
        ...flightBookings.map((booking) => booking.userId.toString()),
        ...hotelBookings.map((booking) => booking.userId.toString()),
      ]),
    ].map((id) => new Types.ObjectId(id));

    const flightIds = [
      ...new Set(flightBookings.flatMap((booking) => (booking.segments ?? []).map((segment) => segment.flightId.toString()))),
    ].map((id) => new Types.ObjectId(id));

    const roomIds = [
      ...new Set(hotelBookings.flatMap((booking) => (booking.rooms ?? []).map((room) => room.roomId.toString()))),
    ].map((id) => new Types.ObjectId(id));

    const [users, flights, rooms] = await Promise.all([
      userIds.length
        ? this.userModel
            .find({ _id: { $in: userIds } })
            .select('fullName emailAddress')
            .lean<{ _id: Types.ObjectId; fullName: string; emailAddress: string }[]>()
            .exec()
        : Promise.resolve([]),
      flightIds.length && this.flightModel
        ? this.flightModel
            .find({ _id: { $in: flightIds } })
            .select('airlineId departure arrival')
            .lean<FlightSummaryRecord[]>()
            .exec()
        : Promise.resolve([] as FlightSummaryRecord[]),
      roomIds.length && this.roomModel
        ? this.roomModel
            .find({ _id: { $in: roomIds } })
            .select('hotelId')
            .lean<RoomSummaryRecord[]>()
            .exec()
        : Promise.resolve([] as RoomSummaryRecord[]),
    ]);

    const airlineIds = [...new Set(flights.map((flight) => flight.airlineId.toString()))].map((id) => new Types.ObjectId(id));
    const hotelIds = [...new Set(rooms.map((room) => room.hotelId.toString()))].map((id) => new Types.ObjectId(id));

    const [airlines, hotels] = await Promise.all([
      airlineIds.length && this.airlineModel
        ? this.airlineModel.find({ _id: { $in: airlineIds } }).select('name').lean<AirlineSummaryRecord[]>().exec()
        : Promise.resolve([] as AirlineSummaryRecord[]),
      hotelIds.length && this.hotelModel
        ? this.hotelModel.find({ _id: { $in: hotelIds } }).select('name').lean<HotelSummaryRecord[]>().exec()
        : Promise.resolve([] as HotelSummaryRecord[]),
    ]);

    const userMap = new Map(
      users.map((user) => [
        user._id.toString(),
        { id: user._id.toString(), fullName: user.fullName, emailAddress: user.emailAddress },
      ]),
    );
    const flightMap = new Map(flights.map((flight) => [flight._id.toString(), flight]));
    const airlineMap = new Map(airlines.map((airline) => [airline._id.toString(), airline]));
    const roomMap = new Map(rooms.map((room) => [room._id.toString(), room]));
    const hotelMap = new Map(hotels.map((hotel) => [hotel._id.toString(), hotel]));

    const mappedFlights: AdminBookingItemDto[] = flightBookings.map((booking) => {
      const firstSegment = booking.segments?.[0];
      const lastSegment = booking.segments?.[booking.segments.length - 1];
      const outboundFlight = firstSegment ? flightMap.get(firstSegment.flightId.toString()) : undefined;
      const finalFlight = lastSegment ? flightMap.get(lastSegment.flightId.toString()) : undefined;
      const airline = outboundFlight ? airlineMap.get(outboundFlight.airlineId.toString()) : undefined;
      const createdAt = booking.createdAt ?? booking._id.getTimestamp();

      return {
        id: booking._id.toString(),
        type: AdminBookingType.FLIGHT,
        reference: isReferenceVisible(booking.status) ? booking.reference : null,
        userId: booking.userId.toString(),
        user: userMap.get(booking.userId.toString()) ?? null,
        provider: airline
          ? { id: airline._id.toString(), type: AdminProviderType.AIRLINE, name: airline.name }
          : null,
        dates: {
          startDate: outboundFlight?.departure?.timestamp ?? null,
          endDate: finalFlight?.arrival?.timestamp ?? outboundFlight?.arrival?.timestamp ?? null,
        },
        amount: booking.cost ?? (booking.fareTotal ?? 0) + (booking.baggageFee ?? 0),
        status: booking.status,
        createdAt,
      };
    });

    const mappedHotels: AdminBookingItemDto[] = hotelBookings.map((booking) => {
      const firstRoomId = booking.rooms?.[0]?.roomId;
      const room = firstRoomId ? roomMap.get(firstRoomId.toString()) : undefined;
      const hotel = room ? hotelMap.get(room.hotelId.toString()) : undefined;
      const startDate = booking.startDate ? new Date(booking.startDate) : null;
      const endDate = startDate ? new Date(startDate.getTime() + (booking.nightsCount ?? 1) * DAY_MS) : null;
      const createdAt = booking.createdAt ?? booking._id.getTimestamp();

      return {
        id: booking._id.toString(),
        type: AdminBookingType.HOTEL,
        reference: booking._id.toString(),
        userId: booking.userId.toString(),
        user: userMap.get(booking.userId.toString()) ?? null,
        provider: hotel
          ? { id: hotel._id.toString(), type: AdminProviderType.HOTEL, name: hotel.name }
          : null,
        dates: { startDate, endDate },
        amount: booking.cost ?? 0,
        status: booking.status,
        createdAt,
      };
    });

    const allItems = [...mappedFlights, ...mappedHotels]
      .filter((item) => matchesDateRange(item, fromDate, toDate))
      .sort((a, b) => {
        const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return diff !== 0 ? diff : b.id.localeCompare(a.id);
      });

    const total = allItems.length;
    const start = (page - 1) * ADMIN_PAGE_SIZE;
    const items = allItems.slice(start, start + ADMIN_PAGE_SIZE);

    return {
      items,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / ADMIN_PAGE_SIZE),
    };
  }

  private async changeProviderStatus(
    admin: AuthenticatedUser,
    type: AdminProviderType,
    providerId: string,
    targetStatus: ProviderStatus,
    dto?: AdminReasonDto,
  ): Promise<AdminProviderStatusResponseDto> {
    this.assertAdmin(admin);
    const label = type === AdminProviderType.AIRLINE ? 'Airline' : 'Hotel';
    if (!isValidObjectId(providerId)) throw new NotFoundException(`${label} not found.`);

    const model = (
      (type === AdminProviderType.AIRLINE ? this.airlineModel : this.hotelModel) ?? this.providerModel
    ) as Model<Provider> | undefined;
    if (!model) throw new NotFoundException(`${label} not found.`);

    const result = await this.connection.transaction(async (session) => {
      const provider = await model.findById(providerId).session(session).lean<ProviderRecord>().exec();
      if (!provider || (provider.providerType && provider.providerType !== type)) {
        throw new NotFoundException(`${label} not found.`);
      }

      if (provider.status === targetStatus) {
        const stateLabel = targetStatus === ProviderStatus.DEACTIVATED ? 'deactivated' : 'active';
        throw new ConflictException(`This ${type} is already ${stateLabel}.`);
      }

      await model.updateOne({ _id: provider._id }, { $set: { status: targetStatus } }, { session }).exec();

      await this.recordAudit(
        {
          adminId: new Types.ObjectId(admin.id),
          action:
            targetStatus === ProviderStatus.DEACTIVATED
              ? AdminAction.DEACTIVATE_PROVIDER
              : AdminAction.REACTIVATE_PROVIDER,
          targetType: type === AdminProviderType.AIRLINE ? AuditTargetType.AIRLINE : AuditTargetType.HOTEL,
          targetId: provider._id,
          reason: dto?.reason ?? null,
          metadata: {
            providerName: provider.name,
            moderatorId: provider.moderatorId.toString(),
            previousStatus: provider.status,
            newStatus: targetStatus,
          },
        },
        session,
      );

      const moderator = await this.userModel
        .findById(provider.moderatorId)
        .select('fullName emailAddress')
        .session(session)
        .lean<{ fullName: string; emailAddress: string }>()
        .exec();

      return {
        response: {
          id: provider._id.toString(),
          type,
          name: provider.name,
          status: targetStatus,
          moderatorId: provider.moderatorId.toString(),
          message: `${label} has been ${targetStatus === ProviderStatus.DEACTIVATED ? 'deactivated' : 'reactivated'}.`,
        },
        moderator,
      };
    });

    if (result.moderator) {
      const verb = targetStatus === ProviderStatus.DEACTIVATED ? 'deactivated' : 'reactivated';
      await this.mailService?.send({
        to: result.moderator.emailAddress,
        subject: `Your ${type} "${result.response.name}" has been ${verb}`,
        text: `Hello ${result.moderator.fullName},\n\nYour ${type} "${result.response.name}" has been ${verb} by an administrator.${dto?.reason ? ` Reason: ${dto.reason}` : ''}`,
        html: `<p>Hello ${result.moderator.fullName},</p><p>Your ${type} <strong>${result.response.name}</strong> has been ${verb} by an administrator.${dto?.reason ? ` Reason: ${dto.reason}` : ''}</p>`,
      });
    }

    return result.response;
  }

  private assertAdmin(admin: AuthenticatedUser): void {
    if (admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Administrator access is required.');
    }
  }

  private async resolveModeratorUsername(
    requested: string | undefined,
    emailAddress: string,
    session: ClientSession,
  ): Promise<string> {
    if (requested) {
      const normalized = normalizeUsername(requested);
      const taken = await this.userModel.exists({ username: normalized }).session(session).exec();
      if (taken) throw new ConflictException(MESSAGES.usernameTaken);
      return normalized;
    }

    const baseRaw = emailAddress.split('@')[0]?.toLowerCase().replace(/[^a-z0-9._]/g, '') ?? '';
    const base = (baseRaw.length >= 3 ? baseRaw : `${baseRaw}mod`).slice(0, 22);
    const baseTaken = await this.userModel.exists({ username: base }).session(session).exec();
    if (!baseTaken) return base;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${base}.${randomBytes(3).toString('hex')}`.slice(0, 30);
      const taken = await this.userModel.exists({ username: candidate }).session(session).exec();
      if (!taken) return candidate;
    }
    return `mod.${randomBytes(4).toString('hex')}`;
  }

  private async resolveCountryId(countryId: string | undefined, session: ClientSession): Promise<Types.ObjectId> {
    if (countryId) {
      if (this.countryModel) {
        const exists = await this.countryModel.exists({ _id: countryId }).session(session).exec();
        if (!exists) throw new BadRequestException(MESSAGES.unknownCountry);
      }
      return new Types.ObjectId(countryId);
    }

    if (this.countryModel) {
      const firstCountry = await this.countryModel
        .findOne()
        .select('_id')
        .session(session)
        .lean<{ _id: Types.ObjectId }>()
        .exec();
      if (firstCountry) return firstCountry._id;
    }
    return new Types.ObjectId();
  }

  private async validateProviderForRole(
    providerId: string,
    role: UserRole.HOTEL_MODERATOR | UserRole.AIRLINE_MODERATOR,
    session: ClientSession,
  ): Promise<ProviderRecord> {
    const isHotelRole = role === UserRole.HOTEL_MODERATOR;
    const primaryModel = (isHotelRole ? this.hotelModel : this.airlineModel) as Model<Provider> | undefined;
    const oppositeModel = (isHotelRole ? this.airlineModel : this.hotelModel) as Model<Provider> | undefined;

    if (primaryModel) {
      const found = await primaryModel.findById(providerId).session(session).lean<ProviderRecord>().exec();
      if (found) return found;
      if (oppositeModel) {
        const oppositeExists = await oppositeModel.exists({ _id: new Types.ObjectId(providerId) }).session(session).exec();
        if (oppositeExists) {
          throw new BadRequestException(
            isHotelRole
              ? 'providerId must refer to a hotel for a hotel moderator.'
              : 'providerId must refer to an airline for an airline moderator.',
          );
        }
      }
      throw new NotFoundException(isHotelRole ? 'Hotel not found.' : 'Airline not found.');
    }

    if (this.providerModel) {
      const found = await this.providerModel.findById(providerId).session(session).lean<ProviderRecord>().exec();
      if (!found) throw new NotFoundException(isHotelRole ? 'Hotel not found.' : 'Airline not found.');
      const expectedType = isHotelRole ? 'hotel' : 'airline';
      if (found.providerType && found.providerType !== expectedType) {
        throw new BadRequestException(`providerId must refer to a ${expectedType} for a ${role}.`);
      }
      return found;
    }

    return { _id: new Types.ObjectId(providerId) } as ProviderRecord;
  }

  private async loadProviderIdsForModerators(
    users: AccountRecord[],
    session?: ClientSession,
  ): Promise<Map<string, string>> {
    const moderatorIds = users
      .filter((user) => user.role === UserRole.HOTEL_MODERATOR || user.role === UserRole.AIRLINE_MODERATOR)
      .map((user) => user._id);
    const map = new Map<string, string>();
    if (!moderatorIds.length) return map;

    if (this.providerModel) {
      const query = this.providerModel
        .find({ moderatorId: { $in: moderatorIds } })
        .select('_id moderatorId');
      if (session) query.session(session);
      const providers = await query.lean<{ _id: Types.ObjectId; moderatorId: Types.ObjectId }[]>().exec();
      for (const provider of providers) {
        map.set(provider.moderatorId.toString(), provider._id.toString());
      }
      return map;
    }

    const queries: Promise<{ _id: Types.ObjectId; moderatorId: Types.ObjectId }[]>[] = [];
    for (const model of [this.hotelModel, this.airlineModel] as (Model<Provider> | undefined)[]) {
      if (!model) continue;
      const q = model.find({ moderatorId: { $in: moderatorIds } }).select('_id moderatorId');
      if (session) q.session(session);
      queries.push(q.lean<{ _id: Types.ObjectId; moderatorId: Types.ObjectId }[]>().exec());
    }
    const results = await Promise.all(queries);
    for (const list of results) {
      for (const provider of list) {
        map.set(provider.moderatorId.toString(), provider._id.toString());
      }
    }
    return map;
  }

  private toAdminAccount(
    record: AccountRecord,
    providerId: string | null,
    message?: string,
    statusOverride?: UserActivityStatus,
  ): AdminAccountDto {
    return {
      id: record._id.toString(),
      fullName: record.fullName,
      emailAddress: record.emailAddress,
      username: record.username,
      role: record.role,
      status: statusOverride ?? record.status,
      isVerified: Boolean(record.isVerified),
      mustChangePassword: Boolean(record.mustChangePassword),
      providerId,
      createdAt: record.createdAt ?? record._id.getTimestamp(),
      ...(message ? { message } : {}),
    };
  }

  private async recordAudit(entry: AuditLog, session: ClientSession): Promise<void> {
    if (!this.auditLogModel) return;
    await this.auditLogModel.create([entry], { session });
  }
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDateBound(raw: string, fieldName: string, endOfDay: boolean): Date {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const isoString = isDateOnly ? `${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : raw;
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldName} is not a valid date.`);
  }
  if (isDateOnly && parsed.toISOString().slice(0, 10) !== raw) {
    throw new BadRequestException(`${fieldName} is not a valid calendar date.`);
  }
  return parsed;
}

function matchesDateRange(item: AdminBookingItemDto, fromDate?: Date, toDate?: Date): boolean {
  if (!fromDate && !toDate) return true;
  const inRange = (value: Date | null | undefined): boolean => {
    if (!value) return false;
    const time = new Date(value).getTime();
    if (fromDate && time < fromDate.getTime()) return false;
    if (toDate && time > toDate.getTime()) return false;
    return true;
  };
  return inRange(item.dates.startDate) || inRange(item.createdAt);
}
