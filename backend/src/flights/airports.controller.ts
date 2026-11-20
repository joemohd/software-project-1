import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { AirportsService } from './airports.service.js';
import { AirportListResponseDto } from './dto/airport-response.dto.js';
import { ListAirportsQueryDto } from './dto/list-airports.dto.js';

@ApiTags('Airports')
@Controller('airports')
export class AirportsController {
  constructor(private readonly airportsService: AirportsService) {}

  // GET /api/airports (FLT-02)
  @Public()
  @Get()
  @ApiOperation({ summary: 'List the predefined airports (read-only), 10 per page' })
  @ApiOkResponse({ type: AirportListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid page or search value' })
  list(@Query() query: ListAirportsQueryDto): Promise<AirportListResponseDto> {
    return this.airportsService.list(query);
  }
}
