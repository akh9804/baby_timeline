# Baby Timeline — MVP Technical Specification

## 1. 프로젝트 개요

### 1.1 목적

아이의 출생 전부터 출생 이후까지의 사진과 영상을 시간순으로 기록하고 가족과 공유할 수 있는 비공개 가족 앨범 서비스를 만든다.

서비스의 핵심 목적은 다음과 같다.

- 임신 중 초음파 사진/영상부터 기록 가능
- 출생 이후 성장 사진/영상을 동일한 타임라인에서 관리
- 가족 구성원은 별도 회원가입 없이 공용 비밀번호로 열람 가능
- 사진/영상 업로드는 인가된 사용자만 가능
- 원본 미디어는 일반 공개 URL로 노출하지 않음
- 초기 인프라 비용을 최대한 낮게 유지
- 추후 저장 용량과 기능이 증가해도 구조를 확장할 수 있도록 설계

---

# 2. 핵심 요구사항

## 2.1 사용자 유형

서비스 사용자는 크게 세 가지 상태로 구분한다.

### 미인증 사용자

사이트 URL에 접근했으나 가족 공용 비밀번호 인증을 하지 않은 사용자.

권한:

- 로그인 화면 접근
- 가족 비밀번호 입력

불가능:

- 타임라인 조회
- 사진 조회
- 영상 조회
- 업로드
- 수정
- 삭제

---

### Family Viewer

가족 공용 비밀번호 인증을 완료한 사용자.

별도의 Supabase 계정은 필요하지 않다.

권한:

- 타임라인 조회
- 사진 조회
- 영상 조회

불가능:

- 사진/영상 업로드
- 기록 생성
- 기록 수정
- 기록 삭제

---

### Editor

Supabase Auth를 통해 로그인한 인가 사용자.

예:

- 아빠
- 엄마

권한:

- Family Viewer의 모든 권한
- Moment 생성
- 사진 업로드
- 영상 업로드
- Moment 수정
- Moment 삭제
- 미디어 삭제

---

# 3. 기술 스택

## Frontend / BFF

**Next.js**

사용 목적:

- React UI
- Client-side navigation
- Route Handler 기반 BFF
- 가족 비밀번호 검증
- Family Session 발급
- Private media Signed URL 발급

SSR 자체는 이 프로젝트의 핵심 목적이 아니다.

Next.js를 사용하는 가장 큰 이유는:

> React 애플리케이션과 작은 서버 실행 영역을 하나의 프로젝트 안에서 관리하기 위해서다.

Next.js Route Handler는 `app` 디렉터리 아래에서 서버 API를 구현할 수 있다.

---

## Database

**Supabase PostgreSQL**

사용 목적:

- 아이 정보
- Moment
- Media metadata
- Editor 권한 정보

---

## Authentication

**Supabase Auth**

사용 대상:

- Editor만 사용

Family Viewer는 Supabase Auth를 사용하지 않는다.

---

## Media Storage

**Supabase Storage**

Bucket:

```text
family-media
```

설정:

```text
private
```

Supabase private bucket은 public URL만으로 파일을 가져올 수 없으며 인증된 요청이나 일정 시간 동안 유효한 Signed URL이 필요하다.

---

## Styling

**Tailwind CSS**

---

## Client data fetching

권장:

```text
TanStack Query
```

용도:

- Timeline 조회
- Signed URL 조회
- Mutation 후 cache invalidation

---

## Deployment

1차 후보:

```text
Vercel
```

구성:

```text
Vercel
 └ Next.js

Supabase
 ├ PostgreSQL
 ├ Auth
 └ Storage
```

---

# 4. 전체 시스템 Architecture

