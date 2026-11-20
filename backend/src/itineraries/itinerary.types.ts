import { NotFoundException } from '@nestjs/common';
import { isValidObjectId, Types } from 'mongoose';
import type {
  BudgetCategory,
  ItineraryVisibility,
} from '../database/schemas/itinerary.schema.js';

// Plain (lean / toObject) shapes of an itinerary and its embedded parts

export interface ActivityRecord {
  _id: Types.ObjectId;
  name: string;
  description: string;
  time: string | null;
  cost: number | null;
  currency: string | null;
  imageUrls: string[];
}

export interface BudgetRecord {
  _id: Types.ObjectId;
  category: BudgetCategory;
  amount: number;
  currency: string;
  note: string;
}

export interface DayRecord {
  _id: Types.ObjectId;
  cityId: Types.ObjectId;
  notes: string;
  activities: ActivityRecord[];
  budgets: BudgetRecord[];
}

export interface TransportRecord {
  _id: Types.ObjectId;
  mode: string;
  fromCityId: Types.ObjectId;
  toCityId: Types.ObjectId;
  amount: number;
  currency: string;
  dayId: Types.ObjectId;
}

export interface ItineraryRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  countries: string[];
  startDate: Date;
  visibility: ItineraryVisibility;
  days: DayRecord[];
  transportCosts: TransportRecord[];
  clonedFrom: {
    itineraryId: Types.ObjectId;
    authorId: Types.ObjectId;
    authorName: string;
    title: string;
  } | null;
  isHidden?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Turns a route id into an ObjectId, or answers 404 when it can't be one. */
export function toObjectIdOr404(id: string, entity: string): Types.ObjectId {
  if (!isValidObjectId(id)) throw new NotFoundException(`${entity} not found.`);
  return new Types.ObjectId(id);
}

/** ITN-12: the id of an image is the last part of its URL without the extension (a UUID from the upload service). */
export function imageIdFromUrl(url: string): string {
  try {
    const fileName = new URL(url).pathname.split('/').pop() ?? '';
    return fileName.replace(/\.[^.]+$/, '');
  } catch {
    return url;
  }
}

/** Escapes a user-typed keyword so it is matched literally inside a regular expression. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
