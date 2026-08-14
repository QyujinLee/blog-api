import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  summary!: string;

  @IsString()
  body!: string;

  // 카테고리 slug가 아니라 label(자유 입력) — 서버가 slugify해서 없으면 Category를 새로 만듦
  @IsString()
  @MinLength(1)
  category!: string;

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  // 시리즈에 안 묶으면 생략 — seriesSlug/seriesOrder는 서버가 계산(클라이언트가 안 보냄)
  @IsOptional()
  @IsString()
  seriesTitle?: string;
}
