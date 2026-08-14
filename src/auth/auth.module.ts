import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { OptionalJwtGuard } from './optional-jwt.guard';
import { RolesGuard } from './roles.guard';
import { OwnerSeedService } from './owner-seed.service';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRATION ?? '1h') as StringValue,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtGuard,
    OptionalJwtGuard,
    RolesGuard,
    OwnerSeedService,
  ],
  exports: [JwtGuard, OptionalJwtGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
