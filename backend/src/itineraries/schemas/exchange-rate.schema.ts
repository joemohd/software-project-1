import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// ITN-18: one cached rate table per day, fetched from FXRatesAPI by the backend
@Schema({
  collection: 'exchange_rates',
  timestamps: true,
  strict: 'throw',
  minimize: true,
})
export class ExchangeRate {
  @Prop({ type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  base: string;

  // "YYYY-MM-DD": the day the rates were fetched (one document per base per day)
  @Prop({ type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  fetchedOn: string;

  // Date the provider reports for the rates (shown to the user as the rate date)
  @Prop({ type: Date, required: true })
  rateDate: Date;

  // currency code -> units of that currency per 1 base
  @Prop({ type: Map, of: Number, required: true })
  rates: Map<string, number>;
}

export type ExchangeRateDocument = HydratedDocument<ExchangeRate>;
export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);

ExchangeRateSchema.index({ base: 1, fetchedOn: 1 }, { unique: true });
ExchangeRateSchema.index({ base: 1, rateDate: -1 });
