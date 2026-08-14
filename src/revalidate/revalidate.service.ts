import { Injectable, Logger } from '@nestjs/common';

// 글 CRUD(등록/수정/삭제/숨김/고정) 성공 직후에만 호출 — 트랜잭션 밖, 실패해도 삼킴(로그만)
@Injectable()
export class RevalidateService {
  private readonly logger = new Logger(RevalidateService.name);

  async notifyChanged(): Promise<void> {
    const url = process.env.REVALIDATE_WEBHOOK_URL;
    const secret = process.env.REVALIDATE_SECRET;

    if (!url || !secret) {
      this.logger.warn(
        'REVALIDATE_WEBHOOK_URL/REVALIDATE_SECRET이 설정되지 않아 재검증 웹훅을 건너뜁니다.',
      );
      return;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'x-revalidate-secret': secret },
      });
      if (!response.ok) {
        this.logger.warn(
          `revalidate webhook responded with ${response.status}`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `revalidate webhook failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
