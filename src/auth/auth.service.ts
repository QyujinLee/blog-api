import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import type { User } from '../../generated/prisma/client.js';
import type { Role } from '../../generated/prisma/enums.js';

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_TTL_SECONDS = 15 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
  ) {}

  // IP별 실패 횟수를 먼저 확인해 초과 시 429(비밀번호 검증은 bcrypt 비용이 있어 그 전에 차단),
  // 실패하면 카운트 증가, 성공하면 카운트 리셋(정상 로그인 후 이전 실패 이력에 발목 안 잡히게)
  async login(email: string, password: string, ip: string): Promise<string> {
    const attemptKey = `login-attempt:${ip}`;
    const attempts = await this.redis.getCount(attemptKey);

    if (attempts >= LOGIN_ATTEMPT_LIMIT) {
      throw new HttpException(
        '로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const user = await this.validateOwner(email, password);
      await this.redis.reset(attemptKey);
      return this.signToken(user.id, user.role);
    } catch (error) {
      await this.redis.incrementWithTtl(attemptKey, LOGIN_ATTEMPT_TTL_SECONDS);
      throw error;
    }
  }

  // googleId로 기존 방문자를 찾아 로그인시키거나, 처음이면 VISITOR로 새로 만듦.
  // 프로필(name/avatarUrl/email)은 매번 최신 Google 프로필로 갱신
  async loginWithGoogle(dto: GoogleLoginDto): Promise<string> {
    const user = await this.prisma.user.upsert({
      where: { googleId: dto.googleId },
      update: { name: dto.name, avatarUrl: dto.avatarUrl, email: dto.email },
      create: {
        email: dto.email,
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        googleId: dto.googleId,
        role: 'VISITOR',
      },
    });

    return this.signToken(user.id, user.role);
  }

  private async validateOwner(email: string, password: string): Promise<User> {
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
