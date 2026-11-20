import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { AdminAction, AuditLog } from '../admin/schemas/audit-log.schema.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { rethrowProviderError } from '../common/providers/profile.rules.js';
import { Airline, ProviderStatus } from '../database/schemas/provider.schema.js';
import { User, UserRole } from '../database/schemas/user.schema.js';
import { AirlineProfileDto } from './dto/airline-profile.dto.js';
import { CreateAirlineDto } from './dto/create-airline.dto.js';
import { UpdateAirlineDto } from './dto/update-airline.dto.js';

type AirlineRecord = Airline & { _id: Types.ObjectId };

@Injectable()
export class AirlinesService {
  constructor(
    @InjectModel(Airline.name) private readonly airlineModel: Model<Airline>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLog>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // FLT-01, GEN-07
  async create(admin: AuthenticatedUser, dto: CreateAirlineDto): Promise<AirlineProfileDto> {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException('Administrator access is required.');
    try {
      return await this.connection.transaction(async (session) => {
        const moderatorId = new Types.ObjectId(dto.moderatorId);
        const moderator = await this.userModel.exists({ _id: moderatorId, role: UserRole.AIRLINE_MODERATOR }).session(session).exec();
        if (!moderator) throw new BadRequestException('moderatorId must refer to an airline moderator.');
        const [airline] = await this.airlineModel.create([{
          name: dto.name, iataCode: dto.iataCode, logoUrl: dto.logoUrl, moderatorId,
        }], { session });
        await this.auditModel.create([{
          adminId: new Types.ObjectId(admin.id), targetProviderId: airline._id, action: AdminAction.CREATE_AIRLINE,
        }], { session });
        return this.toProfile(airline);
      });
    } catch (error) {
      rethrowProviderError(error);
    }
  }

  // FLT-01: only active airlines have a public profile.
  async findOne(id: string): Promise<AirlineProfileDto> {
    const airline = await this.airlineModel.findOne({ _id: id, status: ProviderStatus.ACTIVE }).lean<AirlineRecord>().exec();
    if (!airline) throw new NotFoundException('Airline not found.');
    return this.toProfile(airline);
  }

  // FLT-01, ACC-11: the moderator identity always comes from @CurrentUser().
  async update(user: AuthenticatedUser, id: string, dto: UpdateAirlineDto): Promise<AirlineProfileDto> {
    if (user.role !== UserRole.AIRLINE_MODERATOR) throw new ForbiddenException('Airline moderator access is required.');
    if (Object.keys(dto).length === 0) throw new BadRequestException('Provide at least one profile field to update.');
    const fields: Partial<Airline> = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.iataCode !== undefined) fields.iataCode = dto.iataCode;
    if (dto.logoUrl !== undefined) fields.logoUrl = dto.logoUrl;
    try {
      const airline = await this.airlineModel.findOneAndUpdate(
        { _id: id, moderatorId: new Types.ObjectId(user.id) }, { $set: fields },
        { returnDocument: 'after', runValidators: true },
      ).lean<AirlineRecord>().exec();
      if (!airline) throw new NotFoundException('Airline not found or not assigned to you.');
      return this.toProfile(airline);
    } catch (error) {
      rethrowProviderError(error);
    }
  }

  private toProfile(airline: AirlineRecord): AirlineProfileDto {
    return { id: airline._id.toString(), name: airline.name, iataCode: airline.iataCode, logoUrl: airline.logoUrl };
  }
}
