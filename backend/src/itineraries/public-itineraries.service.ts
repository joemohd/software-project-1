import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { City } from '../database/schemas/city.schema.js';
import { Country } from '../database/schemas/country.schema.js';
import {
  ClonebaseItinerary,
  Itinerary,
  ItineraryVisibility,
} from '../database/schemas/itinerary.schema.js';
import { User, UserActivityStatus } from '../database/schemas/user.schema.js';
import { BudgetSummaryService } from './budget-summary.service.js';
import type {
  ItineraryDetailDto,
  ItineraryPageDto,
  PublicItineraryDto,
} from './dto/itinerary-response.dto.js';
import type { PublicSearchQueryDto } from './dto/query.dto.js';
import { ItineraryPresenter } from './itinerary-presenter.service.js';
import {
  escapeRegex,
  type ItineraryRecord,
  toObjectIdOr404,
} from './itinerary.types.js';
import { PAGE_SIZE } from './itineraries.constants.js';

/**
 * ITN-20, ITN-21: public itineraries. Only Public, non-hidden (GEN-10) itineraries of
 * non-deactivated authors (ACC-12) are visible; they are read-only to everyone but the owner.
 */
@Injectable()
export class PublicItinerariesService {
  constructor(
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<Itinerary>,
    @InjectModel(ClonebaseItinerary.name)
    private readonly clonebaseModel: Model<ClonebaseItinerary>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly presenter: ItineraryPresenter,
    private readonly budgetSummary: BudgetSummaryService,
  ) {}

  private publicFilter(): Record<string, unknown> {
    return { visibility: ItineraryVisibility.PUBLIC, isHidden: { $ne: true } };
  }

  // ITN-21: keyword on title / country / city; filters by duration, country and city; 10 per page
  async search(query: PublicSearchQueryDto): Promise<ItineraryPageDto> {
    const conditions: Record<string, unknown>[] = [this.publicFilter()];

    if (query.q) {
      const pattern = new RegExp(escapeRegex(query.q), 'i');
      const [countries, cities] = await Promise.all([
        this.countryModel
          .find({ $or: [{ name: pattern }, { code: query.q.toUpperCase() }] })
          .select('code')
          .lean<{ code: string }[]>()
          .exec(),
        this.cityModel
          .find({ name: pattern })
          .select('_id')
          .lean<{ _id: Types.ObjectId }[]>()
          .exec(),
      ]);
      conditions.push({
        $or: [
          { title: pattern },
          { countries: { $in: countries.map((country) => country.code) } },
          { 'days.cityId': { $in: cities.map((city) => city._id) } },
        ],
      });
    }
    if (query.country) conditions.push({ countries: query.country });
    if (query.cityId) conditions.push({ 'days.cityId': new Types.ObjectId(query.cityId) });
    if (query.minDays !== undefined) {
      conditions.push({ $expr: { $gte: [{ $size: '$days' }, query.minDays] } });
    }
    if (query.maxDays !== undefined) {
      conditions.push({ $expr: { $lte: [{ $size: '$days' }, query.maxDays] } });
    }

    // ACC-12: leave out itineraries of deactivated authors
    const inactiveAuthors = await this.userModel
      .find({ status: UserActivityStatus.INACTIVE })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    if (inactiveAuthors.length) {
      conditions.push({ userId: { $nin: inactiveAuthors.map((user) => user._id) } });
    }

    const filter = { $and: conditions };
    const page = query.page;
    const [items, total] = await Promise.all([
      this.itineraryModel
        .find(filter)
        .select('title countries startDate visibility days.cityId days._id userId updatedAt createdAt')
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean<ItineraryRecord[]>()
        .exec(),
      this.itineraryModel.countDocuments(filter).exec(),
    ]);

    const [authors, cities] = await Promise.all([
      this.presenter.authorNames(items.map((item) => item.userId)),
      this.presenter.cityNames(items.flatMap((item) => item.days.map((day) => day.cityId))),
    ]);
    return {
      items: items.map((item) => ({
        ...this.presenter.summary(item),
        author: { id: item.userId.toString(), name: authors.get(item.userId.toString()) ?? '' },
        cities: [...new Set(item.days.map((day) => cities.get(day.cityId.toString()) ?? ''))].filter(Boolean),
      })),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    };
  }

