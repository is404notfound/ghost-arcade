#!/usr/bin/env python3
"""player-ride 스프라이트시트 전처리 — 시안 네온 바이커 소녀 6프레임 런사이클.

소스(assets/images/player/player-ride-sheet-src.png): RGB 2172×724, 6포즈 시트.
흰 배경, 포즈 간 간격 불균등.

전략:
  1) column-profile(흰 배경 제외, 열당 10px)으로 측정한 6포즈 실제 x 범위 크롭.
  2) 공통 Y0/Y1 수직 범위 — 전 포즈 합집합.
  3) 흰 배경 → 부드러운 알파 (채도+어두움 기반, 경계 계단현상 제거).
  4) 바퀴 최하단(bottom_y) 기준 정렬 — 프레임마다 상단 y가 달라도
     하단이 공통 baseline에 고정 → 달릴 때 위아래 떨림 방지.
     (고스트는 상체 정렬이었지만, 바이크는 항상 지면에 붙으므로 하단 정렬이 맞음)

산출물: assets/game/player-ride.png (RGBA, 6프레임 균등)
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets", "images", "player", "player-ride-sheet-src.png")
OUT = os.path.join(ROOT, "assets", "game", "player-ride.png")

# column-profile(흰 배경 제외, 열당 10px)으로 측정한 6포즈 실제 x 범위.
# 소스: 2172×724 RGB (2026-06, 시안 네온 바이커 소녀).
POSES = [(40, 392), (407, 740), (756, 1091), (1106, 1441), (1455, 1790), (1805, 2142)]
Y0, Y1 = 220, 556            # 공통 세로 크롭 범위 — 전 포즈 캐릭터 합집합 + 여유
PAD = 16                     # 포즈 좌우 여백(px, 소스 기준)
TARGET_H = 300               # 출력 프레임 높이(px)


def soft_alpha(img: Image.Image) -> Image.Image:
    """흰 배경 → 부드러운 알파. 채도/어두움 기반이라 경계가 매끈(안티에일리어싱)."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            sat_c = min(1.0, sat / 0.30)
            dark_c = min(1.0, (255 - mx) / 70.0)
            a = max(sat_c, dark_c)
            if a < 0.05:
                a = 0.0
            px[x, y] = (r, g, b, int(255 * a))
    return img


def bottom_y_of(img: Image.Image) -> int:
    """알파 있는 최하단 y 반환 — 바퀴 baseline 정렬 앵커."""
    px = img.load()
    w, h = img.size
    for y in range(h - 1, -1, -1):
        for x in range(w):
            if px[x, y][3] > 24:
                return y
    return h - 1


def main() -> None:
    sheet = Image.open(SRC).convert("RGB")
    crop_h = Y1 - Y0
    scale = TARGET_H / crop_h

    # 1) 포즈별 크롭 + 부드러운 알파 + 스케일
    frames = []
    baselines = []  # 각 프레임의 스케일 후 바퀴 하단 y
    for (x0, x1) in POSES:
        cx0 = max(0, x0 - PAD)
        cx1 = min(sheet.width, x1 + PAD)
        fr = sheet.crop((cx0, Y0, cx1, Y1))
        fr = soft_alpha(fr)
        nw = max(1, round(fr.width * scale))
        fr = fr.resize((nw, TARGET_H), Image.LANCZOS)
        # 알파 가장자리 미세 블러 → 다운스케일 후 계단현상 제거
        r_, g_, b_, a_ = fr.split()
        a_ = a_.filter(ImageFilter.GaussianBlur(0.9))
        fr = Image.merge("RGBA", (r_, g_, b_, a_))
        frames.append(fr)
        baselines.append(bottom_y_of(fr))

    # 2) 프레임 폭 결정 (모든 포즈가 들어갈 최대 폭)
    fw = max(fr.width for fr in frames) + 4

    # 3) 공통 baseline — 모든 프레임의 바퀴 하단을 이 y에 맞춤
    common_bl = max(baselines)
    canvas_h = common_bl + 1  # baseline을 하단으로 하는 최소 캔버스 높이

    # 4) 합본 — 바퀴 하단(baseline)을 common_bl에 맞춰 배치
    out = Image.new("RGBA", (fw * len(frames), canvas_h), (0, 0, 0, 0))
    for i, (fr, bl) in enumerate(zip(frames, baselines)):
        ox = i * fw + (fw - fr.width) // 2  # 수평 중앙
        oy = common_bl - bl                  # 하단 정렬
        out.paste(fr, (ox, oy), fr)
    out.save(OUT, "PNG")
    print(f"out {out.size}  frame {fw}x{canvas_h} × {len(frames)} → {OUT}")
    print(f"baselines={baselines}  common={common_bl}")


if __name__ == "__main__":
    main()
