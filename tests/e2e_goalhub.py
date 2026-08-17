# 목표허브 E2E 실유저 주행 — 7시나리오
import sys, time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3800"
TS = str(int(time.time()))[-6:]
SHOT = r"C:\Users\NOTEBI~1\AppData\Local\Temp\claude\C--Users-notebiz765-OneDrive-------\df9e9485-901a-4d72-8751-cf74a5fee614\scratchpad"
results = []

def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (" — " + detail if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})  # 폰 뷰포트
    page.set_default_timeout(15000)

    # ① 오늘: 할일 추가 → 체크
    page.goto(BASE + "/", wait_until="networkidle")
    page.fill('input[name="title"][placeholder*="할일"]', f"E2E-할일-{TS}")
    page.click('section:has(input[placeholder*="할일"]) button[type="submit"]:has-text("＋")')
    page.wait_for_timeout(1800)
    page.goto(BASE + "/", wait_until="networkidle")
    ok = page.locator(f'text=E2E-할일-{TS}').count() > 0
    check("1a 할일 추가", ok)
    if ok:
        row = page.locator(f'li:has-text("E2E-할일-{TS}")').first
        row.locator('button[aria-label="완료"]').click()
        page.wait_for_timeout(1800)
        page.goto(BASE + "/", wait_until="networkidle")
        open_list = page.locator(f'ul li:has-text("E2E-할일-{TS}"):has(button[aria-label="완료"])').count()
        check("1b 할일 체크(완료 이동)", open_list == 0)
    page.screenshot(path=f"{SHOT}/e2e1-today.png")

    # ② 목표: 분기목표 + 자동 KR + ↻갱신
    page.goto(BASE + "/okr", wait_until="networkidle")
    first_obj_form = page.locator('form:has(input[placeholder*="분기 목표 추가"])').first
    first_obj_form.locator('input[name="title"]').fill(f"E2E-목표-{TS}")
    first_obj_form.locator('button:has-text("＋목표")').click()
    page.wait_for_timeout(1800)
    page.goto(BASE + "/okr", wait_until="networkidle")
    check("2a 분기목표 생성", page.locator(f'text=E2E-목표-{TS}').count() > 0)
    obj_details = page.locator(f'details:has(summary:has-text("E2E-목표-{TS}"))').first
    kr_form = obj_details.locator('form:has(select[name="auto"])').first
    kr_form.locator('input[name="title"]').fill(f"E2E-KR-{TS}")
    kr_form.locator('input[name="target_value"]').fill("100")
    kr_form.locator('select[name="auto"]').select_option(value="api:auction_grade_a")
    kr_form.locator('button:has-text("＋KR")').click()
    page.wait_for_timeout(1800)
    page.goto(BASE + "/okr", wait_until="networkidle")
    check("2b KR(자동연결) 생성", page.locator(f'text=E2E-KR-{TS}').count() > 0)
    page.click('button:has-text("자동 KR 갱신")')
    page.wait_for_timeout(1800)
    page.goto(BASE + "/okr", wait_until="networkidle")
    kr_row = page.locator(f'div:has(> div span:text-is("E2E-KR-{TS}"))').first
    val = page.locator(f'form:has(input[name="current_value"])').filter(has=page.locator("xpath=..")).first
    cur = page.locator(f'div.text-sm:has-text("E2E-KR-{TS}") input[name="current_value"]').first.input_value()
    check("2c 자동 KR 갱신(경매 양호 수 반영)", cur not in ("", "0"), f"current={cur}")
    page.screenshot(path=f"{SHOT}/e2e2-okr.png")

    # ③ 습관: 생성 → 체크 → 잔디
    page.goto(BASE + "/habits", wait_until="networkidle")
    page.click('summary:has-text("새 습관")')
    page.fill('input[placeholder*="운동 30분"]', f"E2E-습관-{TS}")
    page.click('button:has-text("만들기")')
    page.wait_for_timeout(1800)
    page.goto(BASE + "/habits", wait_until="networkidle")
    ok = page.locator(f'section:has-text("E2E-습관-{TS}")').count() > 0
    check("3a 습관 생성", ok)
    if ok:
        sec = page.locator(f'section:has-text("E2E-습관-{TS}")').first
        sec.locator('button[aria-label*="체크"]').first.click()
        page.wait_for_timeout(1800)
        page.goto(BASE + "/habits", wait_until="networkidle")
        sec = page.locator(f'section:has-text("E2E-습관-{TS}")').first
        checked = sec.locator('button:has-text("✓")').count() > 0
        check("3b 습관 오늘 체크", checked)
    page.screenshot(path=f"{SHOT}/e2e3-habits.png")

    # ④ 일정: 추가 → 오늘 화면 반영
    page.goto(BASE + "/calendar", wait_until="networkidle")
    page.fill('input[name="title"]', f"E2E-일정-{TS}")
    today = time.strftime("%Y-%m-%d", time.localtime())
    page.fill('input[name="starts_at"]', f"{today}T21:30")
    page.click('button:has-text("추가")')
    page.wait_for_timeout(1800)
    page.goto(BASE + "/calendar", wait_until="networkidle")
    check("4a 일정 추가", page.locator(f'text=E2E-일정-{TS}').count() > 0)
    page.goto(BASE + "/", wait_until="networkidle")
    check("4b 오늘 화면에 일정 반영", page.locator(f'text=E2E-일정-{TS}').count() > 0)

    # ⑤ 마감: 할일 하나 더 만들고 마감체크 + 회고
    page.fill('input[name="title"][placeholder*="할일"]', f"E2E-마감할일-{TS}")
    page.click('section:has(input[placeholder*="할일"]) button[type="submit"]:has-text("＋")')
    page.wait_for_timeout(1800)
    page.goto(BASE + "/close", wait_until="networkidle")
    btn = page.locator(f'button:has-text("E2E-마감할일-{TS}")')
    ok = btn.count() > 0
    check("5a 마감 화면에 남은 할일 표시", ok)
    if ok:
        btn.first.click()
        page.wait_for_timeout(1800)
        page.goto(BASE + "/close", wait_until="networkidle")
        check("5b 마감 탭 체크", page.locator(f'button:has-text("E2E-마감할일-{TS}")').count() == 0)
    page.fill('input[name="note"]', f"E2E 회고 {TS}")
    page.click('button:has-text("저장")')
    page.wait_for_timeout(1800)
    page.goto(BASE + "/close", wait_until="networkidle")
    check("5c 한줄회고 저장", page.locator('text=저장됨').count() > 0)
    page.screenshot(path=f"{SHOT}/e2e5-close.png")

    # ⑥ 허브: 공고 → 할일 보내기
    page.goto(BASE + "/hub", wait_until="networkidle")
    send = page.locator('button:has-text("할일로")')
    if send.count() > 0:
        first_company = page.locator('li:has(button:has-text("할일로")) b').first.inner_text()
        send.first.click()
        page.wait_for_timeout(1800)
        page.goto(BASE + "/", wait_until="networkidle")
        check("6 공고→할일 보내기", page.locator(f'text=[지원검토] {first_company}').count() > 0, first_company)
    else:
        check("6 공고→할일 보내기", False, "보낼 공고 버튼 없음")
    page.screenshot(path=f"{SHOT}/e2e6-hub.png")

    # ⑦ 설정 렌더
    page.goto(BASE + "/settings", wait_until="networkidle")
    check("7 설정 화면", page.locator('text=알림').count() > 0)

    browser.close()

fails = [r for r in results if not r[1]]
print(f"\n== 결과: {len(results) - len(fails)}/{len(results)} PASS ==")
sys.exit(1 if fails else 0)
