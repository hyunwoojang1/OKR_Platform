# 목표 계열화 스펙 — 홈 세션 ↔ 목표 세션 공동 계약 (2026-08-24)

> 홈 그릴에서 사용자 확정: "소목표 달성이 대목표 진척으로 흐르는 계열화, 단 연결하는 일 자체가 없어야 한다.
> 로컬 AI가 감지하고 묶는다." 인프라(스키마·AI 하네스·롤업)는 홈 세션이 구현 완료 — **위저드 UI 연결만 목표 세션 몫.**

## 구조 (2단 트리로 제한)

```
대목표 (parent_id = null)          예: 하반기 금융권 공채 합격
 ├ 지표(KR)들 + "소목표 달성 n/m"   ← goal_agg 지표, 자동 생성·갱신 (건드리지 말 것)
 └ 소목표 (parent_id = 대목표 id)   예: 신한은행 서류 합격 — 자기 지표·주간계획·기록을 가짐
```

- `objectives.parent_id` (006 마이그레이션, 적용 완료). 소목표 아래 또 소목표는 금지(후보에서 제외됨).
- KR `source='goal_agg'`: 대목표의 "소목표 달성" 지표. 분모=자식 수, 분자=완료 자식 수.
  kr-sync가 재계산하고, 소목표 완료(setStatus)·생성(createGoalPlan) 때도 즉시 갱신됨.

## 위저드에 연결하는 법 (목표 세션 TODO)

1. **검토 화면 진입 시** (마지막 "이렇게 잡아봤어요" 단계 렌더 전):
   ```ts
   import { suggestParentGoal } from '@/lib/actions';
   const s = await suggestParentGoal({ title, areaId, dueDate }); // ParentSuggestion
   ```
   - 반환: `{ parentId, parentTitle, confidence: 'high'|'low', engine }`
   - 내부 동작: 같은 영역·최상위·활성 목표를 프리필터(기한 정합) → 로컬 Ollama가 의미 판단(JSON 강제·검증)
     → 실패 시 휴리스틱 폴백. Ollama 응답 10~30초 걸릴 수 있음 — 검토 화면에서 비동기로 받고 스피너 말고 조용히 나타나게.

2. **검토 화면 UI 한 줄** (parentId가 있을 때만):
   ```
   ☑ 「{parentTitle}」의 소목표로 넣기        ← confidence='high'면 기본 체크, 'low'면 기본 해제
   ```
   같은 영역 대목표가 여럿인데 AI가 -1을 준 경우엔 줄 자체를 안 보여줘도 됨(사용자가 원하면 나중에 연결).

3. **확정 시**: `createGoalPlan({ ..., parentId: checked ? parentId : null })` — 이미 받도록 확장돼 있음.
   parentId가 가면 대목표의 "소목표 달성" 지표가 자동 생성/갱신된다.

## 완료 흐름 (구현 완료 — 참고만)

소목표를 done으로 바꾸면(setStatus) → 대목표 goal_agg 지표 +1 → 대목표 % 상승 →
session_logs에 "소목표 달성 — {제목}" 물결 로그(대목표 귀속) → 홈·달력 농도·기록 타임라인에 반영.

## 목표 목록 UI 권장 (목표 세션 재량)

- 목표 목록에서 소목표는 대목표 카드 아래 들여쓰기/중첩으로 (영역별 그룹은 이미 areaName으로 가능).
- goal_agg 지표("소목표 달성")는 목표 상세에서 값 수정 UI를 잠글 것 (자동 관리 지표).
