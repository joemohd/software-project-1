import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../database/schemas/user.schema.js';
import type { BudgetSummaryDto } from './dto/itinerary-response.dto.js';
import { ExchangeRateService } from './exchange-rate.service.js';
import { ItineraryPresenter } from './itinerary-presenter.service.js';
import {
  aggregateBudget,
  convertAmount,
  dayDate,
  isoDate,
  MissingRateError,
  type MoneyLine,
  roundMoney,
} from './itinerary-rules.js';
import type { ItineraryRecord } from './itinerary.types.js';
import { DEFAULT_DISPLAY_CURRENCY } from './itineraries.constants.js';

/**
 * ITN-14, ITN-18, ITN-09: the itinerary's total budget by category, by day and by city group,
 * converted to one display currency. Booking prices are not converted here (PAY-04).
 */
@Injectable()
export class BudgetSummaryService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly exchangeRates: ExchangeRateService,
    private readonly presenter: ItineraryPresenter,
  ) {}

  /** The query currency, else the user's preferred currency (ACC-09), else the default. */
  async resolveCurrency(requested: string | undefined, userId?: string): Promise<string> {
    if (requested) return requested;
    if (userId) {
      const user = await this.userModel
        .findById(new Types.ObjectId(userId))
        .select('preferredCurrency')
        .lean<{ preferredCurrency?: string | null }>()
        .exec();
      if (user?.preferredCurrency) return user.preferredCurrency;
    }
    return DEFAULT_DISPLAY_CURRENCY;
  }

  async summarize(itinerary: ItineraryRecord, currency: string): Promise<BudgetSummaryDto> {
    // Invalid or unsupported codes are rejected with 400 before any conversion
    await this.presenter.assertCurrencies([currency]);

    const lines: MoneyLine[] = [];
    const dayIndexById = new Map(itinerary.days.map((day, index) => [day._id.toString(), index]));
    itinerary.days.forEach((day, dayIndex) => {
      for (const budget of day.budgets ?? []) {
        lines.push({ dayIndex, category: budget.category, amount: budget.amount, currency: budget.currency });
      }
      for (const activity of day.activities ?? []) {
        if (activity.cost !== null && activity.cost !== undefined && activity.currency) {
          lines.push({ dayIndex, category: 'activities', amount: activity.cost, currency: activity.currency });
        }
      }
    });
    for (const cost of itinerary.transportCosts ?? []) {
      lines.push({
        dayIndex: dayIndexById.get(cost.dayId.toString()) ?? -1,
        category: 'intercityTransport',
        amount: cost.amount,
        currency: cost.currency,
      });
    }

    const table = await this.exchangeRates.getRates();
    let breakdown: ReturnType<typeof aggregateBudget>;
    try {
      breakdown = aggregateBudget(itinerary.days.length, lines, (amount, from) =>
        convertAmount(amount, from, currency, table.rates, table.base),
      );
    } catch (error) {
      if (error instanceof MissingRateError) {
        throw new ServiceUnavailableException(
          `No exchange rate is available for ${error.currency}; the budget cannot be converted right now.`,
        );
      }
      throw error;
    }

    const names = await this.presenter.cityNames(itinerary.days.map((day) => day.cityId));
    const byDay = breakdown.byDay.map((day) => {
      const record = itinerary.days[day.dayIndex];
      return {
        dayId: record._id.toString(),
        dayNumber: day.dayIndex + 1,
        date: isoDate(dayDate(itinerary.startDate, day.dayIndex + 1)),
        city: this.presenter.cityRef(record.cityId, names),
        byCategory: day.byCategory,
        total: day.total,
      };
    });

    // ITN-09: each city group's subtotal is the sum of its days
    const byCityGroup = this.presenter.groupsOf(itinerary, names).map((group) => ({
      index: group.index,
      city: group.city,
      dayCount: group.dayCount,
      subtotal: roundMoney(
        byDay
          .slice(group.firstDayNumber - 1, group.lastDayNumber)
          .reduce((sum, day) => sum + day.total, 0),
      ),
    }));

    return {
      currency,
      rateDate: table.rateDate,
      rateSource: table.source,
      byCategory: breakdown.byCategory,
      byDay,
      byCityGroup,
      total: breakdown.total,
    };
  }
}
