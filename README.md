# 작은 날들 · Baby Timeline

`CLAUDE.md`를 기준으로 만든 비공개 가족 성장 앨범 MVP입니다. Next.js App Router, TypeScript, Tailwind CSS, TanStack Query, Supabase Auth/PostgreSQL/Private Storage를 사용합니다.

## 구현 범위

- 가족 공용 비밀번호: 최대 2개, 서버 bcrypt 검증, 30일 HS256 세션, HttpOnly / SameSite=Lax 쿠키, 프로덕션 Secure.
- 편집자: 이메일 매직 링크 + `editors` allowlist. 가족 비밀번호 없이도 인가된 편집자는 열람 가능합니다.
- 타임라인: 실제 기록 일시 내림차순, 안정적인 cursor pagination, 임신 주수 / 출생일 D+0부터 표시. 가족 날짜 표시는 Asia/Seoul 기준입니다.
- 원본 미디어: private bucket, 서버에서 media ID로만 10분 signed URL 발급. 화면에 가까운 미디어부터 조회하고 8분마다 URL을 갱신합니다. 원본 바이너리는 Next.js를 거치지 않습니다.
- 기록 생성·수정, 사진·영상 업로드, EXIF 촬영일 후보 수정, 크기·해상도·영상 길이 추출, 개별 파일 및 기록 전체 삭제.
- 모바일: 본문 15px·입력 16px, 주요 버튼 44~48px 이상, 사진 한 열 배치, 사진 전체화면 보기와 확대·축소, 닫기 후 포커스 복귀.
- 첫 아이 등록 및 예정일·생일 수정. 여러 아이를 고르는 UI는 MVP 범위에서 제외했습니다.
- 영구적인 DB 로그인 시도 제한, Storage 파일 정리 실패에 대비한 삭제 큐.

## 로컬 실행

Node.js 22 이상과 pnpm 10을 사용합니다.

```sh
pnpm install
cp .env.example .env.local
pnpm password:hash
openssl rand -hex 32
```

`.env.local`에 Supabase 프로젝트 URL, publishable key, secret key, 비밀번호 hash, 세션 secret을 입력합니다. 비밀번호 hash는 출력된 **작은따옴표까지 그대로 복사**해야 Next.js의 `$` 환경변수 확장을 막을 수 있습니다. 실제 키나 비밀번호는 Git에 넣지 않습니다.

가족 비밀번호를 두 개 사용하려면 아래 명령으로 두 번째 비밀번호의 해시를 생성하세요.

```sh
pnpm password:hash --second
```

두 비밀번호 모두 6자 이상, 최대 72바이트로 설정할 수 있습니다. 숫자 6자리도 가능합니다.

기존 `FAMILY_PASSWORD_HASH`는 필수이며 그대로 유지합니다. 추가로 `FAMILY_PASSWORD_HASH_2`를 설정하면 두 비밀번호 중 어느 것으로든 동일한 가족 열람 권한을 얻습니다. 두 번째 값이 없거나 비어 있으면 기존처럼 첫 번째 비밀번호만 사용합니다. Vercel에는 변수 이름을 Key에, `$2b$...` 해시만 Value에 입력합니다. 등호나 바깥따옴표는 넣지 않습니다. 환경변수 변경 후 재배포해야 적용됩니다.

두 비밀번호는 같은 가족 세션을 발급합니다. 한쪽 비밀번호를 변경하거나 두 번째 값을 제거해도 이미 발급된 세션은 최대 30일 유지됩니다. 기존 로그인을 해제하려면 `FAMILY_SESSION_SECRET`을 교체해야 하며, 이때 모든 가족 세션이 무효화됩니다. 비밀번호별 세션 구분이나 개별 로그아웃은 지원하지 않습니다.

```sh
pnpm dev
```

<http://127.0.0.1:3000>에서 확인합니다. 환경변수 없이도 `/access`와 편집자 로그인 UI는 열리지만 인증과 앨범 데이터 기능은 Supabase 연결이 필요합니다. 가짜 인증 우회나 공개 샘플 데이터는 포함하지 않았습니다.

## Supabase 설정

