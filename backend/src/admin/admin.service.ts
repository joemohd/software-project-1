import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { clearedLoginAttempts, hashPassword } from '../auth/auth.helper.js';
import type { AuthenticatedUser, UserRecord } from '../auth/auth.types.js';
import { MessageResponseDto } from '../auth/dto/auth-response.dto.js';
import { RefreshToken } from '../auth/schemas/refresh-token.schema.js';
import { PasswordResetToken } from '../database/schemas/password-reset-token.schema.js';
import { User, UserRole } from '../database/schemas/user.schema.js';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto.js';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(PasswordResetToken.name) private readonly passwordResetTokenModel: Model<PasswordResetToken>,
    @InjectModel(RefreshToken.name) private readonly refreshTokenModel: Model<RefreshToken>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // ACC-07a
  async resetUserPassword(admin: AuthenticatedUser, userId: string, dto: ResetUserPasswordDto): Promise<MessageResponseDto> {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException('Administrator access is required.');
    const passwordHash = await hashPassword(dto.temporaryPassword);

    return this.connection.transaction(async (session) => {
      const target = await this.userModel.findById(userId).session(session).lean<UserRecord>().exec();
      if (!target) throw new NotFoundException('Account not found.');
      if (target.role === UserRole.ADMIN) throw new ForbiddenException('Only user and moderator passwords can be reset.');

      await this.userModel.updateOne({ _id: target._id }, {
        $set: { passwordHash, mustChangePassword: true, ...clearedLoginAttempts() },
        $inc: { sessionVersion: 1 },
      }, { session }).exec();
      await this.refreshTokenModel.deleteMany({ userId: target._id }, { session }).exec();
      await this.passwordResetTokenModel.deleteMany({ userId: target._id }, { session }).exec();
      return { message: 'Temporary password set. The account must choose a new password at its next login.' };
    });
  }
}
