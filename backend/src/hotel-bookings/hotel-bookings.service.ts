import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import {
  HotelBooking,
  HotelBookingDocument,
} from './schemas/hotel-booking.schema.js';
import { CancellationTier, Hotel } from '../hotels/schemas/hotel.schema.js';
import { HotelBookingStatus } from '../common/enums/hotel-booking-status.enum.js';
import { daysBetween, todayUtcMidnight, toUtcMidnight } from '../common/utils/date.util.js';
import type { JwtUser } from '../common/auth/jwt-user.interface.js';

type Group = 'Upcoming' | 'Past' | 'Cancelled';

@Injectable()
export class HotelBookingsService {
  constructor(
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
  ) {}

  /**
   * HTL-20 — the user's reservations grouped as Upcoming / Past / Cancelled.
   */
  async listMine(user: JwtUser) {
    const bookings = await this.bookingModel
      .find({ userId: new Types.ObjectId(user.sub) })
      .sort({ checkIn: -1 })
      .populate('hotelId', 'name city country photos')
      .lean();

    const groups: Record<Group, unknown[]> = {
      Upcoming: [],
      Past: [],
      Cancelled: [],
    };

    for (const b of bookings) {
      // Pending holds that were never paid and in-progress holds are not shown
      // as real reservations in HTL-20.
      if (b.status === HotelBookingStatus.PENDING_PAYMENT) continue;
      groups[this.groupOf(b)].push(this.toSummary(b));
    }

    return groups;
  }

  /** HTL-20 — full details of one of the user's reservations. */
  async getMine(bookingId: string, user: JwtUser) {
    const booking = await this.getOwnedBooking(bookingId, user.sub, true);
    return this.toDetail(booking);
  }

  /**
   * HTL-21 — cancel the user's own Confirmed reservation as a whole before
   * check-in. Computes the refund from the hotel's tiers on the full total,
   * marks the reservation Cancelled (releasing its rooms) and records a
   * pending refund.
   */
  async cancel(bookingId: string, user: JwtUser) {
    const booking = await this.getOwnedBooking(bookingId, user.sub, false);

    if (booking.status !== HotelBookingStatus.CONFIRMED) {
      throw new BadRequestException(
        'Only a Confirmed reservation can be cancelled.',
      );
    }
    if (toUtcMidnight(booking.checkIn) <= todayUtcMidnight()) {
      throw new BadRequestException(
        'A reservation can only be cancelled before its check-in date.',
      );
    }

    const hotel = await this.hotelModel.findById(booking.hotelId).lean();
    const tiers = hotel?.cancellationTiers ?? [];
    const daysBefore = daysBetween(todayUtcMidnight(), toUtcMidnight(booking.checkIn));
    const refundPercent = this.resolveRefundPercent(tiers, daysBefore);
    const refundAmount = Math.round(booking.totalPrice * refundPercent) / 100;

    booking.status = HotelBookingStatus.CANCELLED;
    booking.cancellation = {
      cancelledAt: new Date(),
      refundPercent,
      refundAmount,
      refundStatus: refundAmount > 0 ? 'Pending' : 'Refunded',
    } as HotelBookingDocument['cancellation'];
    await booking.save();

    // Rooms are released automatically: availability checks ignore CANCELLED
    // reservations.
    //
    // INTEGRATION HOOKS (other teammates):
    //  - PAY-03: if refundAmount > 0, issue the Stripe refund and update
    //    booking.cancellation.refundStatus / refundId.
    //  - GEN-01: send an in-app "reservation cancelled / refund" notification.

    return {
      id: (booking._id as Types.ObjectId).toString(),
      reference: booking.reference,
      status: booking.status,
      refund: {
        percent: refundPercent,
        amount: refundAmount,
        status: booking.cancellation.refundStatus,
      },
    };
  }

  // ---- refund rule ---------------------------------------------------------

