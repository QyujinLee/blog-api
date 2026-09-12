import type { Request } from 'express';
import { extractBearerToken } from './extract-bearer-token';

const req = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as Request;

describe('extractBearerToken', () => {
  it('Bearer 토큰을 꺼낸다', () => {
    expect(extractBearerToken(req('Bearer abc.def.ghi'))).toBe('abc.def.ghi');
  });

  // 여기가 핵심 — 다른 인증 스킴을 Bearer로 오인해 토큰처럼 다루면 안 된다
  it('Bearer가 아닌 스킴이나 헤더 없음은 undefined', () => {
    expect(extractBearerToken(req('Basic abc'))).toBeUndefined();
    expect(extractBearerToken(req('bearer abc'))).toBeUndefined();
    expect(extractBearerToken(req())).toBeUndefined();
    expect(extractBearerToken(req('Bearer'))).toBeUndefined();
  });
});
