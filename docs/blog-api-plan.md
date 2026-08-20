# blog-api 구조 설계

> 이 저장소(`blog-api`)는 개인 블로그의 백엔드 API. 프론트(`blog` 저장소) 설계는 그쪽 `docs/blog-structure-plan.md` 참고.

## 개요

- **NestJS** + **Prisma** + **PostgreSQL** (TypeScript)
- 배포: **Render 무료 웹서비스** (512MB RAM, 0.1 CPU, 월 750시간 — 개인 블로그엔 충분. 15분 미사용 시 슬립되지만 Node 런타임이라 재기동이 대략 1~2초로 짧음)
- DB: **Neon 무료 Postgres 우선 추천** (0.5GB 저장공간, 월 100 CU-hour, 미사용 시 컴퓨트가 자동으로 잠들었다가 다음 쿼리 때 자동으로 깨어남 — 사람 개입 불필요). Supabase(500MB 저장공간)도 무료지만 **7일 미사용 시 프로젝트가 일시정지되고 대시보드에서 수동으로 복구해야 함** — 개인 블로그처럼 트래픽이 뜸할 수 있는 서비스엔 운영 리스크라 후순위. 둘 다 Render 자체 DB(무료 티어 만료 정책 있음)보다 나음
- Redis: 조회수 중복방지 + 로그인 브루트포스 방어용. **Upstash 무료 티어**(256MB, 월 50만 명령 — 이 프로젝트 트래픽엔 충분히 넉넉함) 확인 완료
- 이미지 저장: **Cloudflare R2** (S3 호환 API) — 이력서는 R2 대신 프론트 저장소의 정적 파일(`public/resume.pdf`)로 관리(아래 "다음 단계" 참고, 자주 안 바뀌는 파일이라 업로드 API 불필요)
- API 문서화: **`@nestjs/swagger`** → `/docs`

### 왜 Spring Boot가 아니라 NestJS인가

처음엔 Spring Boot로 설계했다가 착수 직전에 바꿨음. 이유는 두 가지:

1. **Render 무료 티어 콜드스타트** — JVM은 512MB/0.1 CPU 환경에서 재기동에 30~60초가 걸림. 트래픽이 뜸한 개인 블로그라 15분 슬립에 자주 걸리는데, 그때마다 첫 방문자가 1분 가까이 기다리게 됨. Node 런타임은 같은 조건에서 1~2초 수준
2. **프론트와 언어 통일** — 프론트가 이미 TypeScript(Next.js)라 타입·유틸·멘탈모델을 공유

NestJS는 Spring Boot를 본떠 만들어진 프레임워크라, 이 문서의 설계(계층 분리, DI, 기능별 모듈, 데코레이터 기반 라우팅)가 거의 그대로 옮겨짐:

| Spring Boot | NestJS |
|---|---|
| `@RestController` | `@Controller` |
| `@Service` | `@Injectable()` |
| Spring Data JPA Repository | Prisma Client |
| Spring Security 필터 체인 | Guards |
| `@Valid` + Bean Validation | `class-validator` + `ValidationPipe` |
| springdoc-openapi | `@nestjs/swagger` |
| `@ControllerAdvice` | Exception Filter |
| package-by-feature | 기능별 모듈(module) |

## 브라우저는 이 서버를 직접 호출하지 않음

프론트가 BFF(Next.js Route Handler) 패턴이라, 이 서버로 오는 모든 요청은 **Next.js 서버가 대신 보내는 서버-to-서버 요청**임 (딱 하나 예외: 없음 — 전부 프록시 경유). 그래서:

- **CORS 설정 불필요** — 브라우저發 크로스 오리진 요청 자체가 없음
- 하지만 이게 "아무나 이 API를 직접 못 부른다"는 뜻은 아님 — Render에 배포되면 공개 URL이 생기고, `curl`이나 Postman으로 누구든 직접 호출 가능함. CORS는 브라우저만 막는 정책이라 서버 대 서버(또는 임의의 클라이언트) 호출은 못 막음
- 그래서 진짜 보호는 **엔드포인트별 인증/인가**로 함 (아래 "엔드포인트 보호 정책" 참고)

## 엔드포인트 보호 정책

