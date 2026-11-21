import { BadRequestException, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageUploadOptions } from './image-upload.options.js';
import { UploadService } from './upload.service.js';

export class UploadImageResponseDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/travel-booking/images/sample.jpg',
    description: 'Uploaded JPG/PNG image URL stored on the server and served by URL (GEN-08).',
  })
  url: string;
}

@ApiTags('Upload')
@ApiCookieAuth()
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) { }

  @Post('image')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  @ApiOperation({
    summary: 'Upload a JPG or PNG image (max 5 MB) and get its URL (GEN-08, FLT-01, HTL-01)',
    description:
      'Shared image upload endpoint accepting a single JPG or PNG file up to 5 MB and returning its hosted URL for airline logos, hotel photos, blog posts, or itinerary activities.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: UploadImageResponseDto })
  @ApiBadRequestResponse({ description: 'Missing file, invalid image format (only JPG/PNG allowed), or file exceeds 5 MB' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  upload(@UploadedFile() file: Express.Multer.File): Promise<UploadImageResponseDto> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    return this.uploadService.uploadImage(file);
  }
}
