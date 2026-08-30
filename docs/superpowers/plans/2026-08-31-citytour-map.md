# 전국 시티투어 지도 (citytour_map) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지자체가 운영하는 시티투어 버스·코스 298건을 지도에서 찾아보는 빌드 없는 정적 PWA(`citytour_map`)를 만들고, 다있맵(daitmap) 포트폴리오에 카드를 추가한다.

**Architecture:** 공공데이터포털 표준데이터(`publicDataPk=15025456`)를 무키로 다운로드(`tools/download_data.py`)해 얻은 298행을 (시군구명, 시티투어탑승장소명) 조합 120개로 묶는다. 원본에 주소·좌표가 없어 카카오 로컬 키워드검색으로 지오코딩하되(`tools/geocode.py`), 탑승장소명이 여러 장소를 `+`로 합치거나 모호한 문구인 경우가 많아 사다리형 폴백을 둔다. `tools/build_data.py`가 코스를 마커별로 묶어 `assets/js/data.js`를 생성하고, `museum_map`의 검색·필터·상세모달·독도표시 패턴을 그대로 따르는 `assets/js/app.js`로 화면을 그린다.

**Tech Stack:** Python 3(`py` 실행), `requests`(카카오 API 호출), 표준 라이브러리(`csv`, `json`, `urllib`). 프런트엔드는 순수 JS(ES5) + Leaflet 1.9 + OpenStreetMap.

**Spec:** `docs/superpowers/specs/2026-08-31-citytour-map-design.md`

## Global Constraints

- 파이썬은 `python`이 아니라 `py`로 실행한다.
- 이모지(국기 포함)를 UI에 쓰지 않는다. 아이콘은 인라인 SVG(`class="ico"`, `viewBox="0 0 24 24"`). 단, PWA 홈 화면 아이콘(`tools/make_icons.py` 산출물)은 최근 지도들(park_map 등)의 관례대로 이모지 대신 흰 픽토그램을 직접 그린다.
- 독도를 항상 위도 37.2429 / 경도 131.8664(경상북도 울릉군 울릉읍 독도리)에 `markDokdo()` + `.dokdo-label`로 직접 표시한다.
- `report.html`은 메인 UI에서 버튼을 노출하지 않는다(기본 숨김).
- `assets/js/data.js`는 `tools/build_data.py`가 생성한다 — 직접 수정하지 않는다.
- `.env`는 git에 커밋하지 않는다.
- `운행정보` 필드는 자유텍스트라 "운행중/중단" 상태를 자동 판정하지 않는다 — 원문을 그대로 노출한다.
- 원본 CSV는 `utf-8-sig` 인코딩이다(2026-08-31 실제 다운로드로 확인).
- 마커 단위는 (시군구명, 시티투어탑승장소명) 조합 120개다(2026-08-31 사용자 결정 — 시군구 단위 78개 대신 더 세밀한 쪽을 선택).

---

### Task 1: 프로젝트 골격

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `manifest.json`
- Create: `robots.txt`

**Interfaces:**
- Consumes: 없음
- Produces: 이후 모든 Task가 참조하는 디렉터리 구조

- [ ] **Step 1: `.gitignore` 작성**

```gitignore
.env
node_modules/
tools/*.csv
tools/*.json
!tools/kakao_cache.json
.DS_Store
```

- [ ] **Step 2: `.env.example` 작성**

```
# 카카오 로컬 API 인증키 (탑승장소 지오코딩용). 카카오맵 API 활성화 필요.
KAKAO_REST_KEY=
```

- [ ] **Step 3: `.env` 생성 (git에 안 잡힘)**

다른 지도 프로젝트(`museum_map`, `voucher_map` 등)의 `.env`에 있는 `KAKAO_REST_KEY`와 같은 값을 `citytour_map/.env`에 넣는다.

- [ ] **Step 4: `manifest.json` 작성**

```json
{
  "name": "전국 시티투어 지도",
  "short_name": "시티투어지도",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#F7F7F5",
  "theme_color": "#2F6690",
  "icons": [
    { "src": "assets/icons/app-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/app-icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 5: `robots.txt` 작성**

```
User-agent: *
Allow: /
```

- [ ] **Step 6: 디렉터리 생성 및 커밋**

```bash
mkdir -p assets/css assets/js assets/icons tools docs/superpowers/specs docs/superpowers/plans
git add .gitignore .env.example manifest.json robots.txt
git commit -m "citytour_map: 프로젝트 골격"
```

---

### Task 2: 원본 데이터 다운로드 스크립트

**Files:**
- Create: `tools/download_data.py` (기반: `글감/전국시티투어정보/download_citytour_data.py` — 이미 2026-08-31에 실행해 298행을 검증한 스크립트)

**Interfaces:**
- Consumes: 없음(무키 다운로드)
- Produces: `tools/citytour_raw.csv` (utf-8-sig 인코딩, 헤더는 한글 컬럼명 22개) — Task 3·4가 이 파일을 읽는다.

- [ ] **Step 1: `tools/download_data.py` 작성**

```python
# -*- coding: utf-8 -*-
"""공공데이터포털 「전국시티투어정보표준데이터」(publicDataPk=15025456)를
로그인/API키 없이 내려받아 tools/citytour_raw.csv 로 저장한다.

방법(museum_map/tools/download_data.py와 동일): ① columList.json으로 totalCount·
svcTableNm·컬럼 목록 획득 ② standard.json으로 전체 레코드 JSON 다운로드
③ 영문 컬럼코드를 원래 CSV 헤더(한글)로 매핑해 utf-8-sig CSV로 저장.
"""
import csv
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

PK = "15025456"
ROOT = Path(__file__).resolve().parent.parent
OUT_CSV = ROOT / "tools" / "citytour_raw.csv"
BASE = "https://www.data.go.kr/download"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# columCode -> 원본 CSV 한글 헤더 (data.go.kr 표준데이터 화면 다운로드 헤더와 동일)
COLUMN_MAP = {
    "CTPRVN_NM": "시도명",
    "SIGNGU_NM": "시군구명",
    "CITY_TOUR_COURSE": "시티투어코스명",
    "CITY_TOUR_REFRNC": "시티투어문의처",
    "OPER_HHMM": "시티투어운영시간",
    "OPER_MTHD": "시티투어운행방식",
    "BRDNG_PLACE_NM": "시티투어탑승장소명",
    "COURSE_INFO": "시티투어코스정보",
    "CFR_TURSM_INFO": "경유지주변관광정보",
    "CFR_TURSM_ADI_INFO": "시티투어코스부가정보",
    "OPER_INFO": "운행정보",
    "OPER_OPEN_HHMM": "운행시작시각",
    "OPER_CLOSE_HHMM": "운행종료시각",
    "CARALC_TIME": "배차시간",
    "USE_CHARGE": "이용요금",
    "USE_CHARGE_ADI_INFO": "이용요금부가정보",
    "HOMEPAGE_URL": "홈페이지주소",
    "INSTITUTION_NM": "관리기관명",
    "PHONE_NUMBER": "관리기관전화번호",
    "REFERENCE_DATE": "데이터기준일자",
    "INSTT_CODE": "제공기관코드",
    "INSTT_NM": "제공기관명",
}