| 종류 | 보호 방식 |
|---|---|
| 공개 조회 (글 목록/상세, 댓글 목록, 검색, 통계) | 없음 — 원래 공개 데이터 |
| `POST /posts/{slug}/like` | 없음 — 인증 개념 자체가 없는 기능, Redis IP+day로만 가벼운 어뷰징 방지 |
| `POST /auth/login` | 비밀번호 자체가 보호 수단 + Redis 기반 IP별 시도 횟수 제한 |
| `POST /auth/google` | **`X-Internal-Secret` 헤더 필수**(`InternalSecretGuard`) — Next.js BFF만 아는 공유 시크릿. 이게 없으면 "이 이메일로 로그인시켜줘"라는 요청을 아무나 보낼 수 있어서(신원을 자체적으로 증명 안 하고 그냥 믿어주는 구조라) 반드시 필요 |
| `GET /auth/me` | `JwtGuard`(유효성만 검사, role 조건 없음 — 유효하지 않으면 401) |
| 글 CRUD | `JwtGuard` + `RolesGuard('OWNER')` |
| 이미지 업로드 | `JwtGuard` + `RolesGuard('OWNER')` (글 작성은 소유자만 하므로) |
| 댓글 작성 | `JwtGuard` (VISITOR/OWNER 무관 — 누구든 로그인만 하면) |
| 댓글 삭제(모더레이션) | `JwtGuard` + `RolesGuard('OWNER')` |
| `POST /revalidate` 호출(이 서버 → Next.js) | 반대 방향 — 이 서버가 Next.js의 `x-revalidate-secret` 헤더를 붙여서 호출 |

`INTERNAL_SECRET`, `REVALIDATE_SECRET`은 서로 다른 값. 둘 다 Vercel/Render 양쪽 환경변수에 동일하게 등록해둬야 함.

## 인증 설계

```
[소유자 로그인]
프론트 BFF → POST /auth/login { email, password }
  → Redis에서 이 IP의 실패 횟수 확인, 초과 시 429
  → 비밀번호 검증(bcrypt) → JWT(role: OWNER, sub: userId) 발급 → 200 { token }
  → 프론트가 이 token을 httpOnly 쿠키로 저장

[방문자 로그인]
프론트가 Google과 직접 OAuth 코드 교환 → 프로필(email, name, avatarUrl, googleId) 확보
프론트 BFF → POST /auth/google { email, name, avatarUrl, googleId } + X-Internal-Secret 헤더
  → InternalSecretGuard가 시크릿 검증
  → googleId로 User 조회, 없으면 role: VISITOR로 새로 생성
  → JWT(role: VISITOR, sub: userId) 발급 → 200 { token }
  → 프론트가 이 token을 httpOnly 쿠키로 저장

[세션 확인 / 이후 모든 인증 요청]
프론트 BFF → GET /auth/me (또는 다른 보호된 엔드포인트) + Authorization: Bearer <token>
  → JwtGuard가 서명/만료 검증 (@nestjs/jwt)
  → 유효하면 request.user에 { userId, role } 주입, 유효하지 않으면 401
```

- JWT: 서명 시크릿(`JWT_SECRET`)은 이 서버만 가짐 — 프론트와 공유 안 함(프론트는 서명 검증을 안 하고 이 서버에 위임하기로 했으므로)
- 만료: 짧게(예: 1시간), 리프레시 토큰 없음 — 만료되면 401, 프론트가 재로그인 유도
- 비밀번호: bcrypt 해시로 저장(평문 저장 금지), 애초에 owner 계정은 1개뿐이라 최초 기동 시 환경변수(`OWNER_EMAIL`, `OWNER_PASSWORD_HASH`)로 시드
- **Passport는 쓰지 않음** — `@nestjs/jwt`로 토큰 검증하고 커스텀 Guard 두 개(`JwtGuard`, `RolesGuard`)만 만들면 충분. 전략(strategy)이 하나뿐이라 `@nestjs/passport` + `passport-jwt`를 얹으면 의존성만 늘고 얻는 게 없음

## 데이터 모델 (`prisma/schema.prisma`)

> **Prisma 7 기준** — 설치된 CLI(7.x)로 `prisma validate` 통과를 확인한 스키마임. Prisma 6 이하와 달라진 점이 있어 아래 "Prisma 7 설정" 절을 먼저 볼 것.