1. Supabase 프로젝트를 준비합니다.
2. SQL Editor에서 `supabase/migrations/202609290001_initial.sql` 전체를 실행합니다. 또는 프로젝트에 연결한 Supabase CLI로 `supabase db push`를 실행합니다.
3. Auth에서 Email provider와 매직 링크 사용을 활성화하고, 공개 회원가입은 비활성화합니다. 운영 환경에서는 SMTP도 설정합니다.
4. Auth의 URL Configuration에서 Site URL을 서비스 주소로, Redirect URLs에 `http://127.0.0.1:3000/auth/callback`과 운영 주소의 `/auth/callback`을 등록합니다. 기본 매직 링크 템플릿의 `{{ .ConfirmationURL }}`을 사용합니다.
5. Auth Users에서 엄마·아빠 계정을 관리자로 미리 생성합니다. 생성한 사용자의 UUID를 allowlist에 넣습니다. 클라이언트는 allowlist를 수정할 수 없습니다.

```sql
insert into public.editors(user_id, display_name)
values ('AUTH_USER_UUID', '엄마');
```

6. 편집자 로그인 → 기록 남기기에서 아이 이름, 출산 예정일 또는 생일을 입력합니다.
7. Storage의 `family-media`가 **Private**인지 확인합니다. migration은 bucket 제한을 500MB로 설정하지만 프로젝트/플랜의 전역 파일 제한이 더 작으면 그 제한이 우선합니다. 필요한 용량과 요금은 Supabase 설정에서 확인하세요.

매직 링크는 요청한 브라우저에서 열어야 PKCE 검증이 됩니다. 등록되지 않은 이메일은 새 계정을 만들지 않습니다. Auth 사용자여도 allowlist에 없다면 조회·업로드 권한이 없습니다.

## API

| 경로                            | 동작                                        | 권한                 |
| ------------------------------- | ------------------------------------------- | -------------------- |
| `POST /api/access`              | `{ password }`, 성공 시 204 + 세션 쿠키     | same-origin          |
| `POST /api/logout`              | 가족 쿠키 및 현재 브라우저 편집자 세션 해제 | same-origin          |
| `GET /api/session`              | `{ authenticated, editor }`                 | 누구나               |
| `GET /api/timeline?cursor=...`  | `{ child, moments, nextCursor }`, 20개씩    | 가족 또는 편집자     |
| `GET /api/media/:id/signed-url` | `{ url, expiresIn: 600 }`                   | 가족 또는 편집자     |
| `DELETE /api/moments/:id`       | 연결된 미디어와 원본 삭제                   | 편집자 + same-origin |
| `DELETE /api/media/:id`         | 단일 미디어와 원본 삭제                     | 편집자 + same-origin |

타임라인 필드는 DB와 동일한 snake_case입니다. `storage_path`는 타임라인 응답에 포함하지 않습니다. UI 보호는 서버 페이지에서 수행하고, 각 API에서도 권한을 검증합니다. Next.js `proxy.ts`는 Supabase 세션 갱신과 private/no-store 헤더를 담당합니다.

일반 생성·수정·업로드는 브라우저에서 Supabase로 직접 요청하며 RLS가 권한을 검증합니다. 삭제는 DB와 Storage를 함께 정리해야 하므로 편집자를 검증하는 BFF가 담당합니다.

## 실패 복구와 제한

- 업로드 중 실패한 경우 이미 저장된 Moment와 파일은 유지합니다. 같은 화면에서 다시 저장하면 동일한 media UUID로 조회하여 완료된 업로드를 건너뜁니다.
- Storage 성공 후 metadata 저장 실패가 확인되면 파일을 바로 삭제합니다. DB 응답이 유실된 경우 다시 조회해서 실제로 저장된 파일을 실수로 삭제하지 않습니다.
- 브라우저 종료·네트워크 단절 등으로 metadata가 생기기 전 업로드가 남으면 orphan이 생길 수 있습니다. Storage 목록과 `media.storage_path`를 비교해 관리자가 확인해야 합니다. 무조건 오래된 파일을 지우는 작업은 포함하지 않았습니다.
- 기록 삭제 시 DB trigger가 삭제 대상 경로를 큐에 기록하고 BFF가 Storage API로 즉시 원본을 제거합니다. 실패하면 202 응답과 `cleanupPending: true`를 반환합니다. 서버 종료나 동시 삭제로 큐가 남으면 다음 명령을 다시 실행합니다. 정기 작업으로 실행해도 됩니다.

```sh
pnpm storage:cleanup
```

