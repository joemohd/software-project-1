import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

export const imageUploadOptions = {
  storage: memoryStorage(),
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
