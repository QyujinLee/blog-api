# gyujin's log API

개인 기술 블로그의 백엔드 API. 프론트(Next.js BFF, [`blog`](https://github.com/QyujinLee/blog) 저장소)만 호출하는 내부 서버로, 글 CRUD·검색·조회수/좋아요·이미지 업로드·인증을 담당합니다.

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white) ![Redis](https://img.shields.io/badge/Redis-Upstash-DC382D?logo=redis&logoColor=white) ![Jest](https://img.shields.io/badge/Jest-30-C21325?logo=jest&logoColor=white)

## 아키텍처

브라우저는 이 서버를 직접 호출하지 않습니다 — 모든 요청은 `blog` 저장소의 Next.js Route Handler(BFF)가 서버-to-서버로 보냅니다(그래서 CORS 미설정). 인증 토큰은 BFF가 httpOnly 쿠키로 들고 있다가 `Authorization: Bearer` 헤더로 실어 보내고, 이 서버는 글 CRUD가 성공하면 BFF의 `/api/revalidate`를 웹훅으로 호출해 온디맨드 ISR을 트리거합니다. 전체 아키텍처 다이어그램은 `blog` 저장소의 [README](https://github.com/QyujinLee/blog#아키텍처) 참고.

설계 배경과 각 결정의 이유(왜 NestJS인지, 왜 Neon/Upstash/R2인지, 인증·레이트리밋·검색 설계 등)는 [`docs/blog-api-plan.md`](docs/blog-api-plan.md)에 정리되어 있습니다.

## 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | NestJS 11 | Render 무료 웹서비스 배포 |
| 언어 | TypeScript | strict |
| ORM | Prisma 7 | 커스텀 출력 경로(`generated/prisma`), CJS 강제 생성 |
| DB | PostgreSQL (Neon) | pooled(`DATABASE_URL`) + direct(`DIRECT_URL`, 마이그레이션용) |
| 캐시/카운터 | Redis (Upstash) | 로그인 브루트포스 방어, 조회수/좋아요 중복 방지(IP+day) |
| 이미지 저장 | Cloudflare R2 (S3 호환, `@aws-sdk/client-s3`) | 프론트가 `**.r2.dev` public URL로 직접 서빙 |
| 인증 | `@nestjs/jwt` + bcrypt | 소유자(이메일/비밀번호), 방문자(Google 프로필, v1 프론트 미연결) |
| 검증 | `class-validator` + `ValidationPipe` | DTO 화이트리스트, 여분 필드 400 거부 |
| API 문서 | `@nestjs/swagger` | `/docs` |
| 테스트 | Jest, Supertest | 유닛(`*.spec.ts`) + e2e |

## 로컬 개발

```bash
yarn install
yarn dev        # http://localhost:4000 (NODE_OPTIONS=--experimental-global-webcrypto 포함 watch 모드)
```

Node 버전은 `.nvmrc`(v24) 기준입니다. `nvm use`로 맞춰주세요.

`.env`에 아래 환경변수가 필요합니다(값은 커밋되지 않음):

| 변수 | 용도 |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Neon Postgres (pooled / direct) |
| `JWT_SECRET`, `JWT_EXPIRATION` | JWT 서명/만료 |
| `OWNER_EMAIL`, `OWNER_PASSWORD_HASH` | 서버 기동 시 소유자 계정 자동 upsert(`OwnerSeedService`) — 비밀번호는 평문이 아니라 bcrypt 해시값 |
| `REDIS_URL` | Upstash Redis |
| `REVALIDATE_WEBHOOK_URL`, `REVALIDATE_SECRET` | 글 CRUD 성공 시 `blog`의 `/api/revalidate` 웹훅 호출 |
| `INTERNAL_SECRET` | `blog`(BFF)만 호출 가능하게 제한하는 공유 시크릿(`x-internal-secret` 헤더) |

DB 스키마를 바꿨다면:

```bash
npx prisma migrate dev   # 로컬 마이그레이션 적용
npx prisma generate      # 클라이언트 재생성 (generated/prisma)
```

### 테스트

```bash
yarn lint       # ESLint --fix
yarn test       # Jest 유닛 테스트
yarn test:cov   # 커버리지
yarn test:e2e   # test/jest-e2e.json 설정으로 e2e 테스트
yarn build      # nest build
```

### API 문서

서버 기동 후 `http://localhost:4000/docs`에서 Swagger UI로 전체 엔드포인트를 확인할 수 있습니다.

## 진행 상황

글 CRUD(작성/수정/삭제/숨김/고정), 검색(ILIKE 부분 매칭 + 정렬/필터), 조회수·통계, R2 이미지 업로드, 소유자 인증(로그인 시도 제한 포함)까지 구현·검증이 끝나 `blog` 프론트와 연동 중입니다. 댓글, 좋아요, 방문자(Google) 로그인 API도 구현·검증까지 끝났지만, 로그인 없는 방문자 참여 지표는 조회수 하나로 충분하다고 판단해 `blog` 쪽 v1 스코프에서 의도적으로 제외되어 아직 호출되지 않습니다. 배포는 Render(DB: Neon, Redis: Upstash) 기준으로 설계되어 있습니다.

단계별 진행 상황과 설계 결정 배경은 [`docs/blog-api-plan.md`](docs/blog-api-plan.md) 참고.
