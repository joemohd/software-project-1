import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum PostStatus {
    PUBLISHED = 'published',
    DRAFT = 'draft'
}

export class BlogPost {
    title: string;
    body: string;
    tags: Types.ObjectId[];
    imageUrls: string[];
    status: PostStatus;
    itinerary: Types.ObjectId;
}