# NIGHT_REPORT — 목표관리설정 밤샘루프 (2026-08-17 23:04 ~ 08-18 00:45 KST)

## ① 물어본 것 (미션)
목표 달성 툴(캘린더+OKR+습관+아침 푸시 브리핑) PWA를 만들고, econ-dashboard·경매·job 크롤러를 읽기/쓰기로 잇는 허브를 구축. 보안 우선, E2E 검수까지.

## ② 한 작업 (R0~R14, 커밋 11개)
- **앱 본체**: Next.js PWA(홈화면 설치형) — 오늘(벤토)·목표(OKR 트리)·습관(잔디+스트릭)·일정·마감(10초 체크+한줄회고)·허브·설정 7화면
- **DB**: 기존 Supabase에 goalhub 전용 스키마 14표(RLS 전부 ON·anon 완전차단·service_role만)
- **알림**: Web Push 파이프라인(VAPID) + Vercel 크론 — 아침 7시 브리핑(규칙: 마감임박>이월>진척뒤처짐, 자동이월 포함)·밤 9시 마감 리마인더
- **허브**: 읽기 3타일(경매 보수차익 추천·econ 리포트+뉴스·채용공고) + 쓰기 2종(공고→취업 할일 / KR 자동채움: 습관 집계·경매 양호등급 수·지원검토 수)
- **보안**: 세션 HMAC 쿠키·Google OAuth 코드(전환 대기)·크론 시크릿 게이트·임시 devkey 자물쇠 / **econ-dashboard에도 Google 로그인 게이트 코드 커밋(어두운 배포 — 기본 OFF, 크론 무영향 설계, 스위치는 오늘 같이)**
- **검수**: Playwright 실유저 E2E 7시나리오 **14/14 통과** (문제 6건은 적대판정 결과 전부 테스트 하네스 결함으로 판명·수정, 앱 버그 0)

## ③ 결과
- **배포 완료: https://goal-hub-blue.vercel.app** (⚠️ goal-hub.vercel.app은 남의 프로젝트 — 혼동 금지)
- 접속: 주소 뒤에 `?devkey=<토큰>` 1회 붙이면 이후 쿠키로 자동 (토큰은 Claude에게 물어보거나 `app/.env.local`의 DEV_GATE_TOKEN)
- 크론 2개 등록됨(아침 7시·밤 9시 KST) — **푸시는 폰에서 알림 켜기 전까지 발송대상 0**

## ④ 발견·판정 (밤샘 중 잡은 것)
- 🔴 areas 시드 폭주(11,838행) → 정리+unique 제약+멱등화로 원천 봉쇄
- 🔴 신규 스키마에 service_role 권한 자동부여 안 됨 → grants 마이그레이션
- 🟡 경매 등급은 S/A가 아니라 한글('양호'=최상) → 커넥터 교정
- 🟡 서버 살아있는 채 재빌드 = 혼합 빌드 서빙 → E2E 오탐 원인, 재기동 원칙화
- 🟡 Vercel sensitive env는 pull로 복구 불가 → devkey 회전으로 해결
- MEDIUM(미수정): 서버액션 실패 시 사용자용 에러 UI 없음 / iOS 푸시는 홈화면 추가 후에만

## ⑤ 전체 계획 중 현재 위치 & 다음
P1~P4 완료 + 허브(원래 P6 일부)까지 선완료. **남은 것 = Google 전환(P5 캘린더 양방향 포함)과 아래 체크리스트.**

---

# ☑️ 현우가 할 일 (오늘)

1. **Google OAuth 발급 (10분, hyunwoojang99@gmail.com 계정으로)**
   - console.cloud.google.com → 새 프로젝트(이름 자유, 예: goal-hub)
   - 「OAuth 동의 화면」: External, 테스트 사용자에 hyunwoojang99@gmail.com 추가
   - 「API 및 서비스 → 라이브러리」: **Google Calendar API** 사용 설정
   - 「사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션)」 생성, 승인된 리디렉션 URI 3개:
     - `https://goal-hub-blue.vercel.app/api/auth/callback`
     - `http://localhost:3800/api/auth/callback`
     - (econ용은 스위치 켤 때 실제 도메인 확인 후 추가)
   - 발급된 **클라이언트 ID/Secret을 Claude에게 전달** → Claude가 env 넣고 AUTH_MODE=google 전환+캘린더 동기화 마무리
2. **폰 셋업 (2분)**: https://goal-hub-blue.vercel.app?devkey=<토큰> 접속 → 홈화면에 추가 → 설정(⚙️)에서 「알림 켜기」→「테스트 알림」확인. 내일 아침 7시부터 브리핑 도착
3. **econ 보안 스위치 (Claude와 함께, 5분)**: econ 레포 push → Vercel env(GOOGLE_CLIENT_ID/SECRET·AUTH_SESSION_SECRET·AUTH_REQUIRED=true) → redeploy → 폰에서 로그인 확인 (문제 시 env 하나 지우면 즉시 원상복구)
4. (선택) job 크롤러 일일 실행 끝에 `bridge/upload_jobs.py` 연결 — 5소스 공고가 허브에 합류
