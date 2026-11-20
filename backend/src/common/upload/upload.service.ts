import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { randomUUID } from 'node:crypto';

@Injectable()
export class UploadService {
  async uploadImage(file: Express.Multer.File): Promise<{ url: string }> {
    if (!this.hasAllowedImageContent(file)) {
      throw new BadRequestException('Only valid JPG and PNG image files are allowed');
    }

    if (!process.env.CLOUDINARY_URL) {
      throw new InternalServerErrorException('Cloudinary is not configured');
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'travel-booking/images',
          public_id: randomUUID(),
          resource_type: 'image',
          allowed_formats: ['jpg', 'png'],
        },
        (error, uploadResult) => {
          if (error) {
            reject(error);
          } else if (uploadResult) {
            resolve(uploadResult);
          } else {
            reject(new Error('Cloudinary returned no upload result'));
          }
        },
      );

      stream.end(file.buffer);
    }).catch(() => {
      throw new InternalServerErrorException('Image upload to Cloudinary failed');
    });

    return { url: result.secure_url };
  }

  private hasAllowedImageContent(file: Express.Multer.File): boolean {
    if (!file.buffer) return false;

    const isJpeg =
      file.mimetype === 'image/jpeg' &&
      file.buffer.length >= 3 &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff;
    const isPng =
      file.mimetype === 'image/png' &&
      file.buffer.length >= 8 &&
      file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    return isJpeg || isPng;
  }
}