```prisma
generator client {
  provider     = "prisma-client"        // 구버전의 "prisma-client-js"가 아님
  output       = "../generated/prisma"  // v7은 출력 경로 명시 필수
  moduleFormat = "cjs"                  // NestJS가 CommonJS라 명시 필수 — 없으면 부팅 시 ESM 관련 에러("Prisma 7 설정" 섹션 참고)
}

datasource db {
  provider = "postgresql"
  // url은 여기 쓰지 않음 — v7에서 제거됨, prisma.config.ts로 이동
}

enum Role {
  OWNER
  VISITOR
}

model User {
  id           String    @id @default(uuid())
  email        String    @unique
  name         String
  avatarUrl    String?
  role         Role
  passwordHash String?   // OWNER만 사용
  googleId     String?   @unique  // VISITOR만 사용
  createdAt    DateTime  @default(now())
  comments     Comment[]
}

model Post {
  id          String   @id @default(uuid())
  slug        String   @unique
  title       String
  summary     String
  body        String   // 마크다운 원문
  categorySlug String  // FK 아님 — Category.slug 참조용 문자열
  tags        String[] // Postgres 네이티브 배열 (JPA @ElementCollection과 달리 별도 테이블 불필요)
  seriesSlug  String?  // 클라이언트가 안 보냄 — 저장 시 seriesTitle을 slugify(Category와 동일 규칙), 같은 이름이면 항상 같은 slug로 묶임
  seriesTitle String?
  seriesOrder Int?     // 클라이언트가 안 보냄 — 같은 seriesSlug의 기존 최대 order + 1로 서버가 계산
  pinned      Boolean  @default(false)
  hidden      Boolean  @default(false)
  viewCount   Int      @default(0)
  likeCount   Int      @default(0)  // 로그인 불필요 — "누가 눌렀는지"는 저장 안 함, 카운트만
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  comments    Comment[]

  @@index([categorySlug])
  @@index([seriesSlug])
}
// 삭제는 하드 삭제 (댓글과 달리 모더레이션 대상이 아니라 소유자 본인이 관리하는 콘텐츠라 소프트 삭제 불필요)

model Category {
  slug  String @id
  label String
}
// 자유 생성 — 글 저장 시 categorySlug가 없는 값이면 upsert (label을 slugify)

model Comment {
  id        String   @id @default(uuid())
  postId    String
  authorId  String
  body      String
  deleted   Boolean  @default(false)  // 소프트 삭제
  createdAt DateTime @default(now())
  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  author    User     @relation(fields: [authorId], references: [id])

  @@index([postId])
}
// 글이 하드 삭제되면 댓글도 함께 삭제(onDelete: Cascade) — 남겨둘 이유가 없음

model DailyVisit {
  date  DateTime @id @db.Date
  count Int      @default(0)
}
// 조회수 중복방지 통과한 요청마다 오늘 날짜 row를 +1 (홈페이지 "글 조회 추이" 그래프용)
// 주의: "사이트 방문자 수"가 아니라 "글 조회수 집계"에 가까움 — 홈/about 등 글이 아닌 페이지 방문은 안 잡히고,
// 같은 사람이 그날 다른 글 2개를 보면 +2로 카운트됨. "최근 트래픽 추이" 용도로는 충분(정확한 UV 트래킹은 스코프 밖, YAGNI)
```

## Prisma 7 설정

Prisma 7은 6 이하와 설정 방식이 꽤 달라졌음. 학습된 예제나 블로그 글 상당수가 구버전 기준이라 그대로 따라 하면 안 됨:

- **연결 URL은 `schema.prisma`에 못 씀** — `datasource`의 `url` 속성이 제거됨. 마이그레이션용 URL은 **`prisma.config.ts`**에 둠
- **클라이언트는 드라이버 어댑터가 필수** — `new PrismaClient()`를 인자 없이 부르면 에러. `@prisma/adapter-pg` 사용
- **생성된 클라이언트는 `@prisma/client`가 아니라 출력 경로에서 import** — 이 프로젝트는 `tsconfig.json`이 `module`/`moduleResolution: "nodenext"`라 상대 경로 import에 `.js` 확장자를 명시해야 함(컴파일된 `.ts`→`.js`를 가리키는 nodenext 관례): `from '../../generated/prisma/client.js'`
- **`generator client`에 `moduleFormat = "cjs"` 명시 필수** — 이거 없이 그냥 실행해봤더니(실제로 재현) 생성된 클라이언트가 기본적으로 ESM으로 나와서 NestJS(CommonJS 빌드) 부팅 시 `ReferenceError: exports is not defined in ES module scope`로 죽음. 공식 문서에 `moduleFormat`은 `esm`/`cjs` 중 선택, 기본값은 "환경에서 추론"인데 이 프로젝트 구성(`tsconfig`가 `nodenext`인데 `package.json`엔 `"type": "module"` 없음)에서는 추론이 틀림 — 명시해서 해결
- **`.env`는 `prisma.config.ts`만 자동으로 읽음, 실행 중인 NestJS 앱은 아님** — `src/main.ts` 맨 위에 `import 'dotenv/config'`를 직접 추가해야 `process.env.DATABASE_URL` 등이 런타임에도 채워짐. 안 하면 `$connect()`/앱 부팅까진 아무 에러 없이 성공하는데(드라이버 어댑터의 `pg.Pool`이 lazy라 연결을 미루기 때문), **첫 실제 쿼리에서만** `ECONNREFUSED`로 죽음(`connectionString`이 `undefined`라 `pg`가 `localhost:5432`로 조용히 폴백) — 실제로 재현해서 잡음. `dotenv`는 프로덕션 런타임에도 필요하므로 devDependencies가 아니라 **dependencies**에 둬야 함(Render 배포 시 devDependencies는 설치 안 됨)
- **Neon은 연결 문자열이 두 개** — Pooled(`DATABASE_URL`, 호스트명에 `-pooler`)는 앱 런타임 쿼리용, Direct(`DIRECT_URL`, `-pooler` 없음)는 마이그레이션 전용. `prisma.config.ts`의 `datasource.url`은 `DIRECT_URL`, `PrismaService`의 어댑터는 `DATABASE_URL`을 씀(Neon 공식 Prisma 가이드 기준)

