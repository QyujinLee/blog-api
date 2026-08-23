import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PopularPost {
  slug: string;
  title: string;
  viewCount: number;
}

export interface DailyVisitPoint {
  date: Date;
  count: number;
}

const DEFAULT_POPULAR_LIMIT = 5;
const MAX_POPULAR_LIMIT = 50;
const DEFAULT_VISIT_DAYS = 30;
const MAX_VISIT_DAYS = 90;

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async popularPosts(limit?: number): Promise<PopularPost[]> {
    const take = clamp(limit ?? DEFAULT_POPULAR_LIMIT, 1, MAX_POPULAR_LIMIT);

    return this.prisma.post.findMany({
      where: { hidden: false },
      orderBy: { viewCount: 'desc' },
      take,
      select: { slug: true, title: true, viewCount: true },
    });
  }

  // 트래픽 없는 날도 0으로 채워야 프론트 그래프에 빈 구간이 안 생김 — generate_series로 날짜 뼈대를 만들고 LEFT JOIN
  async visits(days?: number): Promise<DailyVisitPoint[]> {
    const rangeDays = clamp(days ?? DEFAULT_VISIT_DAYS, 1, MAX_VISIT_DAYS);

    return this.prisma.$queryRaw<DailyVisitPoint[]>`
      SELECT gs.date::date AS date, COALESCE(dv.count, 0) AS count
      FROM generate_series(
        CURRENT_DATE - (${rangeDays}::int - 1),
        CURRENT_DATE,
        '1 day'
      ) AS gs(date)
      LEFT JOIN "DailyVisit" dv ON dv.date = gs.date
      ORDER BY gs.date ASC
    `;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
