import { ConflictException } from '@nestjs/common';
import { isDuplicateKeyError } from '../../auth/auth.helper.js';

export const PROFILE_LIMITS = {
  name: 120,
  description: 2000,
  address: 300,
  images: 5,
  amenities: 50,
  amenity: 50,
  minStarClass: 1,
  maxStarClass: 5,
} as const;

export const IMAGE_URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };

export function rethrowProviderError(error: unknown): never {
  if (isDuplicateKeyError(error)) {
    throw new ConflictException(error.keyPattern?.iataCode
      ? 'This airline code is already registered.'
      : 'This moderator is already assigned to a provider.');
  }
  throw error;
}
