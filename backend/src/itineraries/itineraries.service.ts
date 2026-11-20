import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UploadService } from '../common/upload/upload.service.js';
import {
  ClonebaseItinerary,
  Itinerary,
  ItineraryVisibility,
} from '../database/schemas/itinerary.schema.js';
import type { CreateActivityDto, UpdateActivityDto } from './dto/activity.dto.js';
import type { CreateBudgetDto, UpdateBudgetDto } from './dto/budget.dto.js';
import type { CreateItineraryDto } from './dto/create-itinerary.dto.js';
import type { CreateDayDto, ReorderDaysDto, UpdateDayDto } from './dto/day.dto.js';
import type { ItineraryDetailDto, ItineraryPageDto } from './dto/itinerary-response.dto.js';
import type { CreateTransportCostDto, UpdateTransportCostDto } from './dto/transport-cost.dto.js';
import type { UpdateItineraryDto } from './dto/update-itinerary.dto.js';
import { ItineraryPresenter } from './itinerary-presenter.service.js';
import { moveItem, toUtcMidnight } from './itinerary-rules.js';
import {
  imageIdFromUrl,
  type ItineraryRecord,
  toObjectIdOr404,
} from './itinerary.types.js';
import { ACTIVITY_MAX_IMAGES, ITINERARY_MAX_DAYS, PAGE_SIZE } from './itineraries.constants.js';

/**
 * Owner-side itinerary operations: ITN-01, ITN-03, ITN-05, ITN-07, ITN-08, ITN-09,
 * ITN-10, ITN-12, ITN-14, ITN-16, ITN-20.
 *
 * Every query filters on the itinerary id AND the current user id, so another user's
 * itinerary (private or not) answers 404 and is never revealed (ACC-11).
 * Days, activities, budget entries and transport costs are embedded in the itinerary
 * (bounded, parent-owned data); day numbers are array positions and dates are derived
 * from the start date, so add / delete / reorder never leave gaps or stale dates.
 */
@Injectable()
export class ItinerariesService {
  constructor(
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<Itinerary>,
    @InjectModel(ClonebaseItinerary.name)
    private readonly clonebaseModel: Model<ClonebaseItinerary>,
    private readonly presenter: ItineraryPresenter,
    private readonly uploadService: UploadService,
  ) {}

  // ---- ITN-01, ITN-03, ITN-20 ----

  async create(userId: string, dto: CreateItineraryDto): Promise<ItineraryDetailDto> {
    await this.presenter.assertCountries(dto.countries);
    const created = await this.itineraryModel
      .create({
        userId: new Types.ObjectId(userId),
        title: dto.title,
        countries: dto.countries,
        startDate: toUtcMidnight(new Date(dto.startDate)),
        visibility: ItineraryVisibility.PRIVATE,
        days: [],
        transportCosts: [],
      })
      .catch(this.rethrowValidation);
    return this.presenter.detail(created.toObject() as unknown as ItineraryRecord);
  }

  async listMine(userId: string, page: number): Promise<ItineraryPageDto> {
    const filter = { userId: new Types.ObjectId(userId) };
    const [items, total] = await Promise.all([
      this.itineraryModel
        .find(filter)
        .select('title countries startDate visibility days._id updatedAt createdAt userId')
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean<ItineraryRecord[]>()
        .exec(),
      this.itineraryModel.countDocuments(filter).exec(),
    ]);
    return {
      items: items.map((item) => this.presenter.summary(item)),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    };
  }

  async getMine(userId: string, itineraryId: string): Promise<ItineraryDetailDto> {
    return this.presenter.detail(await this.findOwned(userId, itineraryId));
  }

  /** Loads one of the user's itineraries as a plain object, or 404. */
  async findOwned(userId: string, itineraryId: string): Promise<ItineraryRecord> {
    const itinerary = await this.itineraryModel
      .findOne({ _id: toObjectIdOr404(itineraryId, 'Itinerary'), userId: new Types.ObjectId(userId) })
      .lean<ItineraryRecord>()
      .exec();
    if (!itinerary) throw new NotFoundException('Itinerary not found.');
    return itinerary;
  }

  async update(userId: string, itineraryId: string, dto: UpdateItineraryDto): Promise<ItineraryDetailDto> {
    if (dto.countries) await this.presenter.assertCountries(dto.countries);
    return this.mutate(this.ownedFilter(userId, itineraryId), (itinerary) => {
      if (dto.title !== undefined) itinerary.title = dto.title;
      if (dto.countries !== undefined) itinerary.countries = dto.countries;
      // Day dates are derived on read, so moving the start date shifts every day (ITN-05)
      if (dto.startDate !== undefined) itinerary.startDate = toUtcMidnight(new Date(dto.startDate));
      // ITN-20: setting Private removes it from public search immediately
      if (dto.visibility !== undefined) itinerary.visibility = dto.visibility;
    });
  }

