import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('인증 토큰이 없습니다.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user: AuthenticatedUser = {
        userId: payload.sub,
        role: payload.role,
      };
      (request as Request & { user: AuthenticatedUser }).user = user;
    } catch {
      throw new UnauthorizedException('유효하지 않거나 만료된 토큰입니다.');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
