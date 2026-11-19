import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema.js';
import { Hotel } from '../hotels/schemas/hotel.schema.js';
import {
  HotelBooking,
  HotelBookingDocument,
} from '../hotel-bookings/schemas/hotel-booking.schema.js';
import { HotelBookingStatus } from '../common/enums/hotel-booking-status.enum.js';
import { Role } from '../common/enums/role.enum.js';
import { todayUtcMidnight, toUtcMidnight } from '../common/utils/date.util.js';
import type { JwtUser } from '../common/auth/jwt-user.interface.js';
import type { CreateReviewDto } from './dto/create-review.dto.js';
import type { UpdateReviewDto } from './dto/update-review.dto.js';
import type { ReplyReviewDto } from './dto/reply-review.dto.js';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
  ) {}

  /**
   * HTL-23 — submit the single review allowed for a Completed reservation.
   * Only the reservation's owner may review it, only after check-out has
   * passed, and only once.
   */
  async createForBooking(
    bookingId: string,
    user: JwtUser,
    dto: CreateReviewDto,
  ): Promise<ReviewDocument> {
    const booking = await this.getOwnedBooking(bookingId, user.sub);

    if (!this.isCompleted(booking)) {
      throw new BadRequestException(
        'You can only review a reservation after its check-out date has passed.',
      );
    }

    // Keep the stored status in sync: a Confirmed stay whose check-out passed
    // is Completed (HTL-23).
    if (booking.status === HotelBookingStatus.CONFIRMED) {
      booking.status = HotelBookingStatus.COMPLETED;
    }

    const existing = await this.reviewModel.findOne({ bookingId: booking._id });
    if (existing || booking.reviewId) {
      throw new ConflictException('This reservation has already been reviewed.');
    }

    const review = await this.reviewModel.create({
      hotelId: booking.hotelId,
      bookingId: booking._id,
      userId: new Types.ObjectId(user.sub),
      rating: dto.rating,
      comment: dto.comment ?? '',
      reply: null,
    });

    booking.reviewId = review._id as Types.ObjectId;
    await booking.save();

    await this.recalcHotelRating(booking.hotelId);
    return review;
  }

  /** HTL-23 — the review's author edits their rating and/or comment. */
  async update(
    reviewId: string,
    user: JwtUser,
    dto: UpdateReviewDto,
  ): Promise<ReviewDocument> {
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException(
        'Provide at least one of "rating" or "comment".',
      );
    }
    const review = await this.getReviewOr404(reviewId);
    if (review.userId.toString() !== user.sub) {
      throw new ForbiddenException('You can only edit your own review.');
    }

    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.comment !== undefined) review.comment = dto.comment;
    await review.save();

    await this.recalcHotelRating(review.hotelId);
    return review;
  }

  /** HTL-23 — the review's author deletes it. */
  async remove(reviewId: string, user: JwtUser): Promise<{ deleted: true }> {
    const review = await this.getReviewOr404(reviewId);
    if (review.userId.toString() !== user.sub) {
      throw new ForbiddenException('You can only delete your own review.');
    }

    const hotelId = review.hotelId;
    await review.deleteOne();
    await this.bookingModel.updateOne(
      { _id: review.bookingId },
      { $unset: { reviewId: '' } },
    );
    await this.recalcHotelRating(hotelId);
    return { deleted: true };
  }

  /** HTL-26 (bonus) — the hotel's moderator replies to a review. */
  async reply(
    reviewId: string,
    user: JwtUser,
    dto: ReplyReviewDto,
  ): Promise<ReviewDocument> {
    const review = await this.getReviewOr404(reviewId);
    await this.assertHotelModerator(review.hotelId, user);

    review.reply = {
      text: dto.text,
      moderatorId: new Types.ObjectId(user.sub),
      repliedAt: new Date(),
    };
    await review.save();
    return review;
  }

  /** HTL-24 — public, paginated list of a hotel's reviews, newest first. */
  async listForHotel(hotelId: string, page: number, limit: number) {
    if (!isValidObjectId(hotelId)) {
      throw new NotFoundException('Hotel not found');
    }
    const hotel = await this.hotelModel.findById(hotelId).lean();
    if (!hotel) throw new NotFoundException('Hotel not found');

    const filter = { hotelId: new Types.ObjectId(hotelId) };
    const [items, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'firstName lastName name')
        .lean(),
      this.reviewModel.countDocuments(filter),
    ]);

    return {
      averageRating: hotel.averageRating ?? 0,
      ratingsCount: hotel.ratingsCount ?? 0,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items,
    };
  }

  /** Recompute and cache a hotel's average rating and number of ratings. */
  async recalcHotelRating(hotelId: Types.ObjectId): Promise<void> {
    const [agg] = await this.reviewModel.aggregate<{
      avg: number;
      count: number;
    }>([
      { $match: { hotelId: new Types.ObjectId(hotelId) } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);

    const averageRating = agg ? Math.round(agg.avg * 10) / 10 : 0;
    const ratingsCount = agg ? agg.count : 0;
    await this.hotelModel.updateOne(
      { _id: hotelId },
      { $set: { averageRating, ratingsCount } },
    );
  }

  // ---- helpers -------------------------------------------------------------

  private isCompleted(booking: HotelBookingDocument): boolean {
    const active =
      booking.status === HotelBookingStatus.CONFIRMED ||
      booking.status === HotelBookingStatus.COMPLETED;
    return active && toUtcMidnight(booking.checkOut) <= todayUtcMidnight();
  }

  private async getOwnedBooking(
    bookingId: string,
    userId: string,
  ): Promise<HotelBookingDocument> {
    if (!isValidObjectId(bookingId)) {
      throw new NotFoundException('Reservation not found');
    }
    const booking = await this.bookingModel.findById(bookingId);
    // Return 404 (not 403) for someone else's booking so its existence is not leaked (ACC-11).
    if (!booking || booking.userId.toString() !== userId) {
      throw new NotFoundException('Reservation not found');
    }
    return booking;
  }

  private async getReviewOr404(reviewId: string): Promise<ReviewDocument> {
    if (!isValidObjectId(reviewId)) {
      throw new NotFoundException('Review not found');
    }
    const review = await this.reviewModel.findById(reviewId);
    if (!review) throw new NotFoundException('Review not found');
    return review;
  }

  private async assertHotelModerator(
    hotelId: Types.ObjectId,
    user: JwtUser,
  ): Promise<void> {
    const hotel = await this.hotelModel.findById(hotelId).lean();
    if (!hotel) throw new NotFoundException('Hotel not found');

    const ownsHotel =
      hotel.moderatorId?.toString() === user.sub ||
      user.hotelId === hotelId.toString();
    if (user.role !== Role.HOTEL_MODERATOR || !ownsHotel) {
      throw new ForbiddenException('You can only reply to reviews of your own hotel.');
    }
  }
}