  // ITN-01: deleting removes it from public search; clones made by others are separate documents and stay
  async remove(userId: string, itineraryId: string): Promise<void> {
    const result = await this.itineraryModel
      .deleteOne(this.ownedFilter(userId, itineraryId))
      .exec();
    if (!result.deletedCount) throw new NotFoundException('Itinerary not found.');
    await this.clonebaseModel
      .deleteMany({ derivedItineraryId: new Types.ObjectId(itineraryId) })
      .exec();
  }

  // ---- ITN-05, ITN-07, ITN-08, ITN-09: days ----

  async addDay(userId: string, itineraryId: string, dto: CreateDayDto): Promise<ItineraryDetailDto> {
    const cityId = new Types.ObjectId(dto.cityId);
    await this.presenter.assertCities([cityId]);
    return this.mutate(this.ownedFilter(userId, itineraryId), (itinerary) => {
      if (itinerary.days.length >= ITINERARY_MAX_DAYS) {
        throw new BadRequestException(`An itinerary can have at most ${ITINERARY_MAX_DAYS} days.`);
      }
      itinerary.days.push({
        _id: new Types.ObjectId(),
        cityId,
        notes: dto.notes ?? '',
        activities: [],
        budgets: [],
      });
    });
  }

  async updateDay(
    userId: string,
    itineraryId: string,
    dayId: string,
    dto: UpdateDayDto,
  ): Promise<ItineraryDetailDto> {
    if (dto.cityId) await this.presenter.assertCities([new Types.ObjectId(dto.cityId)]);
    return this.mutate(this.ownedFilter(userId, itineraryId), (itinerary) => {
      const day = itinerary.days[this.dayIndex(itinerary, dayId)];
      if (dto.cityId !== undefined) day.cityId = new Types.ObjectId(dto.cityId);
      if (dto.notes !== undefined) day.notes = dto.notes;
    });
  }

  // ITN-07: later days move up one number and one date; the day's transport costs go with it
  async deleteDay(userId: string, itineraryId: string, dayId: string): Promise<ItineraryDetailDto> {
    return this.mutate(this.ownedFilter(userId, itineraryId), (itinerary) => {
      const index = this.dayIndex(itinerary, dayId);
      const [removed] = itinerary.days.splice(index, 1);
      itinerary.transportCosts = itinerary.transportCosts.filter(
        (cost) => !cost.dayId.equals(removed._id),
      );
    });
  }

  // ITN-08: move a day to a new position; numbers, dates and city groups are recalculated
  async reorderDays(userId: string, itineraryId: string, dto: ReorderDaysDto): Promise<ItineraryDetailDto> {
    return this.mutate(this.ownedFilter(userId, itineraryId), (itinerary) => {
      const from = this.dayIndex(itinerary, dto.dayId);
      if (dto.newPosition > itinerary.days.length) {
        throw new BadRequestException(`newPosition must be between 1 and ${itinerary.days.length}.`);
      }
      itinerary.days = moveItem(itinerary.days, from, dto.newPosition - 1);
    });
  }

  // ---- ITN-10, ITN-12: activities ----

  async addActivity(
    userId: string,
    itineraryId: string,
    dayId: string,
    dto: CreateActivityDto,
  ): Promise<ItineraryDetailDto> {
    this.assertCostHasCurrency(dto.cost, dto.currency);
    if (dto.currency) await this.presenter.assertCurrencies([dto.currency]);
    return this.mutate(this.ownedFilter(userId, itineraryId), (itinerary) => {
      itinerary.days[this.dayIndex(itinerary, dayId)].activities.push({
        _id: new Types.ObjectId(),
        name: dto.name,
        description: dto.description ?? '',
        time: dto.time ?? null,
        cost: dto.cost ?? null,
        currency: dto.currency ?? null,
        imageUrls: [],
      });
    });
  }

  async updateActivity(userId: string, activityId: string, dto: UpdateActivityDto): Promise<ItineraryDetailDto> {
    if (dto.currency) await this.presenter.assertCurrencies([dto.currency]);
    return this.mutate(this.childFilter(userId, 'days.activities._id', activityId, 'Activity'), (itinerary) => {
      const activity = this.findActivity(itinerary, activityId);
      if (dto.name !== undefined) activity.name = dto.name;
      if (dto.description !== undefined) activity.description = dto.description;
      if (dto.time !== undefined) activity.time = dto.time;
      if (dto.cost !== undefined) activity.cost = dto.cost;
      if (dto.currency !== undefined) activity.currency = dto.currency;
      this.assertCostHasCurrency(activity.cost, activity.currency);
    });
  }

