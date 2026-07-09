#!/usr/bin/env python3
"""UI 패널 에셋 전처리 (9-slice용).

panel-rank-hud-src.png      → panel-rank-hud.png      (시안 가로 랭킹 칩)
panel-rank-hud-gold-src.png → panel-rank-hud-gold.png (골드 가로 랭킹 칩, YOU 행)
panel-weekly-src.png        → panel-weekly.png         (세로 주간 랭킹 패널)
panel-daily-src.png         → panel-daily.png          (세로 일간 랭킹 패널, 주간과 동일 프레임)
panel-gameover-src.png      → panel-gameover.png       (레드 세로 결과 프레임)
panel-tutorial-src.png      → panel-tutorial.png       (시안 세로 튜토리얼 오버레이)
btn-replay-src.png          → btn-replay.png           (게임오버 중앙 Replay CTA)

공통 처리 (2026-07 fringe 정리):
  - soft_alpha (흰 배경) 또는 flood_black (검 배경)
  - defringe: 저알파+밝은 RGB 픽셀을 투명화 (배경 잔상 제거)
  - morphological opening + blur로 고립 speckle 제거 (기본 finish)
  - 세로 네온 패널(daily/weekly)은 finish=neon — opening 생략, 알파 AA 보존
  - 가로 랭킹 칩(rank-hud)은 finish=chip — 흰 fringe 강제거, 네온 코어 보존
  - 극저알파 하드컷
  - bbox 트림
  - 원본 해상도 유지 (리사이즈 금지)

9-slice 인셋 (px, 처리 후 이미지 기준) — GameScene.ts에서 참조:
  panel-rank-hud:       L=40, R=40, T=32, B=32
  panel-rank-hud-gold:  L=40, R=40, T=32, B=32
  panel-weekly:         L=80, R=80, T=60, B=60
  panel-daily:          L=80, R=80, T=60, B=60
  panel-gameover:       L=60, R=60, T=80, B=80
  panel-tutorial:       L=70, R=70, T=70, B=70
  btn-replay:           (버튼 — 9-slice 선택)
"""
from __future__ import annotations
from collections import deque
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC  = os.path.join(ROOT, "assets", "images", "ui")
OUT  = os.path.join(ROOT, "assets", "game")


def _soft_alpha_white_bg(im: Image.Image) -> Image.Image:
    """흰/밝은 저채도 배경 → 부드러운 알파.

    플레이어 시트 soft_alpha와 같은 원리: 채도(네온)와 어두움(패널 바디)이
    높을수록 불투명. 흰 배경은 둘 다 낮아 α→0. 경계는 계단 없이 페이드.
    """
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            # 네온 글로우: 채도 높으면 살림 (흰 배경 sat≈0)
            sat_c = min(1.0, sat / 0.22)
            # 다크 패널 바디: 어두울수록 살림 (흰 배경 mx≈255 → dark_c≈0)
            dark_c = min(1.0, (255 - mx) / 55.0)
            a = max(sat_c, dark_c)
            if a < 0.06:
                a = 0.0
            px[x, y] = (r, g, b, int(255 * a))
    return im


