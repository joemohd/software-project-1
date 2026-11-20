import { PipelineStage, Types } from 'mongoose';
import { BookingStatus } from '../database/schemas/expense.schema.js';
import { PAGE_SIZE } from '../flights/flights.constants.js';

// FLT-25: a user's flight bookings are listed in three groups
export const BOOKING_GROUPS = ['upcoming', 'past', 'cancelled'] as const;
export type BookingGroup = (typeof BOOKING_GROUPS)[number];
export type GroupPages = Record<BookingGroup, number>;

// Expired bookings (never paid) are listed with the cancelled ones
const CANCELLED_STATUSES = [BookingStatus.CANCELLED, BookingStatus.EXPIRED];

/**
 * FLT-25: one aggregation over the user's flight bookings.
 * - looks up the outbound flight (segments[0]) for its departure time,
 * - puts each booking in a group: cancelled (Cancelled or Expired), otherwise upcoming if the outbound flight departs
 *   after `now`, else past,
 * - returns one page of 10 per group, newest booking first, plus each group's total.
 * Result: [{ upcoming: [...], upcomingTotal: [{ count }], past: [...], pastTotal: [...], cancelled: [...], cancelledTotal: [...] }]
 */
export function bookingListPipeline(
  userId: Types.ObjectId,
  pages: GroupPages,
  now: Date,
  flightsCollection: string,
): PipelineStage[] {
  const facets: Record<string, PipelineStage.FacetPipelineStage[]> = {};
  for (const group of BOOKING_GROUPS) {
    facets[group] = [
      { $match: { listGroup: group } },
      // _id breaks ties between bookings created in the same millisecond, so pages never overlap
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: (pages[group] - 1) * PAGE_SIZE },
      { $limit: PAGE_SIZE },
      { $project: { listGroup: 0, outboundDeparture: 0 } },
    ];
    facets[`${group}Total`] = [{ $match: { listGroup: group } }, { $count: 'count' }];
  }

  return [
    // expenseType too, in case this runs on the shared expenses collection without the discriminator filter
    { $match: { userId, expenseType: 'flight_booking' } },
    {
      $lookup: {
        from: flightsCollection,
        let: { outboundFlightId: { $arrayElemAt: ['$segments.flightId', 0] } },
        pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$outboundFlightId'] } } }, { $project: { 'departure.timestamp': 1 } }],
        as: 'outboundFlight',
      },
    },
    { $set: { outboundDeparture: { $first: '$outboundFlight.departure.timestamp' } } },
    { $unset: 'outboundFlight' },
    {
      $set: {
        // $cond: [if, then, else]. "past" also covers a booking whose flight no longer exists
        listGroup: {
          $cond: [
            { $in: ['$status', CANCELLED_STATUSES] },
            'cancelled',
            { $cond: [{ $gt: ['$outboundDeparture', now] }, 'upcoming', 'past'] },
          ],
        },
      },
    },
    { $facet: facets },
  ];
}
