import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { AirlinesService, toCancellationPolicies, toCancellationTiers } from './airlines.service.js';
import { UpdateCancellationPolicyDto } from './dto/update-cancellation-policy.dto.js';

/** Mimics a chainable mongoose query resolved by exec(). */
const query = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = { exec: vi.fn().mockResolvedValue(result) };
  for (const method of ['select', 'lean']) q[method] = vi.fn().mockReturnValue(q);
  return q;
};

describe('AirlinesService', () => {
  const airlineId = new Types.ObjectId();
  const moderatorId = new Types.ObjectId();
  const owned = { _id: airlineId, moderatorId };

  let airlineModel: Record<string, ReturnType<typeof vi.fn>>;
  let service: AirlinesService;

  beforeEach(() => {
    airlineModel = {
      findById: vi.fn().mockReturnValue(query(owned)),
      findOneAndUpdate: vi.fn(),
    };
    service = new AirlinesService(airlineModel as any);
  });

  describe('findOwnedAirline (ownership check)', () => {
    it('returns the airline when the moderator owns it', async () => {
      await expect(service.findOwnedAirline(airlineId.toString(), moderatorId.toString())).resolves.toBe(owned);
    });

    it('returns 404 for a malformed id without querying', async () => {
      await expect(service.findOwnedAirline('not-an-id', moderatorId.toString())).rejects.toBeInstanceOf(NotFoundException);
      expect(airlineModel.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when no airline has that id', async () => {
      airlineModel.findById.mockReturnValue(query(null));
      await expect(service.findOwnedAirline(airlineId.toString(), moderatorId.toString())).rejects.toBeInstanceOf(NotFoundException);
    });

    it("returns 403 for another moderator's airline", async () => {
      await expect(
        service.findOwnedAirline(airlineId.toString(), new Types.ObjectId().toString()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('updateBaggagePolicy (FLT-08)', () => {
    it('replaces the policy, filtering on the owner, and returns it', async () => {
      airlineModel.findOneAndUpdate.mockReturnValue(
        query({ _id: airlineId, bagPolicy: { priceExtraBag: 2500, maxExtraBagCount: 2 } }),
      );

      const result = await service.updateBaggagePolicy(airlineId.toString(), moderatorId.toString(), {
        priceExtraBag: 2500,
        maxExtraBagCount: 2,
      });

      expect(airlineModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: airlineId, moderatorId },
        { $set: { bagPolicy: { priceExtraBag: 2500, maxExtraBagCount: 2 } } },
        { returnDocument: 'after', runValidators: true },
      );
      expect(result).toEqual({ airlineId: airlineId.toString(), priceExtraBag: 2500, maxExtraBagCount: 2 });
    });

    it('does not update when ownership fails', async () => {
      await expect(
        service.updateBaggagePolicy(airlineId.toString(), new Types.ObjectId().toString(), {
          priceExtraBag: 2500,
          maxExtraBagCount: 2,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(airlineModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('returns 404 if the airline disappears between the check and the update', async () => {
      airlineModel.findOneAndUpdate.mockReturnValue(query(null));
      await expect(
        service.updateBaggagePolicy(airlineId.toString(), moderatorId.toString(), { priceExtraBag: 1, maxExtraBagCount: 0 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateCancellationPolicy (FLT-09)', () => {
    it('stores sorted intervals and returns the tiers', async () => {
      const stored = [
        { daysBeforeService: { startDay: 0, endDay: 7 }, refundPercentage: 0 },
        { daysBeforeService: { startDay: 7, endDay: null }, refundPercentage: 50 },
      ];
      airlineModel.findOneAndUpdate.mockReturnValue(query({ _id: airlineId, cancellationPolicies: stored }));

      const result = await service.updateCancellationPolicy(airlineId.toString(), moderatorId.toString(), {
        tiers: [
          { daysBeforeDeparture: 7, refundPercentage: 50 },
          { daysBeforeDeparture: 0, refundPercentage: 0 },
        ],
      });

      expect(airlineModel.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { cancellationPolicies: stored } });
      expect(result).toEqual({
        airlineId: airlineId.toString(),
        tiers: [
          { daysBeforeDeparture: 0, refundPercentage: 0 },
          { daysBeforeDeparture: 7, refundPercentage: 50 },
        ],
      });
    });

    it('rejects duplicate thresholds with 400 before touching the database', async () => {
      await expect(
        service.updateCancellationPolicy(airlineId.toString(), moderatorId.toString(), {
          tiers: [
            { daysBeforeDeparture: 3, refundPercentage: 20 },
            { daysBeforeDeparture: 3, refundPercentage: 40 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(airlineModel.findById).not.toHaveBeenCalled();
      expect(airlineModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('UpdateCancellationPolicyDto validation (FLT-09)', () => {
    const errorsFor = async (refundPercentage: number) =>
      validate(plainToInstance(UpdateCancellationPolicyDto, { tiers: [{ daysBeforeDeparture: 3, refundPercentage }] }));

    it.each([0, 50, 100])('accepts a whole-number percentage (%s)', async (pct) => {
      expect(await errorsFor(pct)).toHaveLength(0);
    });

    it.each([12.5, -1, 101])('rejects %s', async (pct) => {
      expect(await errorsFor(pct)).not.toHaveLength(0);
    });
  });

  describe('tier <-> interval mapping (FLT-09)', () => {
    it('turns thresholds into contiguous intervals with an open-ended top tier', () => {
      expect(
        toCancellationPolicies([
          { daysBeforeDeparture: 30, refundPercentage: 100 },
          { daysBeforeDeparture: 2, refundPercentage: 25 },
          { daysBeforeDeparture: 14, refundPercentage: 75 },
        ]),
      ).toEqual([
        { daysBeforeService: { startDay: 2, endDay: 14 }, refundPercentage: 25 },
        { daysBeforeService: { startDay: 14, endDay: 30 }, refundPercentage: 75 },
        { daysBeforeService: { startDay: 30, endDay: null }, refundPercentage: 100 },
      ]);
    });

    it('allows an empty list (no refunds)', () => {
      expect(toCancellationPolicies([])).toEqual([]);
    });

    it('round-trips back to the tiers the moderator sent', () => {
      const tiers = [
        { daysBeforeDeparture: 1, refundPercentage: 10 },
        { daysBeforeDeparture: 10, refundPercentage: 60 },
      ];
      expect(toCancellationTiers(toCancellationPolicies(tiers))).toEqual(tiers);
    });
  });
});