def _flood_black_bg(
    im: Image.Image, luma_max: float = 18.0, sat_max: float = 0.22
) -> Image.Image:
    """테두리에서 시작하는 flood-fill로 순검/저채도 검정 배경만 투명화.

    패널 바디(남색·시안 글로우)는 테두리와 연결되지 않거나 luma/sat이 높아 남는다.
    soft_alpha(흰 배경용)는 검정 매트에서 dark_c≈1이 되어 배경을 못 지운다.
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def is_bg(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a == 0:
            return False
        mx = max(r, g, b)
        mn = min(r, g, b)
        sat = (mx - mn) / mx if mx > 0 else 0.0
        luma = 0.299 * r + 0.587 * g + 0.114 * b
        return luma <= luma_max and sat <= sat_max

    for x in range(w):
        for y in (0, h - 1):
            idx = y * w + x
            if not visited[idx] and is_bg(x, y):
                q.append((x, y))
                visited[idx] = 1
    for y in range(h):
        for x in (0, w - 1):
            idx = y * w + x
            if not visited[idx] and is_bg(x, y):
                q.append((x, y))
                visited[idx] = 1

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                nidx = ny * w + nx
                if not visited[nidx]:
                    visited[nidx] = 1
                    if is_bg(nx, ny):
                        q.append((nx, ny))
    return im


def _defringe(im: Image.Image, alpha_hi: int = 140, lum_hi: int = 150, sat_max: float = 0.35) -> Image.Image:
    """저~중알파 + 밝은 픽셀 제거 (= 흰 배경 fringe / '타일 잔상').

    흰 배경에서 번진 후광은 채도가 낮거나 중간이어도 밝다.
    네온 코어(고알파)는 건드리지 않고, mid-alpha 밝은 껍질만 벗긴다.
    """
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a >= alpha_hi:
                continue
            lum = (r + g + b) / 3.0
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            # 밝은 mid-alpha = 배경 fringe (채도 무관 — 시안빛 흰 잔상도 포함)
            if lum >= lum_hi:
                px[x, y] = (r, g, b, 0)
            elif a < 100 and lum >= 110 and sat <= sat_max:
                px[x, y] = (r, g, b, 0)
    return im


def _outer_crust_cut(im: Image.Image, alpha_cut: int = 155, lum_hi: int = 140) -> Image.Image:
    """투명과 맞닿은 외곽의 밝은 mid-alpha '껍질'을 제거.

    글로우 코어(안쪽, 고알파)는 남기고, 바깥으로 부스러진 자글한 픽셀만 지운다.
    """
    px = im.load()
    w, h = im.size
    # 1-pass: 투명 이웃을 가진 밝은 mid-alpha → 0
    kill: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a >= alpha_cut:
                continue
            lum = (r + g + b) / 3.0
            if lum < lum_hi:
                continue
            touches_clear = False
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] < 20:
                        touches_clear = True
                        break
                if touches_clear:
                    break
            if touches_clear:
                kill.append((x, y))
    for x, y in kill:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
    return im


def _hard_cut_alpha(im: Image.Image, min_alpha: int = 26) -> Image.Image:
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < min_alpha:
                px[x, y] = (r, g, b, 0)
    return im


def _bbox_trim(im: Image.Image, alpha_thresh: int = 10) -> Image.Image:
    amask = im.split()[3].point(lambda v: 255 if v > alpha_thresh else 0)
    bb = amask.getbbox()
    if bb:
        im = im.crop(bb)
    return im


def _clean_edges(im: Image.Image) -> Image.Image:
    """morphological opening(erode→dilate)으로 고립 speckle 제거 후 blur로 매끈하게."""
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.MinFilter(5))   # erode: 고립 fringe·speckle 소멸
    a_ = a_.filter(ImageFilter.MaxFilter(5))   # dilate: 프레임 두께 복원
    a_ = a_.filter(ImageFilter.GaussianBlur(1.0))
    return Image.merge("RGBA", (r_, g_, b_, a_))


def _finish_panel(im: Image.Image) -> Image.Image:
    """배경 제거 이후 공통 fringe 정리 + bbox 트림."""
    im = _defringe(im)
    im = _hard_cut_alpha(im, min_alpha=48)
    im = _outer_crust_cut(im)
    im = _outer_crust_cut(im, alpha_cut=170, lum_hi=130)
    im = _clean_edges(im)
    im = _defringe(im, alpha_hi=130, lum_hi=140, sat_max=0.40)
    im = _outer_crust_cut(im, alpha_cut=160, lum_hi=135)
    im = _hard_cut_alpha(im, min_alpha=56)
    im = _bbox_trim(im)
    return im


def _finish_panel_neon(im: Image.Image) -> Image.Image:
    """세로 네온 패널용 — morphological open을 빼 알파 AA를 살린다.

    이유: MinFilter(5) opening이 글로우 가장자리 soft alpha를 톱니처럼 잘라
    210×400 축소 시 자글거림이 더 도드라진다. fringe만 가볍게 걷고
    알파에 약한 blur를 남겨 표시 스케일에서 매끈하게 보이게 한다.
    """
    im = _defringe(im, alpha_hi=110, lum_hi=165, sat_max=0.42)
    im = _hard_cut_alpha(im, min_alpha=22)
    im = _outer_crust_cut(im, alpha_cut=150, lum_hi=155)
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(1.0))
    im = Image.merge("RGBA", (r_, g_, b_, a_))
    im = _defringe(im, alpha_hi=100, lum_hi=155, sat_max=0.45)
    im = _hard_cut_alpha(im, min_alpha=16)
    im = _bbox_trim(im)
    return im


def _kill_white_outer_fringe(im: Image.Image) -> Image.Image:
    """흰 매트 잔상(저채도·밝은 외곽)만 투명화. 시안/골드 코어는 sat이 높아 남는다."""
    px = im.load()
    w, h = im.size
    kill: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a >= 235:
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            if sat >= 0.20 or mx < 150:
                continue
            touches_clear = False
            for dy in (-2, -1, 0, 1, 2):
                for dx in (-2, -1, 0, 1, 2):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] < 28:
                        touches_clear = True
                        break
                if touches_clear:
                    break
            if touches_clear:
                kill.append((x, y))
    for x, y in kill:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
    return im


def _finish_panel_chip(im: Image.Image) -> Image.Image:
    """가로 랭킹 칩용 — 흰/회색 외곽 할로를 세게 지우고 네온 코어만 남긴다.

    이유: 218×42로 줄이면 soft_alpha가 남긴 저채도 껍질이 톱니·노이즈로 보인다.
    채도 낮은 외곽을 걷고 알파를 조금 더 단단히 잘라, 인게임 벡터 스트로크가
    덮을 때 깨끗한 림만 보이게 한다.
    """
    im = _defringe(im, alpha_hi=180, lum_hi=120, sat_max=0.32)
    im = _defringe(im, alpha_hi=220, lum_hi=160, sat_max=0.25)
    im = _kill_white_outer_fringe(im)
    px = im.load()
    w, h = im.size
    kill: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a >= 240:
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            if sat >= 0.25:
                continue  # 시안/골드 코어 보존
            edge = False
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] < 40:
                        edge = True
                        break
                if edge:
                    break
            if edge:
                kill.append((x, y))
    for x, y in kill:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
    im = _hard_cut_alpha(im, min_alpha=28)
    im = _outer_crust_cut(im, alpha_cut=160, lum_hi=140)
    # 최외곽 1px 침식 — 노이즈 할로를 잘라 인게임 벡터 림이 덮을 자리를 만듦
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.MinFilter(3))
    a_ = a_.filter(ImageFilter.GaussianBlur(0.45))
    im = Image.merge("RGBA", (r_, g_, b_, a_))
    im = _kill_white_outer_fringe(im)
    im = _hard_cut_alpha(im, min_alpha=42)
    im = _bbox_trim(im)
    return im


def _prep_panel(src_name: str, out_name: str, bg: str = "white", finish: str = "default") -> None:
    src_path = os.path.join(SRC, src_name)
    im = Image.open(src_path)
    if bg == "black":
        im = _flood_black_bg(im)
    else:
        im = _soft_alpha_white_bg(im)
    if finish == "neon":
        im = _finish_panel_neon(im)
    elif finish == "chip":
        im = _finish_panel_chip(im)
    else:
        im = _finish_panel(im)
    out_path = os.path.join(OUT, out_name)
    im.save(out_path, "PNG")
    print(f"  {out_name} → {im.size}  (bg={bg}, finish={finish})")


if __name__ == "__main__":
    print("[panel assets]")
    # 가로 랭킹 칩 — 흰 매트 + chip finish(흰 fringe 제거)
    _prep_panel("panel-rank-hud-src.png",      "panel-rank-hud.png", finish="chip")
    _prep_panel("panel-rank-hud-gold-src.png",  "panel-rank-hud-gold.png", finish="chip")
    # 일간/주간 세로 패널 — 검정 매트 + neon finish(글로우 AA 보존)
    _prep_panel("panel-daily-src.png",           "panel-daily.png", bg="black", finish="neon")
    _prep_panel("panel-weekly-src.png",          "panel-weekly.png", bg="black", finish="neon")
    _prep_panel("panel-gameover-src.png",        "panel-gameover.png")
    _prep_panel("panel-tutorial-src.png",        "panel-tutorial.png")
    # Replay CTA — 흰 매트 → soft_alpha
    _prep_panel("btn-replay-src.png",            "btn-replay.png")
    print("done.")
