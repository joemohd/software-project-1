import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type Stripe from 'stripe';
import { Refund } from '../database/schemas/expense.schema.js';
import type { BookingType, RefundResponseDto } from './dto/payment.dto.js';
import { refundDisplayStatus } from './refund-policy.js';
import { StripeService, stripeId } from './stripe.service.js';

type RefundRecord = Refund & { _id: Types.ObjectId; createdAt?: Date };

export type IssueRefund = {
  bookingId: Types.ObjectId;
  bookingType: BookingType;
  userId: Types.ObjectId;
  paymentIntentId: string;
  amount: number;
};

const REFUND_NOT_FOUND = 'Refund not found.';

/** PAY-03: issues refunds through the Stripe Refunds API, records them and reports their status. */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectModel(Refund.name) private readonly refundModel: Model<Refund>,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * One refund per booking. Calling again for the same booking returns the first one, and the Stripe idempotency key
   * makes a repeated request (e.g. after a timeout) return the same Stripe refund instead of paying twice.
   * Returns null when there is nothing to refund.
   */
  async issue(request: IssueRefund): Promise<RefundRecord | null> {
    if (request.amount <= 0) return null;
    const existing = await this.refundModel.findOne({ bookingId: request.bookingId }).lean<RefundRecord>().exec();
    if (existing) return existing;

    const refund = await this.stripeService.call('refund the payment', () =>
      this.stripeService.stripe.refunds.create(
        {
          payment_intent: request.paymentIntentId,
          amount: request.amount,
          reason: 'requested_by_customer',
          metadata: { bookingId: request.bookingId.toString(), bookingType: request.bookingType },
        },
        { idempotencyKey: `refund-${request.bookingId.toString()}` },
      ),
    );
    return this.save(refund, request);
  }

  /** Webhook: keeps a refund's status in step with Stripe (pending → succeeded / failed). */
  async syncFromStripe(refund: Stripe.Refund): Promise<void> {
    await this.refundModel
      .updateOne(
        { stripeRefundId: refund.id },
        { $set: { status: refund.status ?? null, failureReason: refund.failure_reason ?? null, balanceTransactionId: stripeId(refund.balance_transaction) } },
      )
      .exec();
  }

  /** PAY-03: GET /api/refunds/:id for its owner (404 for anyone else). Refreshes the status from Stripe when it can. */
  async findOneForUser(userId: string, refundId: string): Promise<RefundResponseDto> {
    if (!isValidObjectId(refundId)) throw new NotFoundException(REFUND_NOT_FOUND);
    let refund = await this.refundModel
      .findOne({ _id: refundId, userId: new Types.ObjectId(userId) })
      .lean<RefundRecord>()
      .exec();
    if (!refund) throw new NotFoundException(REFUND_NOT_FOUND);

    if (refund.status !== 'succeeded' && refund.status !== 'failed' && refund.status !== 'canceled') {
      try {
        await this.syncFromStripe(await this.stripeService.stripe.refunds.retrieve(refund.stripeRefundId));
        refund = (await this.refundModel.findById(refund._id).lean<RefundRecord>().exec()) ?? refund;
      } catch (error) {
        // Show the stored status if Stripe can't be reached right now
        this.logger.warn(`Could not refresh refund ${refund.stripeRefundId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return toRefundResponse(refund);
  }

  /** The booking's refund, if it has one. */
  async findForBooking(bookingId: Types.ObjectId): Promise<RefundRecord | null> {
    return this.refundModel.findOne({ bookingId }).lean<RefundRecord>().exec();
  }

  private async save(refund: Stripe.Refund, request: IssueRefund): Promise<RefundRecord> {
    const saved = await this.refundModel
      .findOneAndUpdate(
        { stripeRefundId: refund.id },
        {
          $set: {
            bookingId: request.bookingId,
            bookingType: request.bookingType,
            userId: request.userId,
            amount: refund.amount,
            currency: refund.currency,
            status: refund.status ?? null,
            reason: refund.reason ?? null,
            paymentIntentId: stripeId(refund.payment_intent),
            chargeId: stripeId(refund.charge),
            balanceTransactionId: stripeId(refund.balance_transaction),
            failureReason: refund.failure_reason ?? null,
            stripeCreatedAt: new Date(refund.created * 1000),
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .lean<RefundRecord>()
      .exec();
    this.logger.log(`Refund ${refund.id} of ${refund.amount} ${refund.currency} for ${request.bookingType} booking ${request.bookingId.toString()}.`);
    return saved!;
  }
}

export function toRefundResponse(refund: RefundRecord): RefundResponseDto {
  return {
    id: refund._id.toString(),
    bookingType: refund.bookingType,
    bookingId: refund.bookingId.toString(),
    amount: refund.amount,
    currency: refund.currency,
    status: refundDisplayStatus(refund.status),
    stripeStatus: refund.status,
    failureReason: refund.failureReason,
    createdAt: (refund.createdAt ?? refund.stripeCreatedAt ?? new Date()).toISOString(),
  };
}
