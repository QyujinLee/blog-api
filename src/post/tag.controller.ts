import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('tags')
export class TagController {
  constructor(private readonly prisma: PrismaService) {}

  // tags가 Postgres 네이티브 배열이라 Prisma 필터로 distinct 목록을 뽑을 수 없어 raw 쿼리 사용
  @Get()
  async findAll(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ tag: string }[]>`
      SELECT DISTINCT unnest(tags) AS tag FROM "Post" WHERE hidden = false ORDER BY tag
    `;
    return rows.map((row) => row.tag);
  }
}