```ts
// prisma.config.ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DIRECT_URL'] }, // 마이그레이션은 direct 연결
});
```

```ts
// src/prisma/prisma.service.ts — 앱 전체에서 인스턴스 하나만 유지 (실제 구현 그대로)
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- 필요한 패키지: `prisma`(devDependencies), `@prisma/client`·`@prisma/adapter-pg`·`pg`·`dotenv`(dependencies — `dotenv`는 `main.ts`가 런타임에 직접 씀)
- `.gitignore`에 **`/generated/prisma`**와 `.env` 추가 필요 (생성물·비밀정보 커밋 방지)
- `npx prisma init`은 `.agents/skills/`, `.claude/skills/`, `.windsurf/skills/`, `skills-lock.json`도 함께 생성함(실제 실행해서 확인) — 이 프로젝트엔 불필요하니 지우거나 커밋에서 제외

## API 엔드포인트

| 메서드 | 경로 | 보호 | 설명 |
|---|---|---|---|
| GET | `/posts` | 공개* | 목록 (*hidden 제외 — 유효한 OWNER `Authorization` 헤더가 실려오면 hidden 포함. 소유자가 프론트 Draft Mode로 요청할 때 자기 숨김 글도 목록에서 찾을 수 있게 하기 위함, 프론트 문서의 "숨김 글 미리보기" 참고. 카테고리/태그/시리즈 필터) |
| GET | `/posts/{slug}` | 공개* | 상세 (*hidden인 글은 OWNER만) |
| POST | `/posts` | OWNER | 등록 (slug는 title로부터 서버가 자동 생성) |
| PUT | `/posts/{slug}` | OWNER | 수정 |
| PATCH | `/posts/{slug}` | OWNER | `hidden`/`pinned` 토글 |
| DELETE | `/posts/{slug}` | OWNER | 삭제 (하드) |
| POST | `/posts/{slug}/view` | 공개 | 조회 기록 (Redis 중복방지) |
| POST | `/posts/{slug}/like` | 공개 | 좋아요 기록, `likeCount` 증가 (Redis IP+day 중복방지) |
| GET | `/posts/search` | 공개 | `q`, `sort`, `category`, `tags` 쿼리 — full-text search |
| GET | `/posts/{slug}/comments` | 공개 | 댓글 목록 |
| POST | `/posts/{slug}/comments` | VISITOR/OWNER | 댓글 작성 |
| DELETE | `/comments/{id}` | OWNER | 소프트 삭제 |
| GET | `/categories` | 공개 | 카테고리 목록(slug+label) — 글쓰기 화면 자동완성용 |
| GET | `/tags` | 공개 | 태그 목록(distinct 문자열) — 글쓰기 화면 자동완성용 |
| POST | `/auth/login` | 비번+Redis 제한 | 소유자 로그인 |
| POST | `/auth/google` | `X-Internal-Secret` | 방문자 로그인/가입 |
| GET | `/auth/me` | JWT | 세션 정보 |
| POST | `/images` | OWNER | 이미지 업로드 → R2, ≤5MB, jpg/png/webp/gif |
| GET | `/stats/popular-posts` | 공개 | 조회수 TOP N |
| GET | `/stats/visits` | 공개 | 최근 N일 글 조회 추이 (`DailyVisit`) |

`slug`는 글 등록 시 title로부터 한 번만 생성되고 이후 title을 수정해도 바뀌지 않음 — URL 안정성 유지 + 프론트가 slug 하나로 조회/수정/삭제를 전부 처리할 수 있게(별도 id 조회 왕복 불필요).

`POST /posts/{slug}/like`는 인증이 아예 없는 완전 공개 엔드포인트 — "누가 눌렀는지"는 저장하지 않고 카운트만 올림(로그인 개념이 없는 기능이라 서버는 유저를 특정할 필요도 이유도 없음). `POST /posts/{slug}/view`와 완전히 동일한 Redis IP+day 중복방지 패턴을 재사용 — 같은 IP는 하루에 한 번만 카운트되어 스크립트 어뷰징을 어느 정도 억제. 완벽한 부정클릭 방지는 아니지만(스크립트가 IP를 계속 바꾸면 뚫림), 좋아요는 로그인·인증 자체가 없는 캐주얼한 지표라 이 정도면 충분 — 더 강한 보호가 필요해지면 그때 CAPTCHA 등을 검토.

**`GET /tags`는 raw 쿼리 필요** — `tags`가 Postgres 배열이라 distinct 목록을 뽑으려면 `SELECT DISTINCT unnest(tags) FROM "Post" WHERE hidden = false`처럼 `prisma.$queryRaw`를 씀.

**검색(`GET /posts/search`)도 raw 쿼리** — 제목/태그 가중치를 본문보다 높게 주는 랭킹이 필요해서 `to_tsvector` + `setweight` + `ts_rank`를 `$queryRaw`로 직접 작성. Prisma의 기본 필터로는 가중치 랭킹을 표현할 수 없음.

## 온디맨드 ISR 재검증 연동

글 CRUD(등록/수정/삭제/숨김/고정) 성공 시 프론트에 재검증 요청. 어떤 글이 어떤 목록/카테고리/태그 페이지에 걸쳐있는지 이 서버가 계산할 필요 없음 — 그냥 "뭔가 바뀌었다"는 신호만 보내면 프론트가 `revalidatePath('/', 'layout')`로 전체를 무효화함.

```ts
// revalidate.service.ts — DB 쓰기가 끝난 뒤에만 호출
async notifyChanged(): Promise<void> {
  try {
    await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'x-revalidate-secret': this.secret },
      // 바디 없음 — 호출 자체가 트리거, path 계산 불필요
    });
  } catch (e) {
    this.logger.warn(`revalidate webhook failed: ${e}`); // 삼켜도 되는 실패 (아래 참고)
  }
}
```

- Spring의 `@TransactionalEventListener(AFTER_COMMIT)`에 해당하는 처리는 **서비스에서 DB 작업이 성공적으로 끝난 직후에 호출**하는 것으로 갈음. 여러 테이블을 함께 바꿔야 하면 `prisma.$transaction()`으로 묶고, 그 Promise가 resolve된 뒤에 `notifyChanged()`를 부름 — 트랜잭션이 롤백되면 호출 자체가 일어나지 않음
- 웹훅 호출은 **절대 트랜잭션 안에 넣지 않음** — 외부 HTTP 응답이 늦어지면 DB 커넥션과 락을 그만큼 오래 붙잡게 됨
- 실패해도 글 CRUD 자체는 이미 커밋됐으니 사용자에게 에러 노출 안 함 — 로그만 남기고 다음 정기 방문/재시도로 보정 (YAGNI, 재시도 큐까지는 안 만듦)

## Redis 사용처

| 키 패턴 | 용도 | TTL |
|---|---|---|
| `login-attempt:{ip}` | 로그인 실패 횟수 카운트, 초과 시 429 | 15분 |
| `view:{slug}:{ip}:{yyyy-MM-dd}` | 조회수 중복 방지 (하루 1회만 카운트) | 1일 |
| `like:{slug}:{ip}:{yyyy-MM-dd}` | 좋아요 중복 방지 (하루 1회만 카운트) — view와 동일 패턴 | 1일 |

- 클라이언트는 **`ioredis`** — Upstash가 표준 Redis 프로토콜을 지원하므로 `REDIS_URL` 하나로 붙음
- `SET key 1 EX <ttl> NX` 한 번으로 "처음이면 기록하고 true, 이미 있으면 false"를 원자적으로 판정 — 조회/좋아요 중복방지가 이 한 줄로 끝남

## R2 연동

- S3 호환 SDK(**`@aws-sdk/client-s3`**, endpoint만 R2로 override) 사용
- 환경변수: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_URL_BASE`
- 업로드 키 규칙: 이미지는 `images/{uuid}.{ext}`
- 업로드 수신은 `@nestjs/platform-express`의 `FileInterceptor`(multer) 사용, 크기/MIME 타입은 서버에서 재검증(프론트 검증만 믿지 않음)

