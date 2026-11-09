import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

const mongooseConfig = (config: ConfigService) => ({ uri: config.getOrThrow<string>('database.uri') });

@Module({
    imports: [
        MongooseModule.forRootAsync({
            inject: [ConfigService],
            useFactory: mongooseConfig,
        })
    ]
})
export class DatabaseModule { }