  async deleteActivity(userId: string, activityId: string): Promise<ItineraryDetailDto> {
    return this.mutate(this.childFilter(userId, 'days.activities._id', activityId, 'Activity'), (itinerary) => {
      for (const day of itinerary.days) {
        day.activities = day.activities.filter((activity) => !activity._id.equals(activityId));
      }
    });
  }

  // ITN-12, GEN-08: JPG/PNG up to 5 MB (checked by the shared upload options/service), at most 5 per activity
  async addActivityImage(
    userId: string,
    activityId: string,
    file: Express.Multer.File,
  ): Promise<ItineraryDetailDto> {
    const filter = this.childFilter(userId, 'days.activities._id', activityId, 'Activity');
    // Check ownership and the image limit before uploading anything
    const current = await this.itineraryModel.findOne(filter).lean<ItineraryRecord>().exec();
    if (!current) throw new NotFoundException('Activity not found.');
    if (this.findActivity(current, activityId).imageUrls.length >= ACTIVITY_MAX_IMAGES) {
      throw new BadRequestException(`An activity can have at most ${ACTIVITY_MAX_IMAGES} images.`);
    }

    const { url } = await this.uploadService.uploadImage(file);
    return this.mutate(filter, (itinerary) => {
      const activity = this.findActivity(itinerary, activityId);
      if (activity.imageUrls.length >= ACTIVITY_MAX_IMAGES) {
        throw new BadRequestException(`An activity can have at most ${ACTIVITY_MAX_IMAGES} images.`);
      }
      activity.imageUrls.push(url);
    });
  }

  async deleteActivityImage(userId: string, activityId: string, imageId: string): Promise<ItineraryDetailDto> {
    return this.mutate(this.childFilter(userId, 'days.activities._id', activityId, 'Activity'), (itinerary) => {
      const activity = this.findActivity(itinerary, activityId);
      const remaining = activity.imageUrls.filter((url) => imageIdFromUrl(url) !== imageId);
      if (remaining.length === activity.imageUrls.length) throw new NotFoundException('Image not found.');
      activity.imageUrls = remaining;
    });
  }

  // ---- ITN-14: budget entries ----

  async addBudget(
    userId: string,
    itineraryId: string,
    dayId: string,
    dto: CreateBudgetDto,
  ): Promise<ItineraryDetailDto> {
    await this.presenter.assertCurrencies([dto.currency]);
    return this.mutate(this.ownedFilter(userId, itineraryId), (itinerary) => {
      itinerary.days[this.dayIndex(itinerary, dayId)].budgets.push({
        _id: new Types.ObjectId(),
        category: dto.category,
        amount: dto.amount,
        currency: dto.currency,
        note: dto.note ?? '',
      });
    });
  }

  async updateBudget(userId: string, budgetId: string, dto: UpdateBudgetDto): Promise<ItineraryDetailDto> {
    if (dto.currency) await this.presenter.assertCurrencies([dto.currency]);
    return this.mutate(this.childFilter(userId, 'days.budgets._id', budgetId, 'Budget entry'), (itinerary) => {
      const budget = itinerary.days
        .flatMap((day) => day.budgets)
        .find((entry) => entry._id.equals(budgetId));
      if (!budget) throw new NotFoundException('Budget entry not found.');
      if (dto.category !== undefined) budget.category = dto.category;
      if (dto.amount !== undefined) budget.amount = dto.amount;
      if (dto.currency !== undefined) budget.currency = dto.currency;
      if (dto.note !== undefined) budget.note = dto.note;
    });
  }

  async deleteBudget(userId: string, budgetId: string): Promise<ItineraryDetailDto> {
    return this.mutate(this.childFilter(userId, 'days.budgets._id', budgetId, 'Budget entry'), (itinerary) => {
      for (const day of itinerary.days) {
        day.budgets = day.budgets.filter((entry) => !entry._id.equals(budgetId));
      }
    });
  }

  // ---- ITN-16: intercity transport costs ----

  async addTransportCost(
    userId: string,
    itineraryId: string,
    dto: CreateTransportCostDto,
  ): Promise<ItineraryDetailDto> {
    const fromCityId = new Types.ObjectId(dto.fromCityId);
    const toCityId = new Types.ObjectId(dto.toCityId);
    await Promise.all([
      this.presenter.assertCities([fromCityId, toCityId]),
      this.presenter.assertCurrencies([dto.currency]),
    ]);
    return this.mutate(this.ownedFilter(userId, itineraryId), (itinerary) => {
      const day = itinerary.days[this.dayIndex(itinerary, dto.dayId)];
      itinerary.transportCosts.push({
        _id: new Types.ObjectId(),
        mode: dto.mode,
        fromCityId,
        toCityId,
        amount: dto.amount,
        currency: dto.currency,
        dayId: day._id,
      });
    });
  }

