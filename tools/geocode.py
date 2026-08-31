# -*- coding: utf-8 -*-
"""citytour_raw.csv 의 고유 (시군구명, 시티투어탑승장소명) 120개를
카카오 로컬 API로 지오코딩해 tools/geocoded.json 을 만든다.

원본에 주소가 없고 탑승장소명 텍스트만 있다. 게다가 이 텍스트가
"청주가경시외버스터미널+청주체육관"처럼 여러 곳을 "+"로 이어붙이거나
"출발희망지(청주시)"처럼 장소가 아닌 안내문구인 경우가 많다.
그래서 지오코딩 사다리를 둔다:
  1) 괄호 제거 -> "+" 분리 -> 각 조각을 "{시군구명} {조각}"으로 키워드검색, 첫 성공 채택
  2) 전부 실패하면 각 조각을 "{시도명} {조각}"으로 재시도 (시군구명이 "없음"이거나
     "연수구+중우"처럼 손상된 경우 대비). 시군구 필터 없이 시도명만 붙이면 카카오가
     엉뚱한 시군구의 동명 장소를 1위로 올릴 수 있어 geoApprox=True로 표시한다
  3) 그래도 실패하면 "{시도명} {시군구명}청" 키워드검색으로 대체 (geoApprox=True)
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
    # 시군구명 자체가 "없음"이거나 "중구+옹진군"처럼 여러 시군구가 뒤섞인 경우,
    # 1단계 검색에 이 손상된 시군구명이 그대로 섞여 들어가 엉뚱한 결과가 1위로
    # 올라올 수 있다(예: id 27 "중구+옹진군"+"인천역" -> 실제 인천역과 16km 이상
    # 떨어진 곳). 이런 경우 1단계가 성공해도 근사치로 표시한다.
    sigungu_corrupted = sigungu == "없음" or "+" in sigungu
    fragments = clean_fragments(place)
    for frag in fragments:
        hit = kakao_keyword(f"{sigungu} {frag}")
        if hit:
            return hit["lat"], hit["lng"], sigungu_corrupted
    for frag in fragments:
        hit = kakao_keyword(f"{sido} {frag}")
        if hit:
            return hit["lat"], hit["lng"], True
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
