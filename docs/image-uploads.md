# Image uploads for API endpoints

The shared upload feature accepts one image per request. `POST /api/upload/image` takes a `multipart/form-data` field named `file` and returns `{ "url": "<Cloudinary secure URL>" }`. Only files whose declared type and file signature both match JPG/PNG are accepted, up to 5 MB. Files are sent to Cloudinary under `travel-booking/images`; Cloudinary stores and serves them by URL.

## Use uploads from an entity endpoint

Import `UploadModule` in the feature module, then inject its exported `UploadService` into the feature service (or controller if the endpoint is a thin wrapper). For a route that accepts an image, use the same interceptor options and call the shared service:

```ts
@Module({ imports: [UploadModule], ... })
export class BlogModule {}

@Post(':id/image')
@UseInterceptors(FileInterceptor('file', imageUploadOptions))
async addImage(
  @Param('id') id: string,
  @UploadedFile() file: Express.Multer.File,
) {
  if (!file) throw new BadRequestException('Image file is required');

  const { url } = await this.uploadService.uploadImage(file);
  return this.blogService.addImage(id, url);
}
```

Add the normal authorization and ownership checks to the entity endpoint, then enforce its image-count rule before saving the returned URL in the entity (at most five images for a post/activity/hotel and one logo for an airline). The blog post and hotel schema arrays already validate the five-image cap; an activity image field and its endpoint are not implemented yet. The current generic upload endpoint is not entity-aware, so feature endpoints must enforce authorization and count rules before attaching URLs. Do not duplicate Cloudinary calls or file validation in feature modules. `UploadService.uploadImage(file)` is the shared entry point; `imageUploadOptions` applies the common memory storage, MIME filter, and 5 MB limit, and the service verifies the file signature before upload.

Configure `CLOUDINARY_URL` in the backend `.env` and deployment secret store. The example value format is in `backend/.env.example`. Never commit the real connection string. The existing generic endpoint can also be used first to upload an image and then send its returned URL to an entity endpoint.
