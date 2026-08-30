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
