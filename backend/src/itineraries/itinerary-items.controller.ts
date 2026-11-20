import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { imageUploadOptions } from '../common/upload/image-upload.options.js';
import { UpdateActivityDto } from './dto/activity.dto.js';
import { UpdateBudgetDto } from './dto/budget.dto.js';
import { ItineraryDetailDto } from './dto/itinerary-response.dto.js';
import { UpdateTransportCostDto } from './dto/transport-cost.dto.js';
import { ItinerariesService } from './itineraries.service.js';
import { TravelerOnly } from './itinerary.decorators.js';

// Flat routes for parts of an itinerary. Each one finds the parent itinerary owned by the
// current user, so another user's activity / entry answers 404 (ACC-11).

@ApiTags('Itineraries')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  // PATCH /api/activities/:id (ITN-10)
  @Patch(':id')
  @TravelerOnly()
  @ApiOperation({ summary: 'Edit an activity (ITN-10)' })
  @ApiParam({ name: 'id', description: 'Activity id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Validation failed (cost needs a currency).' })
  @ApiNotFoundResponse({ description: 'Activity not found or not yours.' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') activityId: string,
    @Body() dto: UpdateActivityDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.updateActivity(userId, activityId, dto);
  }

  // DELETE /api/activities/:id (ITN-10)
  @Delete(':id')
  @TravelerOnly()
  @ApiOperation({ summary: 'Delete an activity (ITN-10)' })
  @ApiParam({ name: 'id', description: 'Activity id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiNotFoundResponse({ description: 'Activity not found or not yours.' })
  remove(@CurrentUser('id') userId: string, @Param('id') activityId: string): Promise<ItineraryDetailDto> {
    return this.itinerariesService.deleteActivity(userId, activityId);
  }

  // POST /api/activities/:id/images (ITN-12, GEN-08)
  @Post(':id/images')
  @TravelerOnly()
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  @ApiOperation({ summary: 'Attach an image to an activity: JPG/PNG, max 5 MB, max 5 per activity (ITN-12, GEN-08)' })
  @ApiParam({ name: 'id', description: 'Activity id' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Missing file, not JPG/PNG, over 5 MB, or already 5 images.' })
  @ApiNotFoundResponse({ description: 'Activity not found or not yours.' })
  addImage(
    @CurrentUser('id') userId: string,
    @Param('id') activityId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ItineraryDetailDto> {
    if (!file) throw new BadRequestException('Image file is required.');
    return this.itinerariesService.addActivityImage(userId, activityId, file);
  }

  // DELETE /api/activities/:id/images/:imageId (ITN-12)
  @Delete(':id/images/:imageId')
  @TravelerOnly()
  @ApiOperation({ summary: 'Remove an image from an activity (ITN-12)' })
  @ApiParam({ name: 'id', description: 'Activity id' })
  @ApiParam({ name: 'imageId', description: 'Image id (images[].id in the itinerary details)' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiNotFoundResponse({ description: 'Activity or image not found.' })
  removeImage(
    @CurrentUser('id') userId: string,
    @Param('id') activityId: string,
    @Param('imageId') imageId: string,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.deleteActivityImage(userId, activityId, imageId);
  }
}

@ApiTags('Itineraries')
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  // PATCH /api/budgets/:id (ITN-14)
  @Patch(':id')
  @TravelerOnly()
  @ApiOperation({ summary: 'Edit a budget entry (ITN-14)' })
  @ApiParam({ name: 'id', description: 'Budget entry id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Validation failed or unsupported currency.' })
  @ApiNotFoundResponse({ description: 'Budget entry not found or not yours.' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') budgetId: string,
    @Body() dto: UpdateBudgetDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.updateBudget(userId, budgetId, dto);
  }

  // DELETE /api/budgets/:id (ITN-14)
  @Delete(':id')
  @TravelerOnly()
  @ApiOperation({ summary: 'Delete a budget entry (ITN-14)' })
  @ApiParam({ name: 'id', description: 'Budget entry id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiNotFoundResponse({ description: 'Budget entry not found or not yours.' })
  remove(@CurrentUser('id') userId: string, @Param('id') budgetId: string): Promise<ItineraryDetailDto> {
    return this.itinerariesService.deleteBudget(userId, budgetId);
  }
}

@ApiTags('Itineraries')
@Controller('transport-costs')
export class TransportCostsController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  // PATCH /api/transport-costs/:id (ITN-16)
  @Patch(':id')
  @TravelerOnly()
  @ApiOperation({ summary: 'Edit a transport cost (ITN-16)' })
  @ApiParam({ name: 'id', description: 'Transport cost id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Validation failed, unknown city or unsupported currency.' })
  @ApiNotFoundResponse({ description: 'Transport cost or day not found, or not yours.' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') transportId: string,
    @Body() dto: UpdateTransportCostDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.updateTransportCost(userId, transportId, dto);
  }

  // DELETE /api/transport-costs/:id (ITN-16)
  @Delete(':id')
  @TravelerOnly()
  @ApiOperation({ summary: 'Delete a transport cost (ITN-16)' })
  @ApiParam({ name: 'id', description: 'Transport cost id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiNotFoundResponse({ description: 'Transport cost not found or not yours.' })
  remove(@CurrentUser('id') userId: string, @Param('id') transportId: string): Promise<ItineraryDetailDto> {
    return this.itinerariesService.deleteTransportCost(userId, transportId);
  }
}
