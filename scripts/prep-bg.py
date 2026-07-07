#!/usr/bin/env python3
"""배경 원경(far) 레이어 에셋 전처리.

bg-buildings-far-src.png  — 흰 배경 제거, seamless, 2048px 출력
bg-bridges-far-src.png    — 흰 배경 제거, seamless, 2048px 출력
bg-bridges-curved-far-src.png — 검은 배경 제거(luma<12), seamless, 2048px 출력

공통:
  - 배경 제거 후 bbox 트림
  - 폭 2048로 리샘플(시차 스크롤 여유, 디자인 폭 1040의 약 2배), 종횡비 보존
  - 좌우 8px 엣지 페이드 → seamless tile
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC  = os.path.join(ROOT, "assets", "images", "bg")
OUT  = os.path.join(ROOT, "assets", "game")

TARGET_W = 2048
EDGE_FADE_PX = 8


def _clean_edges(im: Image.Image) -> Image.Image:
    """알파 가장자리 안티에일리어싱: 가우시안 blur로 부드럽게만 한다.
    ★ median은 알파를 계단식으로 만들고 얇은 구조(아치형 다리)를 갉아먹어 '자글자글+소실'을
    유발하므로 쓰지 않는다. blur만 걸면 반투명 페더 가장자리 → 매끈."""
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(1.1))
    return Image.merge("RGBA", (r_, g_, b_, a_))


def _remove_white_bg(im: Image.Image, thresh: int = 212, sat_thresh: float = 0.16) -> Image.Image:
    """흰/밝은 배경 제거. R&G&B > thresh & 채도 < sat_thresh → α0."""
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


def _remove_black_bg(im: Image.Image, luma_lo: int = 6, luma_hi: int = 42) -> Image.Image:
    """검은 배경 소프트 키잉: luma<lo → α0, luma>hi → α유지, 사이는 선형 램프.
    ★ 하드 컷은 어두운 남색 다리(luma가 배경과 가까움)를 조각내 '소실+검은 외곽선'을 만든다.
    램프로 알파를 점진 부여하면 다리는 살고 순검정 배경만 매끈하게 페이드한다."""
    im = im.convert("RGBA")
    pixels = im.load()
    w, h = im.size
    span = max(1, luma_hi - luma_lo)
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            luma = 0.299 * r + 0.587 * g + 0.114 * b
            if luma <= luma_lo:
                k = 0.0
            elif luma >= luma_hi:
                k = 1.0
            else:
                k = (luma - luma_lo) / span
            pixels[x, y] = (r, g, b, int(a * k))
    return im


def _hard_cut_alpha(im: Image.Image, min_alpha: int = 31) -> Image.Image:
    """잔여 극저알파 하드컷 (α < min_alpha → 0)."""
    pixels = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a < min_alpha:
                pixels[x, y] = (r, g, b, 0)
    return im


def _seamless_edge_fade(im: Image.Image, fade_px: int = 8) -> Image.Image:
    """좌우 엣지 fade → 타일 이음매 제거."""
    pixels = im.load()
    w, h = im.size
    for x in range(fade_px):
        ratio = x / fade_px
        for y in range(h):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, int(a * ratio))
    for x in range(w - fade_px, w):
        ratio = (w - 1 - x) / fade_px
        for y in range(h):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, int(a * ratio))
    return im


def _bbox_trim(im: Image.Image, alpha_thresh: int = 10) -> Image.Image:
    amask = im.split()[3].point(lambda v: 255 if v > alpha_thresh else 0)
    bb = amask.getbbox()
    if bb:
        im = im.crop(bb)
    return im


def _resize_to_width(im: Image.Image, target_w: int) -> Image.Image:
    cw, ch = im.size
    th = max(1, round(ch * target_w / cw))
    return im.resize((target_w, th), Image.LANCZOS)


def prep_bg_buildings_far() -> None:
    im = Image.open(os.path.join(SRC, "bg-buildings-far-src.png"))
    im = _remove_white_bg(im)
    im = _hard_cut_alpha(im, min_alpha=36)
    im = _clean_edges(im)
    # 낮은 컷 + LANCZOS 축소가 매끈한 AA 가장자리를 만든다(강한 컷은 톱니 유발).
    im = _hard_cut_alpha(im, min_alpha=18)
    im = _bbox_trim(im)
    im = _resize_to_width(im, TARGET_W)
    im = _seamless_edge_fade(im, EDGE_FADE_PX)
    out = os.path.join(OUT, "bg-buildings-far.png")
    im.save(out, "PNG")
    print(f"  bg-buildings-far.png → {im.size}")


def prep_bg_bridges_far() -> None:
    im = Image.open(os.path.join(SRC, "bg-bridges-far-src.png"))
    im = _remove_white_bg(im)
    im = _hard_cut_alpha(im, min_alpha=36)
    im = _clean_edges(im)
    im = _hard_cut_alpha(im, min_alpha=18)
    im = _bbox_trim(im)
    im = _resize_to_width(im, TARGET_W)
    im = _seamless_edge_fade(im, EDGE_FADE_PX)
    out = os.path.join(OUT, "bg-bridges-far.png")
    im.save(out, "PNG")
    print(f"  bg-bridges-far.png → {im.size}")


def prep_bg_bridges_curved_far() -> None:
    im = Image.open(os.path.join(SRC, "bg-bridges-curved-far-src.png"))
    # 소프트 키잉으로 남색 다리 보존 + 순검정 배경만 페이드. 극저알파만 살짝 컷.
    im = _remove_black_bg(im)
    im = _clean_edges(im)
    im = _hard_cut_alpha(im, min_alpha=6)
    im = _bbox_trim(im)
    im = _resize_to_width(im, TARGET_W)
    im = _seamless_edge_fade(im, EDGE_FADE_PX)
    out = os.path.join(OUT, "bg-bridges-curved-far.png")
    im.save(out, "PNG")
    print(f"  bg-bridges-curved-far.png → {im.size}")


if __name__ == "__main__":
    print("[bg assets]")
    prep_bg_buildings_far()
    prep_bg_bridges_far()
    prep_bg_bridges_curved_far()
    print("done.")