```text
                     ┌────────────────────┐
                     │      Browser       │
                     └─────────┬──────────┘
                               │
                               ▼
                     ┌────────────────────┐
                     │      Next.js       │
                     │                    │
                     │ React UI           │
                     │ Route Handlers     │
                     │ Family Session     │
                     └───────┬─────┬──────┘
                             │     │
                   DB Query  │     │ Signed URL
                             │     │
                             ▼     ▼
                     ┌────────────────────┐
                     │      Supabase      │
                     │                    │
                     │ PostgreSQL         │
                     │ Auth               │
                     │ Private Storage    │
                     └────────────────────┘
```

Next.js는 미디어 데이터를 직접 전달하지 않는다.

예를 들어 20MB 사진을 조회할 때:

```text
잘못된 구조

Browser
   ↓
Next.js
   ↓
Supabase
   ↓
Next.js
   ↓
20MB image
   ↓
Browser
```

이 구조를 사용하지 않는다.

대신:

```text
Browser
   │
   │ Signed URL 요청
   ▼
Next.js
   │
   │ Supabase Signed URL 생성
   ▼
Browser
   │
   │ 실제 파일 요청
   ▼
Supabase Storage
```

를 사용한다.

따라서 실제 사진/영상 트래픽은 Supabase Storage가 담당한다.

---

# 5. 인증 Architecture

## 5.1 Family Viewer 인증

Family Viewer는 Supabase 사용자가 아니다.

가족 공용 비밀번호를 이용하여 서비스 자체 세션을 발급한다.

### Flow

```text
사이트 접속
    ↓
Family Password 입력
    ↓
POST /api/access
    ↓
Next.js에서 password 검증
    ↓
성공
    ↓
Family Session 생성
    ↓
HttpOnly Cookie 발급
```

예:

```text
family_session=<signed-session>
```

Cookie 옵션:

```text
HttpOnly
Secure
SameSite=Lax
Path=/
Max-Age=30 days
```

Next.js Route Handler에서는 서버 측에서 Cookie를 읽고 설정할 수 있다.

---

# 6. Family Password

공용 비밀번호 자체를 Browser bundle에 포함하면 안 된다.

따라서 아래와 같은 코드는 금지한다.

```ts
if (
  password ===
  process.env.NEXT_PUBLIC_FAMILY_PASSWORD
) {
  // ...
}
```

`NEXT_PUBLIC_*` 값은 client bundle에 포함될 수 있기 때문이다.

대신 서버 환경변수에 password hash를 저장한다.

```text
FAMILY_PASSWORD_HASH
```

예:

```text
FAMILY_PASSWORD_HASH=$2b$...
```

비밀번호 검증은 Route Handler에서 실행한다.

```text
POST /api/access
```

개념:

```ts
const valid = await verifyPassword(
  password,
  process.env.FAMILY_PASSWORD_HASH
)

if (!valid) {
  return Response.json(
    { error: 'INVALID_PASSWORD' },
    { status: 401 }
  )
}

createFamilySession()
```

---

# 7. Family Session

공용 비밀번호를 매 요청마다 다시 검사하지 않는다.

비밀번호 인증 성공 시 서버가 서명된 Family Session을 발급한다.

예:

```text
family_session=eyJ...
```

세션 payload 예:

```json
{
  "type": "family",
  "iat": 1780000000,
  "exp": 1782592000
}
```

권장 만료:

```text
30일
```

가족 사용성을 고려하여 비교적 길게 유지한다.

---

# 8. Editor 인증

업로드 사용자는 별도의 Supabase Auth를 사용한다.

```text
Editor
   ↓
Supabase Login
   ↓
JWT
   ↓
authenticated
```

MVP에서는 로그인 방식을 하나만 지원한다.

예:

```text
Google OAuth
```

또는

```text
Email Magic Link
```

둘 중 하나를 선택한다.

Editor 여부는 단순히 `authenticated` 여부로 판단하지 않는다.

DB allowlist를 사용한다.

```text
editors
```

테이블을 통해 실제 업로드 권한을 확인한다.

---

# 9. 권한 Model

최종 권한은 다음과 같다.

