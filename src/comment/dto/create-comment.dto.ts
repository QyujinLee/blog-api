import { IsString, MinLength } from 'class-validator';

export class CreateCommentDto {
  // 순수 텍스트만 — 마크다운/HTML 렌더링 안 함(XSS 방지), 프론트에서 white-space: pre-wrap으로 줄바꿈만 유지
  @IsString()
  @MinLength(1)
  body!: string;
}
