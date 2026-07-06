#!/usr/bin/env python3
"""UI 에셋 전처리.

hp-frame-src.png (RGBA 투명배경, 1024×1024):
  알파 > 16 bbox 트림 → '종횡비 보존' 고해상 리사이즈 → 알파 GaussianBlur → 저장.
  내부 투명, 외곽 시안+하트 프레임만 남음.

  ★ 이전 버그: 260×20(=13:1)로 강제 리사이즈해 원본 바(≈6.8:1)가 가로로 눌리고(비율 깨짐)
    저해상이라 화질도 뭉갬. → 원본 종횡비를 유지하고 고해상(@3x)으로 구워 crisp하게 만든다.
    GameScene은 이 종횡비에 맞춰 barH를 계산해 왜곡 없이 표시한다.
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC  = os.path.join(ROOT, "assets", "images", "ui")
OUT  = os.path.join(ROOT, "assets", "game")

# 고해상 목표 폭(@3x 급). 표시 폭 260에서 다운스케일 → retina에서도 선명.
HP_FRAME_TARGET_W = 780


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


if __name__ == "__main__":
    print("[ui assets]")
    prep_hp_frame()
    print("done.")
