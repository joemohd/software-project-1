import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminAction } from '../../admin/schemas/audit-log.schema.js';
import { AirlinesService } from '../../airlines/airlines.service.js';
import { ProviderStatus } from '../../database/schemas/provider.schema.js';
import { UserActivityStatus, UserRole } from '../../database/schemas/user.schema.js';
import { HotelsService } from '../../hotels/hotels.service.js';

const admin = { id: new Types.ObjectId().toString(), role: UserRole.ADMIN, status: UserActivityStatus.ACTIVE, isVerified: true };
const moderatorId = new Types.ObjectId();
const hotelId = new Types.ObjectId();
const airlineId = new Types.ObjectId();
const cityId = new Types.ObjectId();
const countryId = new Types.ObjectId();
const session = { id: 'test-session' };
const query = (value: unknown) => ({
  lean: vi.fn().mockReturnThis(), session: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue(value),
});
const hotelDto = {
  name: 'Cairo Hotel', address: '1 Example Street', cityId: cityId.toString(), countryId: countryId.toString(),
  starClass: 4, moderatorId: moderatorId.toString(), imageUrls: ['https://example.com/hotel.png'], amenities: ['Wi-Fi'],
};
const hotelRecord = { ...hotelDto, _id: hotelId, cityId, moderatorId };
const airlineDto = { name: 'Example Air', iataCode: 'EA', logoUrl: 'https://example.com/logo.png', moderatorId: moderatorId.toString() };
const airlineRecord = { ...airlineDto, _id: airlineId, moderatorId, status: ProviderStatus.ACTIVE, bagPolicy: { priceExtraBag: 0, maxExtraBagCount: 0 } };

