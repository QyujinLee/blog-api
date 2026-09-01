## 작업 원칙

### 리뷰 → 검증 반복
코드 작성이든 설계/문서 작업이든, 완료 후 바로 끝내지 않는다. 스스로 리뷰해서 문제(모순, 빠진 부분, 과설계, 보안 구멍 등)를 찾고 고친 뒤, 다시 처음부터 검증한다. 이 리뷰→수정→재검증 사이클을 "문제없다"고 확신할 때까지 반복한다. 한 번 훑어보고 끝내는 것은 리뷰가 아니다.

### 추측 금지 — 공식 문서로 검증 후 답변
API 사용법, 설정 방법, 라이브러리 동작 방식 등 확신이 없는 내용을 학습 데이터 기억에 의존해 추측으로 답하지 않는다. 특히 NestJS, Prisma, 그 외 버전이 자주 바뀌는 라이브러리는 학습 데이터 시점과 실제 설치된 버전이 다를 수 있으므로, 답변하거나 코드를 쓰기 전에 반드시 공식 문서(필요시 `node_modules` 안의 문서, 웹 검색)를 확인해서 검증된 내용만 답한다. 확인이 어려우면 확인이 안 됐다는 사실을 그대로 말한다 — 그럴듯하게 지어내지 않는다.

### Prisma 클라이언트는 커스텀 출력 경로 + CJS 강제
`prisma/schema.prisma`의 generator가 `output = "../generated/prisma"`, `moduleFormat = "cjs"`로 고정되어 있다(NestJS 빌드가 CJS라 자동추론이 ESM으로 잘못 판단해 런타임에서 "exports is not defined" 에러가 나던 걸 재현 후 고정한 값 — schema.prisma 주석 참고). 기본 `@prisma/client` 경로를 가정하지 말고 `generated/prisma/client.js`, `generated/prisma/enums.js`처럼 실제 생성 경로에서 타입/클라이언트를 가져온다. 스키마 수정 후엔 `npx prisma generate`로 재생성해야 한다.

## 커맨드

```bash
yarn dev          # watch 모드, 로컬 전용(NODE_OPTIONS=--experimental-global-webcrypto 포함), localhost:4000
yarn build         # nest build
yarn lint          # eslint --fix
yarn test          # jest 유닛 테스트 (src/**/*.spec.ts, rootDir이 src라 테스트는 소스와 같은 디렉터리에 위치)
yarn test -- <파일명 또는 -t 패턴>   # 단일 테스트만 실행
yarn test:e2e      # test/jest-e2e.json 설정으로 e2e 테스트
yarn test:cov      # 커버리지
npx prisma migrate dev   # 로컬 마이그레이션 적용 (DIRECT_URL 사용)
npx prisma generate      # 스키마 변경 후 클라이언트 재생성
```

서버 기동 후 `/docs`에서 Swagger 문서 확인 가능.

## 아키텍처

Next.js BFF(별도 저장소 `blog`)만 호출하는 내부 API — 브라우저가 직접 호출하지 않으므로 CORS 미설정.

- **모듈 구성**: `PrismaModule`, `AuthModule`, `PostModule`, `CommentModule`, `CategoryModule`, `ImageModule`, `StatsModule`을 `AppModule`에서 조립. `RedisModule`은 레이트리밋/중복방지 카운터용.
- **인증**: 소유자는 이메일+bcrypt 비밀번호(`auth/auth.service.ts`), 방문자는 Google 프로필 upsert — 둘 다 JWT 발급. `JwtGuard`/`OptionalJwtGuard`(라우트별 인증 필수/선택)와 `RolesGuard`(+`@Roles()`)로 OWNER 전용 라우트를 보호한다. `InternalSecretGuard`는 `x-internal-secret` 헤더로 BFF만 호출 가능하게 제한한다 — `/auth/google`처럼 클라이언트가 보낸 이메일을 그대로 믿는 라우트에 필수(없으면 임의 이메일로 가입 가능).
- **레이트리밋**: 로그인 실패 시도는 IP별로 Redis에 카운트(`RedisService`), 5회 초과 시 429(비밀번호 검증 전에 차단). 조회수/좋아요 중복 방지도 Redis(IP+day) 기반.
- **온디맨드 재검증**: 글 CRUD(등록/수정/삭제/숨김/고정) 성공 직후 `RevalidateService.notifyChanged()`가 `blog` 저장소의 `/api/revalidate`를 웹훅 호출(`x-revalidate-secret` 헤더). 트랜잭션 밖에서 실행되고 실패해도 로그만 남기고 삼킨다 — 요청 흐름을 막지 않는다.
- **이미지**: `ImageModule`이 S3 호환 클라이언트(`@aws-sdk/client-s3`, Cloudflare R2)로 업로드하고, 프론트는 `**.r2.dev` public URL로 직접 서빙한다.
- **데이터 모델**(`prisma/schema.prisma`): `Post.categorySlug`/`seriesSlug`는 FK가 아닌 참조용 문자열(자유 생성, upsert). `Post`/`Category`는 하드 삭제, `Comment`는 소프트 삭제(`deleted` 플래그, 글이 삭제될 때만 cascade). `DailyVisit`은 조회수 통계용 일자별 카운터.
- **v1 프론트 스코프 제외 기능**: 댓글/좋아요/방문자(Google) 로그인 API는 백엔드에 구현·검증까지 끝났지만 `blog` 프론트에서 아직 사용하지 않는다(`docs/blog-api-plan.md` 참고) — 삭제된 기능이 아니라 연결만 안 된 상태.
- **배포**: Render(리버스 프록시 뒤에서 실행되므로 `main.ts`의 `trust proxy` 설정이 필수 — 없으면 IP 기반 레이트리밋이 전역으로 걸림). DB는 Neon Postgres(pooled `DATABASE_URL` + direct `DIRECT_URL`), Redis는 Upstash.
- 설계 배경 전체는 `docs/blog-api-plan.md` 참고. 프론트(BFF) 쪽 설계는 `blog` 저장소의 `docs/blog-structure-plan.md`.

## 환경 변수

`.env`에 정의(값은 커밋 안 됨): `DATABASE_URL`, `DIRECT_URL`(Neon), `JWT_SECRET`, `JWT_EXPIRATION`, `OWNER_EMAIL`, `OWNER_PASSWORD_HASH`, `REDIS_URL`(Upstash), `REVALIDATE_WEBHOOK_URL`, `REVALIDATE_SECRET`, `INTERNAL_SECRET`.
