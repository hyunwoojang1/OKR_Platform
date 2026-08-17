# 목표관리설정 (가칭) — ARCHITECTURE.md

> 버전: v0.2 (그릴 세션 반영, 2026-08-17 23:04 KST)
> 상태: **설계 확정** — 그릴 결정 기록은 `docs/DECISIONS.md`, 변경 이력은 `docs/versions.md`.

---

## 0. 한 줄 정의

인생 전 영역(운동·재테크·취업·자기계발·일·자격증)의 목표와 캘린더·습관을 한 곳에 모아, **매일 아침 7시 "오늘 뭘 하면 좋을지"를 푸시 알림으로 밀어주는** 개인용 PWA(홈화면 앱).

## 1. 왜 만드는가 (문제)

- 생각·계획이 여러 곳에 흩어져 있음 (업무체크리스트 docx, 캘린더, 수기 일기, 머릿속)
- "오늘 뭐부터 하지"를 매일 아침 수동으로 정리해야 함
- 장기 목표(OKR)와 오늘의 행동이 연결이 안 됨 — 급한 일만 하다 목표가 밀림
- econ-dashboard·auction처럼 홈화면 앱으로 쓰는 패턴은 검증됨 → 같은 방식으로 항상 손에 있게

**★ 기존 work-briefing(매일 08:50 docx) 체계는 이 앱이 흡수·대체한다.** 기존 체크리스트는 초기 데이터로 이관, 앱 안정화 후 docx 스케줄러 종료. (그릴 Q1)

## 2. 핵심 개념: 5단 계층 + 습관층

```
영역(Area)                    # 운동 · 재테크 · 취업 · 자기계발 · 일(부산) · 자격증 … 자유 추가
 └─ 분기 Objective            # 큰 방향
     └─ 월 마일스톤            # 분기 목표의 월 단위 중간 지점
         └─ 주간 이니셔티브     # 이번 주 행동 묶음
             └─ 오늘 할일       # 아침 브리핑의 단위

습관(Habit)                   # OKR 트리와 별도 층 — "주 3회 운동", "매일 1시간 공부"
 └─ 일별 체크 로그 + 스트릭     # 누적 실적이 KR로 자동 집계될 수 있음 (예: 분기 운동 36회)
```

- 혼합 주기(분기+월)는 관리 부담이 가장 큰 구조 → **앱이 부담을 대신 진다**: 월 전환 시 자동 이월 + 월간 리뷰 유도, 주간 이니셔티브 자동 롤오버 제안. (Q3)
- 단발성 할 일은 트리에 안 매달고 daily_tasks에 직접 넣을 수 있음.
- 반복 습관을 할일로 위장하지 않는다 — 스트릭·주기라는 고유 개념으로 취급. (Q9)

## 3. 앱 형태: PWA (확정)

| 구성요소 | 역할 |
|---|---|
| `manifest.json` | 앱 이름·아이콘·standalone 모드 |
| Service Worker | 오프라인 캐시 + **푸시 수신** |
| HTTPS (Vercel) | PWA·푸시 전제조건, 자동 충족 |

- 안드로이드 크롬: 푸시·설치 완벽 지원 / iOS 16.4+: 홈화면 추가된 PWA만 Web Push 수신 가능

## 4. 알림 아키텍처 (심장)

```
[Vercel Cron 07:00 KST]                    [Vercel Cron 21:00 KST]
        │                                          │
        ▼                                          ▼
[아침 브리핑 생성 API]                       [저녁 마감 리마인더]
  OKR·할일·습관·캘린더 읽기                    "오늘 체크할 시간"
        │                                          │
        ▼ web-push (VAPID)                         ▼
[Push 발송] ──> 폰 SW ──> 잠금화면 알림 ──탭──> 앱 '오늘' 화면
```

- **아침 브리핑 (07:00)**: 오늘 할일 **전체 목록** + 오늘의 습관 + 일정 요약. 푸시 본문이 잘려도 탭하면 앱에서 전체가 보이는 구조. (Q4)
- **저녁 마감 (21:00)**: 리마인더 1회 → 10초 탭 체크 + **선택적 「한 줄 회고」**. 체크 안 해도 자동 이월로 시스템은 안 죽음. (Q6)
- **구독 흐름**: 첫 실행 시 알림 권한 → `PushSubscription`을 DB 저장 → 크론이 발송. VAPID 키는 Vercel env (하드코딩 금지).

## 5. 아침 브리핑 엔진: 규칙 기반 (v1 확정, Q5)

입력: ① 오늘 캘린더 일정 ② 이번 주 이니셔티브 미완료 ③ 어제 이월분 ④ KR 진척 뒤처짐 ⑤ 오늘의 습관
정렬 규칙: **마감 임박 > 이월 누적 > KR 진척 뒤처진 순** — 결정론적, 모든 추천에 "왜"가 설명됨.
LLM은 P6에서 규칙 결과 위에 자연어 말투만 얹는다 (추천 결정권은 끝까지 규칙에).

## 6. 기술 스택

