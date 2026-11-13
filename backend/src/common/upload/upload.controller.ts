import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { imageUploadOptions } from './image-upload.options.js';

@ApiTags('Upload')
@Controller('api/upload')
export class UploadController {
  @Post('image')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
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
  upload(@UploadedFile() file: Express.Multer.File): { url: string } {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
    return { url: `${baseUrl}/uploads/${file.filename}` };
  }
}
