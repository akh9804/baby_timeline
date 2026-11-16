# 개발 및 배포 절차

이 문서는 작은 날들 서버의 변경, 검증, 커밋, GitHub 푸시, 로컬 운영 서버 반영 절차를 정리한 문서입니다.

## 프로젝트 실행 구조

개발 시에는 TypeScript 소스를 `tsx`로 직접 실행할 수 있지만, 현재 이 컴퓨터에서 실제로 서비스 중인 서버는 launchd가 실행하는 운영용 JavaScript 빌드입니다.

```text
src/server/*.ts  ->  dist/server/*.js  ->  Node.js + Fastify
src/client/*     ->  dist/client/*     ->  Fastify가 정적 파일로 제공
```

운영 서버 설정:

- launchd 서비스: `com.baby-timeline.server`
- launchd 설정 복사본: `~/Library/LaunchAgents/com.baby-timeline.server.plist`
- 서버 시작 스크립트: `scripts/production-server.mjs`
- 서버 빌드: `dist/server`
- 클라이언트 빌드: `dist/client`
- 포트: `3000`
- 데이터베이스: `data/family-media.db`
- 미디어 저장소: launchd 환경 변수의 `MEDIA_STORAGE_ROOT` 값
- 로그: `logs/server.log`, `logs/server-error.log`

`dist/`는 배포 산출물이므로 Git에 커밋하지 않습니다. 소스를 변경한 뒤 운영 서버에 반영하려면 반드시 다시 빌드해야 합니다.

## 일반적인 변경 및 배포 순서

### 1. 변경 전 상태 확인

```bash
git status --short --branch
git log -1 --oneline
```

관련 없는 사용자의 변경사항은 보존합니다. 같은 파일을 수정해야 해서 충돌이 생기면 임의로 덮어쓰지 말고 확인합니다.

### 2. 기능 구현

프로젝트 구조와 인증 방식을 먼저 확인합니다. Fastify 라우트는 `register()`로 앱에 연결하고, 관리자 기능은 서버의 `request.auth?.role === 'admin'` 검사를 통해 보호합니다.

데이터베이스 변경이 필요하면 `src/server/database.ts`의 `CREATE TABLE IF NOT EXISTS` 또는 기존 마이그레이션 패턴을 사용합니다. 테스트에서는 `databasePath: ':memory:'`와 Fastify `inject()`를 우선 사용합니다.

### 3. 검증

변경 범위에 따라 필요한 검사를 실행합니다. 일반적인 서버/클라이언트 변경은 다음을 모두 실행합니다.

```bash
pnpm typecheck:client
pnpm run build:server
pnpm test
pnpm run build:client
git diff --check
```

`pnpm lint`는 현재 저장소의 기존 오류가 있을 수 있으므로, 실패하면 새 변경으로 생긴 오류인지 기존 오류인지 구분해서 보고합니다.

### 4. 커밋 및 GitHub 푸시

검증이 끝나면 이번 작업에 해당하는 파일만 스테이징합니다.

```bash
git add <변경한 파일>
git commit -m "<변경 내용을 설명하는 커밋 메시지>"
git push origin main
```

GitHub 인증 오류가 발생하면 `gh auth status`로 상태를 확인하고, 필요할 때 사용자가 `gh auth login`을 완료한 뒤 다시 푸시합니다. 강제 푸시는 승인 없이 하지 않습니다.

### 5. 운영 빌드 생성

커밋 후 현재 체크아웃된 소스 기준으로 운영 산출물을 생성합니다.

```bash
pnpm run build:server
pnpm run build:client
```

`build:server`는 TypeScript를 `dist/server`의 JavaScript로 컴파일합니다. `build:client`는 클라이언트 타입 검사 후 Vite 번들을 `dist/client`에 생성합니다.

### 6. launchd 서버 재시작

먼저 서비스가 등록되어 있는지 확인합니다.

```bash
launchctl print gui/$(id -u)/com.baby-timeline.server
```

서비스가 실행 중이거나 등록되어 있으면 새 빌드를 사용하도록 재시작합니다.

```bash
launchctl kickstart -k gui/$(id -u)/com.baby-timeline.server
```

상태와 HTTP 응답을 확인합니다.

```bash
launchctl print gui/$(id -u)/com.baby-timeline.server | rg 'state =|pid =|runs ='
curl -fsS http://127.0.0.1:3000/ping
```

응답은 다음과 같은 형태여야 합니다.

```json
{ "message": "pong" }
```

처음 재시작 직후에는 프로세스가 뜨는 데 시간이 걸릴 수 있습니다. 바로 연결되지 않으면 잠시 후 다시 확인하고, 계속 실패하면 다음 로그를 확인합니다.

```bash
tail -n 100 logs/server-error.log
tail -n 100 logs/server.log
```

### 7. 브라우저 캐시 확인

클라이언트 번들은 해시가 붙은 파일명으로 생성되므로 일반적으로 새 HTML을 받으면 새 번들이 로드됩니다. 화면이 이전 상태로 보이면 브라우저에서 강력 새로고침합니다.

- macOS Chrome: `⌘ + Shift + R`
- Safari: `⌥ + ⌘ + R`

## 데이터베이스와 배포

서버가 시작될 때 `createDatabase()`가 필요한 테이블과 인덱스를 `IF NOT EXISTS`로 준비합니다. 따라서 새 테이블을 추가한 변경은 새 서버 빌드로 재시작하면 기존 데이터베이스에도 반영됩니다.

다만 운영 데이터베이스를 직접 삭제하거나 초기화하지 않습니다. 데이터가 중요한 작업에서는 먼저 백업 상태를 확인하고, 삭제·초기화가 필요하면 별도 승인을 받습니다.

## 배포가 막혔을 때

- GitHub 인증 실패: `gh auth status` 확인 후 사용자에게 로그인 요청
- `dist`가 오래된 상태: `pnpm run build:server`와 `pnpm run build:client` 재실행
- launchd가 이전 프로세스를 사용함: `launchctl kickstart -k gui/$(id -u)/com.baby-timeline.server`
- 서버가 바로 종료됨: `logs/server-error.log` 확인
- 로컬 `curl`이 샌드박스에서 실패함: 권한이 있는 환경에서 다시 확인하되, launchd 로그의 `Server listening`도 함께 확인
- 운영 데이터베이스 오류: 서버를 반복 재시작하지 말고 로그를 보존한 뒤 원인을 확인

## 다음 세션을 위한 기본 규칙

이 프로젝트에서 코드 변경 요청을 완료할 때는 다음을 기본으로 합니다.

1. 변경 구현
2. 관련 테스트와 타입 검사
3. 운영 서버용 server/client 빌드
4. 커밋
5. `origin/main` 푸시
6. `com.baby-timeline.server` 재시작
7. `/ping` 및 로그로 배포 확인

단순 설명·리뷰·진단 요청처럼 코드 변경이 없는 작업은 이 배포 절차를 실행하지 않습니다.
