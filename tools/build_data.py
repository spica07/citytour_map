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
    return t in ("", "0", "0원", "무료")


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
