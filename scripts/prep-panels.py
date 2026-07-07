#!/usr/bin/env python3
"""UI 패널 에셋 전처리 (9-slice용).

panel-rank-hud-src.png      → panel-rank-hud.png      (시안 가로 랭킹 칩)
panel-rank-hud-gold-src.png → panel-rank-hud-gold.png (골드 가로 랭킹 칩, YOU 행)
panel-weekly-src.png        → panel-weekly.png         (세로 주간 랭킹 패널)
panel-gameover-src.png      → panel-gameover.png       (레드 세로 결과 프레임)
panel-tutorial-src.png      → panel-tutorial.png       (시안 세로 튜토리얼 오버레이)

공통 처리:
  - 흰 배경 제거 (R&G&B > 238 & sat < 0.12 → α0)
  - 극저알파 하드컷 (α < 26 → 0) — 외곽 글로우 살림
  - bbox 트림
  - 원본 해상도 유지 (리사이즈 금지)

9-slice 인셋 (px, 처리 후 이미지 기준) — GameScene.ts에서 참조:
  panel-rank-hud:       L=40, R=40, T=32, B=32
  panel-rank-hud-gold:  L=40, R=40, T=32, B=32
  panel-weekly:         L=80, R=80, T=60, B=60
  panel-gameover:       L=60, R=60, T=80, B=80
  panel-tutorial:       L=70, R=70, T=70, B=70
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC  = os.path.join(ROOT, "assets", "images", "ui")
OUT  = os.path.join(ROOT, "assets", "game")


def _remove_white_bg(im: Image.Image, thresh: int = 238, sat_thresh: float = 0.12) -> Image.Image:
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


def _hard_cut_alpha(im: Image.Image, min_alpha: int = 26) -> Image.Image:
    pixels = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < min_alpha:
                pixels[x, y] = (r, g, b, 0)
    return im


def _bbox_trim(im: Image.Image, alpha_thresh: int = 10) -> Image.Image:
    amask = im.split()[3].point(lambda v: 255 if v > alpha_thresh else 0)
    bb = amask.getbbox()
    if bb:
        im = im.crop(bb)
    return im


def _clean_edges(im: Image.Image) -> Image.Image:
    """알파 가장자리 안티에일리어싱: 가우시안 blur로 부드럽게만.
    ★ median은 알파를 계단식으로 만들어 네온 프레임 테두리가 오히려 자글자글해진다.
    blur만 걸어 반투명 페더 → 매끈한 가장자리."""
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(1.4))
    return Image.merge("RGBA", (r_, g_, b_, a_))


def _prep_panel(src_name: str, out_name: str) -> None:
    src_path = os.path.join(SRC, src_name)
    im = Image.open(src_path)
    # ★ 순백(>238)만 지우면 살짝 푸른 흰색(예: 230,240,250)이 speckle로 남아 '흰색 깨짐'이 됨.
    #   min>212 & 저채도로 넓게 지우되, 네온 글로우(채도 높음)는 보존.
    im = _remove_white_bg(im, thresh=212, sat_thresh=0.16)
    im = _hard_cut_alpha(im, min_alpha=36)
    im = _clean_edges(im)
    im = _hard_cut_alpha(im, min_alpha=18)
    im = _bbox_trim(im)
    out_path = os.path.join(OUT, out_name)
    im.save(out_path, "PNG")
    print(f"  {out_name} → {im.size}")


if __name__ == "__main__":
    print("[panel assets]")
    _prep_panel("panel-rank-hud-src.png",      "panel-rank-hud.png")
    _prep_panel("panel-rank-hud-gold-src.png",  "panel-rank-hud-gold.png")
    _prep_panel("panel-weekly-src.png",          "panel-weekly.png")
    _prep_panel("panel-gameover-src.png",        "panel-gameover.png")
    _prep_panel("panel-tutorial-src.png",        "panel-tutorial.png")
    print("done.")
