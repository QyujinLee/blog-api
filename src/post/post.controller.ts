import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PatchPostDto } from './dto/patch-post.dto';
import { JwtGuard } from '../auth/jwt.guard';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthenticatedUser } from '../auth/jwt-payload.interface';

type RequestWithOptionalUser = Request & { user?: AuthenticatedUser };

@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get()
  @UseGuards(OptionalJwtGuard)
  findAll(
    @Req() request: RequestWithOptionalUser,
    @Query('category') category?: string,
    @Query('tags') tags?: string,
    @Query('series') series?: string,
  ) {
    return this.postService.findAll(request.user?.role === 'OWNER', {
      category,
      tags: tags ? tags.split(',').filter(Boolean) : undefined,
      series,
    });
  }

  // ":slug"보다 먼저 선언해야 함 — 안 그러면 "search"가 slug 파라미터로 잡혀버림
  @Get('search')
  @UseGuards(OptionalJwtGuard)
  search(
    @Req() request: RequestWithOptionalUser,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('category') category?: string,
    @Query('tags') tags?: string,
  ) {
    if (!q?.trim()) {
      throw new BadRequestException('검색어(q)는 필수입니다.');
    }

    return this.postService.search(request.user?.role === 'OWNER', {
      q: q.trim(),
      sort,
      category,
      tags: tags ? tags.split(',').filter(Boolean) : undefined,
    });
  }

  @Post(':slug/view')
  @HttpCode(HttpStatus.OK)
  async view(
    @Param('slug') slug: string,
    @Req() request: Request,
  ): Promise<{ viewCount: number }> {
    const viewCount = await this.postService.recordView(
      slug,
      request.ip ?? 'unknown',
    );
    return { viewCount };
  }

  @Post(':slug/like')
  @HttpCode(HttpStatus.OK)
  async like(
    @Param('slug') slug: string,
    @Req() request: Request,
  ): Promise<{ likeCount: number }> {
    const likeCount = await this.postService.recordLike(
      slug,
      request.ip ?? 'unknown',
    );
    return { likeCount };
  }

  @Get(':slug')
  @UseGuards(OptionalJwtGuard)
  findOne(
    @Param('slug') slug: string,
    @Req() request: RequestWithOptionalUser,
  ) {
    return this.postService.findBySlug(slug, request.user?.role === 'OWNER');
  }

  @Post()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('OWNER')
  create(@Body() dto: CreatePostDto) {
    return this.postService.create(dto);
  }

  @Put(':slug')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('OWNER')
  update(@Param('slug') slug: string, @Body() dto: UpdatePostDto) {
    return this.postService.update(slug, dto);
  }

  @Patch(':slug')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('OWNER')
  patch(@Param('slug') slug: string, @Body() dto: PatchPostDto) {
    return this.postService.patch(slug, dto);
  }

  @Delete(':slug')
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('slug') slug: string) {
    await this.postService.remove(slug);
  }
}
