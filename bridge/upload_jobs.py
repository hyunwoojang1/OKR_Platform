"""job 크롤러 → goalhub.job_postings 업로드 브리지.

사용법:
  python upload_jobs.py <공고.json>
  JSON 형식: [{"source": "...", "company": "...", "title": "...", "url": "...", "deadline": "YYYY-MM-DD"|null}, ...]

크롤러(github_repo\\job_applications) 일일 실행 마지막 단계에서 호출된다:
  job_applications/5_AI툴/scripts/export_for_okr.py 가 변환한 JSON을 이 스크립트로 업로드.
접속 정보는 이 레포 app/.env.local의 SUPABASE_URL/SUPABASE_SECRET_KEY 재사용.
(2026-08-24 감독 하 연결 완료 — 구 econ-dashboard 경로에서 교체)
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

ENV_PATH = str(Path(__file__).resolve().parent.parent / "app" / ".env.local")


def load_env(path: str) -> dict:
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                env[k] = v
    return env


def main() -> int:
    if len(sys.argv) < 2 or not os.path.exists(sys.argv[1]):
        print("사용법: python upload_jobs.py <공고.json>")
        return 1
    with open(sys.argv[1], encoding="utf-8") as f:
        rows = json.load(f)
    if not isinstance(rows, list):
        print("JSON 최상위는 리스트여야 합니다")
        return 1

    clean = []
    for r in rows:
        if not all(r.get(k) for k in ("source", "company", "title", "url")):
            continue
        clean.append({
            "source": str(r["source"])[:50],
            "company": str(r["company"])[:200],
            "title": str(r["title"])[:300],
            "url": str(r["url"])[:500],
            "deadline": r.get("deadline") or None,
        })
    if not clean:
        print("업로드할 유효 공고 없음")
        return 0

    env = load_env(ENV_PATH)
    url = env["SUPABASE_URL"].rstrip("/") + "/rest/v1/job_postings?on_conflict=url"
    req = urllib.request.Request(
        url,
        data=json.dumps(clean).encode(),
        headers={
            "apikey": env["SUPABASE_SECRET_KEY"],
            "Authorization": f"Bearer {env['SUPABASE_SECRET_KEY']}",
            "Content-Type": "application/json",
            "Content-Profile": "goalhub",  # goalhub 스키마 대상
            "Prefer": "resolution=merge-duplicates",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        print(f"업로드 {len(clean)}건 → HTTP {res.status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