| 층 | 선택 | 근거 |
|---|---|---|
| 프론트/서버 | Next.js (App Router) | econ-dashboard 동일 패턴 |
| DB | Supabase (Postgres) | 기존 운영 노하우, RLS |
| 배포 | Vercel | HTTPS 자동, Cron 내장 |
| 푸시 | web-push (VAPID) | 표준, 서드파티 종속 없음 |
| 인증 | **Google OAuth 로그인** | 캘린더 연동용 OAuth를 로그인으로 겸용. 허용 이메일 1개(hyunwoojang99@gmail.com) 화이트리스트, fail-closed. (Q7) |
| 캘린더 | **Google Calendar API 양방향** | 개인 계정 기반(회사 계정 리스크 회피). 읽기+쓰기 모두 v1. (Q2) |

## 7. 데이터 모델 (v0.2)

```
areas                 # 영역 (이름, 컬러, 아이콘, 정렬순서)
objectives            # 분기 Objective (area_id, title, period 예:2026-Q3, status)
milestones            # 월 마일스톤 (objective_id, month, title, status)
key_results           # KR (objective_id, title, target, current, unit,
                      #     source: manual | habit_agg | api)   ★api=향후 econ/auction 연동 자리
initiatives           # 주간 이니셔티브 (milestone_id nullable, title, week_of, status, priority)
daily_tasks           # 오늘 할일 (initiative_id nullable, title, date, done, carried_over)
habits                # 습관 정의 (area_id, title, cadence 예:주3회|매일, target_per_week)
habit_logs            # 일별 체크 (habit_id, date, done)
calendar_events       # 일정 캐시 (google_event_id, title, starts_at, ends_at, sync_status)
daily_reviews         # 한 줄 회고 (date, note)   ★향후 일기 볼트로 내보내는 원천
push_subscriptions    # 푸시 구독 (endpoint, keys)
briefings             # 브리핑 이력 (date, content json, sent_at, opened_at)
```

- `key_results.source` — v1은 manual과 habit_agg(습관 자동집계)만 구현, `api`는 스키마 자리만. (확장 통로)
- Google 양방향 동기화: 앱에서 만든 일정 → Google에 쓰기, Google 변경 → 앱 캐시 갱신(주기 폴링 or webhook).

## 8. UI/UX: 벤토 그리드 + 영역 컬러 (Q10)

- **영역별 고유 컬러가 정보 역할** (운동=그린, 재테크=골드, 취업=블루 … 장식 아님) — 할일·습관·타일 어디서든 영역이 색으로 읽힘
- **'오늘' 화면 = 벤토 타일**: 오늘 할일(큰 타일) · 습관 체크(스트릭) · 일정 · KR 진척 — 크기가 곧 우선순위
- 라이트 기본(아침 7시 계획용) + 밤 다크 자동 전환(저녁 9시 마감용)
- 확장 타일 구조: 향후 econ-dashboard 요약 타일, 경매 신규매물 타일을 꽂을 수 있는 그리드
- 화면 구성: `/today`(벤토 홈) · `/okr`(영역→분기→월 트리) · `/calendar`(월/주) · `/habits` · `/settings`

## 9. 향후 확장 (v1 범위 아님, 자리만 확보)

| 확장 | 연결 지점 | 비고 |
|---|---|---|
| **일기 디지털화 → 생각 위키** | daily_reviews 내보내기 | 수기 일기 사진→OCR→**옵시디언식 로컬 md 볼트**→기존 RAG(rag_docs.db) 적재. 별도 웹앱 대신 볼트=위키. 한 줄 회고가 이 볼트로 흘러감 |
| econ-dashboard 연동 | key_results.source=api | 포트폴리오 수익률 등이 재테크 KR 자동 채움 |
| 경매 차익거래 연동 | 벤토 타일 + api KR | 신규 추천 매물 타일 |
| LLM 브리핑 말투 | 규칙 결과→자연어 요약 | econ-dashboard 요약 검증 게이트 패턴 재사용 |

## 10. 로드맵 (v0.2)

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| P1 | Next.js+PWA 셋업, Google 로그인(화이트리스트) | 폰 홈화면 standalone 실행 + 본인만 로그인 |
| P2 | 데이터 모델 + 영역/OKR/습관/할일 CRUD (벤토 '오늘' 화면 포함) | 실제 영역·목표·습관 입력, 기존 체크리스트 이관 |
| P3 | 푸시 파이프라인 (구독→저장→수동 발송) | 폰 잠금화면 테스트 알림 도착 |
| P4 | 브리핑 엔진(규칙) + 크론 07:00/21:00 + 마감 루프 | 매일 아침·저녁 자동 알림 실측 |
| P5 | Google Calendar 양방향 동기화 | 앱↔Google 일정 왕복 + 브리핑 반영 |
| P6 | LLM 말투 · 일기 볼트 · 외부 연동 KR | §9 확장 착수 |

주: 양방향 캘린더(P5)가 v1 확정 범위지만, 푸시 루프(P3~P4)가 앱의 심장이라 먼저 완성한다.
