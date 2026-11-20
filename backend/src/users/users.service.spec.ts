import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PostStatus } from '../database/schemas/blog-post.schema.js';
import { ItineraryVisibility } from '../database/schemas/itinerary.schema.js';
import { UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { UsersService } from './users.service.js';

const userId = new Types.ObjectId();
const countryId = new Types.ObjectId();
const user = { id: userId.toString(), role: UserRole.USER, status: UserActivityStatus.ACTIVE, isVerified: true };
const record = {
  _id: userId, fullName: 'Mona Ahmed', emailAddress: 'mona@example.com', username: 'mona',
  role: UserRole.USER, status: UserActivityStatus.ACTIVE, isVerified: true, countryOfOriginId: countryId,
  passwordHash: 'private hash', loginAttempts: 2, sessionVersion: 0,
};
const query = (result: unknown) => ({
  session: vi.fn().mockReturnThis(), lean: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue(result),
});
const session = { id: 'test-session' };

describe('UsersService (ACC-09, ACC-11, ACC-12)', () => {
  let service: UsersService;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let currencyModel: Record<string, ReturnType<typeof vi.fn>>;
  let hotelModel: Record<string, ReturnType<typeof vi.fn>>;
  let flightBookingModel: Record<string, ReturnType<typeof vi.fn>>;
  let postModel: Record<string, ReturnType<typeof vi.fn>>;
  let itineraryModel: Record<string, ReturnType<typeof vi.fn>>;
  let resetModel: Record<string, ReturnType<typeof vi.fn>>;
  let refreshModel: Record<string, ReturnType<typeof vi.fn>>;
  let connection: { transaction: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    userModel = {
      findById: vi.fn(() => query(record)),
      findByIdAndUpdate: vi.fn(() => query({ ...record, fullName: 'Updated', phoneNumber: '+201234567890', preferredCurrency: 'USD' })),
      updateOne: vi.fn(() => query({ matchedCount: 1 })),
    };
    currencyModel = { exists: vi.fn(() => query({ _id: new Types.ObjectId() })) };
    hotelModel = { exists: vi.fn(() => query(null)) };
    flightBookingModel = { aggregate: vi.fn(() => query([])) };
    postModel = { updateMany: vi.fn(() => query({ modifiedCount: 1 })) };
    itineraryModel = { updateMany: vi.fn(() => query({ modifiedCount: 1 })) };
    resetModel = { deleteMany: vi.fn(() => query({ deletedCount: 1 })) };
    refreshModel = { deleteMany: vi.fn(() => query({ deletedCount: 1 })) };
    connection = { transaction: vi.fn(async (work) => work(session)) };
    service = new UsersService(
      userModel as never, currencyModel as never, hotelModel as never, flightBookingModel as never,
      { collection: { name: 'flights' } } as never, postModel as never, itineraryModel as never,
      resetModel as never, refreshModel as never, connection as never,
    );
  });

  it('reads the authenticated account and returns its profile without internal authentication fields', async () => {
    const profile = await service.me(user);
    expect(userModel.findById).toHaveBeenCalledWith(user.id);
    expect(profile).toMatchObject({ id: user.id, fullName: 'Mona Ahmed', preferredCurrency: null, phoneNumber: null });
    expect(profile).not.toHaveProperty('passwordHash');
    expect(profile).not.toHaveProperty('loginAttempts');
    expect(profile).not.toHaveProperty('sessionVersion');
  });

  it('rejects an account that disappeared after authentication', async () => {
    userModel.findById.mockReturnValue(query(null));
    await expect(service.me(user)).rejects.toThrow(UnauthorizedException);
  });

  it.each([UserRole.ADMIN, UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR])('lets a %s read their own profile', async (role) => {
    userModel.findById.mockReturnValue(query({ ...record, role }));
    const profile = await service.me({ ...user, role });
    expect(userModel.findById).toHaveBeenCalledWith(user.id);
    expect(profile).toMatchObject({ id: user.id, role });
  });

  it.each([UserRole.ADMIN, UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR])('lets a %s update their own profile', async (role) => {
    userModel.findByIdAndUpdate.mockReturnValue(query({ ...record, role, fullName: 'Updated' }));
    const profile = await service.updateMe({ ...user, role }, { fullName: 'Updated' });
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(user.id, { $set: { fullName: 'Updated' } }, {
      returnDocument: 'after', runValidators: true,
    });
    expect(profile).toMatchObject({ id: user.id, role, fullName: 'Updated' });
  });

  it('updates only the authenticated account and validates the selected currency against reference data', async () => {
    const changes = { fullName: 'Updated', phoneNumber: '+201234567890', preferredCurrency: 'USD' };
    const profile = await service.updateMe(user, changes);
    expect(currencyModel.exists).toHaveBeenCalledWith({ currency: 'USD' });
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(user.id, { $set: changes }, {
      returnDocument: 'after', runValidators: true,
    });
    expect(profile).toMatchObject(changes);
  });

  it('does not save any fields when the currency is unknown', async () => {
    currencyModel.exists.mockReturnValue(query(null));
    await expect(service.updateMe(user, { fullName: 'Updated', preferredCurrency: 'ZZZ' })).rejects.toThrow(BadRequestException);
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an empty profile update', async () => {
    await expect(service.updateMe(user, {})).rejects.toThrow(BadRequestException);
    expect(userModel.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('does not require a currency when only the name is being updated', async () => {
    await service.updateMe(user, { fullName: 'Updated' });
    expect(currencyModel.exists).not.toHaveBeenCalled();
  });

  it.each([UserRole.ADMIN, UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR])('does not deactivate a %s', async (role) => {
    await expect(service.deactivateMe({ ...user, role }, { confirm: true })).rejects.toThrow(ForbiddenException);
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation', async () => {
    await expect(service.deactivateMe(user, { confirm: false })).rejects.toThrow(BadRequestException);
    expect(connection.transaction).not.toHaveBeenCalled();
  });

  it('blocks deactivation when a confirmed hotel stay has not ended', async () => {
    hotelModel.exists.mockReturnValue(query({ _id: new Types.ObjectId() }));
    await expect(service.deactivateMe(user, { confirm: true })).rejects.toThrow(ConflictException);
    expect(userModel.updateOne).not.toHaveBeenCalled();
    expect(postModel.updateMany).not.toHaveBeenCalled();
    expect(refreshModel.deleteMany).not.toHaveBeenCalled();
  });

  it('blocks deactivation when a confirmed flight has not arrived', async () => {
    flightBookingModel.aggregate.mockReturnValue(query([{ _id: new Types.ObjectId() }]));
    await expect(service.deactivateMe(user, { confirm: true })).rejects.toThrow(ConflictException);
    expect(userModel.updateOne).not.toHaveBeenCalled();
    expect(itineraryModel.updateMany).not.toHaveBeenCalled();
    expect(refreshModel.deleteMany).not.toHaveBeenCalled();
  });

  it('deactivates and anonymizes the account, hides its public content and revokes credentials in one transaction', async () => {
    await expect(service.deactivateMe(user, { confirm: true })).resolves.toEqual({ message: 'Your account has been deactivated.' });
    expect(connection.transaction).toHaveBeenCalledOnce();
    expect(userModel.updateOne).toHaveBeenCalledWith({ _id: userId }, {
      $set: { status: UserActivityStatus.INACTIVE, fullName: 'Deleted user', profileImageUrl: '' },
      $inc: { sessionVersion: 1 },
    }, { session });
    expect(postModel.updateMany).toHaveBeenCalledWith(
      { userId, status: PostStatus.PUBLISHED }, { $set: { status: PostStatus.ARCHIVED } }, { session },
    );
    expect(itineraryModel.updateMany).toHaveBeenCalledWith(
      { userId, visibility: ItineraryVisibility.PUBLIC }, { $set: { visibility: ItineraryVisibility.PRIVATE } }, { session },
    );
    expect(refreshModel.deleteMany).toHaveBeenCalledWith({ userId }, { session });
    expect(resetModel.deleteMany).toHaveBeenCalledWith({ userId }, { session });
  });

  it('propagates transaction failures instead of reporting successful deactivation', async () => {
    connection.transaction.mockRejectedValue(new Error('transaction aborted'));
    await expect(service.deactivateMe(user, { confirm: true })).rejects.toThrow('transaction aborted');
  });
});
