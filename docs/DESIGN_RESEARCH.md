# 디자인 레퍼런스 리서치 (2026-08-18)

> 계기: 배포 후 사용자 피드백 「디자인이 어플리케이션 같지 않다」— 정확한 지적. v1은 시스템 폰트+날것 폼+무채색 카드였음.

## 볼만한 레퍼런스 사이트 (사용자 직접 구경용)

| 사이트 | 뭘 보나 |
|---|---|
| **mobbin.com** | 실제 상용 앱 스크린샷 아카이브. Productivity/Habit 카테고리가 우리 앱과 직결 |
| **screensdesign.com** | 앱별 UI 분해 영상 (Amie·Structured·Fabulous 분석 있음) |
| **amie.so** | 지금 가장 「예쁜 생산성 앱」. 웜톤 배경+파스텔 일정 블록 |
| **structured.app** | 세로 타임라인 데일리 플래너의 정석 |
| **culturedcode.com/things** | Things 3 — 여백·타이포만으로 위계 만드는 미니멀의 정석 |
| **dribbble.com** ("habit tracker" 검색) | 습관앱 트렌드: progress ring·잔디·마이크로 인터랙션 |

## 핵심 발견 — 「앱처럼 보이게 하는」 결정 요소

**비주얼 (상용 앱 공통):**
1. 순백 대신 **웜톤 저채도 배경**(#FAFAFA류) + 카테고리 컬러는 진하게 — 색이 장식이 아니라 정보
2. **그림자를 4~12% opacity로 얕게** (이중 레이어) — 이거 하나로 고급스러움
3. 컬러는 **배경 통칠 금지** — 좌측 바·도트·틴트 8~12%·텍스트색으로 절제 (Things 3·Todoist)
4. **radius 12~16px·4px 스페이싱 스케일 통일** — 값 뒤섞임이 "폼처럼" 보이는 주범
5. 체크·등장·전환에 **150~300ms 마이크로 애니메이션** 필수

**네이티브룩 기법 (적은 코드로 효과 큰 순):**
1. CSS 3줄: `-webkit-tap-highlight-color:transparent` + `user-select:none` + `overscroll-behavior:contain`
2. 하단 탭바 `backdrop-filter:blur` + safe-area — iOS 탭바 정체성의 핵심
3. **Pretendard Variable** 폰트 (한국 앱 표준, OFL 무료)
4. `:active` press scale(0.97) — 카드가 눌리는 감각
5. View Transitions API 페이지 전환 (0kb 네이티브 API)
6. 폼 전면 재설계: 인라인 `<input>`/`<select>` → **바텀시트**(Vaul ~7kb) + 세그먼트 컨트롤 + 스테퍼
7. 타이포 스케일 34/28/17/12 (iOS HIG), 다크모드는 그림자 대신 명도 4단 위계

## 확정 방향 (추천안)

**「Amie 웜 미니멀 × Things 3 컬러 절제 × 네이티브 셸」**
- 배경 웜 그레이, 카드는 얕은 이중 그림자, radius 16px 통일
- 영역 6색: 좌측 4px 바 or 8~12% 틴트 + 진채도 동색 텍스트/아이콘 (통칠 금지)
- Pretendard Variable + 34/28/17/12 스케일
- 탭바 블러+SVG 아이콘(이모지 퇴출), 체크 스프링 애니메이션, 추가 폼은 바텀시트
- 다크모드: #000→표면 명도 4단

전체 근거·출처는 세션 리서치 원문 참조 (밤샘루프.md R15에 요약).
