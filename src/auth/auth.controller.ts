import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtGuard } from './jwt.guard';
import { AuthenticatedUser } from './jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<{ token: string }> {
    const token = await this.authService.login(
      dto.email,
      dto.password,
      request.ip ?? 'unknown',
    );
    return { token };
  }

  @Get('me')
  @UseGuards(JwtGuard)
  async me(@Req() request: Request & { user: AuthenticatedUser }) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: request.user.userId },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }
}
