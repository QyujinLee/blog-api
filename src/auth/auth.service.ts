import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../../generated/prisma/client.js';
import type { Role } from '../../generated/prisma/enums.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateOwner(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.role !== 'OWNER' || !user.passwordHash) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    return user;
  }

  signToken(userId: string, role: Role): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, role });
  }
}
