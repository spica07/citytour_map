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
