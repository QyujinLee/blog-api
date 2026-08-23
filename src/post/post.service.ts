import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidateService } from '../revalidate/revalidate.service';
import { RedisService } from '../redis/redis.service';
import { slugify } from '../common/slugify';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PatchPostDto } from './dto/patch-post.dto';
import type { Post } from '../../generated/prisma/client.js';

export interface FindAllQuery {
  category?: string;
  tags?: string[];
  series?: string;
}

export interface SearchQuery {
  q: string;
  sort?: string;
  category?: string;
  tags?: string[];
}

const ONE_DAY_SECONDS = 24 * 60 * 60;

// Redis 키/DailyVisit 둘 다 "yyyy-MM-dd" 하루 단위로 맞춤 — UTC 기준(서버 로컬 타임존에 안 흔들리게)
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class PostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revalidate: RevalidateService,
    private readonly redis: RedisService,
  ) {}

  async findAll(isOwner: boolean, query: FindAllQuery): Promise<Post[]> {
    return this.prisma.post.findMany({
      where: {
        hidden: isOwner ? undefined : false,
        categorySlug: query.category,
        seriesSlug: query.series,
        tags: query.tags?.length ? { hasEvery: query.tags } : undefined,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findBySlug(slug: string, isOwner: boolean): Promise<Post> {
    const post = await this.prisma.post.findUnique({ where: { slug } });

    if (!post || (post.hidden && !isOwner)) {
      throw new NotFoundException('글을 찾을 수 없습니다.');
    }

    return post;
  }

  // 한글은 to_tsvector가 어절 단위로만 토큰화돼 부분검색이 안 되고(예: "인증과" 안에서 "인증" 검색 실패),
  // pg_trgm 유사도도 짧은 검색어 대비 긴 제목에선 기본 임계값을 못 넘어 매칭이 안 됨(둘 다 실제 Neon으로 확인).
  // 그래서 ILIKE 부분문자열 매칭 + title(3) > tags(2) > body(1) 수동 가중치 정렬로 구현
  async search(isOwner: boolean, query: SearchQuery): Promise<Post[]> {
    const category = query.category ?? null;
    const tags = query.tags?.length ? query.tags : null;

    if (query.sort === 'latest') {
      return this.prisma.$queryRaw<Post[]>`
        SELECT * FROM "Post"
        WHERE (hidden = false OR ${isOwner})
          AND (title ILIKE '%' || ${query.q} || '%'
            OR ${query.q} = ANY(tags)
            OR body ILIKE '%' || ${query.q} || '%')
          AND (${category}::text IS NULL OR "categorySlug" = ${category})
          AND (${tags}::text[] IS NULL OR tags @> ${tags}::text[])
        ORDER BY "createdAt" DESC
      `;
    }

    return this.prisma.$queryRaw<Post[]>`
      SELECT * FROM "Post"
      WHERE (hidden = false OR ${isOwner})
        AND (title ILIKE '%' || ${query.q} || '%'
          OR ${query.q} = ANY(tags)
          OR body ILIKE '%' || ${query.q} || '%')
        AND (${category}::text IS NULL OR "categorySlug" = ${category})
        AND (${tags}::text[] IS NULL OR tags @> ${tags}::text[])
      ORDER BY
        CASE
          WHEN title ILIKE '%' || ${query.q} || '%' THEN 3
          WHEN ${query.q} = ANY(tags) THEN 2
          WHEN body ILIKE '%' || ${query.q} || '%' THEN 1
          ELSE 0
        END DESC,
        "createdAt" DESC
    `;
  }

  // 하루 1회(IP+날짜) 통과한 요청만 viewCount 증가 + DailyVisit 오늘 행 +1(홈 트래픽 그래프용)
  async recordView(slug: string, ip: string): Promise<number> {
    const post = await this.findBySlug(slug, false);
    const isFirstToday = await this.redis.checkOnce(
      `view:${slug}:${ip}:${todayDateString()}`,
      ONE_DAY_SECONDS,
    );

    if (!isFirstToday) {
      return post.viewCount;
    }

    const today = new Date(`${todayDateString()}T00:00:00.000Z`);
    const [updated] = await this.prisma.$transaction([
      this.prisma.post.update({
        where: { slug },
        data: { viewCount: { increment: 1 } },
      }),
      this.prisma.dailyVisit.upsert({
        where: { date: today },
        update: { count: { increment: 1 } },
        create: { date: today, count: 1 },
      }),
    ]);

    return updated.viewCount;
  }

  // 좋아요는 view와 동일한 하루 1회(IP+날짜) 중복방지 패턴, DailyVisit엔 안 남김(글 조회 추이용이라 별개)
  async recordLike(slug: string, ip: string): Promise<number> {
    const post = await this.findBySlug(slug, false);
    const isFirstToday = await this.redis.checkOnce(
      `like:${slug}:${ip}:${todayDateString()}`,
      ONE_DAY_SECONDS,
    );

    if (!isFirstToday) {
      return post.likeCount;
    }

    const updated = await this.prisma.post.update({
      where: { slug },
      data: { likeCount: { increment: 1 } },
    });

    return updated.likeCount;
  }

  async create(dto: CreatePostDto): Promise<Post> {
    const slug = await this.generateUniqueSlug(slugify(dto.title));
    const categorySlug = await this.upsertCategory(dto.category);
    const series = await this.resolveSeries(dto.seriesTitle);

    const post = await this.prisma.post.create({
      data: {
        slug,
        title: dto.title,
        summary: dto.summary,
        body: dto.body,
        categorySlug,
        tags: dto.tags,
        ...series,
      },
    });

    await this.revalidate.notifyChanged();
    return post;
  }

  async update(slug: string, dto: UpdatePostDto): Promise<Post> {
    // 존재 확인 + 이미 속한 시리즈 파악(숨김 글도 소유자 관점으로 수정 가능해야 하므로 isOwner: true)
    const existing = await this.findBySlug(slug, true);

    const categorySlug = await this.upsertCategory(dto.category);
    const series = await this.resolveSeries(dto.seriesTitle, existing);

    const post = await this.prisma.post.update({
      where: { slug },
      data: {
        title: dto.title,
        summary: dto.summary,
        body: dto.body,
        categorySlug,
        tags: dto.tags,
        ...series,
      },
    });

    await this.revalidate.notifyChanged();
    return post;
  }

  async patch(slug: string, dto: PatchPostDto): Promise<Post> {
    await this.findBySlug(slug, true);

    const post = await this.prisma.post.update({
      where: { slug },
      data: { hidden: dto.hidden, pinned: dto.pinned },
    });

    await this.revalidate.notifyChanged();
    return post;
  }

  async remove(slug: string): Promise<void> {
    await this.findBySlug(slug, true);
    await this.prisma.post.delete({ where: { slug } });
    await this.revalidate.notifyChanged();
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let suffix = 2;

    while (await this.prisma.post.findUnique({ where: { slug: candidate } })) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  // 카테고리는 자유 생성 — label로 slug를 만들어 upsert하고, 그 slug를 반환
  private async upsertCategory(label: string): Promise<string> {
    const slug = slugify(label);
    await this.prisma.category.upsert({
      where: { slug },
      update: {},
      create: { slug, label },
    });
    return slug;
  }

  // seriesTitle이 없으면 시리즈에서 뺌(null), 있으면 같은 이름은 항상 같은 seriesSlug로 묶이고
  // order는 그 시리즈의 기존 최대값 + 1로 서버가 계산(클라이언트는 순서를 모름).
  // 이미 같은 시리즈에 속한 글을 수정하는 거면(제목 오타 수정 등) order를 그대로 유지 —
  // 안 그러면 아무 필드나 고칠 때마다 시리즈 맨 뒤로 밀려남
  private async resolveSeries(
    seriesTitle: string | undefined,
    currentPost?: Post | null,
  ) {
    if (!seriesTitle) {
      return { seriesSlug: null, seriesTitle: null, seriesOrder: null };
    }

    const seriesSlug = slugify(seriesTitle);

    if (currentPost?.seriesSlug === seriesSlug) {
      return { seriesSlug, seriesTitle, seriesOrder: currentPost.seriesOrder };
    }

    const last = await this.prisma.post.findFirst({
      where: { seriesSlug },
      orderBy: { seriesOrder: 'desc' },
    });

    return {
      seriesSlug,
      seriesTitle,
      seriesOrder: (last?.seriesOrder ?? 0) + 1,
    };
  }
}