describe('HotelsService (HTL-01)', () => {
  let service: HotelsService;
  let hotelModel: Record<string, ReturnType<typeof vi.fn>>;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let cityModel: Record<string, ReturnType<typeof vi.fn>>;
  let countryModel: Record<string, ReturnType<typeof vi.fn>>;
  let auditModel: Record<string, ReturnType<typeof vi.fn>>;
  const moderator = { ...admin, id: moderatorId.toString(), role: UserRole.HOTEL_MODERATOR };

  beforeEach(() => {
    hotelModel = {
      create: vi.fn().mockResolvedValue([hotelRecord]),
      findOne: vi.fn(() => query(hotelRecord)),
      findOneAndUpdate: vi.fn(() => query({ ...hotelRecord, name: 'Updated' })),
    };
    userModel = { exists: vi.fn(() => query({ _id: moderatorId })) };
    cityModel = { findById: vi.fn(() => query({ _id: cityId, countryId })) };
    countryModel = { exists: vi.fn(() => query({ _id: countryId })) };
    auditModel = { create: vi.fn().mockResolvedValue([]) };
    service = new HotelsService(hotelModel as never, userModel as never, cityModel as never, countryModel as never,
      auditModel as never, { transaction: async (work: (value: unknown) => unknown) => work(session) } as never);
  });

  it('creates an admin-owned action with a valid moderator and location, and records the provider id in the same transaction', async () => {
    const profile = await service.create(admin, hotelDto);
    expect(userModel.exists).toHaveBeenCalledWith({ _id: moderatorId, role: UserRole.HOTEL_MODERATOR });
    expect(hotelModel.create).toHaveBeenCalledWith([expect.objectContaining({ moderatorId, cityId, name: hotelDto.name })], { session });
    expect(auditModel.create).toHaveBeenCalledWith([{
      adminId: new Types.ObjectId(admin.id), targetProviderId: hotelId, action: AdminAction.CREATE_HOTEL,
    }], { session });
    expect(profile).toMatchObject({ id: hotelId.toString(), countryId: countryId.toString(), name: hotelDto.name });
    expect(profile).not.toHaveProperty('moderatorId');
  });

  it('rejects creation by a moderator', async () => {
    await expect(service.create(moderator, hotelDto)).rejects.toThrow(ForbiddenException);
    expect(hotelModel.create).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent moderator or a moderator of the wrong type', async () => {
    userModel.exists.mockReturnValue(query(null));
    await expect(service.create(admin, hotelDto)).rejects.toThrow(BadRequestException);
    expect(hotelModel.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown city', async () => {
    cityModel.findById.mockReturnValue(query(null));
    await expect(service.create(admin, hotelDto)).rejects.toThrow(BadRequestException);
    expect(hotelModel.create).not.toHaveBeenCalled();
  });

  it('rejects a city from another country without creating a hotel or audit entry', async () => {
    await expect(service.create(admin, { ...hotelDto, countryId: new Types.ObjectId().toString() })).rejects.toThrow(BadRequestException);
    expect(hotelModel.create).not.toHaveBeenCalled();
    expect(auditModel.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown country', async () => {
    countryModel.exists.mockReturnValue(query(null));
    await expect(service.create(admin, hotelDto)).rejects.toThrow(BadRequestException);
    expect(hotelModel.create).not.toHaveBeenCalled();
  });

  it('turns a concurrent duplicate moderator assignment into a conflict', async () => {
    hotelModel.create.mockRejectedValue({ code: 11000, keyPattern: { moderatorId: 1 } });
    await expect(service.create(admin, hotelDto)).rejects.toThrow(ConflictException);
  });

  it('updates only the hotel assigned to the authenticated moderator', async () => {
    const profile = await service.update(moderator, hotelId.toString(), { name: 'Updated' });
    expect(hotelModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: hotelId.toString(), moderatorId }, { $set: { name: 'Updated' } }, { returnDocument: 'after', runValidators: true },
    );
    expect(profile.name).toBe('Updated');
  });

  it('refuses edits to another moderator\'s hotel', async () => {
    hotelModel.findOne.mockReturnValue(query(null));
    await expect(service.update(moderator, hotelId.toString(), { name: 'Updated' })).rejects.toThrow(NotFoundException);
    expect(hotelModel.findOne).toHaveBeenCalledWith({ _id: hotelId.toString(), moderatorId });
    expect(hotelModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('keeps the ownership predicate on the final update if assignment changes after the read', async () => {
    hotelModel.findOneAndUpdate.mockReturnValue(query(null));
    await expect(service.update(moderator, hotelId.toString(), { name: 'Updated' })).rejects.toThrow(NotFoundException);
  });

  it('rejects a mismatched city/country change before saving any profile fields', async () => {
    await expect(service.update(moderator, hotelId.toString(), {
      name: 'Updated', cityId: cityId.toString(), countryId: new Types.ObjectId().toString(),
    })).rejects.toThrow(BadRequestException);
    expect(hotelModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires a city when changing country', async () => {
    await expect(service.update(moderator, hotelId.toString(), { countryId: countryId.toString() })).rejects.toThrow(BadRequestException);
    expect(hotelModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects empty edits', async () => {
    await expect(service.update(moderator, hotelId.toString(), {})).rejects.toThrow(BadRequestException);
  });

  it.each([UserRole.ADMIN, UserRole.USER, UserRole.AIRLINE_MODERATOR])('does not let a %s edit a hotel', async (role) => {
    await expect(service.update({ ...moderator, role }, hotelId.toString(), { name: 'Updated' })).rejects.toThrow(ForbiddenException);
  });

  it('does not report success when the audit write fails', async () => {
    auditModel.create.mockRejectedValue(new Error('audit write failed'));
    await expect(service.create(admin, hotelDto)).rejects.toThrow('audit write failed');
  });
});

describe('AirlinesService (FLT-01)', () => {
  let service: AirlinesService;
  let airlineModel: Record<string, ReturnType<typeof vi.fn>>;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let auditModel: Record<string, ReturnType<typeof vi.fn>>;
  const moderator = { ...admin, id: moderatorId.toString(), role: UserRole.AIRLINE_MODERATOR };

  beforeEach(() => {
    airlineModel = {
      create: vi.fn().mockResolvedValue([airlineRecord]),
      findOne: vi.fn(() => query(airlineRecord)),
      findOneAndUpdate: vi.fn(() => query({ ...airlineRecord, name: 'Updated' })),
    };
    userModel = { exists: vi.fn(() => query({ _id: moderatorId })) };
    auditModel = { create: vi.fn().mockResolvedValue([]) };
    service = new AirlinesService(airlineModel as never, userModel as never, auditModel as never,
      { transaction: async (work: (value: unknown) => unknown) => work(session) } as never);
  });

  it('creates an airline for an admin and audits the action', async () => {
    const profile = await service.create(admin, airlineDto);
    expect(userModel.exists).toHaveBeenCalledWith({ _id: moderatorId, role: UserRole.AIRLINE_MODERATOR });
    expect(airlineModel.create).toHaveBeenCalledWith([expect.objectContaining({ iataCode: 'EA', moderatorId })], { session });
    expect(auditModel.create).toHaveBeenCalledWith([{
      adminId: new Types.ObjectId(admin.id), targetProviderId: airlineId, action: AdminAction.CREATE_AIRLINE,
    }], { session });
    expect(profile.id).toBe(airlineId.toString());
  });

  it('rejects creation by a moderator', async () => {
    await expect(service.create(moderator, airlineDto)).rejects.toThrow(ForbiddenException);
    expect(airlineModel.create).not.toHaveBeenCalled();
  });

  it('requires a valid airline moderator', async () => {
    userModel.exists.mockReturnValue(query(null));
    await expect(service.create(admin, airlineDto)).rejects.toThrow(BadRequestException);
  });

  it.each(['iataCode', 'moderatorId'])('handles duplicate %s with 409', async (field) => {
    airlineModel.create.mockRejectedValue({ code: 11000, keyPattern: { [field]: 1 } });
    await expect(service.create(admin, airlineDto)).rejects.toThrow(ConflictException);
  });

  it('returns only public fields and searches only active airlines', async () => {
    const profile = await service.findOne(airlineId.toString());
    expect(airlineModel.findOne).toHaveBeenCalledWith({ _id: airlineId.toString(), status: ProviderStatus.ACTIVE });
    expect(profile).toEqual({ id: airlineId.toString(), name: 'Example Air', iataCode: 'EA', logoUrl: airlineDto.logoUrl });
  });

  it('returns 404 for missing or deactivated airlines', async () => {
    airlineModel.findOne.mockReturnValue(query(null));
    await expect(service.findOne(airlineId.toString())).rejects.toThrow(NotFoundException);
  });

  it('updates only the authenticated moderator\'s airline', async () => {
    await service.update(moderator, airlineId.toString(), { name: 'Updated' });
    expect(airlineModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: airlineId.toString(), moderatorId }, { $set: { name: 'Updated' } }, { returnDocument: 'after', runValidators: true },
    );
  });

  it('refuses edits to another moderator\'s airline', async () => {
    airlineModel.findOneAndUpdate.mockReturnValue(query(null));
    await expect(service.update(moderator, airlineId.toString(), { name: 'Updated' })).rejects.toThrow(NotFoundException);
  });

  it('handles a conflicting airline code on edit', async () => {
    airlineModel.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockReturnThis(), exec: vi.fn().mockRejectedValue({ code: 11000, keyPattern: { iataCode: 1 } }) });
    await expect(service.update(moderator, airlineId.toString(), { iataCode: 'XX' })).rejects.toThrow(ConflictException);
  });

  it('rejects empty edits', async () => {
    await expect(service.update(moderator, airlineId.toString(), {})).rejects.toThrow(BadRequestException);
  });

  it.each([UserRole.ADMIN, UserRole.USER, UserRole.HOTEL_MODERATOR])('does not let a %s edit an airline', async (role) => {
    await expect(service.update({ ...moderator, role }, airlineId.toString(), { name: 'Updated' })).rejects.toThrow(ForbiddenException);
  });
});