  /**
   * Selection rule (shared with FLT-09, HTL-10): among the tiers whose
   * `daysBeforeCheckIn` threshold is <= the days actually remaining before
   * check-in, pick the one with the HIGHEST threshold. No qualifying tier → 0%.
   */
  private resolveRefundPercent(
    tiers: CancellationTier[],
    daysBefore: number,
  ): number {
    const applicable = tiers
      .filter((t) => t.daysBeforeCheckIn <= daysBefore)
      .sort((a, b) => b.daysBeforeCheckIn - a.daysBeforeCheckIn);
    return applicable.length > 0 ? applicable[0].refundPercent : 0;
  }

  // ---- mapping helpers -----------------------------------------------------

  private groupOf(b: HotelBooking): Group {
    if (
      b.status === HotelBookingStatus.CANCELLED ||
      b.status === HotelBookingStatus.EXPIRED
    ) {
      return 'Cancelled';
    }
    if (toUtcMidnight(b.checkOut) <= todayUtcMidnight()) return 'Past';
    return 'Upcoming';
  }

  /** Display status: a Confirmed stay whose check-out passed shows as Completed. */
  private displayStatus(b: HotelBooking): string {
    if (
      b.status === HotelBookingStatus.CONFIRMED &&
      toUtcMidnight(b.checkOut) <= todayUtcMidnight()
    ) {
      return HotelBookingStatus.COMPLETED;
    }
    return b.status;
  }

  private guestCounts(b: HotelBooking) {
    const adults = b.rooms.reduce((s, r) => s + r.adults, 0);
    const children = b.rooms.reduce((s, r) => s + r.childrenAges.length, 0);
    return { adults, children };
  }

  private toSummary(b: HotelBooking & { _id?: Types.ObjectId; hotelId: any }) {
    return {
      id: b._id?.toString(),
      reference: b.reference ?? null,
      hotel: b.hotelId
        ? {
            id: b.hotelId._id?.toString?.() ?? b.hotelId.toString?.(),
            name: b.hotelId.name,
            city: b.hotelId.city,
            country: b.hotelId.country,
          }
        : null,
      rooms: b.rooms.map((r) => ({
        roomNumber: r.roomNumber,
        type: r.type,
        adults: r.adults,
        children: r.childrenAges.length,
      })),
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: b.nights,
      guests: this.guestCounts(b),
      totalPrice: b.totalPrice,
      status: this.displayStatus(b),
    };
  }

  private toDetail(b: HotelBooking & { _id?: Types.ObjectId; hotelId: any }) {
    return {
      id: b._id?.toString(),
      reference: b.reference ?? null,
      hotel: b.hotelId
        ? {
            id: b.hotelId._id?.toString?.() ?? b.hotelId.toString?.(),
            name: b.hotelId.name,
            address: b.hotelId.address,
            city: b.hotelId.city,
            country: b.hotelId.country,
            checkInTime: b.hotelId.checkInTime,
            checkOutTime: b.hotelId.checkOutTime,
            cancellationTiers: b.hotelId.cancellationTiers,
          }
        : null,
      rooms: b.rooms.map((r) => ({
        roomId: r.roomId?.toString?.(),
        roomNumber: r.roomNumber,
        type: r.type,
        pricePerNight: r.pricePerNight,
        adults: r.adults,
        childrenAges: r.childrenAges,
      })),
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: b.nights,
      guests: this.guestCounts(b),
      totalPrice: b.totalPrice,
      status: this.displayStatus(b),
      policyAcceptance: b.policyAcceptance,
      payment: b.payment ?? null,
      cancellation: b.cancellation ?? null,
      reviewId: b.reviewId?.toString?.() ?? null,
    };
  }

  // ---- fetch + ownership ---------------------------------------------------

  private async getOwnedBooking(
    bookingId: string,
    userId: string,
    populateHotel: boolean,
  ): Promise<HotelBookingDocument> {
    if (!isValidObjectId(bookingId)) {
      throw new NotFoundException('Reservation not found');
    }
    const query = this.bookingModel.findById(bookingId);
    if (populateHotel) {
      query.populate(
        'hotelId',
        'name address city country checkInTime checkOutTime cancellationTiers',
      );
    }
    const booking = await query.exec();
    // 404 (not 403) for someone else's reservation so existence is not leaked (ACC-11).
    if (!booking || booking.userId.toString() !== userId) {
      throw new NotFoundException('Reservation not found');
    }
    return booking;
  }
}