```text
┌─────────────────────┬────────┬────────┬────────┐
│                     │ Guest  │ Family │ Editor │
├─────────────────────┼────────┼────────┼────────┤
│ 사이트 진입          │   X    │   O    │   O    │
│ Timeline 조회        │   X    │   O    │   O    │
│ 사진 조회            │   X    │   O    │   O    │
│ 영상 조회            │   X    │   O    │   O    │
│ 업로드               │   X    │   X    │   O    │
│ 수정                 │   X    │   X    │   O    │
│ 삭제                 │   X    │   X    │   O    │
└─────────────────────┴────────┴────────┴────────┘
```

---

# 10. Database Schema

## children

현재는 아이 한 명을 기준으로 하지만 향후 확장을 고려해 별도 테이블로 둔다.

```sql
create table children (
  id uuid primary key default gen_random_uuid(),

  name text,

  due_date date,
  birth_date date,

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);
```

`birth_date`는 출생 전에는 nullable이다.

---

## moments

사진/영상이 연결되는 하나의 사건 또는 기록.

예:

```text
12주 초음파
성별 확인
출생
첫 목욕
D+100
첫 걸음
```

Schema:

```sql
create table moments (
  id uuid primary key default gen_random_uuid(),

  child_id uuid
    not null references children(id),

  title text not null,

  description text,

  occurred_at timestamptz not null,

  created_by uuid references auth.users(id),

  created_at timestamptz
    not null default now(),

  updated_at timestamptz
    not null default now()
);
```

---

## media

실제 사진/영상 metadata.

```sql
create type media_type as enum (
  'image',
  'video'
);

create table media (
  id uuid primary key default gen_random_uuid(),

  moment_id uuid
    not null references moments(id)
    on delete cascade,

  type media_type not null,

  storage_path text
    not null unique,

  file_name text,

  mime_type text,

  file_size bigint,

  width integer,
  height integer,

  duration_seconds numeric,

  captured_at timestamptz,

  sort_order integer
    not null default 0,

  created_at timestamptz
    not null default now()
);
```

---

## editors

업로드가 허용된 사용자.

```sql
create table editors (
  user_id uuid
    primary key references auth.users(id)
    on delete cascade,

  display_name text,

  created_at timestamptz
    not null default now()
);
```

---

# 11. Moment와 Media를 분리하는 이유

예를 들어 한 번의 초음파 방문에서:

```text
2026-10-10
12주 초음파

├ photo-1.jpg
├ photo-2.jpg
├ photo-3.jpg
└ ultrasound.mp4
```

가 올라올 수 있다.

따라서:

```text
Moment
  1:N
Media
```

구조를 사용한다.

이렇게 하면 Timeline UI가 자연스럽다.

---

# 12. Timeline 날짜 모델

Timeline 정렬 기준은:

```text
moments.occurred_at
```

이다.

업로드 날짜인:

```text
created_at
```

을 Timeline 기준으로 사용하지 않는다.

예를 들어 2028년에 2026년 초음파 사진을 추가해도:

```text
2026년 Timeline
```

에 표시되어야 한다.

---

# 13. 출생 전 날짜 표시

`children.due_date` 또는 임신 기준일을 이용하여 임신 주수를 계산한다.

예:

```text
2026.09.28

임신 11주 3일
```

Timeline 카드:

```text
11주 3일

12주 초음파

[PHOTO]
[PHOTO]
[VIDEO]
```

---

# 14. 출생 후 날짜 표시

`birth_date` 이후에는 출생일 기준으로 표시한다.

예:

```text
D+1
D+30
D+100
생후 6개월
1살
```

내부 DB에는 별도의 `D+100` 값 등을 저장하지 않는다.

항상:

```text
occurred_at
-
birth_date
```

로 계산한다.

---

# 15. Storage Architecture

Bucket:

```text
family-media
```

설정:

```text
private
```

Private bucket은 public bucket과 달리 object URL만 가지고는 파일을 조회할 수 없다. 다운로드하려면 인증된 요청이나 제한 시간 Signed URL이 필요하다.

---

# 16. Storage Path 규칙

