import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import {
    Activity,
    ActivityCategory,
    ActivityCategorySchema,
    ActivitySchema,
    FlightBooking,
    FlightBookingSchema,
    FlightTransport,
    FlightTransportSchema,
    HotelBooking,
    HotelBookingSchema,
    Refund,
    RefundSchema,
    Transport,
    TransportSchema,
} from './schemas/expense.schema.js';
import { Airport, AirportSchema } from './schemas/airport.schema.js';
import { BlogPost, BlogPostSchema } from './schemas/blog-post.schema.js';
import { City, CitySchema } from './schemas/city.schema.js';
import { Comment, CommentSchema, Reply, ReplySchema } from './schemas/comment.schema.js';
import { Country, CountrySchema } from './schemas/country.schema.js';
import { Flight, FlightSchema } from './schemas/flight.schema.js';
import {
    ClonebaseItinerary,
    ClonebaseItinerarySchema,
    Itinerary,
    ItinerarySchema,
} from './schemas/itinerary.schema.js';
import { PasswordResetToken, PasswordResetTokenSchema } from './schemas/password-reset-token.schema.js';
import { PostComment, PostCommentSchema } from './schemas/post-comment.schema.js';
import { PostLike, PostLikeSchema } from './schemas/post-like.schema.js';
import {
    Airline,
    AirlineSchema,
    Hotel,
    HotelSchema,
    Provider,
    ProviderSchema,
    Room,
    RoomSchema,
    RoomType,
    RoomTypeSchema,
} from './schemas/provider.schema.js';
import { Tag, TagSchema } from './schemas/tag.schema.js';
import { TouristAttraction, TouristAttractionSchema } from './schemas/tourist-attraction.schema.js';
import {
    Moderator,
    ModeratorSchema,
    User,
    UserSchema,
} from './schemas/user.schema.js';

const mongooseConfig = (config: ConfigService) => ({
    uri: config.getOrThrow<string>('database.uri'),
});

const databaseModels = [
    { name: ActivityCategory.name, schema: ActivityCategorySchema },
    { name: Activity.name, schema: ActivitySchema },
    { name: Transport.name, schema: TransportSchema },
    { name: FlightTransport.name, schema: FlightTransportSchema },
    { name: Refund.name, schema: RefundSchema },
    { name: HotelBooking.name, schema: HotelBookingSchema },
    { name: FlightBooking.name, schema: FlightBookingSchema },
    { name: Airport.name, schema: AirportSchema },
    { name: BlogPost.name, schema: BlogPostSchema },
    { name: City.name, schema: CitySchema },
    { name: Comment.name, schema: CommentSchema },
    { name: Reply.name, schema: ReplySchema },
    { name: Country.name, schema: CountrySchema },
    { name: Flight.name, schema: FlightSchema },
    { name: ClonebaseItinerary.name, schema: ClonebaseItinerarySchema },
    { name: Itinerary.name, schema: ItinerarySchema },
    { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
    { name: PostComment.name, schema: PostCommentSchema },
    { name: PostLike.name, schema: PostLikeSchema },
    { name: Provider.name, schema: ProviderSchema },
    { name: Airline.name, schema: AirlineSchema },
    { name: Hotel.name, schema: HotelSchema },
    { name: Room.name, schema: RoomSchema },
    { name: RoomType.name, schema: RoomTypeSchema },
    { name: Tag.name, schema: TagSchema },
    { name: TouristAttraction.name, schema: TouristAttractionSchema },
    { name: Moderator.name, schema: ModeratorSchema },
    { name: User.name, schema: UserSchema },
];

@Module({
    imports: [
        MongooseModule.forRootAsync({
            inject: [ConfigService],
            useFactory: mongooseConfig,
        }),
        MongooseModule.forFeature(databaseModels),
    ],
    exports: [MongooseModule],
})
export class DatabaseModule {}