def get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)


def main():
    meta = get_json(f"{BASE}/columList.json?pk={PK}&ext=CSV")
    total = meta["totalCount"]
    table = meta["tableVO"]["svcTableNm"]
    cols = [c["columCode"] for c in meta["columList"]
            if c["columCode"] not in ("INSTT_CODE", "INSTT_NM")]
    print("totalCount:", total, "| svcTableNm:", table, "| 컬럼:", len(cols))

    records = []
    page = 1
    while len(records) < total:
        params = [("publicDataPk", PK), ("totalCount", str(total)),
                  ("svcTableNm", table), ("perPage", "10000"), ("page", str(page))]
        params += [("colNmList", c) for c in cols]
        url = f"{BASE}/standard.json?" + urllib.parse.urlencode(params)
        data = get_json(url)
        chunk = data if isinstance(data, list) else (data.get("resultList") or data.get("records") or [])
        if not chunk:
            print("페이지", page, "응답 키:", list(data.keys()) if isinstance(data, dict) else data)
            break
        records.extend(chunk)
        print("페이지", page, "누적", len(records))
        page += 1

    code_order = cols + ["INSTT_CODE", "INSTT_NM"]
    header = [COLUMN_MAP[c] for c in code_order]

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for rec in records:
            w.writerow([rec.get(c, "") for c in code_order])

    print("저장:", OUT_CSV, "|", len(records), "행")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행**

Run: `cd citytour_map && py tools/download_data.py`
Expected: `totalCount: 298 | svcTableNm: ... | 컬럼: 20` 출력 후 `저장: ...\tools\citytour_raw.csv | 298 행`.

- [ ] **Step 3: 인코딩과 내용 확인**

Run: `py -c "import csv; r=list(csv.DictReader(open('tools/citytour_raw.csv', encoding='utf-8-sig'))); print(len(r)); print(r[0])"`
Expected: `298` 출력 후 첫 행 딕셔너리가 한글 깨짐 없이 출력된다(`시도명`, `시군구명` 등 키 포함).

- [ ] **Step 4: 커밋**

```bash
git add tools/download_data.py
git commit -m "citytour_map: 원본 CSV 다운로드 스크립트"
```

---

### Task 3: 지오코딩 스크립트 (사다리형 폴백)

**Files:**
- Create: `tools/geocode.py`

**Interfaces:**
- Consumes: `tools/citytour_raw.csv`(Task 2), `.env`의 `KAKAO_REST_KEY`
- Produces: `tools/geocoded.json` — 배열, 각 원소 `{sido, sigungu, place, lat, lng, geoApprox}`. Task 4가 `(sigungu, place)` 키로 이 파일을 조인한다. `tools/kakao_cache.json`(재실행 시 캐시, 커밋 대상).

- [ ] **Step 1: `tools/geocode.py` 작성**

```python
# -*- coding: utf-8 -*-
"""citytour_raw.csv 의 고유 (시군구명, 시티투어탑승장소명) 120개를
카카오 로컬 API로 지오코딩해 tools/geocoded.json 을 만든다.

원본에 주소가 없고 탑승장소명 텍스트만 있다. 게다가 이 텍스트가
"청주가경시외버스터미널+청주체육관"처럼 여러 곳을 "+"로 이어붙이거나
"출발희망지(청주시)"처럼 장소가 아닌 안내문구인 경우가 많다.
그래서 지오코딩 사다리를 둔다:
  1) 괄호 제거 -> "+" 분리 -> 각 조각을 "{시군구명} {조각}"으로 키워드검색, 첫 성공 채택
  2) 전부 실패하면 "{시도명} {시군구명}청" 키워드검색으로 대체 (geoApprox=True)
캐시(kakao_cache.json)로 재실행 시 이미 조회한 질의는 건너뛴다.
"""
import csv
import json
import re
import sys
import time
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "citytour_raw.csv"
CACHE_FILE = ROOT / "tools" / "kakao_cache.json"
OUT = ROOT / "tools" / "geocoded.json"
KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
REQUEST_SLEEP = 0.05
KOREA_BOX = (33.0, 38.7, 124.5, 132.1)  # 독도 경도 131.87 포함


def load_kakao_key():
    env_path = ROOT / ".env"
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("KAKAO_REST_KEY="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError(".env 에서 KAKAO_REST_KEY를 찾을 수 없습니다.")


session = requests.Session()
session.headers["Authorization"] = "KakaoAK " + load_kakao_key()
cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}


def save_cache():
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def in_korea(lat, lng):
    return KOREA_BOX[0] <= lat <= KOREA_BOX[1] and KOREA_BOX[2] <= lng <= KOREA_BOX[3]


def kakao_keyword(query):
    key = "kw:" + query
    if key in cache:
        return cache[key]
    for attempt in range(3):
        try:
            r = session.get(KAKAO_KEYWORD_URL, params={"query": query}, timeout=15)
            if r.status_code == 429:
                time.sleep(1.0)
                continue
            r.raise_for_status()
            docs = r.json().get("documents", [])
            hit = None
            for d in docs:
                lat, lng = float(d["y"]), float(d["x"])
                if in_korea(lat, lng):
                    hit = {"lat": round(lat, 6), "lng": round(lng, 6)}
                    break
            cache[key] = hit
            save_cache()
            time.sleep(REQUEST_SLEEP)
            return hit
        except requests.RequestException as e:
            if attempt == 2:
                print(f"  ! 요청 실패: {query!r} ({e})")
                return None
            time.sleep(0.5)
    return None


def clean_fragments(place):
    """탑승장소명 원문 -> 검색에 쓸 조각 리스트. 괄호 제거 후 '+'로 분리."""
    no_paren = re.sub(r"\([^)]*\)", "", place)
    fragments = [f.strip() for f in no_paren.split("+")]
    return [f for f in fragments if f]


def geocode_one(sido, sigungu, place):
    for frag in clean_fragments(place):
        hit = kakao_keyword(f"{sigungu} {frag}")
        if hit:
            return hit["lat"], hit["lng"], False
    hit = kakao_keyword(f"{sido} {sigungu}청")
    if hit:
        return hit["lat"], hit["lng"], True
    return None, None, True


def main():
    with SRC.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    seen = {}
    for r in rows:
        key = (r["시군구명"], r["시티투어탑승장소명"])
        seen.setdefault(key, r["시도명"])

    out = []
    failed = []
    for i, ((sigungu, place), sido) in enumerate(seen.items(), 1):
        lat, lng, approx = geocode_one(sido, sigungu, place)
        if lat is None:
            failed.append((sido, sigungu, place))
            print(f"[{i}/{len(seen)}] 실패: {sido} {sigungu} {place}")
            continue
        out.append({
            "sido": sido, "sigungu": sigungu, "place": place,
            "lat": lat, "lng": lng, "geoApprox": approx,
        })
        if i % 20 == 0:
            print(f"[{i}/{len(seen)}] 진행 중...")

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    approx_count = sum(1 for o in out if o["geoApprox"])
    print(f"완료: {len(out)}/{len(seen)} (근사 {approx_count}건, 실패 {len(failed)}건) -> {OUT}")
    if failed:
        print("실패 목록:", failed)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행**

Run: `py tools/geocode.py`
Expected: 진행 로그 후 `완료: 120/120 (근사 N건, 실패 0건) -> ...\tools\geocoded.json`. `실패`가 0이 아니면 원인(해당 시군구명 표기가 카카오와 다른지 등)을 확인한다 — "○○청" 폴백은 실질적으로 모든 시군구에서 성공해야 한다.

- [ ] **Step 3: 근사 좌표 비율 확인**

Run: `py -c "import json; d=json.load(open('tools/geocoded.json', encoding='utf-8')); a=[x for x in d if x['geoApprox']]; print(len(a), '/', len(d)); [print(x['sigungu'], x['place']) for x in a]"`
Expected: 근사 좌표 목록이 출력된다. 전체의 절반을 넘으면(60건 이상) 사다리 1)단계 로직(괄호 제거·`+` 분리)을 다시 살펴본다 — 스펙 3절 기준.

- [ ] **Step 4: 커밋**

```bash
git add tools/geocode.py tools/kakao_cache.json
git commit -m "citytour_map: 카카오 지오코딩 스크립트 (사다리형 폴백)"
```

---

### Task 4: 정제 스크립트 — `assets/js/data.js` 생성

**Files:**
- Create: `tools/build_data.py`

**Interfaces:**
- Consumes: `tools/citytour_raw.csv`(Task 2), `tools/geocoded.json`(Task 3)
- Produces: `assets/js/data.js` — `window.CITYTOUR_META`, `window.CITYTOUR_SIDOS`, `window.CITYTOUR`(마커 배열). 마커 스키마: `{id, sido, sigungu, place, lat, lng, geoApprox, courses: [{name, method, hours, operInfo, opStart, opEnd, interval, fee, feeFree, feeEtc, courseInfo, aroundInfo, homepage, contact, org, orgPhone, refDate}]}`. Task 6(app.js)이 이 스키마를 소비한다.

- [ ] **Step 1: `tools/build_data.py` 작성**

```python
# -*- coding: utf-8 -*-
"""citytour_raw.csv + geocoded.json 을 합쳐 assets/js/data.js 를 생성한다.
마커 단위는 (시군구명, 시티투어탑승장소명) 조합 — 같은 탑승장소에서 출발하는
여러 코스를 courses 배열로 묶는다.
"""
import csv
import json
import sys
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "citytour_raw.csv"
GEOCODED = ROOT / "tools" / "geocoded.json"
OUT = ROOT / "assets" / "js" / "data.js"


