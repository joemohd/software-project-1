import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetCategory, ItineraryVisibility } from '../../database/schemas/itinerary.schema.js';

export class ImageDto {
  @ApiProperty() id: string;
  @ApiProperty() url: string;
}

export class ActivityResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty({ nullable: true, type: String, example: '09:30' }) time: string | null;
  @ApiProperty({ nullable: true, type: Number }) cost: number | null;
  @ApiProperty({ nullable: true, type: String }) currency: string | null;
  @ApiProperty({ type: [ImageDto] }) images: ImageDto[];
}

export class BudgetEntryResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: BudgetCategory }) category: BudgetCategory;
  @ApiProperty() amount: number;
  @ApiProperty() currency: string;
  @ApiProperty() note: string;
}

export class CityRefDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

export class DayResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 1 }) dayNumber: number;
  @ApiProperty({ example: '2026-12-20' }) date: string;
  @ApiProperty({ type: CityRefDto }) city: CityRefDto;
  @ApiProperty() notes: string;
  @ApiProperty({ type: [ActivityResponseDto] }) activities: ActivityResponseDto[];
  @ApiProperty({ type: [BudgetEntryResponseDto] }) budgets: BudgetEntryResponseDto[];
}

export class TransportCostResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() mode: string;
  @ApiProperty({ type: CityRefDto }) fromCity: CityRefDto;
  @ApiProperty({ type: CityRefDto }) toCity: CityRefDto;
  @ApiProperty() amount: number;
  @ApiProperty() currency: string;
  @ApiProperty() dayId: string;
  @ApiProperty() dayNumber: number;
}

export class CityGroupDto {
  @ApiProperty({ description: 'Use as groupIndex for GET /itineraries/:id/hotels (ITN-25).' }) index: number;
  @ApiProperty({ type: CityRefDto }) city: CityRefDto;
  @ApiProperty() firstDayNumber: number;
  @ApiProperty() lastDayNumber: number;
  @ApiProperty() dayCount: number;
  @ApiProperty({ example: '2026-12-20' }) startDate: string;
  @ApiProperty({ example: '2026-12-22' }) endDate: string;
}

export class AuthorDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
}

export class CloneAttributionDto {
  @ApiProperty() itineraryId: string;
  @ApiProperty({ type: AuthorDto }) author: AuthorDto;
  @ApiProperty() title: string;
}

export class ItineraryDetailDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: [String], example: ['EG'] }) countries: string[];
  @ApiProperty({ example: '2026-12-20' }) startDate: string;
  @ApiProperty({ nullable: true, type: String, example: '2026-12-27' }) endDate: string | null;
  @ApiProperty({ enum: ItineraryVisibility }) visibility: ItineraryVisibility;
  @ApiProperty() dayCount: number;
  @ApiProperty({ type: AuthorDto }) author: AuthorDto;
  @ApiProperty({ type: CloneAttributionDto, nullable: true }) clonedFrom: CloneAttributionDto | null;
  @ApiProperty({ type: [DayResponseDto] }) days: DayResponseDto[];
  @ApiProperty({ type: [TransportCostResponseDto] }) transportCosts: TransportCostResponseDto[];
  @ApiProperty({ type: [CityGroupDto], description: 'ITN-09: consecutive days in the same city.' }) cityGroups: CityGroupDto[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class ItinerarySummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: [String] }) countries: string[];
  @ApiProperty({ example: '2026-12-20' }) startDate: string;
  @ApiProperty() dayCount: number;
  @ApiProperty({ enum: ItineraryVisibility }) visibility: ItineraryVisibility;
  @ApiProperty() updatedAt: Date;
  @ApiPropertyOptional({ type: AuthorDto }) author?: AuthorDto;
  @ApiPropertyOptional({ type: [String], description: 'City names visited (public search only).' }) cities?: string[];
}

export class ItineraryPageDto {
  @ApiProperty({ type: [ItinerarySummaryDto] }) items: ItinerarySummaryDto[];
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
  @ApiProperty() total: number;
  @ApiProperty() totalPages: number;
}

export class CategoryTotalsDto {
  @ApiProperty() food: number;
  @ApiProperty() accommodation: number;
  @ApiProperty() inCityTransport: number;
  @ApiProperty({ description: 'Activity budget entries plus activity costs (ITN-10).' }) activities: number;
  @ApiProperty({ description: 'Transport cost entries (ITN-16).' }) intercityTransport: number;
}

export class DayBudgetDto {
  @ApiProperty() dayId: string;
  @ApiProperty() dayNumber: number;
  @ApiProperty() date: string;
  @ApiProperty({ type: CityRefDto }) city: CityRefDto;
  @ApiProperty({ type: CategoryTotalsDto }) byCategory: CategoryTotalsDto;
  @ApiProperty() total: number;
}

export class GroupBudgetDto {
  @ApiProperty() index: number;
  @ApiProperty({ type: CityRefDto }) city: CityRefDto;
  @ApiProperty() dayCount: number;
  @ApiProperty() subtotal: number;
}

export class BudgetSummaryDto {
  @ApiProperty({ example: 'EGP' }) currency: string;
  @ApiProperty({ description: 'Date of the exchange rates used.' }) rateDate: Date;
  @ApiProperty({ enum: ['live', 'cached'], description: "'cached' means the rate API was unavailable and the last cached rates were used." })
  rateSource: 'live' | 'cached';
  @ApiProperty({ type: CategoryTotalsDto }) byCategory: CategoryTotalsDto;
  @ApiProperty({ type: [DayBudgetDto] }) byDay: DayBudgetDto[];
  @ApiProperty({ type: [GroupBudgetDto] }) byCityGroup: GroupBudgetDto[];
  @ApiProperty() total: number;
}

export class PublicItineraryDto extends ItineraryDetailDto {
  @ApiProperty({ type: BudgetSummaryDto }) budget: BudgetSummaryDto;
}

export class SearchLinkDto {
  @ApiProperty({ example: 'GET' }) method: string;
  @ApiProperty({ example: '/api/hotels/search' }) path: string;
  @ApiProperty({ type: Object }) query: Record<string, string | number>;
}

export class ItineraryHotelSearchDto {
  @ApiProperty({ type: CityGroupDto }) group: CityGroupDto;
  @ApiProperty({ example: '2026-12-20' }) checkIn: string;
  @ApiProperty({ example: '2026-12-23', description: 'The day after the last day of the group.' }) checkOut: string;
  @ApiProperty() guests: number;
  @ApiProperty() rooms: number;
  @ApiProperty({ type: SearchLinkDto, description: 'The hotel search (HTL-11) to run with these criteria.' }) search: SearchLinkDto;
}

export class AirportRefDto {
  @ApiProperty() id: string;
  @ApiProperty() iataCode: string;
  @ApiProperty() name: string;
}

export class ItineraryFlightSearchDto {
  @ApiProperty({ type: AirportRefDto }) origin: AirportRefDto;
  @ApiProperty({ type: CityRefDto }) destinationCity: CityRefDto;
  @ApiProperty({ type: [AirportRefDto] }) destinationAirports: AirportRefDto[];
  @ApiProperty({ enum: ['one-way', 'round-trip'] }) tripType: 'one-way' | 'round-trip';
  @ApiProperty() outboundDate: string;
  @ApiProperty({ nullable: true, type: String }) returnDate: string | null;
  @ApiProperty() passengers: { adults: number; children: number; infants: number };
  @ApiProperty({ nullable: true, type: String }) cabinClass: string | null;
  @ApiProperty({ type: [SearchLinkDto], description: 'One flight search (FLT-11/12) per destination airport.' }) searches: SearchLinkDto[];
}
