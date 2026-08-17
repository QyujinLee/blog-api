import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';

type RequestWithOptionalUser = Request & { user?: AuthenticatedUser };
type RequestWithUser = Request & { user: AuthenticatedUser };

@Controller()
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Get('posts/:slug/comments')
  @UseGuards(OptionalJwtGuard)
  findAll(
    @Param('slug') slug: string,
    @Req() request: RequestWithOptionalUser,
  ) {
    return this.commentService.findAllForPost(
      slug,
      request.user?.role === 'OWNER',
    );
  }

  @Post('posts/:slug/comments')
  @UseGuards(JwtGuard) // VISITOR/OWNER 둘 다 가능 — role 조건 없음
  create(
    @Param('slug') slug: string,
    @Body() dto: CreateCommentDto,
    @Req() request: RequestWithUser,
  ) {
    return this.commentService.create(
      slug,
      request.user.userId,
      dto.body,
      request.user.role === 'OWNER',
    );
  }

  @Delete('comments/:id')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.commentService.softDelete(id);
  }
}