def is_free(fee_text):
    t = (fee_text or "").strip()
    return t in ("", "0", "0원") or "무료" in t


def main():
    with SRC.open(encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    geocoded = json.loads(GEOCODED.read_text(encoding="utf-8"))
    coord_by_key = {(g["sigungu"], g["place"]): g for g in geocoded}

    markers = {}
    skipped = []
    for r in rows:
        key = (r["시군구명"], r["시티투어탑승장소명"])
        g = coord_by_key.get(key)
        if not g:
            skipped.append(key)
            continue
        if key not in markers:
            markers[key] = {
                "id": len(markers) + 1,
                "sido": r["시도명"],
                "sigungu": r["시군구명"],
                "place": r["시티투어탑승장소명"],
                "lat": g["lat"],
                "lng": g["lng"],
                "geoApprox": g["geoApprox"],
                "courses": [],
            }
        markers[key]["courses"].append({
            "name": r["시티투어코스명"],
            "method": r["시티투어운행방식"],
            "hours": r["시티투어운영시간"],
            "operInfo": r["운행정보"],
            "opStart": r["운행시작시각"],
            "opEnd": r["운행종료시각"],
            "interval": r["배차시간"],
            "fee": r["이용요금"],
            "feeFree": is_free(r["이용요금"]),
            "feeEtc": r["이용요금부가정보"],
            "courseInfo": r["시티투어코스정보"],
            "aroundInfo": r["경유지주변관광정보"],
            "homepage": r["홈페이지주소"],
            "contact": r["시티투어문의처"],
            "org": r["관리기관명"],
            "orgPhone": r["관리기관전화번호"],
            "refDate": r["데이터기준일자"],
        })

    items = sorted(markers.values(), key=lambda m: (m["sido"], m["sigungu"], m["place"]))
    sidos = sorted({m["sido"] for m in items})
    total_courses = sum(len(m["courses"]) for m in items)
    approx_count = sum(1 for m in items if m["geoApprox"])

    meta = {
        "surveyDate": date.today().isoformat(),
        "source": "공공데이터포털 전국시티투어정보표준데이터",
        "total": len(items),
        "totalCourses": total_courses,
        "geoApproxCount": approx_count,
        "skippedCount": len(skipped),
    }

    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    body = "\n".join([
        "// 자동 생성 파일 -- tools/build_data.py 가 생성. 직접 수정하지 마세요.",
        f"window.CITYTOUR_META = {dump(meta)};",
        f"window.CITYTOUR_SIDOS = {dump(sidos)};",
        f"window.CITYTOUR = {dump(items)};",
        "",
    ])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(body, encoding="utf-8")

    print(f"완료: 마커 {len(items)}곳 / 코스 {total_courses}건 (근사좌표 {approx_count}곳, 좌표 없어 제외 {len(skipped)}건)")
    if skipped:
        print("제외 목록:", skipped)
    print(OUT)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행**

Run: `py tools/build_data.py`
Expected: `완료: 마커 120곳 / 코스 298건 (근사좌표 N곳, 좌표 없어 제외 0건)`과 함께 `assets/js/data.js` 생성. `제외`가 0이 아니면 Task 3의 `geocoded.json`이 최신인지(재실행했는지) 확인한다.

- [ ] **Step 3: 문법 검증**

Run: `node --check assets/js/data.js`
Expected: 아무 출력 없이 종료.

- [ ] **Step 4: 커밋**

```bash
git add tools/build_data.py assets/js/data.js
git commit -m "citytour_map: 정제 스크립트 및 data.js 생성"
```

---

### Task 5: "내 주변" 모듈 이식

**Files:**
- Create: `assets/js/geo.js` (내용은 `shelter_map/assets/js/geo.js`를 그대로 복사)

**Interfaces:**
- Consumes: 없음
- Produces: Task 6(app.js)이 `latLngOf`, `onClear`, `onChange`, `unitLabel: '탑승장'`으로 호출

- [ ] **Step 1: 복사**

```bash
cp ../shelter_map/assets/js/geo.js assets/js/geo.js
```

- [ ] **Step 2: 동일성 확인**

Run: `diff ../shelter_map/assets/js/geo.js assets/js/geo.js`
Expected: 출력 없음.

- [ ] **Step 3: 문법 검증**

Run: `node --check assets/js/geo.js`
Expected: 아무 출력 없이 종료.

- [ ] **Step 4: 커밋**

```bash
git add assets/js/geo.js
git commit -m "citytour_map: geo.js 이식"
```

---

### Task 6: `assets/js/app.js` — 지도·필터·상세 패널

**Files:**
- Create: `assets/js/app.js`

**Interfaces:**
- Consumes: `window.CITYTOUR`(Task 4의 마커 배열), `window.CITYTOUR_META`, `window.CITYTOUR_SIDOS`, `assets/js/geo.js`(Task 5)
- Produces: `index.html`(Task 7)이 참조하는 DOM id 전부

마커가 코스를 여러 개 품는 구조라 `museum_map/assets/js/app.js`를 그대로 복사해 쓸 수 없다(museum_map은 시설 1개 = 레코드 1개). 아래 전체 코드를 새로 작성한다. 검색·시도/시군구 필터·독도 표시·"내 주변" 연동 패턴은 museum_map과 동일하게 유지한다.

- [ ] **Step 1: `assets/js/app.js` 작성**

```javascript
/* 전국 시티투어 지도 — 앱 로직 */
(function () {
  'use strict';

  var CITYTOUR = window.CITYTOUR || [];
  var CITYTOUR_META = window.CITYTOUR_META || {};
  var CITYTOUR_SIDOS = window.CITYTOUR_SIDOS || [];
  var METHOD_ORDER = ['고정형', '순환형'];

  var state = {
    q: '',
    sido: '',
    district: '',   // "시도|시군구" 복합 키
    method: '',
    freeOnly: false,
    view: 'list'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function safeUrl(u) {
    return /^https?:\/\//i.test(String(u == null ? '' : u)) ? String(u) : '';
  }
  function districtKey(m) { return m.sido + '|' + m.sigungu; }

  /* ---------- 필터링 ---------- */
  function matches(m) {
    if (state.sido && m.sido !== state.sido) return false;
    if (state.district && districtKey(m) !== state.district) return false;
    if (state.method && !m.courses.some(function (c) { return c.method === state.method; })) return false;
    if (state.freeOnly && !m.courses.some(function (c) { return c.feeFree; })) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      var hay = [m.place, m.sigungu, m.sido].concat(m.courses.map(function (c) { return c.name; }))
        .join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  /* ---------- 지도 ---------- */
  var DEFAULT_VIEW = { center: [36.30, 127.80], zoom: 7 };
  var map = L.map('map', { zoomControl: true, renderer: L.canvas() })
    .setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  /* ---------- 독도 ---------- */
  // 배경 지도 표기는 축척·언어에 따라 달라지거나 빠질 수 있다.
  // 우리 지도에서는 독도를 항상 같은 자리에 직접 그린다. (독도 표시)
  // 행정구역: 경상북도 울릉군 울릉읍 독도리
  (function markDokdo() {
    var dokdo = L.circleMarker([37.2429, 131.8664], {
      radius: 5,
      color: '#2f2e2b',
      weight: 1.6,
      fillColor: '#ffffff',
      fillOpacity: 1
    }).addTo(map);
    dokdo.bindTooltip('독도', {
      permanent: true,
      direction: 'right',
      offset: [6, 0],
      className: 'dokdo-label'
    });
    dokdo.bindPopup('<b>독도</b><br>경상북도 울릉군 울릉읍 독도리');
  })();

  var markerLayer = L.layerGroup().addTo(map);
  var markersById = {};

  function renderMarkers(list) {
    markerLayer.clearLayers();
    markersById = {};
    list.forEach(function (m) {
      var hasFree = m.courses.some(function (c) { return c.feeFree; });
      var marker = L.circleMarker([m.lat, m.lng], {
        radius: 8,
        fillColor: hasFree ? '#176B5B' : '#2F6690',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.9
      });
      var popupHtml =
        '<div class="popup-name">' + esc(m.place) + '</div>' +
        '<div class="popup-meta">' + esc(m.sido) + ' ' + esc(m.sigungu) + ' · 코스 ' + m.courses.length + '개' +
        (m.geoApprox ? ' · 위치 근사치' : '') + '</div>' +
        '<button class="popup-btn" data-popup-detail="' + m.id + '">자세히 보기</button>';
      marker.bindPopup(popupHtml);
      marker.addTo(markerLayer);
      markersById[m.id] = marker;
    });
  }

  /* ---------- 카드에서 지도 위치로 이동 ---------- */
  function locateOnMap(id) {
    var m = CITYTOUR.find(function (x) { return x.id === id; });
    if (!m) return;
    if (window.innerWidth <= 900 && state.view !== 'map') {
      state.view = 'map';
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p.getAttribute('data-view') === 'map');
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-list');
      grid.classList.add('view-map');
      setTimeout(function () { map.invalidateSize(); }, 50);
    }
    map.flyTo([m.lat, m.lng], 14, { duration: 0.8 });
    var marker = markersById[m.id];
    if (marker) map.once('moveend', function () { marker.openPopup(); });
  }

  /* ---------- 카드 ---------- */
  function cardHtml(m) {
    var hasFree = m.courses.some(function (c) { return c.feeFree; });
    var tags = [
      nearby.tag(m),
      '<span class="tag district">' + esc(m.sido) + ' ' + esc(m.sigungu) + '</span>',
      '<span class="tag">코스 ' + m.courses.length + '개</span>'
    ];
    if (hasFree) tags.push('<span class="tag free">무료 코스 있음</span>');
    if (m.geoApprox) tags.push('<span class="tag approx">위치 근사치</span>');
    return (
      '<article class="facility-card" data-id="' + m.id + '">' +
        '<div class="card-body">' +
          '<div class="card-title-row">' +
            '<h3 class="card-name">' + esc(m.place) + '</h3>' +
          '</div>' +
          '<div class="card-tags">' + tags.join('') + '</div>' +
          '<button class="card-locate" data-locate="' + m.id + '">위치보기</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderCards(list) {
    var grid = document.getElementById('cardGrid');
    grid.innerHTML = list.map(cardHtml).join('');
    document.getElementById('emptyState').hidden = list.length > 0;
  }

  /* ---------- 상세 모달 ---------- */
  function detailRow(k, v, isLink) {
    if (!v) return '';
    var val = isLink
      ? (safeUrl(v) ? '<a href="' + esc(safeUrl(v)) + '" target="_blank" rel="noopener">' + esc(v) + '</a>' : esc(v))
      : esc(v);
    return '<div class="detail-item"><span class="k">' + k + '</span><span class="v">' + val + '</span></div>';
  }

  function courseHtml(c) {
    var feeText = c.feeFree ? '무료' : (c.fee || '');
    return (
      '<div class="course-block">' +
        '<h4 class="course-name">' + esc(c.name) + '</h4>' +
        '<div class="detail-list">' +
          detailRow('운행방식', c.method) +
          detailRow('운영시간', c.hours) +
          detailRow('운행정보', c.operInfo) +
          detailRow('운행시각', (c.opStart || c.opEnd) ? (esc(c.opStart) + ' ~ ' + esc(c.opEnd)) : '') +
          detailRow('배차시간', c.interval) +
          detailRow('이용요금', feeText) +
          detailRow('요금 참고', c.feeEtc) +
          detailRow('코스', c.courseInfo) +
          detailRow('경유지 주변 관광정보', c.aroundInfo) +
          detailRow('홈페이지', c.homepage, true) +
          detailRow('문의처', c.contact) +
          detailRow('관리기관', c.org) +
          detailRow('관리기관 전화', c.orgPhone) +
          detailRow('자료 기준일', c.refDate) +
        '</div>' +
      '</div>'
    );
  }

  window.openMarkerModal = function (id) {
    var m = CITYTOUR.find(function (x) { return x.id === id; });
    if (!m) return;
    var naverUrl = 'https://map.naver.com/p/search/' +
      encodeURIComponent(m.sido + ' ' + m.sigungu + ' ' + m.place);
    var body = document.getElementById('modalBody');
    body.innerHTML =
      '<h2 class="modal-title">' + esc(m.place) + '</h2>' +
      '<div class="modal-tags">' +
        '<span class="tag district">' + esc(m.sido) + ' ' + esc(m.sigungu) + '</span>' +
        (m.geoApprox ? '<span class="tag approx">위치 근사치 — 정확한 탑승 위치는 문의처에 확인하세요</span>' : '') +
      '</div>' +
      '<div class="detail-list">' +
        detailRow('내 위치에서', nearby.text(m)) +
      '</div>' +
      m.courses.map(courseHtml).join('') +
      '<div class="modal-links">' +
        '<a class="link-btn map" href="' + naverUrl + '" target="_blank" rel="noopener">네이버 길찾기</a>' +
      '</div>';
    document.getElementById('modalOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  };

  function closeModal() {
    document.getElementById('modalOverlay').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- 렌더 파이프라인 ---------- */
  function render() {
    var list = nearby.sort(CITYTOUR.filter(matches));
    renderMarkers(list);
    renderCards(list);
    document.getElementById('resultCount').textContent = nearby.active()
      ? '가까운 ' + list.length + '곳'
      : '총 ' + list.length + '곳' + (list.length < CITYTOUR.length ? ' (전체 ' + CITYTOUR.length + '곳 중)' : '');
  }

  /* ---------- 내 주변 ----------
     권한 요청·거리 계산·내 위치 마커는 geo.js 가 맡는다. 이 앱이 알려줄 것은
     좌표를 꺼내는 법과, 지역 필터를 어떻게 푸는지뿐이다. */
  function clearRegion() {
    state.sido = '';
    state.district = '';
    document.getElementById('districtSelect').value = '';
    document.querySelectorAll('#sidoFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-sido') === '');
    });
  }

  var nearby = window.createNearby({
    map: map,
    button: document.getElementById('nearbyBtn'),
    label: document.getElementById('nearbyLabel'),
    notice: document.getElementById('nearbyNotice'),
    unitLabel: '탑승장',
    latLngOf: function (m) { return [m.lat, m.lng]; },
    onClear: clearRegion,
    onChange: render
  });

  /* ---------- 초기 UI 구성 ---------- */
  function buildFilterPills() {
    var sidoRow = document.getElementById('sidoFilters');
    var sPills = ['<button class="pill active" data-sido="">전체</button>'];
    CITYTOUR_SIDOS.forEach(function (s) {
      sPills.push('<button class="pill" data-sido="' + esc(s) + '">' + esc(s) + '</button>');
    });
    sidoRow.insertAdjacentHTML('beforeend', sPills.join(''));

    var methodRow = document.getElementById('methodFilters');
    var mPills = ['<button class="pill active" data-method="">전체</button>'];
    METHOD_ORDER.forEach(function (t) {
      mPills.push('<button class="pill" data-method="' + t + '">' + t + '</button>');
    });
    methodRow.insertAdjacentHTML('beforeend', mPills.join(''));
  }

  function buildDistrictSelect() {
    var sel = document.getElementById('districtSelect');
    var bySido = {};
    CITYTOUR.forEach(function (m) {
      if (!bySido[m.sido]) bySido[m.sido] = {};
      bySido[m.sido][m.sigungu] = (bySido[m.sido][m.sigungu] || 0) + 1;
    });
    CITYTOUR_SIDOS.forEach(function (s) {
      if (!bySido[s]) return;
      var group = document.createElement('optgroup');
      group.label = s;
      Object.keys(bySido[s]).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
        .forEach(function (d) {
          var opt = document.createElement('option');
          opt.value = s + '|' + d;
          opt.textContent = s + ' ' + d + ' (' + bySido[s][d] + ')';
          group.appendChild(opt);
        });
      sel.appendChild(group);
    });
  }

  /* ---------- 이벤트 ---------- */
  function setDistrict(key) {
    nearby.off();
    state.district = key;
    document.getElementById('districtSelect').value = key;
    if (key) {
      var parts = key.split('|');
      var sub = CITYTOUR.filter(function (m) { return m.sido === parts[0] && m.sigungu === parts[1]; });
      if (sub.length) {
        var bounds = L.latLngBounds(sub.map(function (m) { return [m.lat, m.lng]; }));
        map.flyToBounds(bounds.pad(0.3), { duration: 0.8 });
      }
    } else {
      map.flyTo(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom, { duration: 0.8 });
    }
    render();
  }

  function setSido(s) {
    nearby.off();   /* 지역을 고르는 건 내 주변을 그만두겠다는 뜻이다 */
    state.sido = s;
    if (state.district && s && state.district.split('|')[0] !== s) {
      state.district = '';
      document.getElementById('districtSelect').value = '';
    }
    document.querySelectorAll('#sidoFilters .pill').forEach(function (p) {
      p.classList.toggle('active', p.getAttribute('data-sido') === s);
    });
    if (!state.district) {
      var sub = CITYTOUR.filter(function (m) { return !s || m.sido === s; });
      if (sub.length) {
        var bounds = L.latLngBounds(sub.map(function (m) { return [m.lat, m.lng]; }));
        map.flyToBounds(bounds.pad(0.2), { duration: 0.8 });
      }
    }
    render();
  }

  var searchTimer = null;
  document.getElementById('searchInput').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.q = e.target.value.trim();
      render();
    }, 200);
  });

  document.getElementById('districtSelect').addEventListener('change', function (e) {
    setDistrict(e.target.value);
  });

  var filterToggleBtn = document.getElementById('filterToggleBtn');
  var filterGroups = document.getElementById('filterGroups');
  filterToggleBtn.addEventListener('click', function () {
    var willOpen = filterGroups.hidden;
    filterGroups.hidden = !willOpen;
    var label = willOpen ? '필터 닫기' : '필터 열기';
    filterToggleBtn.title = label;
    filterToggleBtn.setAttribute('aria-label', label);
    filterToggleBtn.setAttribute('aria-expanded', String(willOpen));
  });

  document.addEventListener('click', function (e) {
    var t = e.target;

    var locateBtn = t.closest('[data-locate]');
    if (locateBtn) {
      e.stopPropagation();
      locateOnMap(Number(locateBtn.getAttribute('data-locate')));
      return;
    }

    var popupBtn = t.closest('[data-popup-detail]');
    if (popupBtn) {
      window.openMarkerModal(Number(popupBtn.getAttribute('data-popup-detail')));
      return;
    }

    var sidoPill = t.closest('[data-sido]');
    if (sidoPill) {
      setSido(sidoPill.getAttribute('data-sido'));
      return;
    }

    var methodPill = t.closest('[data-method]');
    if (methodPill) {
      state.method = methodPill.getAttribute('data-method');
      document.querySelectorAll('#methodFilters .pill').forEach(function (p) {
        p.classList.toggle('active', p === methodPill);
      });
      render();
      return;
    }

    var togglePill = t.closest('[data-toggle]');
    if (togglePill) {
      var key = togglePill.getAttribute('data-toggle');
      state[key] = !state[key];
      document.querySelectorAll('[data-toggle="' + key + '"]').forEach(function (p) {
        p.classList.toggle('active', state[key]);
      });
      render();
      return;
    }

    var viewBtn = t.closest('[data-view]');
    if (viewBtn) {
      state.view = viewBtn.getAttribute('data-view');
      document.querySelectorAll('#viewToggle .pill').forEach(function (p) {
        p.classList.toggle('active', p === viewBtn);
      });
      var grid = document.querySelector('.content-grid');
      grid.classList.remove('view-map', 'view-list');
      grid.classList.add('view-' + state.view);
      if (state.view === 'map') setTimeout(function () { map.invalidateSize(); }, 50);
      return;
    }

    var card = t.closest('.facility-card');
    if (card) {
      window.openMarkerModal(Number(card.getAttribute('data-id')));
      return;
    }

    if (t.id === 'modalClose' || t.id === 'modalOverlay') closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  document.getElementById('resetBtn').addEventListener('click', function () {
    state.q = ''; state.method = ''; state.freeOnly = false;
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.filter-groups .pill').forEach(function (p) {
      p.classList.toggle('active',
        p.getAttribute('data-sido') === '' || p.getAttribute('data-method') === '');
    });
    document.querySelectorAll('[data-toggle]').forEach(function (p) { p.classList.remove('active'); });
    setSido('');
    setDistrict('');
  });

  /* ---------- 시작 ---------- */
  document.getElementById('surveyDate').textContent = CITYTOUR_META.surveyDate || '';
  document.getElementById('totalCount').textContent = CITYTOUR.length;
  document.getElementById('totalCourses').textContent = CITYTOUR_META.totalCourses || '';
  buildFilterPills();
  buildDistrictSelect();
  if (window.innerWidth <= 900) {
    document.querySelector('.content-grid').classList.add('view-list');
  }
  var params = new URLSearchParams(location.search);
  var paramDistrict = params.get('district');
  var paramSido = params.get('sido');
  if (paramDistrict && paramDistrict.indexOf('|') !== -1) {
    setDistrict(paramDistrict);
  } else if (paramSido && CITYTOUR_SIDOS.indexOf(paramSido) !== -1) {
    setSido(paramSido);
  } else {
    render();
  }

  // PWA: 서비스 워커 등록 (홈 화면 설치 · 오프라인 지원)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('서비스 워커 등록 실패:', err);
      });
    });
  }
})();
```

- [ ] **Step 2: 문법 검증**

Run: `node --check assets/js/app.js`
Expected: 아무 출력 없이 종료.

- [ ] **Step 3: 커밋**

```bash
git add assets/js/app.js
git commit -m "citytour_map: app.js"
```

---

### Task 7: `index.html` / `report.html` / `style.css` / `sw.js`

**Files:**
- Create: `index.html` (기반: `museum_map/index.html`)
- Create: `report.html` (기반: `museum_map/report.html`)
- Create: `assets/css/style.css` (기반: `museum_map/assets/css/style.css`)
- Create: `sw.js` (기반: `museum_map/sw.js`)

**Interfaces:**
- Consumes: Task 6의 `app.js`가 참조하는 DOM id 전부
- Produces: 브라우저에서 열리는 완성된 페이지

- [ ] **Step 1: index.html**

```bash
cp ../museum_map/index.html index.html
```

다음과 같이 고친다:
- `<title>` → `전국 시티투어 지도`
- `<meta name="description">` → `지자체 시티투어 버스·코스 298개를 지도에서 찾아보고, 요금·운행시간을 한눈에 확인하세요`
- `<meta name="theme-color">` → `#2F6690`
- `<meta name="apple-mobile-web-app-title">` → `시티투어지도`
- 헤더 `.sign-mark` SVG를 버스 픽토그램으로 교체:
  ```html
  <svg class="sign-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="5" width="18" height="11" rx="2"/>
    <path d="M3 12h18M6 5V3M18 5V3"/>
    <circle cx="7.5" cy="19" r="1.6" fill="currentColor" stroke="none"/>
    <circle cx="16.5" cy="19" r="1.6" fill="currentColor" stroke="none"/>
  </svg>
  ```
- `.app-title` 텍스트 → `전국 시티투어`
- `.sign-count`를 두 줄로: `<span class="num" id="totalCount">120</span><span class="unit">곳</span>` 아래에 `<p class="sign-sub">코스 <span class="num" id="totalCourses">298</span>개</p>` 추가(`.sign-sub`는 Step 3에서 CSS 추가)
- `.app-notice` 문구 → `운행정보·요금은 참고용입니다. 방문 전 관리기관에 꼭 확인하세요.`
- `#searchInput`의 `placeholder` → `코스 이름이나 시군구로 검색해 보세요`
- `#districtSelect`의 기본 옵션 텍스트 → `전체 시·군·구`(유지)
- `.filter-groups` 안 `#regionFilters`를 `#sidoFilters`로, `data-key="region"`을 `data-key="sido"`로 바꾸고 라벨을 `지역`으로 유지
- `#typeFilters`를 `#methodFilters`로, `data-key="type"`을 `data-key="method"`로, 라벨을 `운행방식`으로
- `#kindFilters` 블록(`<div class="filter-row" id="kindFilters" ...>`) 전체 삭제 — 이 프로젝트에는 종류 필터가 없다
- 빠른필터 줄: `무료만` 버튼의 `id="feeFree" data-toggle="fee"`를 `id="freeOnlyQuick" data-toggle="freeOnly"`로, 라벨을 `무료 코스 있음`으로. `찜만 보기` 버튼과 `favOnly` 관련 요소는 전부 삭제(이 프로젝트는 찜 기능이 없다)
- `.result-count-row`의 `#favOnly` 버튼 삭제
- `.map-legend`(`#mapLegend`) 삭제 — 종류별 색상 범례가 없다(app.js에서도 `buildLegend` 호출을 이미 넣지 않았다)
- footer 문구 → `자료: 공공데이터포털 「전국시티투어정보표준데이터」 (조회일 <span id="surveyDate"></span>) · 운행정보·요금은 바뀔 수 있으니 방문 전 관리기관에 꼭 확인하세요.`
- `.site-notice` 문구 → `© 2026 전국 시티투어 지도 · 무단 복제를 금합니다. 본 사이트는 정보 공유 목적으로 제공됩니다. 시설명·상표 등의 권리는 해당 권리자에게 있습니다.`
- `<script>` 로드 순서를 `data.js` → `geo.js` → `app.js` → `share-link.js`로 확인(museum_map과 동일 순서라 그대로 둔다)

- [ ] **Step 2: report.html**

```bash
cp ../museum_map/report.html report.html
```

`window.MUSEUMS`/`DATA_META` 등을 참조하는 부분을 `window.CITYTOUR`/`window.CITYTOUR_META`로 바꾸고, `CITYTOUR_META.total`(마커 수), `CITYTOUR_META.totalCourses`(코스 수), `CITYTOUR_META.geoApproxCount`(근사 좌표 수), `CITYTOUR_META.skippedCount`(좌표 없어 제외된 수)를 표로 보여준다.

- [ ] **Step 3: style.css**

```bash
cp ../museum_map/assets/css/style.css assets/css/style.css
```

- `:root`의 `--sign`을 `#2F6690`으로, `--sign-wash`를 그 옅은 톤으로 조정
- `--kind-1`~`--kind-6` 변수와 그것을 쓰는 규칙(`.legend-dot`, `.type-*` 등 kind 전용 스타일) 삭제 — 이 프로젝트는 마커를 무료 여부 2색으로만 칠한다(app.js에서 색을 직접 지정하므로 CSS 변수 불필요)
- `.card-title-row` 안 `.fav-btn`, `HEART_ICON` 관련 스타일 삭제(찜 기능 없음)
- `.sign-count` 아래 `.sign-sub` 스타일 추가:
  ```css
  .sign-sub {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: var(--fs-s);
    color: var(--sign-ink);
    opacity: .85;
    margin-top: 2px;
  }
  ```
- `.tag.approx` 스타일 추가(위치 근사치 표시, 눈에 띄되 경고색은 과하지 않게):
  ```css
  .tag.approx { background: var(--sign-wash); color: var(--sign); border: 1px solid var(--sign); }
  ```
- `.course-block` 스타일 추가(상세 모달 안에서 코스 여러 개를 구분):
  ```css
  .course-block { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
  .course-block:first-of-type { border-top: none; margin-top: 0; }
  .course-name { font-size: var(--fs-m); font-weight: 600; margin-bottom: 6px; }
  ```

- [ ] **Step 4: sw.js**

```bash
cp ../museum_map/sw.js sw.js
```

`const CACHE = '...'`을 `const CACHE = 'citytour-map-cache-v1';`로, `CORE_ASSETS` 목록을 이 프로젝트 실제 파일로 맞춘다(`report.js`가 없으면 목록에서 뺀다 — Task 8에서 만들지 여부에 맞춰 조정).

- [ ] **Step 5: 문법 검증**

Run: `node --check sw.js && node --check assets/js/app.js`
Expected: 둘 다 아무 출력 없이 종료.

- [ ] **Step 6: 로컬 서버로 육안 확인**

Run: `py -m http.server 8021` (citytour_map 폴더에서)

브라우저로 `http://localhost:8021`을 열어 다음을 확인한다:
- 지도에 마커 120개가 찍히는지
- 검색창에 코스 이름 일부를 입력하면 결과가 좁혀지는지
- 지역(시도) 필터, 시군구 select, 운행방식 필터가 각각 동작하는지
- "무료 코스 있음" 빠른필터가 동작하는지
- 마커나 카드를 클릭하면 상세 모달에 코스 목록(운행방식·운영시간·요금 등)이 나오는지, 근사 좌표 마커에는 "위치 근사치" 안내가 보이는지
- 독도가 지도에 표시되는지
- "내 주변" 버튼이 동작하는지(위치 권한 허용 시)

- [ ] **Step 7: 커밋**

```bash
git add index.html report.html assets/css/style.css sw.js
git commit -m "citytour_map: index.html/report.html/style.css/sw.js"
```

---

### Task 8: 아이콘 및 README

**Files:**
- Create: `tools/make_icons.py` (기반: `park_map/tools/make_icons.py` — 흰 픽토그램 방식)
- Create: `assets/icons/*.png`
- Create: `README.md`

**Interfaces:**
- Consumes: 없음
- Produces: 최종 배포 가능 상태

- [ ] **Step 1: `tools/make_icons.py` 작성**

```python
# -*- coding: utf-8 -*-
"""앱 아이콘 생성. 버스 실루엣(차체 사각형 + 창 구분선 + 바퀴 2개)으로 시티투어를 나타낸다.

다있맵 공통 규칙: 면색 위에 흰 픽토그램, 그림자 없음.
maskable 은 안전 영역(중앙 80%) 안에 픽토그램이 들어가도록 더 작게 그린다.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")

ICONS = Path(__file__).resolve().parent.parent / "assets" / "icons"
SIGN = (47, 102, 144, 255)   # --sign #2F6690
INK = (255, 255, 255, 255)
SS = 4


def draw_bus(size, scale):
    s = size * SS
    img = Image.new("RGBA", (s, s), SIGN)
    d = ImageDraw.Draw(img)

    cx, cy = s / 2, s / 2
    w = s * scale
    h = w * 0.62
    left, top = cx - w / 2, cy - h / 2
    right, bottom = cx + w / 2, cy + h / 2
    radius = w * 0.10

    d.rounded_rectangle([left, top, right, bottom], radius=radius, fill=INK)
    # 차체를 배경색으로 파서 창 구분선을 만든다
    d.line([left + w * 0.08, cy - h * 0.05, right - w * 0.08, cy - h * 0.05], fill=SIGN, width=int(w * 0.05))
    # 바퀴
    wheel_r = w * 0.11
    wheel_y = bottom - wheel_r * 0.3
    d.ellipse([left + w * 0.18 - wheel_r, wheel_y - wheel_r, left + w * 0.18 + wheel_r, wheel_y + wheel_r], fill=SIGN)
    d.ellipse([right - w * 0.18 - wheel_r, wheel_y - wheel_r, right - w * 0.18 + wheel_r, wheel_y + wheel_r], fill=SIGN)

    return img.resize((size, size), Image.LANCZOS)


def main():
    ICONS.mkdir(parents=True, exist_ok=True)
    targets = [
        ("app-icon-192.png", 192, 0.62),
        ("app-icon-512.png", 512, 0.62),
        ("app-icon-apple-180.png", 180, 0.62),
        ("app-icon-maskable-512.png", 512, 0.46),
    ]
    for name, size, scale in targets:
        path = ICONS / name
        draw_bus(size, scale).save(path, "PNG", optimize=True)
        print(f"{name}: {size}x{size} · {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행**

Run: `py tools/make_icons.py`
Expected: `assets/icons/`에 4개 PNG 생성, 각 파일 크기 로그 출력.

- [ ] **Step 3: README.md 작성**

```markdown
# 전국 시티투어 지도 (citytour_map)

지자체가 운영하는 시티투어 버스·코스 298건을 지도에서 찾아보는 PWA. 빌드 도구 없이 정적 파일로 동작한다.

- Leaflet + OpenStreetMap 타일
- 시도 → 시군구 필터, 운행방식(고정형/순환형) 필터, 무료 코스 빠른필터
- 코스 이름·시군구 검색
- 오프라인 지원(서비스워커), 홈 화면 설치

## 데이터

출처는 공공데이터포털 「전국시티투어정보표준데이터」(`publicDataPk=15025456`).
원본에 주소·좌표가 없어(탑승장소명 텍스트뿐) 카카오 로컬 API로 지오코딩한다.
탑승장소명이 여러 곳을 `+`로 합치거나 모호한 문구인 경우가 많아, 실패하면
`"{시도명} {시군구명}청"` 좌표로 대체하고 `geoApprox` 플래그를 남긴다.

## 갱신 절차

\`\`\`bash
py tools/download_data.py   # CSV 재다운로드 → tools/citytour_raw.csv
py tools/geocode.py         # 카카오 지오코딩 (캐시됨) → tools/geocoded.json
py tools/build_data.py      # 정제 → assets/js/data.js
\`\`\`

`sw.js`의 `CACHE` 버전 숫자를 올려야 이용자에게 새 데이터가 내려간다.

## 규칙

- 독도를 항상 직접 그린다(위도 37.2429 / 경도 131.8664, 경상북도 울릉군 울릉읍 독도리).
- 국기 이모지를 포함해 UI에 이모지를 쓰지 않는다.
- 파이썬은 `python`이 아니라 `py`로 실행한다.
- `운행정보` 필드는 자유텍스트라 운행 중단 여부를 자동 판정하지 않고 원문을 그대로 보여준다.
```

- [ ] **Step 4: 커밋**

```bash
git add tools/make_icons.py assets/icons/ README.md
git commit -m "citytour_map: 아이콘 및 README"
```

- [ ] **Step 5: 스펙 대비 최종 확인**

`docs/superpowers/specs/2026-08-31-citytour-map-design.md` 섹션 2~8을 하나씩 보며 대응 코드를 확인한다. 빠진 게 있으면 보완한다.

---

### Task 9: daitmap 포트폴리오에 카드 추가

**Files:**
- Modify: `../daitmap/index.html`

**Interfaces:**
- Consumes: 없음(정적 카드 추가)
- Produces: daitmap 그리드에 노출되는 새 카드

이 Task는 `daitmap`이라는 **별도 git 저장소**를 건드린다 — 커밋은 `citytour_map`이 아니라 `daitmap` 폴더 안에서 한다.

- [ ] **Step 1: 카드 마크업 추가**

`daitmap/index.html`의 `<ul class="grid">` 안, 마지막 `<li>`(아파트 실거래가 카드) 바로 다음에 삽입:

```html
      <li>
        <a class="card" style="--plaque:#2F6690" href="https://spica07.github.io/citytour_map/" target="_blank" rel="noopener">
          <span class="card__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="11" rx="2"/><path d="M3 12h18M6 5V3M18 5V3"/><circle cx="7.5" cy="19" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.5" cy="19" r="1.6" fill="currentColor" stroke="none"/></svg></span>
          <span class="card__title">전국 시티투어 지도</span>
          <span class="card__desc">지자체 시티투어 버스·코스 한눈에</span>
          <span class="card__stub">
            <span class="card__go" aria-hidden="true">열기 ↗</span>
            <span class="card__sr">(새 창에서 열림)</span>
          </span>
        </a>
      </li>
```

- [ ] **Step 2: 헤더 설명 문구 갱신**

`<meta name="description">`과 `.signboard__desc` 안에 "시티투어"를 목록에 추가한다(둘 다 기존 목록 끝에 자연스럽게 이어 붙인다).

- [ ] **Step 3: 로컬 확인**

Run: `py -m http.server 8022` (daitmap 폴더에서)
브라우저로 열어 새 카드가 그리드에 나오고, 클릭 시 `https://spica07.github.io/citytour_map/`으로 이동을 시도하는지 확인한다(citytour_map을 아직 배포하지 않았다면 404가 정상 — Task 10에서 배포한 뒤 다시 확인).

- [ ] **Step 4: 커밋**

```bash
cd ../daitmap
git add index.html
git commit -m "daitmap: 전국 시티투어 지도 카드 추가"
cd ../citytour_map
```

---

### Task 10: GitHub 저장소 생성 및 배포

**Files:** 없음(배포 작업)

**Interfaces:**
- Consumes: Task 1~9의 전체 결과물
- Produces: `https://spica07.github.io/citytour_map/`

- [ ] **Step 1: GitHub 저장소 생성 (public)**

사용자에게 `gh repo create citytour_map --public --source=. --remote=origin` 실행 여부를 확인받는다 — 새 원격 저장소 생성·푸시는 되돌리기 어려운 공개 행위이므로 반드시 명시적 승인 후 진행한다.

- [ ] **Step 2: 푸시**

```bash
git push -u origin master
```

- [ ] **Step 3: GitHub Pages 활성화**

`gh api repos/spica07/citytour_map/pages -X POST -f "source[branch]=master" -f "source[path]=/"` 또는 저장소 Settings > Pages에서 수동 설정.

- [ ] **Step 4: 배포 확인**

몇 분 뒤 `https://spica07.github.io/citytour_map/`을 열어 Task 7 Step 6과 같은 방식으로 육안 확인한다.

- [ ] **Step 5: daitmap 카드 링크 재확인**

daitmap을 이미 배포했다면 그 사이트에서 새 카드를 클릭해 정상 연결되는지 확인한다.

---

## Self-Review 메모

- **스펙 커버리지:** 섹션 2(데이터·한계) → Task 2·3, 섹션 3(지오코딩 사다리) → Task 3, 섹션 4(마커·상세) → Task 4·6, 섹션 5(필터·UI) → Task 6·7, 섹션 6(파일 구조) → Task 1·5·6·7·8, 섹션 7(daitmap 반영) → Task 9, 섹션 8(검증) → 각 Task의 Step 2~3(실행 결과 수치 확인) + Task 7 Step 6(육안 확인) + Task 10 Step 4.
- **Placeholder 스캔:** "구현 시 최종 확정" 같은 표현은 스펙 문서에만 있었고(카드 설명 문구), 이 계획에서는 Task 9 Step 1에 실제 문구를 확정해 넣었다.
- **타입 일관성:** `window.CITYTOUR` 마커 스키마(Task 4에서 정의)를 `app.js`(Task 6)가 그대로 쓴다 — `m.place`, `m.courses[].feeFree` 등 필드명이 두 Task에서 일치하는지 다시 확인함. `openMarkerModal`(전역 함수명)이 Task 6 Step 1 안에서 정의부(`window.openMarkerModal = ...`)와 호출부(`data-popup-detail`, `.facility-card` 클릭 핸들러) 모두 같은 이름을 쓴다.
- **daitmap은 별도 저장소:** Task 9는 `citytour_map`이 아니라 `daitmap` 안에서 커밋한다는 점을 Step 1에 명시했다 — 다른 Task와 커밋 대상이 다르므로 실행자가 혼동하지 않도록 강조했다.
- **지오코딩 실패 시 수동 보강 경로 없음:** Task 3 설계상 2)단계("○○청" 키워드검색)가 사실상 항상 성공하므로(대한민국의 모든 시군구는 시청/군청이 존재), nanumteo_map처럼 `_extra.json` 수동 보강 경로를 별도로 두지 않았다. 만약 Task 3 Step 2에서 실패가 나오면 그 시점에 원인을 조사해 이 계획을 갱신한다.
