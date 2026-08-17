"""job 크롤러 → goalhub.job_postings 업로드 브리지.

사용법:
  python upload_jobs.py <공고.json>
  JSON 형식: [{"source": "...", "company": "...", "title": "...", "url": "...", "deadline": "YYYY-MM-DD"|null}, ...]

크롤러(장현우\\job_applications) 일일 실행 마지막에 이 스크립트를 붙이는 건
크롤러 레포를 건드리는 일이라 내일 감독 하에 연결한다. (밤샘 안전 원칙)
접속 정보는 econ-dashboard .env.local의 SUPABASE_URL/SUPABASE_SECRET_KEY 재사용.
"""
import json
import os
import sys
import urllib.request

ENV_PATH = r"C:\Users\notebiz765\장현우\econ-dashboard\.env.local"


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
