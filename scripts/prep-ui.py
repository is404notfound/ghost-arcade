#!/usr/bin/env python3
"""UI 에셋 전처리.

hp-frame-src.png (RGBA 투명배경, 1024×1024):
  알파 > 16 bbox 트림 → '종횡비 보존' 고해상 리사이즈 → 알파 GaussianBlur → 저장.
  내부 투명, 외곽 시안+하트 프레임만 남음.

  ★ 이전 버그: 260×20(=13:1)로 강제 리사이즈해 원본 바(≈6.8:1)가 가로로 눌리고(비율 깨짐)
    저해상이라 화질도 뭉갬. → 원본 종횡비를 유지하고 고해상(@3x)으로 구워 crisp하게 만든다.
    GameScene은 이 종횡비에 맞춰 barH를 계산해 왜곡 없이 표시한다.

fuel-can-src.png (RGB 흰 배경, 1024×1024):
  흰 배경 제거(R&G&B > 238 & sat < 0.12 → α0) → bbox 트림 → 104×104 정사각 캔버스 중앙 배치.
  26×26 표시 기준의 4배(@4x) — 고DPR에서도 선명. 종횡비 보존.
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC  = os.path.join(ROOT, "assets", "images", "ui")
SRC_ITEMS = os.path.join(ROOT, "assets", "images", "items")
OUT  = os.path.join(ROOT, "assets", "game")

# 고해상 목표 폭(@3x 급). 표시 폭 260에서 다운스케일 → retina에서도 선명.
HP_FRAME_TARGET_W = 780
# fuel-can: 26×26 표시 × 4배
FUEL_CAN_SIZE = 104


def _remove_white_bg(im: Image.Image, thresh: int = 238, sat_thresh: float = 0.12) -> Image.Image:
    """흰/밝은 배경 제거. R&G&B > thresh 이고 채도 < sat_thresh → α0."""
    im = im.convert("RGBA")
    pixels = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            if r > thresh and g > thresh and b > thresh and sat < sat_thresh:
                pixels[x, y] = (r, g, b, 0)
    return im


def prep_hp_frame() -> None:
    im = Image.open(os.path.join(SRC, "hp-frame-src.png")).convert("RGBA")
    # bbox 트림 (알파 > 16)
    amask = im.split()[3].point(lambda v: 255 if v > 16 else 0)
    bb = amask.getbbox()
    if bb:
        im = im.crop(bb)
    # ★ 종횡비 보존 리사이즈(목표 폭 기준, 높이는 비례)
    cw, ch = im.size
    tw = HP_FRAME_TARGET_W
    th = max(1, round(ch * tw / cw))
    im = im.resize((tw, th), Image.LANCZOS)
    # 알파 채널 소프트닝 (계단현상 완화)
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(0.5))
    im = Image.merge("RGBA", (r_, g_, b_, a_))
    out_path = os.path.join(OUT, "hp-frame.png")
    im.save(out_path, "PNG")
    print(f"  hp-frame.png → {im.size}  (aspect {tw/th:.2f})")


def prep_fuel_can() -> None:
    im = Image.open(os.path.join(SRC_ITEMS, "fuel-can-src.png")).convert("RGBA")
    # 배경 제거(Method B): min(r,g,b)>205 && sat<0.10 → 흰색(253+)·회색 체커(223+) 전부 α0
    im = _remove_white_bg(im, thresh=205, sat_thresh=0.10)
    # 캔 외곽 파란 글로우가 자연스럽게 페이드되도록 알파 채널 소프트닝
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(1.0))
    im = Image.merge("RGBA", (r_, g_, b_, a_))
    # 잔여 극저알파 하드컷 (α < 0.20×255 ≈ 51) — 글로우 보존을 위해 임계 낮춤
    pixels = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < 51:
                pixels[x, y] = (r, g, b, 0)
    # bbox 트림
    amask = im.split()[3].point(lambda v: 255 if v > 0 else 0)
    bb = amask.getbbox()
    if bb:
        im = im.crop(bb)
    cw, ch = im.size
    # 104×104 정사각 캔버스에 중앙 배치, 종횡비 보존
    size = FUEL_CAN_SIZE
    if cw > ch:
        tw, th = size, max(1, round(size * ch / cw))
    else:
        tw, th = max(1, round(size * cw / ch)), size
    im = im.resize((tw, th), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - tw) // 2
    oy = (size - th) // 2
    canvas.paste(im, (ox, oy), im)
    out_path = os.path.join(OUT, "fuel-can.png")
    canvas.save(out_path, "PNG")
    print(f"  fuel-can.png → {canvas.size}  (content {tw}×{th})")


if __name__ == "__main__":
    print("[ui assets]")
    prep_hp_frame()
    prep_fuel_can()
    print("done.")
