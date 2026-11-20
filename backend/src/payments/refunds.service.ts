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
  // FLT-27: set for the refund of a lower fare after a flight change; null/absent for a cancellation refund
  changeId?: Types.ObjectId | null;
};

/** A payment a refund can be taken from, and how much it was. */
export type RefundSource = { paymentIntentId: string; amount: number };

// Refunds in these Stripe states gave no money back, so they don't count against what is left to refund
const NOT_REFUNDED: Refund['status'][] = ['failed', 'canceled'];

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
   * One refund per booking, payment and reason (cancellation, or one flight change). Calling again returns the first
   * one, and the Stripe idempotency key makes a repeated request (e.g. after a timeout) return the same Stripe refund
   * instead of paying twice. Returns null when there is nothing to refund.
   */
  async issue(request: IssueRefund): Promise<RefundRecord | null> {
    if (request.amount <= 0) return null;
    const changeId = request.changeId ?? null;
    const existing = await this.refundModel
      .findOne({ bookingId: request.bookingId, paymentIntentId: request.paymentIntentId, changeId })
      .lean<RefundRecord>()
      .exec();
    if (existing) return existing;

    const refund = await this.stripeService.call('refund the payment', () =>
      this.stripeService.stripe.refunds.create(
        {
          payment_intent: request.paymentIntentId,
          amount: request.amount,
          reason: 'requested_by_customer',
          metadata: { bookingId: request.bookingId.toString(), bookingType: request.bookingType },
        },
        { idempotencyKey: `refund-${request.bookingId.toString()}-${changeId?.toString() ?? 'cancel'}-${request.paymentIntentId}` },
      ),
    );
    return this.save(refund, request);
  }

  /**
   * FLT-26, FLT-27: refunds `amount` from the booking's payments in order (the first payment, then fare differences
   * paid for flight changes), taking from each at most what is still unrefunded on it. Returns the refunds issued.
   */
  async issueAcross(
    request: Omit<IssueRefund, 'paymentIntentId' | 'amount'>,
    sources: RefundSource[],
    amount: number,
  ): Promise<RefundRecord[]> {
    if (amount <= 0 || !sources.length) return [];
    const previous = await this.refundModel
      .find({ paymentIntentId: { $in: sources.map((source) => source.paymentIntentId) }, status: { $nin: NOT_REFUNDED } })
      .select('paymentIntentId amount')
      .lean<{ paymentIntentId: string; amount: number }[]>()
      .exec();
    const refunded = new Map<string, number>();
    for (const refund of previous) refunded.set(refund.paymentIntentId, (refunded.get(refund.paymentIntentId) ?? 0) + refund.amount);

    const issued: RefundRecord[] = [];
    let left = amount;
    for (const source of sources) {
      if (left <= 0) break;
      const take = Math.min(left, source.amount - (refunded.get(source.paymentIntentId) ?? 0));
      if (take <= 0) continue;
      const refund = await this.issue({ ...request, paymentIntentId: source.paymentIntentId, amount: take });
      if (refund) issued.push(refund);
      left -= take;
    }
    if (left > 0) this.logger.error(`Could not refund ${left} cents of booking ${request.bookingId.toString()}: nothing left to refund on its payments.`);
    return issued;
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

  /** The booking's cancellation refund, if it has one. */
  async findForBooking(bookingId: Types.ObjectId): Promise<RefundRecord | null> {
    return this.refundModel.findOne({ bookingId, changeId: null }).lean<RefundRecord>().exec();
  }

  private async save(refund: Stripe.Refund, request: IssueRefund): Promise<RefundRecord> {
    const saved = await this.refundModel
      .findOneAndUpdate(
        { stripeRefundId: refund.id },
        {
          $set: {
            bookingId: request.bookingId,
            bookingType: request.bookingType,
            changeId: request.changeId ?? null,
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
