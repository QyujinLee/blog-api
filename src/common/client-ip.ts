import type { Request } from 'express';

// 요청은 브라우저가 아니라 Next.js BFF(Vercel)가 대신 보낸다 — 그래서 req.ip는 항상
// Vercel 함수 IP 하나로 고정되고, IP 기준 로직(조회수 중복 제거, 로그인 시도 제한)이
// 전부 전역 버킷으로 뭉개진다. BFF가 진짜 방문자 IP를 x-client-ip로 실어보내되,
// 아무나 위조할 수 없도록 /auth/google과 같은 INTERNAL_SECRET을 함께 요구한다.
// (BFF를 안 거치고 이 API를 직접 때리는 경우엔 기존대로 req.ip를 그대로 씀)
export function clientIp(request: Request): string {
  const secret = request.headers['x-internal-secret'];
  const forwarded = request.headers['x-client-ip'];

  if (
    process.env.INTERNAL_SECRET &&
    secret === process.env.INTERNAL_SECRET &&
    typeof forwarded === 'string' &&
    forwarded.length > 0
  ) {
    return forwarded;
  }

  return request.ip ?? 'unknown';
}
