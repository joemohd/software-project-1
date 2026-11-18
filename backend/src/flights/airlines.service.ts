import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Airline, CancellationPolicy } from '../database/schemas/provider.schema.js';
import { BaggagePolicyResponseDto, UpdateBaggagePolicyDto } from './dto/update-baggage-policy.dto.js';
import {
  CancellationPolicyResponseDto,
  CancellationTierDto,
  UpdateCancellationPolicyDto,
} from './dto/update-cancellation-policy.dto.js';

type OwnedAirline = { _id: Types.ObjectId; moderatorId: Types.ObjectId };
type BagPolicyRecord = { _id: Types.ObjectId; bagPolicy: { priceExtraBag: number; maxExtraBagCount: number } };
type CancellationPolicyRecord = { _id: Types.ObjectId; cancellationPolicies: CancellationPolicy[] };

const AIRLINE_NOT_FOUND = 'Airline not found.';

@Injectable()
export class AirlinesService {
  constructor(@InjectModel(Airline.name) private readonly airlineModel: Model<Airline>) {}

  /**
   * Ownership check shared by every moderator write on an airline and its flights (ACC-11, GEN-13).
   * 404 if the id is malformed or is not an airline; 403 if the airline belongs to another moderator.
   */
  async findOwnedAirline(airlineId: string, moderatorId: string): Promise<OwnedAirline> {
    if (!isValidObjectId(airlineId)) throw new NotFoundException(AIRLINE_NOT_FOUND);

    const airline = await this.airlineModel.findById(airlineId).select('moderatorId').lean<OwnedAirline>().exec();
    if (!airline) throw new NotFoundException(AIRLINE_NOT_FOUND);
    if (airline.moderatorId.toString() !== moderatorId) {
      throw new ForbiddenException('You can only manage your own airline.');
    }
    return airline;
  }

  // FLT-08: price per extra bag (> 0, cents) and max extra bags per passenger (>= 0)
  async updateBaggagePolicy(
    airlineId: string,
    moderatorId: string,
    dto: UpdateBaggagePolicyDto,
  ): Promise<BaggagePolicyResponseDto> {
    const airline = await this.findOwnedAirline(airlineId, moderatorId);

    const updated = await this.airlineModel
      .findOneAndUpdate(
        // Filtering on moderatorId again closes the gap if ownership changed after the check
        { _id: airline._id, moderatorId: airline.moderatorId },
        { $set: { bagPolicy: { priceExtraBag: dto.priceExtraBag, maxExtraBagCount: dto.maxExtraBagCount } } },
        { returnDocument: 'after', runValidators: true },
      )
      .select('bagPolicy')
      .lean<BagPolicyRecord>()
      .exec();
    if (!updated) throw new NotFoundException(AIRLINE_NOT_FOUND);

    return { airlineId: updated._id.toString(), ...updated.bagPolicy };
  }

  // FLT-09: replaces all cancellation tiers
  async updateCancellationPolicy(
    airlineId: string,
    moderatorId: string,
    dto: UpdateCancellationPolicyDto,
  ): Promise<CancellationPolicyResponseDto> {
    const policies = toCancellationPolicies(dto.tiers);
    const airline = await this.findOwnedAirline(airlineId, moderatorId);

    const updated = await this.airlineModel
      .findOneAndUpdate(
        { _id: airline._id, moderatorId: airline.moderatorId },
        { $set: { cancellationPolicies: policies } },
        { returnDocument: 'after', runValidators: true },
      )
      .select('cancellationPolicies')
      .lean<CancellationPolicyRecord>()
      .exec();
    if (!updated) throw new NotFoundException(AIRLINE_NOT_FOUND);

    return { airlineId: updated._id.toString(), tiers: toCancellationTiers(updated.cancellationPolicies) };
  }
}

/**
 * FLT-09 tiers -> stored intervals. Each threshold becomes startDay (inclusive) and the next higher
 * threshold becomes endDay (exclusive); the highest tier is open-ended (endDay null). So "the tier with
 * the highest threshold not exceeding the days remaining" is exactly the interval containing that day,
 * and fewer days than the lowest threshold match no interval, i.e. a 0% refund.
 */
export function toCancellationPolicies(tiers: CancellationTierDto[]): CancellationPolicy[] {
  const sorted = [...tiers].sort((a, b) => a.daysBeforeDeparture - b.daysBeforeDeparture);

  const duplicates = sorted
    .filter((tier, index) => index > 0 && tier.daysBeforeDeparture === sorted[index - 1].daysBeforeDeparture)
    .map((tier) => tier.daysBeforeDeparture);
  if (duplicates.length) {
    throw new BadRequestException(
      `Each tier needs a unique daysBeforeDeparture; duplicated: ${[...new Set(duplicates)].join(', ')}.`,
    );
  }

  return sorted.map((tier, index) => ({
    daysBeforeService: {
      startDay: tier.daysBeforeDeparture,
      endDay: sorted[index + 1]?.daysBeforeDeparture ?? null,
    },
    refundPercentage: tier.refundPercentage,
  }));
}

/** Stored intervals -> FLT-09 tiers, sorted by threshold. */
export function toCancellationTiers(policies: CancellationPolicy[]): CancellationTierDto[] {
  return policies
    .map((policy) => ({
      daysBeforeDeparture: policy.daysBeforeService.startDay,
      refundPercentage: policy.refundPercentage,
    }))
    .sort((a, b) => a.daysBeforeDeparture - b.daysBeforeDeparture);
}