  async updateTransportCost(
    userId: string,
    transportId: string,
    dto: UpdateTransportCostDto,
  ): Promise<ItineraryDetailDto> {
    const cityIds = [dto.fromCityId, dto.toCityId]
      .filter((id): id is string => !!id)
      .map((id) => new Types.ObjectId(id));
    if (cityIds.length) await this.presenter.assertCities(cityIds);
    if (dto.currency) await this.presenter.assertCurrencies([dto.currency]);

    return this.mutate(this.childFilter(userId, 'transportCosts._id', transportId, 'Transport cost'), (itinerary) => {
      const cost = itinerary.transportCosts.find((entry) => entry._id.equals(transportId));
      if (!cost) throw new NotFoundException('Transport cost not found.');
      if (dto.mode !== undefined) cost.mode = dto.mode;
      if (dto.fromCityId !== undefined) cost.fromCityId = new Types.ObjectId(dto.fromCityId);
      if (dto.toCityId !== undefined) cost.toCityId = new Types.ObjectId(dto.toCityId);
      if (dto.amount !== undefined) cost.amount = dto.amount;
      if (dto.currency !== undefined) cost.currency = dto.currency;
      if (dto.dayId !== undefined) cost.dayId = itinerary.days[this.dayIndex(itinerary, dto.dayId)]._id;
    });
  }

  async deleteTransportCost(userId: string, transportId: string): Promise<ItineraryDetailDto> {
    return this.mutate(this.childFilter(userId, 'transportCosts._id', transportId, 'Transport cost'), (itinerary) => {
      itinerary.transportCosts = itinerary.transportCosts.filter((entry) => !entry._id.equals(transportId));
    });
  }

  // ---- helpers ----

  private ownedFilter(userId: string, itineraryId: string) {
    return {
      filter: { _id: toObjectIdOr404(itineraryId, 'Itinerary'), userId: new Types.ObjectId(userId) },
      notFound: 'Itinerary not found.',
    };
  }

  /** Flat routes (/activities/:id, /budgets/:id, /transport-costs/:id): find the parent itinerary owned by the user. */
  private childFilter(userId: string, path: string, childId: string, entity: string) {
    return {
      filter: { [path]: toObjectIdOr404(childId, entity), userId: new Types.ObjectId(userId) },
      notFound: `${entity} not found.`,
    };
  }

  /**
   * Loads the itinerary, applies the change to a plain copy, writes it back with full schema
   * validation (max 60 days, non-negative amounts, ...) and returns the updated details.
   */
  private async mutate(
    target: { filter: Record<string, unknown>; notFound: string },
    change: (itinerary: ItineraryRecord) => void,
  ): Promise<ItineraryDetailDto> {
    const document = await this.itineraryModel.findOne(target.filter).exec();
    if (!document) throw new NotFoundException(target.notFound);

    const itinerary = document.toObject() as unknown as ItineraryRecord;
    change(itinerary);

    document.set({
      title: itinerary.title,
      countries: itinerary.countries,
      startDate: itinerary.startDate,
      visibility: itinerary.visibility,
      days: itinerary.days,
      transportCosts: itinerary.transportCosts,
    });
    await document.save().catch(this.rethrowValidation);
    return this.presenter.detail(document.toObject() as unknown as ItineraryRecord);
  }

  private dayIndex(itinerary: ItineraryRecord, dayId: string): number {
    const index = itinerary.days.findIndex((day) => day._id.toString() === dayId);
    if (index === -1) throw new NotFoundException('Day not found in this itinerary.');
    return index;
  }

  private findActivity(itinerary: ItineraryRecord, activityId: string) {
    const activity = itinerary.days
      .flatMap((day) => day.activities)
      .find((entry) => entry._id.toString() === activityId);
    if (!activity) throw new NotFoundException('Activity not found.');
    return activity;
  }

  // ITN-10: a cost needs a currency so it can be converted in the budget (ITN-18)
  private assertCostHasCurrency(cost: number | null | undefined, currency: string | null | undefined) {
    if (cost !== undefined && cost !== null && !currency) {
      throw new BadRequestException('currency is required when cost is given.');
    }
  }

  private readonly rethrowValidation = (error: unknown): never => {
    // Mongoose schema validation (e.g. more than 60 days) becomes a 400 with the field messages
    if (error instanceof Error && error.name === 'ValidationError' && 'errors' in error) {
      const issues = Object.values((error as { errors: Record<string, { message: string }> }).errors);
      throw new BadRequestException(issues.map((issue) => issue.message));
    }
    throw error;
  };
}
