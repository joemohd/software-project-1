import { Mongoose, Types } from 'mongoose';
import { AdminAction, AuditLogSchema } from '../../admin/schemas/audit-log.schema.js';
import { AirlineSchema, HotelSchema, ProviderSchema } from '../../database/schemas/provider.schema.js';

const mongoose = new Mongoose();
const Provider = mongoose.model('ProviderProfileTest', ProviderSchema);
const Hotel = Provider.discriminator('HotelProfileTest', HotelSchema, 'hotel');
const Airline = Provider.discriminator('AirlineProfileTest', AirlineSchema, 'airline');
const AuditLog = mongoose.model('ProfileAuditTest', AuditLogSchema);

describe('Provider profile schema compatibility', () => {
  it('allows hotel creation without an airline logo or a separately configured checking policy', async () => {
    const hotel = new Hotel({ name: 'Hotel', address: 'Address', starClass: 4, cityId: new Types.ObjectId(), moderatorId: new Types.ObjectId() });
    await expect(hotel.validate()).resolves.toBeUndefined();
  });

  it('requires a logo for an airline and defaults to no paid extra bags', async () => {
    const airline = new Airline({ name: 'Airline', iataCode: 'EA', logoUrl: 'https://example.com/logo.png', moderatorId: new Types.ObjectId() });
    await expect(airline.validate()).resolves.toBeUndefined();
    expect(airline.bagPolicy?.maxExtraBagCount).toBe(0);
    const withoutLogo = new Airline({ name: 'Airline', iataCode: 'EA', moderatorId: new Types.ObjectId() });
    await expect(withoutLogo.validate()).rejects.toMatchObject({ errors: { logoUrl: expect.anything() } });
  });

  it('requires an audit target user for password resets', async () => {
    const log = new AuditLog({ action: AdminAction.RESET_PASSWORD, adminId: new Types.ObjectId() });
    await expect(log.validate()).rejects.toMatchObject({ errors: { targetUserId: expect.anything() } });
  });

  it.each([AdminAction.CREATE_HOTEL, AdminAction.CREATE_AIRLINE])('requires a provider audit target for %s', async (action) => {
    const log = new AuditLog({ action, adminId: new Types.ObjectId() });
    await expect(log.validate()).rejects.toMatchObject({ errors: { targetProviderId: expect.anything() } });
    log.targetProviderId = new Types.ObjectId();
    await expect(log.validate()).resolves.toBeUndefined();
  });
});
