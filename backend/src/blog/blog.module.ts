import { Module } from '@nestjs/common';
import { UploadModule } from '../common/upload/upload.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AuthorsController } from './authors.controller.js';
import { BlogController } from './blog.controller.js';
import { BlogService } from './blog.service.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { LikesService } from './likes.service.js';
import { PublicBlogService } from './public-blog.service.js';
import { TagsController } from './tags.controller.js';

// Blog and community: BLG-01 to BLG-10, BLG-12, BLG-13
@Module({
  imports: [DatabaseModule, UploadModule],
  controllers: [
    BlogController,
    CommentsController,
    TagsController,
    AuthorsController,
  ],
  providers: [BlogService, PublicBlogService, CommentsService, LikesService],
})
export class BlogModule {}