파일명 충돌을 피하기 위해 UUID 기반으로 저장한다.

예:

```text
children/
  {childId}/
    moments/
      {momentId}/
        {mediaId}.jpg
```

실제 예:

```text
children/
  47ea.../
    moments/
      ad10.../
        f30a....jpg
```

원래 파일명은 DB에 별도로 저장한다.

```text
media.file_name
```

---

# 17. Media 조회 Flow

사진 한 장을 조회하는 과정:

```text
Browser

GET /api/media/{mediaId}/signed-url
        │
        ▼
Next.js
        │
        ├ family_session 확인
        │
        ├ media 조회
        │
        └ Signed URL 생성
                │
                ▼
          Supabase Storage
                │
                ▼
          Signed URL 반환
                │
                ▼
Browser
                │
                ▼
Supabase Storage에서
직접 사진 다운로드
```

---

# 18. Signed URL

Supabase API:

```ts
supabase.storage
  .from('family-media')
  .createSignedUrl(path, expiresIn)
```

`expiresIn`은 초 단위다.

예:

```ts
const { data, error } =
  await supabaseAdmin.storage
    .from('family-media')
    .createSignedUrl(
      media.storagePath,
      60 * 10
    )
```

결과:

```text
10분간 유효
```

Supabase에서 Signed URL 생성은 기본적으로 object의 `SELECT` 권한이 필요하다.

---

# 19. Server Supabase Client

Family Viewer는 Supabase 사용자 계정이 없기 때문에 서버가 대신 데이터를 조회하고 Signed URL을 발급한다.

서버에서는 관리자용 Supabase client를 별도로 만든다.

```text
lib/
  supabase/
    browser.ts
    admin.ts
```

예:

```ts
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false
    }
  }
)
```

Supabase의 현재 권장 방식은 서버 관리 작업에 legacy `service_role` key보다 Secret Key를 사용하는 것이다. 이 키는 RLS를 우회하므로 절대 브라우저나 소스코드에 노출해서는 안 된다.

---

# 20. 중요 보안 규칙

`SUPABASE_SECRET_KEY`는 다음 위치에서만 사용한다.

```text
Next.js Server
Route Handler
Server Action
Background Worker
```

절대 사용 금지:

```text
Client Component
Browser bundle
NEXT_PUBLIC_*
Git repository
```

Secret Key는 RLS를 우회할 수 있기 때문에 유출 시 프로젝트 데이터 전체가 노출될 수 있다.

---

# 21. Signed URL API 보안

다음 구조는 금지한다.

```text
GET /api/media/url?path=xxxxx
```

이 API가 요청된 path를 그대로 Signed URL로 만들어주면 안 된다.

예:

```text
❌

path = request.query.path

createSignedUrl(path)
```

대신 항상 DB의 `mediaId`를 기반으로 조회한다.

```text
GET /api/media/{mediaId}/signed-url
```

서버:

```text
mediaId
   ↓
DB media 조회
   ↓
storage_path 확인
   ↓
signed URL 발급
```

클라이언트는 Storage path 자체를 지정할 수 없다.

---

# 22. Timeline API

Family Viewer가 DB를 직접 조회하지 않도록 한다.

```text
GET /api/timeline
```

Flow:

```text
Browser
  ↓
GET /api/timeline
  ↓
Next.js
  ↓
family_session 검증
  ↓
Supabase DB 조회
  ↓
Timeline 반환
```

이렇게 하면 Supabase의 anon role에 Moment/Media 데이터를 공개할 필요가 없다.

---

# 23. API Specification

## POST /api/access

Family Password 인증.

Request:

```json
{
  "password": "..."
}
```

Success:

```text
204 No Content
```

그리고:

```text
Set-Cookie: family_session=...
```

Failure:

```text
401 Unauthorized
```

---

## POST /api/logout

Family Session 제거.

```text
family_session
```

Cookie 삭제.

---

## GET /api/session

현재 Family Session 상태 확인.