- Storage와 DB는 하나의 트랜잭션이 아니므로 파일 정리가 대기 중일 수 있습니다. 이미 발급된 URL은 최대 10분 유효하고, 다운로드된 파일이나 브라우저 캐시를 회수하는 기능은 없습니다.
- JPG/PNG/WebP/GIF, MP4/MOV/WebM을 지원합니다. HEIC는 JPG 변환 후 사용하세요. 영상 코덱에 따라 브라우저 재생 가능 여부가 다릅니다. 변환·압축·HLS·썸네일 파이프라인은 없습니다.
- 대용량 파일은 직접 표준 업로드하며 자동 재개는 없습니다. 안정적인 네트워크에서 업로드하세요.
- 로그인은 IP당 15분에 10회, 전체 15분에 200회로 제한합니다. IP는 HMAC으로 저장합니다. Vercel 등 신뢰할 수 있는 프록시가 `x-forwarded-for`를 덮어쓰는 배포 구성이 필요하며, 자체 호스팅 시 해당 헤더를 정규화하세요.
- 가족 비밀번호 변경 시 기존 쿠키까지 무효화하려면 `FAMILY_SESSION_SECRET`도 교체합니다.

### 비밀번호 입력 후 503이 나오는 경우

Vercel 함수 로그에 `Family access rate limiter RPC failed`가 보이면 Supabase SQL Editor에서 migration을 아직 실행하지 않은 상태입니다. `supabase/migrations/202609290001_initial.sql` 전체를 실행한 뒤 재시도하세요. 특히 아래 함수와 권한이 있어야 합니다.

```sql
select public.consume_access_attempt('vercel-check');
```

이 쿼리는 SQL Editor에서는 `service_role`이 아니어서 권한 오류가 날 수 있습니다. 실제 앱 요청으로 확인하려면 Vercel에서 재배포한 뒤 로그인 화면에서 다시 시도하세요. Vercel Runtime Logs에서 원인을 확인할 수 있습니다.

로그에 `Family access is not configured`가 보이면 Vercel Production 환경변수에 `FAMILY_SESSION_SECRET`(32자 이상), `FAMILY_PASSWORD_HASH`(bcrypt `$2b$...` 해시)를 넣었는지 확인하고 재배포하세요. 해시 변수에는 6자리 원문 비밀번호가 아니라 `pnpm password:hash`가 출력한 해시만 입력해야 합니다.

## 검증

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Vitest로 세션 위조·만료, 날짜 경계·윤년, 파일 제한을 검증합니다. PGlite의 실제 PostgreSQL 엔진에 migration을 실행하여 비인가 사용자 접근 차단, allowlist 보호, Editor 쓰기, Storage RLS, cascade 삭제 큐, 로그인 제한을 검증합니다. 테스트의 `auth`와 `storage` 테이블은 Supabase 인터페이스를 재현한 fixture이며 실제 Supabase Auth/Storage API 검증을 대체하지 않습니다.

배포 전 실제 프로젝트에서 아래 사항을 확인해야 합니다.

- 게스트가 `/timeline`, `/upload`, timeline API, signed URL API에 접근할 수 없는지
- 가족 인증 후 사진과 영상이 보이고, 가족 쿠키만으로 Supabase 쓰기가 거부되는지
- 매직 링크 로그인 후 allowlist 사용자만 생성·수정·삭제 가능한지
- Storage public object 주소 접근이 거부되고 signed URL이 10분 후 만료되는지
- 기록 삭제 후 DB media와 실제 Storage 원본이 모두 삭제되는지
- 업로드 실패·재시도 및 `pnpm storage:cleanup` 복구 동작

## 배포

Vercel에 이 저장소를 연결하고 Next.js 설정을 사용합니다. `.env.example`의 환경변수를 설정하고 HTTPS 서비스 주소를 Supabase Redirect URLs에 추가합니다. `NEXT_PUBLIC_*` 변수는 빌드 때 포함되므로 변경 후 재배포가 필요합니다. 서버 secret에는 `NEXT_PUBLIC_` 접두사를 붙이지 마세요. Preview에는 운영 데이터와 별도의 Supabase 프로젝트를 사용하는 편이 좋습니다.

현재 저장소에는 실제 Supabase 프로젝트 키와 배포 대상이 없으므로 인프라 생성, migration 원격 적용, 운영 배포, 실제 메일 및 파일 업로드 검증은 별도 연결이 필요합니다.

## 참고 문서

- [Next.js App Router 설치](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase SSR client / session refresh](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase PKCE와 서버 인증](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
