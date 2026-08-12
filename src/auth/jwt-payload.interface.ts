import { Role } from '../../generated/prisma/enums.js';

export interface JwtPayload {
  sub: string; // userId
  role: Role;
}

// JwtGuard가 request에 주입하는 값 — 컨트롤러/RolesGuard에서 request.user로 접근
export interface AuthenticatedUser {
  userId: string;
  role: Role;
}