Response:

```json
{
  "authenticated": true
}
```

---

## GET /api/timeline

Timeline 조회.

Response 예:

```json
{
  "moments": [
    {
      "id": "...",
      "title": "12주 초음파",
      "description": null,
      "occurredAt": "2026-10-02T10:00:00+09:00",
      "media": [
        {
          "id": "...",
          "type": "image",
          "width": 3024,
          "height": 4032
        }
      ]
    }
  ]
}
```

Storage path는 Client에 반환하지 않아도 된다.

---

## GET /api/media/:id/signed-url

Media temporary URL 발급.

Response:

```json
{
  "url": "https://....",
  "expiresIn": 600
}
```

MVP 기본 expiration:

```text
10분
```

---

# 24. Editor Write Flow

Editor는 Supabase Auth를 사용한다.

```text
Editor
   ↓
Login
   ↓
Supabase Auth JWT
   ↓
Editor RLS
   ↓
DB / Storage write
```

단순 write 작업은 굳이 Next.js BFF를 통과시키지 않는다.

```text
Editor Browser
   ↓
Supabase
```

로 직접 요청한다.

---

# 25. Database RLS

모든 주요 table에 RLS를 활성화한다.

```sql
alter table children enable row level security;
alter table moments enable row level security;
alter table media enable row level security;
alter table editors enable row level security;
```

Anon 사용자에게는 직접 SELECT 권한을 제공하지 않는다.

Family Viewer의 조회는 Next.js BFF를 통해 이루어진다.

---

# 26. Editor Policy

예를 들어 Moment 생성:

```sql
create policy "editors can insert moments"
on moments
for insert
to authenticated
with check (
  exists (
    select 1
    from editors
    where editors.user_id = auth.uid()
  )
);
```

수정:

```sql
create policy "editors can update moments"
on moments
for update
to authenticated
using (
  exists (
    select 1
    from editors
    where editors.user_id = auth.uid()
  )
);
```

삭제도 같은 패턴으로 설정한다.

---

# 27. Storage RLS

Supabase Storage는 `storage.objects` RLS를 통해 업로드 권한을 제어한다. 기본적으로 Storage upload는 허용 정책 없이는 허용되지 않는다.

예:

```sql
create policy "editors can upload media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'family-media'
  and exists (
    select 1
    from editors
    where editors.user_id = auth.uid()
  )
);
```

DELETE / UPDATE도 동일한 Editor 조건을 적용한다.

---

# 28. Media Upload Flow

권장 Flow:

```text
Editor

파일 선택
    ↓
Moment 생성
    ↓
media UUID 생성
    ↓
Supabase Storage 직접 Upload
    ↓
업로드 성공
    ↓
media row INSERT
    ↓
Timeline refresh
```

사진/영상 binary는 Next.js 서버를 거치지 않는다.

```text
Browser
   │
   │ binary
   ▼
Supabase Storage
```

---

# 29. 업로드 실패 처리

Storage upload 후 DB insert가 실패하는 경우 orphan file이 생길 수 있다.

MVP에서는 다음 방식으로 처리한다.

```text
1. mediaId 사전 생성
2. Storage upload
3. DB insert
4. DB insert 실패
5. Storage file 즉시 delete 시도
```

예:

```ts
try {
  await uploadFile()

  await createMedia()
} catch {
  await removeUploadedFile()
  throw error
}
```

추후에는 orphan cleanup job을 추가할 수 있다.

---

# 30. 사진 Metadata

가능하면 업로드 전 브라우저에서 다음 정보를 추출한다.

```text
width
height
mimeType
fileSize
capturedAt
```

EXIF가 존재하면:

```text
DateTimeOriginal
```

을 사용하여 `captured_at` 후보를 만든다.

사용자가 수정 가능해야 한다.

---

# 31. 영상 Metadata

MVP에서는:

```text
duration
width
height
mimeType
fileSize
```

정도만 저장한다.

MVP에서는 transcoding을 하지 않는다.

