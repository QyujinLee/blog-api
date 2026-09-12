import { slugify } from './slugify';

describe('slugify', () => {
  it('공백은 하이픈으로, 대문자는 소문자로 바꾼다', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('  여러   칸  ')).toBe('여러-칸');
  });

  // URL이 발행 후 고정되므로 한글이 로마자로 바뀌거나 사라지면 안 된다
  it('한글 등 유니코드 문자는 그대로 남긴다', () => {
    expect(slugify('백엔드 인증')).toBe('백엔드-인증');
  });

  it('URL에 쓸 수 없는 기호는 제거하되 하이픈은 남긴다', () => {
    // 기호만 지우고 양옆 글자는 그대로 붙는다 — '인증/인가' → '인증인가'
    expect(slugify('JWT: 인증/인가 (완전정복)!')).toBe('jwt-인증인가-완전정복');
    expect(slugify('next-js')).toBe('next-js');
  });

  it('기호만 있는 제목은 빈 문자열이 된다', () => {
    expect(slugify('!!!')).toBe('');
  });
});
