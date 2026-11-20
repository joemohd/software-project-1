import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import Stripe from 'stripe';
import {
  BookingStatus,
  FlightBooking,
  HotelBooking,
  Payment,
  PaymentIntentStatus,
} from '../database/schemas/expense.schema.js';
import { Flight } from '../database/schemas/flight.schema.js';
import { Airline, Hotel, Room } from '../database/schemas/provider.schema.js';
import { FLIGHT_CHANGE_PURPOSE } from '../flight-bookings/flight-bookings.constants.js';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service.js';
import {
  BookingPoliciesResponseDto,
  BookingType,
  CreatePaymentDto,
  PaymentResponseDto,
  ProviderPoliciesDto,
  RefundTierDto,
  RetryPaymentDto,
  TestPaymentMethod,
} from './dto/payment.dto.js';
import { RefundsService } from './refunds.service.js';
import { MIN_CHARGE_CENTS, PLATFORM_CURRENCY, StripeService } from './stripe.service.js';

/** The fields of a flight or hotel booking that payments need. */
type BookingRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  status: BookingStatus;
  cost: number;
  payment: Payment | null;
  policiesAcceptedAt: Date | null;
  holdExpiresAt?: Date | null;
};

type Tier = { daysBeforeService: { startDay: number }; refundPercentage: number };

const BOOKING_NOT_FOUND = 'Booking not found.';
const PAYMENT_NOT_FOUND = 'Payment not found.';
// A payment that can still be (re)tried
const RETRYABLE = [
  PaymentIntentStatus.REQUIRES_PAYMENT_METHOD,
  PaymentIntentStatus.REQUIRES_CONFIRMATION,
  PaymentIntentStatus.REQUIRES_ACTION,
];

const isBookingType = (value: unknown): value is BookingType => value === 'flight' || value === 'hotel';
const minutesToTime = (minutes: number | undefined | null) =>
  minutes === undefined || minutes === null
    ? null
    : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const tiers = (policies: Tier[] | undefined): RefundTierDto[] =>
  [...(policies ?? [])]
    .sort((a, b) => a.daysBeforeService.startDay - b.daysBeforeService.startDay)
    .map((tier) => ({ daysBefore: tier.daysBeforeService.startDay, refundPercentage: tier.refundPercentage }));