---

# 32. Video MVP 제한

비용과 UX를 고려해 초기에는 업로드 제한을 둔다.

예:

```text
최대 파일 크기: 500MB
```

또는 실제 사용하면서 조정한다.

MVP에서는:

```text
4K → 1080p 자동 변환
HLS
adaptive streaming
```

등은 구현하지 않는다.

필요성이 생겼을 때 별도 Worker를 추가한다.

---

# 33. Thumbnail

MVP 1차에서는 구현 우선순위를 낮춘다.

사진은 원본 Signed URL을 사용한다.

영상의 경우 브라우저 기본 video element를 사용한다.

추후:

```text
original/
thumbnail/
preview/
```

구조로 발전시킬 수 있다.

---

# 34. Frontend Page Structure

## `/`

Family Session 상태에 따라:

```text
Unauthenticated
→ /access

Authenticated
→ /timeline
```

---

## `/access`

가족 비밀번호 입력.

UI:

```text
우리 가족의 기록

[ 비밀번호 ]

[ 들어가기 ]
```

---

## `/timeline`

메인 화면.

```text
2026

임신 11주 3일

┌────────────────────┐
│ 11주 초음파         │
│                    │
│ [photo] [photo]    │
│ [video]            │
│                    │
│ 2026.09.28         │
└────────────────────┘
```

---

## `/upload`

Editor 전용.

```text
Moment 정보

날짜
제목
설명

사진 / 영상 선택

[ 업로드 ]
```

---

## `/editor/login`

Supabase Auth 로그인.

---

# 35. 권장 프로젝트 구조

```text
src/

  app/

    access/
      page.tsx

    timeline/
      page.tsx

    upload/
      page.tsx

    editor/
      login/
        page.tsx

    api/

      access/
        route.ts

      logout/
        route.ts

      session/
        route.ts

      timeline/
        route.ts

      media/
        [id]/
          signed-url/
            route.ts


  features/

    family-access/
      api/
      components/
      lib/

    timeline/
      api/
      components/
      hooks/

    media/
      api/
      components/
      hooks/

    upload/
      api/
      components/
      hooks/

    editor-auth/
      api/
      components/


  entities/

    child/
    moment/
    media/


  shared/

    supabase/
      browser.ts
      admin.ts

    auth/
      family-session.ts

    ui/

    utils/

    constants/
```

---

# 36. Environment Variables

```text
NEXT_PUBLIC_SUPABASE_URL=

NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_SECRET_KEY=

FAMILY_PASSWORD_HASH=

FAMILY_SESSION_SECRET=
```

브라우저 사용 가능:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

서버 전용:

```text
SUPABASE_SECRET_KEY
FAMILY_PASSWORD_HASH
FAMILY_SESSION_SECRET
```

---

# 37. Family Session Middleware

보호 대상:

```text
/timeline
/upload
```

초기 page 접근 시 Family Session 확인.

다만 실제 보안은 page redirect만으로 끝내면 안 된다.

반드시 API에서도 다시 검사한다.

예:

```text
GET /api/timeline

verifyFamilySession()
```

```text
GET /api/media/:id/signed-url

verifyFamilySession()
```

즉:

```text
UI protection
+
API authorization
```

둘 다 사용한다.

---

# 38. Signed URL Expiration

초기 설정:

```text
10분
```

이미지가 화면에 표시되고 나면 브라우저 cache 때문에 즉시 문제가 생기지는 않는다.

새로 요청해야 할 때 Signed URL이 만료되었다면 다시 발급한다.

TanStack Query에서는 예:

```text
staleTime = 8분
```

정도로 운영할 수 있다.

---

# 39. 여러 이미지 Signed URL

한 화면에 사진이 많이 있는 경우 사진마다 API 요청을 보내지 않도록 추후 batch API를 사용할 수 있다.

예:

```text
POST /api/media/signed-urls
```

Request:

```json
{
  "ids": [
    "id1",
    "id2",
    "id3"
  ]
}
```

