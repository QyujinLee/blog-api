import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import { AuthenticatedUser } from './jwt-payload.interface';

// JwtGuard가 먼저 실행되어 request.user를 채워둔 걸 전제로 함 — 항상 JwtGuard 다음에 배치
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user: AuthenticatedUser }>();
    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('이 작업을 수행할 권한이 없습니다.');
    }

    return true;
  }
}