/**
 * PAY-01: pays Pending Payment bookings with Stripe PaymentIntents. A booking is confirmed only after the backend has
 * checked with Stripe that the PaymentIntent succeeded (webhook, or reading it back from Stripe), never because the
 * client says so. PAY-02: provider policies must be accepted (with a timestamp) before paying.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(FlightBooking.name) private readonly flightBookingModel: Model<FlightBooking>,
    @InjectModel(HotelBooking.name) private readonly hotelBookingModel: Model<HotelBooking>,
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<Airline>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    private readonly flightBookingsService: FlightBookingsService,
    private readonly stripeService: StripeService,
    private readonly refundsService: RefundsService,
  ) {}

  // ---------- PAY-02: policies ----------

  /** PAY-02: the provider policies of the user's booking and whether they were accepted. */
  async getPolicies(userId: string, type: BookingType, bookingId: string): Promise<BookingPoliciesResponseDto> {
    const booking = await this.loadOwned(userId, type, bookingId);
    return this.policiesOf(type, booking);
  }

  /** PAY-02: records acceptance with a timestamp. Only while the booking is waiting for payment. */
  async acceptPolicies(userId: string, type: BookingType, bookingId: string): Promise<BookingPoliciesResponseDto> {
    const booking = await this.loadOwned(userId, type, bookingId);
    this.assertPayable(booking);
    if (!booking.policiesAcceptedAt) {
      await this.model(type)
        .updateOne(
          { _id: booking._id, status: BookingStatus.PENDING_PAYMENT, policiesAcceptedAt: null },
          { $set: { policiesAcceptedAt: new Date() } },
        )
        .exec();
    }
    return this.policiesOf(type, await this.loadOwned(userId, type, bookingId));
  }

  // ---------- PAY-01: payments ----------

  /**
   * PAY-01: creates (or reuses) the booking's PaymentIntent for its total. The frontend confirms it with the returned
   * clientSecret (Stripe Elements), so card details never reach us. In test mode `testPaymentMethod` pays right away.
   */
  async create(userId: string, dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    const booking = await this.loadOwned(userId, dto.bookingType, dto.bookingId);
    this.assertPayable(booking);
    if (!booking.policiesAcceptedAt) {
      throw new ConflictException('Accept the booking policies first (POST /api/bookings/:type/:id/accept-policies).');
    }
    if (booking.cost < MIN_CHARGE_CENTS) throw new BadRequestException('The booking total is below the minimum charge of 0.50 USD.');

    let intent: Stripe.PaymentIntent;
    if (booking.payment && booking.payment.status !== PaymentIntentStatus.CANCELED) {
      // Already started paying: continue with the same PaymentIntent instead of charging twice
      intent = await this.retrieve(booking.payment.paymentIntentId);
    } else {
      intent = await this.stripeService.call('start the payment', () =>
        this.stripeService.stripe.paymentIntents.create(
          {
            amount: booking.cost,
            currency: PLATFORM_CURRENCY,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            metadata: { bookingId: booking._id.toString(), bookingType: dto.bookingType, userId },
            description: `${dto.bookingType} booking ${booking._id.toString()}`,
          },
          // Two clicks on "Pay" create one PaymentIntent, not two
          { idempotencyKey: `pay-${dto.bookingType}-${booking._id.toString()}` },
        ),
      );
      await this.model(dto.bookingType)
        .updateOne(
          { _id: booking._id, status: BookingStatus.PENDING_PAYMENT },
          { $set: { payment: { paymentIntentId: intent.id, amount: intent.amount, currency: intent.currency, status: intent.status, lastError: null } } },
        )
        .exec();
    }

    if (dto.testPaymentMethod && RETRYABLE.includes(intent.status as PaymentIntentStatus)) {
      intent = await this.confirmWithTestMethod(intent.id, dto.testPaymentMethod);
    }
    await this.applyIntent(intent);
    return this.toResponse(dto.bookingType, booking._id, intent);
  }

  /** PAY-01: try again after a failed attempt, while the hold lasts. */
  async retry(userId: string, paymentId: string, dto: RetryPaymentDto): Promise<PaymentResponseDto> {
    const { type, booking } = await this.findByPayment(userId, paymentId);
    let intent = await this.retrieve(paymentId);
    await this.applyIntent(intent);
    if (intent.status === PaymentIntentStatus.SUCCEEDED) throw new ConflictException('This payment already succeeded.');
    this.assertPayable(await this.loadOwned(userId, type, booking._id.toString()));
    if (!RETRYABLE.includes(intent.status as PaymentIntentStatus)) {
      throw new ConflictException(`This payment can't be retried now (Stripe status: ${intent.status}).`);
    }
    if (dto.testPaymentMethod) {
      intent = await this.confirmWithTestMethod(intent.id, dto.testPaymentMethod);
      await this.applyIntent(intent);
    }
    return this.toResponse(type, booking._id, intent);
  }

  /** PAY-01: payment status, read back from Stripe so it is current (falls back to the stored status). */
  async findOne(userId: string, paymentId: string): Promise<PaymentResponseDto> {
    const { type, booking } = await this.findByPayment(userId, paymentId);
    try {
      const intent = await this.retrieve(paymentId);
      await this.applyIntent(intent);
      return this.toResponse(type, booking._id, intent);
    } catch (error) {
      this.logger.warn(`Showing stored status of ${paymentId}: ${error instanceof Error ? error.message : String(error)}`);
      return this.toResponse(type, booking._id, null);
    }
  }

  /**
   * PAY-01, PAY-03: Stripe calls this. The signature proves the event really comes from Stripe (STRIPE_WEBHOOK_SECRET),
   * so this is where payment success is verified and the booking confirmed.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<{ received: true }> {
    const secret = this.stripeService.webhookSecret;
    if (!secret) throw new ServiceUnavailableException('Webhooks are not set up: STRIPE_WEBHOOK_SECRET is missing in .env.');
    if (!rawBody || !signature) throw new BadRequestException('Missing Stripe signature or body.');

    let event: Stripe.Event;
    try {
      event = this.stripeService.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      throw new BadRequestException(`Invalid Stripe signature: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Compared as plain strings so this works whatever event types the installed Stripe version lists
    const eventType: string = event.type;
    if (eventType.startsWith('payment_intent.')) {
      await this.applyIntent(event.data.object as unknown as Stripe.PaymentIntent);
    } else if (['refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated'].includes(eventType)) {
      await this.refundsService.syncFromStripe(event.data.object as unknown as Stripe.Refund);
    }
    return { received: true };
  }

  // ---------- internals ----------

  /**
   * Stores the PaymentIntent's status on its booking and, when it succeeded, confirms the booking. Safe to call many
   * times for the same intent (webhook + polling): confirmation is a guarded update that happens once.
   * If the money arrived after the hold expired, the seats/rooms are gone, so the payment is refunded in full.
   */
  private async applyIntent(intent: Stripe.PaymentIntent): Promise<void> {
    // FLT-27: a fare difference paid for a flight change, not the booking's own payment
    if (intent.metadata?.purpose === FLIGHT_CHANGE_PURPOSE) {
      await this.flightBookingsService.applyChangePayment(intent);
      return;
    }
    const type = intent.metadata?.bookingType;
    const bookingId = intent.metadata?.bookingId;
    if (!isBookingType(type) || !bookingId || !isValidObjectId(bookingId)) {
      this.logger.warn(`PaymentIntent ${intent.id} has no booking in its metadata; ignored.`);
      return;
    }
    const model = this.model(type);
    const booking = await model
      .findOneAndUpdate(
        { _id: bookingId, 'payment.paymentIntentId': intent.id },
        { $set: { 'payment.status': intent.status, 'payment.lastError': intent.last_payment_error?.message ?? null } },
        { returnDocument: 'after' },
      )
      .lean<BookingRecord>()
      .exec();
    if (!booking || intent.status !== PaymentIntentStatus.SUCCEEDED) return;
    if (booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.COMPLETED) return;

    // Only the exact total, in the platform currency, confirms a booking
    if (intent.amount_received !== booking.cost || intent.currency !== PLATFORM_CURRENCY) {
      this.logger.error(`PaymentIntent ${intent.id} paid ${intent.amount_received} ${intent.currency} but booking ${bookingId} costs ${booking.cost}; not confirmed.`);
      return;
    }

    const confirmed = type === 'flight' ? await this.flightBookingsService.confirmPaid(booking._id) : await this.confirmHotel(booking._id);
    if (confirmed) {
      this.logger.log(`${type} booking ${bookingId} confirmed by payment ${intent.id}.`);
      return;
    }
    const current = await model.findById(booking._id).select('status').lean<{ status: BookingStatus }>().exec();
    if (current?.status === BookingStatus.CONFIRMED || current?.status === BookingStatus.COMPLETED) return;
    this.logger.warn(`Payment ${intent.id} arrived after the hold of ${type} booking ${bookingId} ended; refunding in full.`);
    await this.refundsService.issue({
      bookingId: booking._id,
      bookingType: type,
      userId: booking.userId,
      paymentIntentId: intent.id,
      amount: intent.amount_received,
    });
  }

  /** HTL-17: Pending Payment → Confirmed while the hold (if set) is still valid. */
  private async confirmHotel(bookingId: Types.ObjectId): Promise<boolean> {
    const result = await this.hotelBookingModel
      .updateOne(
        {
          _id: bookingId,
          status: BookingStatus.PENDING_PAYMENT,
          $or: [{ holdExpiresAt: { $exists: false } }, { holdExpiresAt: null }, { holdExpiresAt: { $gt: new Date() } }],
        },
        { $set: { status: BookingStatus.CONFIRMED, holdExpiresAt: null } },
      )
      .exec();
    return result.modifiedCount === 1;
  }

  private async confirmWithTestMethod(paymentIntentId: string, paymentMethod: TestPaymentMethod): Promise<Stripe.PaymentIntent> {
    if (!this.stripeService.isTestMode) throw new BadRequestException('testPaymentMethod only works with a Stripe test key (sk_test_...).');
    try {
      return await this.stripeService.stripe.paymentIntents.confirm(paymentIntentId, { payment_method: paymentMethod });
    } catch (error) {
      // A declined card is a normal outcome: the intent now says why, and the user can retry
      if (error instanceof Stripe.errors.StripeCardError) return this.retrieve(paymentIntentId);
      throw error instanceof Stripe.errors.StripeError ? new BadRequestException(`Stripe: ${error.message}`) : error;
    }
  }

  private retrieve(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripeService.call('read the payment', () => this.stripeService.stripe.paymentIntents.retrieve(paymentIntentId));
  }

  private model(type: BookingType): Model<BookingRecord> {
    return (type === 'flight' ? this.flightBookingModel : this.hotelBookingModel) as unknown as Model<BookingRecord>;
  }

  /** The user's booking or 404 (also when it is someone else's). Overdue flight holds are expired first. */
  private async loadOwned(userId: string, type: BookingType, bookingId: string): Promise<BookingRecord> {
    if (!isValidObjectId(bookingId)) throw new NotFoundException(BOOKING_NOT_FOUND);
    const userObjectId = new Types.ObjectId(userId);
    if (type === 'flight') await this.flightBookingsService.expireOverdueHolds({ userId: userObjectId });
    const booking = await this.model(type).findOne({ _id: bookingId, userId: userObjectId }).lean<BookingRecord>().exec();
    if (!booking) throw new NotFoundException(BOOKING_NOT_FOUND);
    return booking;
  }

  private async findByPayment(userId: string, paymentId: string): Promise<{ type: BookingType; booking: BookingRecord }> {
    const userObjectId = new Types.ObjectId(userId);
    for (const type of ['flight', 'hotel'] as const) {
      const booking = await this.model(type)
        .findOne({ userId: userObjectId, 'payment.paymentIntentId': paymentId })
        .lean<BookingRecord>()
        .exec();
      if (booking) return { type, booking };
    }
    throw new NotFoundException(PAYMENT_NOT_FOUND);
  }

  /** PAY-01: only Pending Payment bookings whose hold hasn't run out can be paid. */
  private assertPayable(booking: BookingRecord): void {
    if (booking.status !== BookingStatus.PENDING_PAYMENT) {
      throw new ConflictException(`This booking is ${booking.status}, so it can't be paid.`);
    }
    if (booking.holdExpiresAt && booking.holdExpiresAt <= new Date()) {
      throw new ConflictException('The 10-minute hold on this booking has expired. Please book again.');
    }
  }

  private async toResponse(type: BookingType, bookingId: Types.ObjectId, intent: Stripe.PaymentIntent | null): Promise<PaymentResponseDto> {
    const booking = await this.model(type).findById(bookingId).lean<BookingRecord>().exec();
    if (!booking?.payment) throw new NotFoundException(PAYMENT_NOT_FOUND);
    return {
      id: booking.payment.paymentIntentId,
      bookingType: type,
      bookingId: booking._id.toString(),
      amount: booking.payment.amount,
      currency: booking.payment.currency,
      status: booking.payment.status,
      bookingStatus: booking.status,
      clientSecret: booking.status === BookingStatus.PENDING_PAYMENT ? (intent?.client_secret ?? null) : null,
      lastError: booking.payment.lastError,
      holdExpiresAt: booking.holdExpiresAt ? booking.holdExpiresAt.toISOString() : null,
    };
  }

  private async policiesOf(type: BookingType, booking: BookingRecord): Promise<BookingPoliciesResponseDto> {
    const providers: ProviderPoliciesDto[] = type === 'flight' ? await this.airlinePolicies(booking._id) : await this.hotelPolicies(booking._id);
    return {
      bookingType: type,
      bookingId: booking._id.toString(),
      accepted: Boolean(booking.policiesAcceptedAt),
      acceptedAt: booking.policiesAcceptedAt ? booking.policiesAcceptedAt.toISOString() : null,
      providers,
    };
  }

  /** PAY-02 (airline): cancellation tiers and baggage rules of each airline flying the booking. */
  private async airlinePolicies(bookingId: Types.ObjectId): Promise<ProviderPoliciesDto[]> {
    const booking = await this.flightBookingModel.findById(bookingId).select('segments').lean<{ segments: { flightId: Types.ObjectId }[] }>().exec();
    const flights = await this.flightModel
      .find({ _id: { $in: (booking?.segments ?? []).map((segment) => segment.flightId) } })
      .select('airlineId maxBagWeight')
      .lean<{ airlineId: Types.ObjectId; maxBagWeight?: number }[]>()
      .exec();
    const airlines = await this.airlineModel
      .find({ _id: { $in: flights.map((flight) => flight.airlineId) } })
      .select('name cancellationPolicies bagPolicy')
      .lean<{ _id: Types.ObjectId; name: string; cancellationPolicies: Tier[]; bagPolicy: { priceExtraBag: number; maxExtraBagCount: number } }[]>()
      .exec();
    return airlines.map((airline) => ({
      providerType: 'airline' as const,
      providerId: airline._id.toString(),
      name: airline.name,
      cancellationTiers: tiers(airline.cancellationPolicies),
      baggage: {
        priceExtraBag: airline.bagPolicy?.priceExtraBag ?? 0,
        maxExtraBagCount: airline.bagPolicy?.maxExtraBagCount ?? 0,
        maxBagWeightKg: flights.find((flight) => flight.airlineId.equals(airline._id))?.maxBagWeight ?? null,
      },
    }));
  }

  /** PAY-02 (hotel): cancellation tiers and check-in/check-out times. */
  private async hotelPolicies(bookingId: Types.ObjectId): Promise<ProviderPoliciesDto[]> {
    const booking = await this.hotelBookingModel.findById(bookingId).select('rooms').lean<{ rooms: { roomId: Types.ObjectId }[] }>().exec();
    const room = await this.roomModel.findById(booking?.rooms?.[0]?.roomId).select('hotelId').lean<{ hotelId: Types.ObjectId }>().exec();
    const hotel = room
      ? await this.hotelModel
          .findById(room.hotelId)
          .select('name cancellationPolicies checkingPolicy')
          .lean<{ _id: Types.ObjectId; name: string; cancellationPolicies: Tier[]; checkingPolicy?: { checkInTime: number; checkOutTime: number } }>()
          .exec()
      : null;
    if (!hotel) return [];
    return [
      {
        providerType: 'hotel',
        providerId: hotel._id.toString(),
        name: hotel.name,
        cancellationTiers: tiers(hotel.cancellationPolicies),
        checkInTime: minutesToTime(hotel.checkingPolicy?.checkInTime),
        checkOutTime: minutesToTime(hotel.checkingPolicy?.checkOutTime),
      },
    ];
  }
}