Response:

```json
{
  "items": [
    {
      "id": "id1",
      "url": "..."
    }
  ]
}
```

Supabase 역시 여러 파일에 대해 Signed URL을 생성하는 API를 제공한다.

MVP부터 batch 형태로 구현해도 좋다.

---

# 40. Security Checklist

MVP 배포 전에 반드시 확인한다.

- [ ] Storage bucket이 Private인가
- [ ] Secret Key가 Browser에 노출되지 않는가
- [ ] Family Password가 client bundle에 없는가
- [ ] Family Session Cookie가 HttpOnly인가
- [ ] Production에서 Secure Cookie인가
- [ ] Timeline API가 Family Session을 검사하는가
- [ ] Signed URL API가 Family Session을 검사하는가
- [ ] Storage path를 Client가 임의 지정할 수 없는가
- [ ] DB RLS가 활성화되어 있는가
- [ ] Anonymous DB SELECT를 열어놓지 않았는가
- [ ] Upload RLS가 Editor만 허용하는가
- [ ] DELETE RLS가 Editor만 허용하는가
- [ ] Secret Key가 Git에 커밋되지 않았는가

---

# 41. MVP 범위

## 반드시 구현

### 인증

- Family Password
- Family Session Cookie
- Editor login

### Timeline

- Moment 목록
- 날짜순 정렬
- 임신 주수 표시
- 출생 이후 D+ 표시

### Media

- 사진 업로드
- 영상 업로드
- 사진 조회
- 영상 재생
- Private Storage
- Signed URL

### Editor

- Moment 생성
- Media 업로드
- Moment 수정
- 삭제

---

# 42. MVP에서 제외

초기에는 다음 기능을 구현하지 않는다.

- 댓글
- 좋아요
- 가족별 계정
- 초대 링크
- 알림
- push notification
- AI 사진 분류
- 얼굴 인식
- 영상 transcoding
- HLS streaming
- 자동 사진 압축 pipeline
- 앱
- React Native
- 복수 아이 UI
- 공개 공유 링크
- 다운로드 제한
- 사진 인쇄
- 검색
- 태그

필요성이 확인되면 이후 추가한다.

---

# 43. Phase 2 후보

MVP 이후 고려할 기능:

```text
Milestone

첫 웃음
첫 뒤집기
첫 이유식
첫 걸음
첫 단어
첫 생일
```

Schema:

```text
milestones
```

또는 기존 Moment의 category로 확장한다.

추가 후보:

- 키
- 몸무게
- 성장 곡선
- 월별 앨범
- 사진 즐겨찾기
- 날짜 검색
- 다운로드
- 가족 댓글
- PWA
- 사진 원본 백업

---

# 44. 향후 Storage 확장

초기:

```text
Supabase Storage
```

용량과 Traffic이 커진다면:

```text
Cloudflare R2
```

등으로 migration할 수 있다.

Media 테이블이 실제 URL이 아니라:

```text
storage_path
```

만 가지고 있도록 한 이유도 Storage provider 변경 가능성을 확보하기 위함이다.

추후:

```text
storage_provider

supabase
r2
```

필드를 추가할 수도 있다.

---

# 45. 최종 Architecture

```text
                         Browser
                            │
             ┌──────────────┴──────────────┐
             │                             │
             │ Family Viewer               │ Editor
             │                             │
             ▼                             ▼
      Family Password                Supabase Auth
             │                             │
             ▼                             │
          Next.js                          │
             │                             │
      Family Session                       │
             │                             │
             ├───────────────┐             │
             │               │             │
             ▼               ▼             ▼
         Timeline         Signed URL      Write
            API               API          │
             │               │             │
             └──────┬────────┘             │
                    │                      │
                    ▼                      ▼
                 Supabase
              ┌─────┴──────┐
              │            │
              ▼            ▼
          PostgreSQL    Private Storage
                              │
                              │ Signed URL
                              ▼
                           Browser
```

---

# 46. 구현 순서