  // ITN-21: read-only view with author, days, activities and budget
  async view(itineraryId: string, currency: string): Promise<PublicItineraryDto> {
    const itinerary = await this.findPublic(itineraryId);
    const [detail, budget] = await Promise.all([
      this.presenter.detail(itinerary),
      this.budgetSummary.summarize(itinerary, currency),
    ]);
    return { ...detail, budget };
  }

  /**
   * ITN-21: an independent private copy with every day, activity, budget entry and transport cost.
   * New ids everywhere, so later changes to either itinerary never affect the other;
   * the original author is credited with a name snapshot that survives deletion of the original.
   */
  async clone(itineraryId: string, userId: string): Promise<ItineraryDetailDto> {
    const source = await this.findPublic(itineraryId);
    const authorNames = await this.presenter.authorNames([source.userId]);

    const dayIdMap = new Map<string, Types.ObjectId>();
    const days = source.days.map((day) => {
      const newId = new Types.ObjectId();
      dayIdMap.set(day._id.toString(), newId);
      return {
        _id: newId,
        cityId: day.cityId,
        notes: day.notes ?? '',
        activities: (day.activities ?? []).map((activity) => ({
          _id: new Types.ObjectId(),
          name: activity.name,
          description: activity.description ?? '',
          time: activity.time ?? null,
          cost: activity.cost ?? null,
          currency: activity.currency ?? null,
          imageUrls: [...(activity.imageUrls ?? [])],
        })),
        budgets: (day.budgets ?? []).map((budget) => ({
          _id: new Types.ObjectId(),
          category: budget.category,
          amount: budget.amount,
          currency: budget.currency,
          note: budget.note ?? '',
        })),
      };
    });
    const transportCosts = (source.transportCosts ?? [])
      .filter((cost) => dayIdMap.has(cost.dayId.toString()))
      .map((cost) => ({
        _id: new Types.ObjectId(),
        mode: cost.mode,
        fromCityId: cost.fromCityId,
        toCityId: cost.toCityId,
        amount: cost.amount,
        currency: cost.currency,
        dayId: dayIdMap.get(cost.dayId.toString()),
      }));

    const clone = await this.itineraryModel.create({
      userId: new Types.ObjectId(userId),
      title: source.title,
      countries: [...source.countries],
      startDate: source.startDate,
      visibility: ItineraryVisibility.PRIVATE,
      days,
      transportCosts,
      clonedFrom: {
        itineraryId: source._id,
        authorId: source.userId,
        authorName: authorNames.get(source.userId.toString()) ?? '',
        title: source.title,
      },
    });
    // Keeps the team's clone lineage collection in sync
    await this.clonebaseModel.create({ baseItineraryId: source._id, derivedItineraryId: clone._id });

    return this.presenter.detail(clone.toObject() as unknown as ItineraryRecord);
  }

  private async findPublic(itineraryId: string): Promise<ItineraryRecord> {
    const itinerary = await this.itineraryModel
      .findOne({ _id: toObjectIdOr404(itineraryId, 'Itinerary'), ...this.publicFilter() })
      .lean<ItineraryRecord>()
      .exec();
    if (!itinerary) throw new NotFoundException('Itinerary not found.');

    const author = await this.userModel
      .findById(itinerary.userId)
      .select('status')
      .lean<{ status: UserActivityStatus }>()
      .exec();
    if (!author || author.status === UserActivityStatus.INACTIVE) {
      throw new NotFoundException('Itinerary not found.');
    }
    return itinerary;
  }
}
