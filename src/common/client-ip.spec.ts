import type { Request } from 'express';
import { clientIp } from './client-ip';

function req(
  headers: Record<string, string>,
  ip: string | undefined = '10.0.0.1',
): Request {
  return { headers, ip } as unknown as Request;
}

describe('clientIp', () => {
  const original = process.env.INTERNAL_SECRET;
  beforeAll(() => {
    process.env.INTERNAL_SECRET = 'secret';
  });
  afterAll(() => {
    process.env.INTERNAL_SECRET = original;
  });

  it('시크릿이 맞으면 BFF가 넘긴 방문자 IP를 쓴다', () => {
    expect(
      clientIp(
        req({ 'x-internal-secret': 'secret', 'x-client-ip': '1.2.3.4' }),
      ),
    ).toBe('1.2.3.4');
  });

  // 여기가 핵심 — 시크릿 없이 헤더만 위조하면 IP 스푸핑으로 조회수/로그인 제한을 우회할 수 있다
  it('시크릿이 없거나 틀리면 위조된 헤더를 무시하고 req.ip로 떨어진다', () => {
    expect(clientIp(req({ 'x-client-ip': '1.2.3.4' }))).toBe('10.0.0.1');
    expect(
      clientIp(req({ 'x-internal-secret': 'wrong', 'x-client-ip': '1.2.3.4' })),
    ).toBe('10.0.0.1');
  });

  it('헤더가 없으면 req.ip, req.ip도 없으면 unknown', () => {
    expect(clientIp(req({}))).toBe('10.0.0.1');
    expect(clientIp({ headers: {} } as unknown as Request)).toBe('unknown');
  });
});