## Step 1 — 프로젝트 생성

```bash
pnpm create next-app
```

설정:

```text
TypeScript
App Router
Tailwind
ESLint
src directory
```

---

## Step 2 — Supabase 프로젝트 생성

생성:

```text
PostgreSQL
Auth
Storage
```

Storage bucket:

```text
family-media
private
```

---

## Step 3 — DB Migration

생성 순서:

```text
children
editors
moments
media
```

그다음:

```text
RLS
Storage Policy
```

---

## Step 4 — Family Access

구현:

```text
/access
/api/access
/api/logout
family-session.ts
```

완료 조건:

```text
비밀번호 없이 /timeline 접근 불가능
```

---

## Step 5 — Timeline API

구현:

```text
GET /api/timeline
```

Family Session 검증 후 DB 조회.

---

## Step 6 — Timeline UI

구현:

```text
/timeline
MomentCard
MediaGrid
```

---

## Step 7 — Private Media

구현:

```text
GET /api/media/:id/signed-url
```

완료 조건:

```text
Storage URL 직접 접근 → 실패

Family 인증
→ Signed URL 발급
→ 이미지 접근 성공
```

---

## Step 8 — Editor Auth

Supabase Auth 연결.

```text
/editor/login
```

그리고 `editors` allowlist 확인.

---

## Step 9 — Upload

구현:

```text
/upload

MomentForm
MediaUploader
```

Browser → Supabase Storage 직접 업로드.

---

## Step 10 — Edit / Delete

구현:

```text
Moment update
Moment delete
Media delete
```

---

## Step 11 — Deployment

Vercel environment variables 설정.

```text
SUPABASE_SECRET_KEY
FAMILY_PASSWORD_HASH
FAMILY_SESSION_SECRET
```

Production에서 Cookie Secure 확인.

---

# 47. MVP 완료 Definition of Done

아래 시나리오가 모두 동작하면 MVP 완료로 본다.

### Scenario 1

```text
사용자가 URL 접속
→ 사진을 볼 수 없음
→ 비밀번호 화면 표시
```

### Scenario 2

```text
가족 비밀번호 입력
→ Timeline 진입
→ 사진 조회 가능
→ 영상 재생 가능
```

### Scenario 3

```text
사진 Signed URL 복사
→ 일정 시간 동안 접근 가능
→ 만료 후 접근 불가능
```

### Scenario 4

```text
Family Viewer
→ 업로드 불가능
```

### Scenario 5

```text
인가된 Editor 로그인
→ Moment 생성
→ 사진 업로드
→ Timeline에 바로 표시
```

### Scenario 6

```text
Supabase Storage 파일 주소를 직접 접근
→ 접근 불가능
```

### Scenario 7

```text
Editor가 Moment 삭제
→ 연결된 DB media 삭제
→ Storage object도 삭제
```

---

# 48. 설계 원칙

이 프로젝트에서는 아래 원칙을 유지한다.

### 1. Client는 신뢰하지 않는다.

권한은 UI가 아니라 Server / RLS에서 검증한다.

### 2. 미디어 binary는 Application Server를 거치지 않는다.

```text
Browser ↔ Storage
```

를 기본으로 한다.

### 3. Secret Key는 Server에서만 사용한다.

### 4. Storage는 Private을 기본값으로 한다.

### 5. Family Viewer에게 Supabase Account를 요구하지 않는다.

공용 Family Password로 사용자 경험을 단순하게 유지한다.

### 6. Editor만 실제 Authentication을 사용한다.

### 7. 업로드 날짜와 실제 사건 날짜를 분리한다.

Timeline은 항상:

```text
occurred_at
```

기준이다.

### 8. 초기에는 단순하게 시작한다.

현재 프로젝트의 목표는 범용 사진 서비스를 만드는 것이 아니라:

> 아이의 출생 전부터 이후까지 가족이 함께 볼 수 있는 안전하고 단순한 성장 기록 서비스를 만드는 것이다.