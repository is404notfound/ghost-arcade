#!/usr/bin/env python3
"""인트로 세로 슬라이드 캔버스 전처리 (§6.3).

소스:
  assets/images/intro/intro-full-src.png   — 땅→하늘 전체 서사 (우선)
  assets/images/intro/intro-ground-src.png — 하단 타일만 (폴백/재합성용)

산출:
  assets/game/intro-slide.png
  assets/game/intro-ground.png

★ 화질 규칙:
  - 폭 ≥1536 (권장 2048): 네이티브 유지. 업스케일/샤픈 금지.
  - 폭 <1536 (레거시 ~576): @2x + 약한 UnsharpMask만.
    디스플레이 확대는 GPU LINEAR 한 번. CPU에서 과업스케일하면 이중으로 뭉갠다.
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets", "images", "intro")
OUT = os.path.join(ROOT, "assets", "game")
# 이 폭 이상이면 '진짜 고해상도'로 보고 손대지 않는다.
HIRES_MIN_W = 1536
# 레거시 저해상도만 @2x (576→1152).
LEGACY_SCALE = 2.0


def _prep(im: Image.Image) -> Image.Image:
    im = im.convert("RGB")
    if im.width >= HIRES_MIN_W:
        return im
    tw = max(1, round(im.width * LEGACY_SCALE))
    th = max(1, round(im.height * LEGACY_SCALE))
    out = im.resize((tw, th), Image.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=2))


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    full_path = os.path.join(SRC, "intro-full-src.png")
    ground_path = os.path.join(SRC, "intro-ground-src.png")
    sky_path = os.path.join(SRC, "intro-sky-src.png")

    if os.path.exists(full_path):
        slide = _prep(Image.open(full_path))
        print(f"  using intro-full-src → {slide.size}")
    elif os.path.exists(ground_path) and os.path.exists(sky_path):
        ground = _prep(Image.open(ground_path))
        sky = _prep(Image.open(sky_path))
        h = sky.height + ground.height
        slide = Image.new("RGB", (sky.width, h), (23, 10, 46))
        slide.paste(sky, (0, 0))
        slide.paste(ground, (0, sky.height))
        print(f"  stacked sky+ground → {slide.size}")
    elif os.path.exists(ground_path):
        slide = _prep(Image.open(ground_path))
        print(f"  fallback ground-only → {slide.size}")
    else:
        raise SystemExit("no intro sources in assets/images/intro/")

    slide.save(os.path.join(OUT, "intro-slide.png"), "PNG", optimize=True)
    print(f"  intro-slide.png → {slide.size}")

    if os.path.exists(ground_path):
        g = _prep(Image.open(ground_path))
        g.save(os.path.join(OUT, "intro-ground.png"), "PNG", optimize=True)
        print(f"  intro-ground.png → {g.size}")


if __name__ == "__main__":
    print("[intro]")
    main()
    print("done.")
