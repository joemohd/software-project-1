import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import {
  AcceptPoliciesDto,
  BookingParamsDto,
  BookingPoliciesResponseDto,
  CreatePaymentDto,
  PaymentIdParamDto,
  PaymentResponseDto,
  RefundIdParamDto,
  RefundResponseDto,
  RetryPaymentDto,
} from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';
import { RefundsService } from './refunds.service.js';

// PAY-01: registered users pay for their own bookings
@ApiTags('Payments')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Not a registered user' })
@Roles(UserRole.USER)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // POST /api/payments (PAY-01)
  @Post()
  @ApiOperation({
    summary: 'Pay for a Pending Payment booking (Stripe test mode)',
    description:
      'Accept the policies first (POST /api/bookings/:type/:id/accept-policies). Creates the Stripe PaymentIntent for the ' +
      'booking total (or returns the existing one). A frontend confirms it with clientSecret; to try it from Swagger, send ' +
      'testPaymentMethod "pm_card_visa" (succeeds) or "pm_card_chargeDeclined" (fails). The booking becomes Confirmed only ' +
      'after the backend verifies with Stripe that the payment succeeded.',
  })
  @ApiCreatedResponse({ type: PaymentResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid body, or testPaymentMethod with a live key' })
  @ApiNotFoundResponse({ description: "Booking not found (also when it is someone else's)" })
  @ApiConflictResponse({ description: 'Policies not accepted, booking not Pending Payment, or hold expired' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    return this.paymentsService.create(userId, dto);
  }

  // POST /api/payments/:id/retry (PAY-01)
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed payment while the 10-minute hold lasts' })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  @ApiConflictResponse({ description: 'Already paid, hold expired, or Stripe status not retryable' })
  retry(@CurrentUser('id') userId: string, @Param() params: PaymentIdParamDto, @Body() dto: RetryPaymentDto): Promise<PaymentResponseDto> {
    return this.paymentsService.retry(userId, params.id, dto);
  }

  // GET /api/payments/:id (PAY-01)
  @Get(':id')
  @ApiOperation({ summary: 'Payment status (read back from Stripe) and the booking status' })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  findOne(@CurrentUser('id') userId: string, @Param() params: PaymentIdParamDto): Promise<PaymentResponseDto> {
    return this.paymentsService.findOne(userId, params.id);
  }
}

// POST /api/payments/webhook (PAY-01): called by Stripe, not by users, so it has no login and no role check.
// The Stripe signature proves where the request came from. Kept in its own controller because PaymentsController
// requires the user role.
@Controller('payments')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  webhook(@Req() request: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string): Promise<{ received: true }> {
    return this.paymentsService.handleWebhook(request.rawBody, signature);
  }
}

// PAY-02: policies shown and accepted before payment
@ApiTags('Payments')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Not a registered user' })
@Roles(UserRole.USER)
@Controller('bookings')
export class BookingPoliciesController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // GET /api/bookings/:type/:id/policies (PAY-02)
  @Get(':type/:id/policies')
  @ApiOperation({
    summary: "The provider's policies for your booking",
    description: 'Airline: cancellation tiers and baggage rules. Hotel: cancellation tiers and check-in/check-out times.',
  })
  @ApiOkResponse({ type: BookingPoliciesResponseDto })
  @ApiNotFoundResponse({ description: "Booking not found (also when it is someone else's)" })
  getPolicies(@CurrentUser('id') userId: string, @Param() params: BookingParamsDto): Promise<BookingPoliciesResponseDto> {
    return this.paymentsService.getPolicies(userId, params.type, params.id);
  }

  // POST /api/bookings/:type/:id/accept-policies (PAY-02)
  @Post(':type/:id/accept-policies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept the policies (required before paying); the time of acceptance is stored' })
  @ApiOkResponse({ type: BookingPoliciesResponseDto })
  @ApiBadRequestResponse({ description: 'accepted is not true' })
  @ApiNotFoundResponse({ description: "Booking not found (also when it is someone else's)" })
  @ApiConflictResponse({ description: 'Booking not Pending Payment, or hold expired' })
  accept(
    @CurrentUser('id') userId: string,
    @Param() params: BookingParamsDto,
    @Body() _dto: AcceptPoliciesDto,
  ): Promise<BookingPoliciesResponseDto> {
    return this.paymentsService.acceptPolicies(userId, params.type, params.id);
  }
}

// PAY-03: refund status
@ApiTags('Payments')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Not a registered user' })
@Roles(UserRole.USER)
@Controller('refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  // GET /api/refunds/:id (PAY-03)
  @Get(':id')
  @ApiOperation({ summary: 'Refund status: Pending, Refunded or Failed' })
  @ApiOkResponse({ type: RefundResponseDto })
  @ApiNotFoundResponse({ description: "Refund not found (also when it is someone else's)" })
  findOne(@CurrentUser('id') userId: string, @Param() params: RefundIdParamDto): Promise<RefundResponseDto> {
    return this.refundsService.findOneForUser(userId, params.id);
  }
}
