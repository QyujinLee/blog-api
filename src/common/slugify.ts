// 한글 등 유니코드 문자는 그대로 유지 — WordPress처럼 발행 후 고정되는 URL이라
// 로마자 음차보다 원문 그대로가 더 읽힘(사용자 확인 후 결정)
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}