## 프로젝트 구조 (기능별 모듈)

```
prisma/
  schema.prisma
  migrations/
src/
  main.ts                       # ValidationPipe, Swagger 설정, 포트(로컬 4000 — 3000은 프론트가 사용)
  app.module.ts
  prisma/
    prisma.service.ts, prisma.module.ts   # PrismaClient 수명주기 관리
  redis/
    redis.service.ts, redis.module.ts     # ioredis 래핑 + 중복방지 헬퍼
  post/
    post.controller.ts, post.service.ts, post.module.ts
    tag.controller.ts           # GET /tags — unnest raw 쿼리
    dto/                        # class-validator 데코레이터 붙인 요청 DTO
  category/
    category.controller.ts, category.service.ts, category.module.ts
  comment/
    comment.controller.ts, comment.service.ts, comment.module.ts
    dto/                        # class-validator 데코레이터 붙인 요청 DTO
  auth/
    auth.controller.ts, auth.service.ts, auth.module.ts
    jwt.guard.ts, optional-jwt.guard.ts, roles.guard.ts, internal-secret.guard.ts
    extract-bearer-token.ts     # JwtGuard/OptionalJwtGuard가 공유하는 Bearer 토큰 추출 헬퍼
    owner-seed.service.ts       # 최초 기동 시 OWNER 계정 시드
  image/
    image.controller.ts, r2.service.ts
  stats/
    stats.controller.ts, stats.service.ts
  revalidate/
    revalidate.service.ts, revalidate.module.ts   # 프론트 재검증 웹훅 호출
  common/
    slugify.ts                  # 제목/카테고리 라벨 → slug (한글 등 유니코드 그대로 유지)
    filters/                    # 전역 예외 필터
```

