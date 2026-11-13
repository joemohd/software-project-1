import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import { extname } from 'node:path';

export const imageUploadOptions = {
  storage: diskStorage({
    destination: './uploads',
    filename: (_request, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (
    _request: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
      callback(new BadRequestException('Only JPG and PNG images are allowed'), false);
      return;
    }

    callback(null, true);
  },
};
