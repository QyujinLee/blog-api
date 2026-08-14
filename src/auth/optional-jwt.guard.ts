import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';
import { extractBearerToken } from './extract-bearer-token';

// 공개 엔드포인트인데 OWNER가 요청하면 다르게 동작해야 할 때 씀(예: GET /posts에서
// hidden 글 포함 여부). 토큰이 없거나 유효하지 않아도 막지 않고 그냥 request.user를
// 안 채운 채로 통과시킴 — JwtGuard와 달리 절대 예외를 던지지 않음.
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
        const user: AuthenticatedUser = {
          userId: payload.sub,
          role: payload.role,
        };
        (request as Request & { user?: AuthenticatedUser }).user = user;
      } catch {
        // 유효하지 않은 토큰이어도 공개 엔드포인트라 그냥 익명 취급하고 통과
      }
    }

    return true;
  }
}