## 환경변수 (Render)

```
DATABASE_URL                              # Neon pooled 연결 문자열(-pooler) — 앱 런타임 쿼리용
DIRECT_URL                                # Neon direct 연결 문자열(-pooler 없음) — 마이그레이션 전용
JWT_SECRET                                # 이 서버만 보유, 프론트와 공유 안 함
JWT_EXPIRATION                            # 예: 1h
OWNER_EMAIL, OWNER_PASSWORD_HASH          # 최초 기동 시 소유자 계정 시드용 (bcrypt 해시)
INTERNAL_SECRET                           # /auth/google 보호용, Vercel과 공유
REVALIDATE_WEBHOOK_URL, REVALIDATE_SECRET # Next.js 재검증 호출용, Vercel과 공유
REDIS_URL                                 # Upstash
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_ENDPOINT, R2_PUBLIC_URL_BASE
PORT                                      # Render가 자동 주입 (로컬은 4000)
```

- Neon은 pooled(`-pooler`)/direct 두 연결 문자열을 제공 — Render 무료 인스턴스는 커넥션 수가 제한적이라 앱 쿼리는 pooled(`DATABASE_URL`), 마이그레이션은 direct(`DIRECT_URL`)로 분리해서 씀 ("Prisma 7 설정" 섹션 참고)

## 테스트

- 서비스 레이어 유닛 테스트: **Jest**(Nest 기본 포함), Prisma는 모킹
- e2e(`test/*.e2e-spec.ts`)는 실제 DB가 필요한 범위라 1차 스코프에서 제외 (YAGNI, 필요해지면 Testcontainers 검토)

## 다음 단계

1. [x] 프로젝트 생성 (`nest new`, TypeScript strict, yarn)
2. [x] Prisma 7 도입 — `prisma init` 후 `schema.prisma`/`prisma.config.ts` 작성, `@prisma/adapter-pg`로 `PrismaService`(`src/prisma/`) 구성, 첫 마이그레이션까지 실제로 실행해 검증 (위 "Prisma 7 설정" 참고). **실제로 재현해서 고친 버그 2개**:
   - 생성된 Prisma 클라이언트가 기본적으로 ESM으로 나와서 NestJS(CommonJS) 앱 부팅 시 `ReferenceError: exports is not defined in ES module scope`가 발생 — `generator client`에 `moduleFormat = "cjs"` 명시해서 해결(설계 문서 초안엔 없던 옵션, Prisma 7 공식 문서로 확인 후 반영)
   - **Neon 실제 연결 후 발견**: `$connect()`와 NestJS 부팅까진 매번 문제없이 성공했지만, 실제 쿼리(`user.count()`)를 처음 날려보니 `ECONNREFUSED`로 실패. `pg.Pool`은 lazy라 `$connect()`만으론 실제 연결 시도가 안 일어나 여태 못 잡고 있었던 것. 원인: `src/main.ts`가 `.env`를 로드한 적이 없어서(`prisma.config.ts`만 자체적으로 `dotenv/config`를 import — Prisma CLI에만 적용되고 실행 중인 NestJS 앱엔 적용 안 됨) `process.env.DATABASE_URL`이 런타임엔 항상 `undefined`였고, `pg.Pool`이 기본값(`localhost:5432`)으로 조용히 폴백해 거부당한 것. `main.ts` 최상단에 `import 'dotenv/config'` 추가로 해결 + `dotenv`를 devDependencies에서 dependencies로 이동(프로덕션에도 필요하므로 — 안 옮기면 Render 배포 시 devDependencies가 설치 안 돼 있어 앱이 아예 부팅 실패함). **평소 `$connect()` 성공만으로 DB 연결을 검증했다고 믿으면 안 된다는 교훈** — 실제 쿼리까지 날려봐야 진짜 검증
   - **Neon 연결 완료**(싱가포르 리전) — Prisma+Neon 공식 가이드대로 `DATABASE_URL`은 pooled(앱 런타임, `prisma.service.ts`의 어댑터가 사용), `DIRECT_URL`은 direct(마이그레이션 전용, `prisma.config.ts`의 datasource가 사용)로 분리. `prisma migrate deploy`로 실제 Neon에 마이그레이션 적용 + NestJS가 실제 쿼리(`user.count()`)까지 성공하는 것 확인 후 임시 코드 원복
   - **프로덕션 빌드까지 실제로 검증하다 3번째 버그 발견**: `package.json`의 `start:prod`가 `node dist/main`이었는데, 실제 `nest build` 산출물은 `dist/src/main.js` — `prisma.config.ts`(프로젝트 루트)와 `generated/prisma`(역시 루트, `src/` 밖)를 같이 컴파일하다 보니 tsc가 공통 루트를 프로젝트 루트로 잡아서 `dist/` 아래 `src/`가 그대로 중첩됨. `nest start`(dev)는 이 스크립트를 안 타서 여태 못 잡았고, Render 배포 시 그대로 뒀으면 부팅 자체가 실패했을 것. `dist/src/main`으로 수정 후 실제 컴파일된 빌드로 Neon 연결까지 재검증 완료
