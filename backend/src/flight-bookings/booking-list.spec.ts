import { Types } from 'mongoose';
import { bookingListPipeline } from './booking-list.js';

describe('bookingListPipeline (FLT-25)', () => {
  const userId = new Types.ObjectId();
  const now = new Date('2026-11-19T12:00:00Z');
  const pipeline = bookingListPipeline(userId, { upcoming: 1, past: 3, cancelled: 2 }, now, 'flights') as Record<string, any>[];
  const facets = pipeline.at(-1)!.$facet;

  it("only reads this user's flight bookings", () => {
    expect(pipeline[0]).toEqual({ $match: { userId, expenseType: 'flight_booking' } });
  });

  it("looks up the outbound flight's departure time", () => {
    const { $lookup } = pipeline[1];
    expect($lookup.from).toBe('flights');
    expect($lookup.let).toEqual({ outboundFlightId: { $arrayElemAt: ['$segments.flightId', 0] } });
    expect(pipeline[2]).toEqual({ $set: { outboundDeparture: { $first: '$outboundFlight.departure.timestamp' } } });
  });

  it('groups Cancelled and Expired as cancelled, then upcoming by departure after now, otherwise past', () => {
    expect(pipeline[4].$set.listGroup).toEqual({
      $cond: [
        { $in: ['$status', ['cancelled', 'expired']] },
        'cancelled',
        { $cond: [{ $gt: ['$outboundDeparture', now] }, 'upcoming', 'past'] },
      ],
    });
  });

  it('pages each group on its own, 10 per page, newest first', () => {
    for (const [group, skip] of [['upcoming', 0], ['past', 20], ['cancelled', 10]] as const) {
      expect(facets[group]).toEqual([
        { $match: { listGroup: group } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: skip },
        { $limit: 10 },
        { $project: { listGroup: 0, outboundDeparture: 0 } },
      ]);
      expect(facets[`${group}Total`]).toEqual([{ $match: { listGroup: group } }, { $count: 'count' }]);
    }
  });
});
