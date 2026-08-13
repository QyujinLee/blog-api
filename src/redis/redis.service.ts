import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client = new Redis(process.env.REDIS_URL!);

  // 조회수/좋아요 중복방지용 — "SET key 1 EX ttl NX" 한 번으로 원자적 판정.
  // 처음이면 true(기록 성공), 이미 있으면 false.
  async checkOnce(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async getCount(key: string): Promise<number> {
    const value = await this.client.get(key);
    return value ? Number(value) : 0;
  }

  // 로그인 실패 횟수 카운트용 — 첫 증가 때만 TTL을 걸어 창(window)을 만듦
  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return count;
  }

  async reset(key: string): Promise<void> {
    await this.client.del(key);
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
