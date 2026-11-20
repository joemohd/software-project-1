import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HydratedDocument, isValidObjectId, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UserRole } from '../database/schemas/user.schema.js';
import {
  BookingStatus,
  HotelBooking,
} from '../database/schemas/expense.schema.js';
import { Hotel, Room } from '../database/schemas/provider.schema.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import type { UpdateReviewDto } from './dto/update-review.dto.js';
import type { ReplyReviewDto } from './dto/reply-review.dto.js';

type BookingDoc = HydratedDocument<HotelBooking> & { _id: Types.ObjectId };
type Group = 'upcoming' | 'past' | 'cancelled';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class HotelBookingsService {
  constructor(
    @InjectModel(HotelBooking.name) private readonly bookingModel: Model<HotelBooking>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
  ) {}

  // ---- HTL-20: list my reservations ---------------------------------------

  async listMine(user: AuthenticatedUser) {
    const bookings = await this.bookingModel
      .find({ userId: new Types.ObjectId(user.id) })
      .sort({ startDate: -1 })
      .exec();

    const hotelsByRoom = await this.hotelsForBookings(bookings);
    const groups: Record<Group, unknown[]> = { upcoming: [], past: [], cancelled: [] };
    for (const booking of bookings) {
      if (booking.status === BookingStatus.PENDING_PAYMENT) continue;
      groups[this.groupOf(booking)].push(this.toSummary(booking, hotelsByRoom));
    }
    return groups;
  }

  async getMine(bookingId: string, user: AuthenticatedUser) {
    const booking = await this.getOwnedBookingOrThrow(bookingId, user.id);
    const hotelsByRoom = await this.hotelsForBookings([booking]);
    return this.toDetail(booking, hotelsByRoom);
  }

  // ---- HTL-21: cancel -----------------------------------------------------

  async cancel(bookingId: string, user: AuthenticatedUser) {
    const booking = await this.getOwnedBookingOrThrow(bookingId, user.id);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Only a Confirmed reservation can be cancelled.');
    }
    if (this.toUtcMidnight(booking.startDate) <= this.todayUtcMidnight()) {
      throw new BadRequestException('A reservation can only be cancelled before its check-in date.');
    }

    const hotel = await this.hotelForBooking(booking);
    const daysBefore = Math.floor(
      (this.toUtcMidnight(booking.startDate).getTime() - this.todayUtcMidnight().getTime()) / DAY_MS,
    );
    const refundPercent = this.refundPercentFor(hotel, daysBefore);
    const refundAmount = Math.round((booking.cost ?? 0) * refundPercent) / 100;

    booking.status = BookingStatus.CANCELLED;
    await booking.save();

    // Rooms are released automatically: availability checks ignore CANCELLED reservations.
    //
    // INTEGRATION HOOKS (other teammates):
    //  - PAY-03: if refundAmount > 0, issue the Stripe refund and create a Refund record.
    //  - GEN-01: send the user an in-app "reservation cancelled / refund" notification.
    return {
      id: booking._id.toString(),
      status: booking.status,
      refund: { percent: refundPercent, amount: refundAmount, currency: 'usd', status: 'pending' },
    };
  }

  // ---- HTL-23: submit / edit / delete review ------------------------------

  async submitReview(bookingId: string, user: AuthenticatedUser, dto: CreateReviewDto) {
    const booking = await this.getOwnedBookingOrThrow(bookingId, user.id);
    if (!this.isCompleted(booking)) {
      throw new BadRequestException('You can only review a reservation after its check-out date has passed.');
    }
    if (booking.review) {
      throw new ConflictException('This reservation has already been reviewed.');
    }
    if (booking.status === BookingStatus.CONFIRMED) booking.status = BookingStatus.COMPLETED;

    booking.review = { rating: dto.rating, comment: dto.comment ?? '', reply: null } as HotelBooking['review'];
    booking.rating = dto.rating; // keep the booking's own rating field in sync
    await booking.save();

    await this.recalcHotelAverage(booking);
    return this.reviewResponse(booking);
  }

  async updateReview(reviewId: string, user: AuthenticatedUser, dto: UpdateReviewDto) {
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException('Provide at least one of "rating" or "comment".');
    }
    const booking = await this.getBookingByReviewOrThrow(reviewId);
    if (booking.userId.toString() !== user.id) {
      throw new ForbiddenException('You can only edit your own review.');
    }
    if (dto.rating !== undefined) {
      booking.review!.rating = dto.rating;
      booking.rating = dto.rating;
    }
    if (dto.comment !== undefined) booking.review!.comment = dto.comment;
    await booking.save();

    await this.recalcHotelAverage(booking);
    return this.reviewResponse(booking);
  }

  async deleteReview(reviewId: string, user: AuthenticatedUser) {
    const booking = await this.getBookingByReviewOrThrow(reviewId);
    if (booking.userId.toString() !== user.id) {
      throw new ForbiddenException('You can only delete your own review.');
    }
    booking.review = null;
    booking.set('rating', undefined);
    await booking.save();

    await this.recalcHotelAverage(booking);
    return { deleted: true };
  }

  // ---- HTL-26: moderator reply --------------------------------------------

  async replyToReview(reviewId: string, user: AuthenticatedUser, dto: ReplyReviewDto) {
    const booking = await this.getBookingByReviewOrThrow(reviewId);
    const hotel = await this.hotelForBooking(booking);
    const ownsHotel = hotel && hotel.moderatorId.toString() === user.id;
    if (user.role !== UserRole.HOTEL_MODERATOR || !ownsHotel) {
      throw new ForbiddenException('You can only reply to reviews of your own hotel.');
    }
    booking.review!.reply = {
      text: dto.text,
      moderatorId: new Types.ObjectId(user.id),
      repliedAt: new Date(),
    } as NonNullable<HotelBooking['review']>['reply'];
    await booking.save();
    return this.reviewResponse(booking);
  }

  // ---- helpers ------------------------------------------------------------

  private groupOf(booking: HotelBooking): Group {
    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.EXPIRED) {
      return 'cancelled';
    }
    return this.checkoutOf(booking) <= this.todayUtcMidnight() ? 'past' : 'upcoming';
  }

  private displayStatus(booking: HotelBooking): string {
    if (booking.status === BookingStatus.CONFIRMED && this.checkoutOf(booking) <= this.todayUtcMidnight()) {
      return BookingStatus.COMPLETED;
    }
    return booking.status;
  }

  private isCompleted(booking: HotelBooking): boolean {
    const active = booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.COMPLETED;
    return active && this.checkoutOf(booking) <= this.todayUtcMidnight();
  }

  private checkoutOf(booking: HotelBooking): Date {
    const checkout = this.toUtcMidnight(booking.startDate);
    checkout.setUTCDate(checkout.getUTCDate() + booking.nightsCount);
    return checkout;
  }

  private guestCounts(booking: HotelBooking) {
    const ages = booking.rooms.flatMap((room) => room.guestAges);
    const children = ages.filter((age) => age < 18).length;
    return { adults: ages.length - children, children, total: ages.length };
  }

  private refundPercentFor(hotel: Hotel | null, daysBefore: number): number {
    const tier = (hotel?.cancellationPolicies ?? []).find(
      (policy) =>
        daysBefore >= policy.daysBeforeService.startDay &&
        (policy.daysBeforeService.endDay === null || daysBefore < policy.daysBeforeService.endDay),
    );
    return tier ? tier.refundPercentage : 0;
  }

  private toSummary(booking: BookingDoc, hotelsByRoom: Map<string, Hotel & { _id: Types.ObjectId }>) {
    const hotel = this.hotelFromMap(booking, hotelsByRoom);
    return {
      id: booking._id.toString(),
      reference: booking._id.toString(),
      hotel: hotel ? { id: hotel._id.toString(), name: hotel.name } : null,
      rooms: booking.rooms.map((room) => ({ roomId: room.roomId.toString(), guests: room.guestAges.length })),
      checkIn: booking.startDate,
      checkOut: this.checkoutOf(booking),
      nights: booking.nightsCount,
      guests: this.guestCounts(booking),
      total: booking.cost ?? null,
      status: this.displayStatus(booking),
    };
  }

  private toDetail(booking: BookingDoc, hotelsByRoom: Map<string, Hotel & { _id: Types.ObjectId }>) {
    return {
      ...this.toSummary(booking, hotelsByRoom),
      policiesAcceptedAt: booking.policiesAcceptedAt ?? null,
      payment: booking.payment ?? null,
      review: booking.review ? this.reviewResponse(booking) : null,
    };
  }

  private reviewResponse(booking: BookingDoc | HotelBooking) {
    const review = (booking as BookingDoc).review;
    if (!review) return null;
    const reviewId = (review as { _id?: Types.ObjectId })._id?.toString() ?? null;
    return {
      id: reviewId,
      bookingId: (booking as BookingDoc)._id.toString(),
      rating: review.rating,
      comment: review.comment,
      reply: review.reply
        ? { text: review.reply.text, moderatorId: review.reply.moderatorId.toString(), repliedAt: review.reply.repliedAt }
        : null,
    };
  }

  /** The hotel that a booking belongs to (resolved via its first room). */
  private async hotelForBooking(booking: HotelBooking): Promise<(Hotel & { _id: Types.ObjectId }) | null> {
    const roomId = booking.rooms[0]?.roomId;
    if (!roomId) return null;
    const room = await this.roomModel.findById(roomId).lean<{ hotelId: Types.ObjectId }>().exec();
    if (!room) return null;
    return this.hotelModel.findById(room.hotelId).lean<Hotel & { _id: Types.ObjectId }>().exec();
  }

  /** Resolve the hotel of every booking in one pass (roomId -> hotel). */
  private async hotelsForBookings(bookings: HotelBooking[]): Promise<Map<string, Hotel & { _id: Types.ObjectId }>> {
    const roomIds = [...new Set(bookings.flatMap((b) => b.rooms.map((r) => r.roomId.toString())))];
    const map = new Map<string, Hotel & { _id: Types.ObjectId }>();
    if (!roomIds.length) return map;
    const rooms = await this.roomModel
      .find({ _id: { $in: roomIds.map((id) => new Types.ObjectId(id)) } })
      .lean<Array<{ _id: Types.ObjectId; hotelId: Types.ObjectId }>>()
      .exec();
    const hotelIds = [...new Set(rooms.map((r) => r.hotelId.toString()))];
    const hotels = await this.hotelModel
      .find({ _id: { $in: hotelIds.map((id) => new Types.ObjectId(id)) } })
      .lean<Array<Hotel & { _id: Types.ObjectId }>>()
      .exec();
    const hotelById = new Map(hotels.map((h) => [h._id.toString(), h]));
    for (const room of rooms) {
      const hotel = hotelById.get(room.hotelId.toString());
      if (hotel) map.set(room._id.toString(), hotel);
    }
    return map;
  }

  private hotelFromMap(booking: HotelBooking, map: Map<string, Hotel & { _id: Types.ObjectId }>) {
    const roomId = booking.rooms[0]?.roomId?.toString();
    return roomId ? (map.get(roomId) ?? null) : null;
  }

  private async recalcHotelAverage(booking: HotelBooking): Promise<void> {
    const hotel = await this.hotelForBooking(booking);
    if (!hotel) return;
    const roomIds = await this.roomModel.find({ hotelId: hotel._id }).distinct('_id').exec();
    const reviewed = await this.bookingModel
      .find({ 'rooms.roomId': { $in: roomIds }, review: { $ne: null } })
      .select('review.rating')
      .lean<Array<{ review: { rating: number } | null }>>()
      .exec();
    const ratings = reviewed.map((b) => b.review?.rating).filter((r): r is number => typeof r === 'number');
    const average = ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : 0;
    await this.hotelModel.updateOne({ _id: hotel._id }, { $set: { averageRating: average } }).exec();
  }

  private async getOwnedBookingOrThrow(bookingId: string, userId: string): Promise<BookingDoc> {
    if (!isValidObjectId(bookingId)) throw new NotFoundException('Reservation not found.');
    const booking = (await this.bookingModel.findById(bookingId).exec()) as BookingDoc | null;
    // 404 (not 403) for another user's reservation so its existence is not leaked (ACC-11).
    if (!booking || booking.userId.toString() !== userId) throw new NotFoundException('Reservation not found.');
    return booking;
  }

  private async getBookingByReviewOrThrow(reviewId: string): Promise<BookingDoc> {
    if (!isValidObjectId(reviewId)) throw new NotFoundException('Review not found.');
    const booking = (await this.bookingModel
      .findOne({ 'review._id': new Types.ObjectId(reviewId) })
      .exec()) as BookingDoc | null;
    if (!booking || !booking.review) throw new NotFoundException('Review not found.');
    return booking;
  }

  private toUtcMidnight(value: Date): Date {
    const d = new Date(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private todayUtcMidnight(): Date {
    return this.toUtcMidnight(new Date());
  }
}
