import { PartialType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto.js';

// BLG-04, BLG-08: every field is optional; only the fields sent are changed.
// Sending "tags" replaces the post's whole tag list (send [] to remove all tags).
export class UpdatePostDto extends PartialType(CreatePostDto) {}
