import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { HotelsService } from './hotels.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { SearchHotelsDto } from './dto/search-hotels.dto.js';
import { AvailableRoomsDto } from './dto/available-rooms.dto.js';
import { ListReviewsDto } from './dto/list-reviews.dto.js';
import { ListReservationsDto } from './dto/list-reservations.dto.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/auth/roles.guard.js';
import { Roles } from '../common/auth/roles.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { JwtUser } from '../common/auth/jwt-user.interface.js';

@ApiTags('Hotels')
@Controller('hotels')
export class HotelsController {
  constructor(
    private readonly hotelsService: HotelsService,
    private readonly reviewsService: ReviewsService,
  ) {}

  // ---- public (Guest + Registered User) -----------------------------------

  @Get('search')
  @ApiOperation({ summary: 'HTL-11 / HTL-12 — search, filter and sort hotels for a stay' })
  search(@Query() dto: SearchHotelsDto) {
    return this.hotelsService.search(dto);
  }

  @Get(':id/rooms/available')
  @ApiOperation({ summary: "HTL-15 — a hotel's rooms free for the searched dates" })
  @ApiParam({ name: 'id', description: 'Hotel id' })
  availableRooms(@Param('id') id: string, @Query() dto: AvailableRoomsDto) {
    return this.hotelsService.availableRooms(id, dto);
  }

  @Get(':id/reviews')
  @ApiOperation({ summary: "HTL-24 — a hotel's rating and reviews (newest first, paginated)" })
  @ApiParam({ name: 'id', description: 'Hotel id' })
  reviews(@Param('id') id: string, @Query() dto: ListReviewsDto) {
    return this.reviewsService.listForHotel(id, dto.page, dto.limit);
  }

  // ---- hotel moderator / admin --------------------------------------------

  @Get(':id/reservations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.HOTEL_MODERATOR, Role.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: "HTL-22 — hotel moderator views their hotel's reservations" })
  @ApiParam({ name: 'id', description: 'Hotel id' })
  reservations(
    @Param('id') id: string,
    @Query() dto: ListReservationsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.hotelsService.reservationsForHotel(id, user, dto);
  }
}
