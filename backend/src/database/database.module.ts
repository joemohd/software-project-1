import { Module } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import {
    Activity,
    ActivityCategory,
    ActivityCategorySchema,
    ActivitySchema,
    Booking,
    BookingSchema,
    Expense,
    ExpenseSchema,
    FlightBooking,
    FlightBookingSchema,
    HotelBooking,
    HotelBookingSchema,
    Refund,
    RefundSchema,
    Transport,
    TransportSchema,
} from './schemas/expense.schema.js';
import { Airport, AirportSchema } from './schemas/airport.schema.js';
import {
    BlogPost,
    BlogPostSchema,
    PostLike,
    PostLikeSchema,
    Tag,
    TagSchema,
} from './schemas/blog-post.schema.js';
import { City, CitySchema } from './schemas/city.schema.js';
import { Comment, CommentSchema } from './schemas/comment.schema.js';
import { Country, CountrySchema } from './schemas/country.schema.js';
import { Currency, CurrencySchema } from './schemas/currency.schema.js';
import { Flight, FlightSchema } from './schemas/flight.schema.js';
import {
    ClonebaseItinerary,
    ClonebaseItinerarySchema,
    Itinerary,
    ItinerarySchema,
} from './schemas/itinerary.schema.js';
import { PasswordResetToken, PasswordResetTokenSchema } from './schemas/password-reset-token.schema.js';
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
import { TouristAttraction, TouristAttractionSchema } from './schemas/tourist-attraction.schema.js';
import { User, UserSchema } from './schemas/user.schema.js';

const mongooseConfig = (config: ConfigService) => ({
    uri: config.getOrThrow<string>('database.uri'),
});

const databaseModels = [
    { name: ActivityCategory.name, schema: ActivityCategorySchema },
    { name: Expense.name, schema: ExpenseSchema, discriminators: [
        { name: Activity.name, schema: ActivitySchema, value: 'activity' },
        { name: Transport.name, schema: TransportSchema, value: 'transport' },
        { name: Booking.name, schema: BookingSchema, value: 'booking' },
    ] },
    { name: Refund.name, schema: RefundSchema },
    { name: Airport.name, schema: AirportSchema },
    { name: BlogPost.name, schema: BlogPostSchema },
    { name: Tag.name, schema: TagSchema },
    { name: PostLike.name, schema: PostLikeSchema },
    { name: City.name, schema: CitySchema },
    { name: Comment.name, schema: CommentSchema },
    { name: Country.name, schema: CountrySchema },
    { name: Currency.name, schema: CurrencySchema },
    { name: Flight.name, schema: FlightSchema },
    { name: ClonebaseItinerary.name, schema: ClonebaseItinerarySchema },
    { name: Itinerary.name, schema: ItinerarySchema },
    { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
    { name: Provider.name, schema: ProviderSchema, discriminators: [
        { name: Airline.name, schema: AirlineSchema, value: 'airline' },
        { name: Hotel.name, schema: HotelSchema, value: 'hotel' },
    ] },
    { name: Room.name, schema: RoomSchema },
    { name: RoomType.name, schema: RoomTypeSchema },
    { name: TouristAttraction.name, schema: TouristAttractionSchema },
    { name: User.name, schema: UserSchema },
];

const bookingSubtypeModels = [
    {
        provide: getModelToken(HotelBooking.name),
        inject: [getModelToken(Booking.name)],
        useFactory: (bookingModel: any) => bookingModel.discriminator(HotelBooking.name, HotelBookingSchema, 'hotel'),
    },
    {
        provide: getModelToken(FlightBooking.name),
        inject: [getModelToken(Booking.name)],
        useFactory: (bookingModel: any) => bookingModel.discriminator(FlightBooking.name, FlightBookingSchema, 'flight'),
    },
];

@Module({
    imports: [
        MongooseModule.forRootAsync({
            inject: [ConfigService],
            useFactory: mongooseConfig,
        }),
        MongooseModule.forFeature(databaseModels),
    ],
    providers: bookingSubtypeModels,
    exports: [MongooseModule, ...bookingSubtypeModels.map(({ provide }) => provide)],
})
export class DatabaseModule {}