3. [x] `main.ts`에 전역 `ValidationPipe`(`whitelist`/`forbidNonWhitelisted`/`transform`) + 전역 예외 필터(`src/common/filters/all-exceptions.filter.ts`, 공식 문서의 "Catch everything" 패턴 — `HttpAdapterHost` 주입해 어댑터 종류에 안 묶이게) + Swagger(`DocumentBuilder` + `SwaggerModule`, `/docs`) 설정. `class-validator`/`class-transformer`/`@nestjs/swagger` 설치(`swagger-ui-dist`는 `@nestjs/swagger`가 알아서 딸려옴, 별도 설치 불필요 — 실제 설치해서 확인). 임시 DTO+컨트롤러(`__temp-verify/`)로 whitelist 위반(400)/타입 검증 실패(400)/예상 못한 에러(500, 서버 로그엔 스택 남고 응답엔 안 새어나감)/정상 변환(`instanceof` 확인)까지 4가지 실제로 검증 후 삭제
4. [x] `auth` 모듈 — `@nestjs/jwt`(Passport 없이, 설계대로) + `bcrypt`로 `JwtGuard`(Bearer 토큰 검증, `request.user`에 `{userId, role}` 주입)/`RolesGuard`(`@Roles()` 데코레이터 + `Reflector`, `JwtGuard` 다음에 배치 전제) 구현. `POST /auth/login`(bcrypt 비교 후 JWT `{sub, role}` 발급) / `GET /auth/me`(JwtGuard만, role 무관 — DB에서 최신 프로필 조회해 반환) / `OwnerSeedService`(`OnModuleInit`, `OWNER_EMAIL`/`OWNER_PASSWORD_HASH` 환경변수로 upsert, 둘 다 없으면 경고만 남기고 건너뜀). 로컬 `.env`에 임시 시크릿/해시 값 만들어 실제 Neon DB 대상으로 로그인 성공/실패(401)/`/auth/me` 토큰 없음(401)·위조 토큰(401)/`RolesGuard` 통과(200)·거부(403, OWNER 아닌 role의 실제 서명된 토큰으로)까지 프로덕션 빌드(`dist/src/main`)에서 전부 실제 요청으로 검증 후 임시 코드 삭제
5. [x] `redis` 모듈 — `ioredis`로 `checkOnce`(`SET key 1 EX ttl NX`, 조회수/좋아요 중복방지용 범용 헬퍼) / `getCount` / `incrementWithTtl`(로그인 실패 카운트, 첫 증가 때만 TTL 설정) / `reset` 구현. `AuthService.login()`에 연결 — IP별 실패 횟수를 비밀번호 검증 **전에** 먼저 확인해 5회(15분 윈도) 초과 시 429(bcrypt 검증 비용을 아낌), 실패 시 카운트 증가, 성공 시 리셋. Upstash(싱가포르, Regional, Eviction 켜짐 — 우리 키는 전부 TTL이라 optimistic-volatile 정책과 잘 맞음) 실제 인스턴스로 원자성(`SET NX` 동시 호출 시 하나만 성공)/카운터+TTL/5회 실패→429/429는 카운트 안 늘어남/성공 시 리셋까지 전부 실제 요청으로 검증. **검증 중 발견한 버그**: `POST /auth/login`이 NestJS POST 기본값인 201을 반환하고 있었음(설계 문서 스펙은 "200 { token }") — `@HttpCode(HttpStatus.OK)` 추가로 수정. Render는 리버스 프록시 뒤에 있어 `main.ts`에 `app.set('trust proxy', 1)`(`NestExpressApplication`) 없으면 `req.ip`가 항상 프록시 IP로 잡혀 IP별 제한이 사실상 전역으로 걸려버리는 걸 미리 확인하고 반영
6. [x] `post` 모듈 — CRUD(slug 기준) + `revalidate.service.ts` 웹훅 연결. `GET /posts`(카테고리/태그 필터, 태그는 AND 시맨틱), `GET /posts/{slug}`, `POST/PUT/PATCH/DELETE`(전부 OWNER). 공개지만 OWNER면 hidden 포함해야 하는 두 GET 엔드포인트를 위해 `OptionalJwtGuard` 신설(`JwtGuard`와 토큰 추출 로직 `extract-bearer-token.ts`로 공유, 토큰 없거나 무효해도 막지 않고 익명 취급). `src/common/slugify.ts`(제목 slug는 **한글 원문 유지** — 사용자와 논의 후 결정, WordPress도 발행 후 slug 고정이 표준적인 방식임을 확인). 카테고리는 label로 upsert, 시리즈는 seriesTitle 있으면 기존 최대 order+1 자동 계산. **구현하다 스스로 잡은 버그**: 이미 같은 시리즈에 속한 글을 다른 필드만 고쳐서 수정해도 order가 매번 맨 뒤로 밀리던 로직 — 수정 전 기존 seriesSlug와 비교해서 안 바뀌었으면 order 유지하도록 고침(테스트 이전에 코드 리뷰로 발견). 실제 Neon으로 전부 검증: 한글 slug 생성/collision 시 `-2` suffix, 시리즈 order 1→2 및 수정 후 유지, hidden 토글 시 공개/OWNER 노출 차이, 카테고리·태그 필터, validation 400, 무인증 401. **`blog` 프론트를 로컬로 같이 띄워서 실제 revalidate 웹훅이 `/api/revalidate`까지 도달하는 것도 로그로 직접 확인**(리포 간 실제 연동 검증)
7. [x] `/auth/google` (`InternalSecretGuard` 보호) 구현 — `X-Internal-Secret` 헤더를 `INTERNAL_SECRET` 환경변수와 비교(미설정 시 항상 거부). `AuthService.loginWithGoogle()`이 `googleId`로 `User` upsert(없으면 `role: VISITOR`로 생성, 있으면 name/avatarUrl/email을 최신 Google 프로필로 갱신) 후 JWT 발급. 로컬에서 실제 Neon으로 검증: 시크릿 없음/오답(401), 신규 googleId → VISITOR 생성 + `/auth/me`로 role 확인, 같은 googleId 재로그인 시 새 행 안 생기고 프로필만 갱신(`id` 동일함 직접 확인)까지 개발 빌드·프로덕션 빌드(`dist/src/main`) 둘 다에서 확인
8. [x] `comment` 모듈 — `@Controller()`에 전체 경로를 직접 지정(`posts/:slug/comments` GET/POST, `comments/:id` DELETE — 베이스 prefix가 서로 달라서). `GET`은 `OptionalJwtGuard`(hidden 글이면 `PostService.findBySlug`가 알아서 404), `POST`는 `JwtGuard`만(VISITOR/OWNER 둘 다 허용), `DELETE`는 `JwtGuard`+`RolesGuard('OWNER')`. 소프트 삭제는 DB `body`를 안 지우고 `deleted` 플래그만 세우고 응답에서만 빈 문자열로 가림(모더레이션 로그 목적). `PostModule`에서 `PostService` export 누락된 것도 이번에 추가. 실제 Neon으로 검증: 무인증 작성 거부(401)/방문자·소유자 작성/방문자 삭제 시도 거부(403)/소유자 삭제(204)+소프트삭제 응답 확인/빈 본문 검증(400)/존재하지 않는 댓글 삭제(404)/hidden 글의 댓글 목록·작성이 공개자에겐 404, 소유자에겐 정상/글 삭제 시 댓글 cascade 삭제까지 개발·프로덕션 빌드 둘 다 확인
9. [x] `category` 모듈 + `GET /tags`(자동완성용) — `CategoryController`(`GET /categories`, label 오름차순)와 `PostModule` 소속 `tag.controller.ts`(`SELECT DISTINCT unnest(tags) ... WHERE hidden = false` raw 쿼리, 별도 service 없이 컨트롤러가 `PrismaService` 직접 사용) 구현. 실제 Neon + 프로덕션 빌드(`dist/src/main`)로 검증: `/categories` 실데이터 응답 확인, 임시 글(태그 2개)을 hidden:false/true 각각으로 만들어 `/tags`가 공개 글의 태그만 정확히 반환하고 hidden 글의 태그는 제외되는 것까지 라이브 서버 HTTP 응답으로 확인 후 삭제
   - (병렬 세션 pull 후 정리) 이력서 기능 제거 결정이 문서/코드에는 반영됐지만 `schema.prisma`의 `model Resume`과 실제 Neon `Resume` 테이블은 남아있던 걸 발견 — 마이그레이션(`20260820095155_drop_resume`)으로 실 DB에서 테이블 삭제, 클라이언트 재생성 후 tsc/lint/build/프로덕션 부팅까지 재검증 완료
10. R2 연동 — 이미지 업로드 API
11. 검색(full-text, `$queryRaw` 가중치 랭킹) + 조회수/좋아요 + 통계 API
12. Render 배포, 환경변수 설정, 프론트와 실제 연동 테스트
