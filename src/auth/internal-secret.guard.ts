import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

// Next.js BFF만 아는 공유 시크릿 — /auth/google은 "이 이메일로 로그인시켜줘"를 그냥 믿어주는
// 구조라, 이 헤더 없이는 아무나 임의의 이메일로 로그인/가입시킬 수 있어서 반드시 필요
@Injectable()
export class InternalSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret = request.headers['x-internal-secret'];

    if (
      !process.env.INTERNAL_SECRET ||
      secret !== process.env.INTERNAL_SECRET
    ) {
      throw new UnauthorizedException('내부 시크릿이 유효하지 않습니다.');
    }

    return true;
  }
}
