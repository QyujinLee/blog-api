import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PostService } from '../post/post.service';
import type { Comment, User } from '../../generated/prisma/client.js';

export interface CommentResponse {
  id: string;
  author: { name: string; avatarUrl: string | null };
  body: string;
  deleted: boolean;
  createdAt: Date;
}

@Injectable()
export class CommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postService: PostService,
  ) {}

  // 댓글은 항상 글 컨텍스트 안에서만 조회되니 postId는 응답에 안 실음(프론트가 이미 slug를 앎)
  async findAllForPost(
    slug: string,
    isOwner: boolean,
  ): Promise<CommentResponse[]> {
    const post = await this.postService.findBySlug(slug, isOwner); // hidden 글이면 여기서 404

    const comments = await this.prisma.comment.findMany({
      where: { postId: post.id },
      include: { author: true },
      orderBy: { createdAt: 'asc' },
    });

    return comments.map((comment) => this.toResponse(comment));
  }

  async create(
    slug: string,
    authorId: string,
    body: string,
    isOwner: boolean,
  ): Promise<CommentResponse> {
    const post = await this.postService.findBySlug(slug, isOwner); // hidden 글엔 소유자만 댓글 작성 가능

    const comment = await this.prisma.comment.create({
      data: { postId: post.id, authorId, body },
      include: { author: true },
    });

    return this.toResponse(comment);
  }

  // 본문은 DB에서 지우지 않고 deleted 플래그만 세움(모더레이션 로그/복구 목적) — 응답에서만 빈 문자열로 가림
  async softDelete(id: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      throw new NotFoundException('댓글을 찾을 수 없습니다.');
    }

    await this.prisma.comment.update({
      where: { id },
      data: { deleted: true },
    });
  }

  private toResponse(comment: Comment & { author: User }): CommentResponse {
    return {
      id: comment.id,
      author: {
        name: comment.author.name,
        avatarUrl: comment.author.avatarUrl,
      },
      body: comment.deleted ? '' : comment.body,
      deleted: comment.deleted,
      createdAt: comment.createdAt,
    };
  }
}
