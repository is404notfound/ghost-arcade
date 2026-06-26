#!/usr/bin/env python3
"""아포칼립스 장애물 2차 전처리.

(A) obstacles-src.png (RGBA, 투명배경, 3장애물 한 장): 알파 컬럼 프로파일로 3개를
    개별 분리 → 좌:부서진차, 중:불타는드럼통, 우:잔해더미. 각각 trim 후 저장.
(B) flame-pilar-1/2-src.png (RGB, 흰배경, 세로로 긴 불기둥): 흰색 flood-fill 제거 →
    소프트 글로우(분홍/주황 헤일로)는 보존.

산출물: assets/game/{obs-car,obs-barrel,obs-debris,flame-pilar-1,flame-pilar-2}.png
"""
from __future__ import annotations
from PIL import Image, ImageFilter
from collections import deque
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets", "images", "obstacles")
OUT = os.path.join(ROOT, "assets", "game")

WHITE_TH = 232


# ── (A) 투명배경 시트 분할 ───────────────────────────────────────────────
def split_by_alpha(path: str, names: list[str], target_h: int) -> None:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    a = im.split()[3]
    ap = a.load()
    # 컬럼별 불투명 픽셀 수 → 0인 구간을 경계로 덩어리 분리
    cols = [0] * w
    for x in range(w):
        c = 0
        for y in range(h):
            if ap[x, y] > 16:
                c += 1
        cols[x] = c
    GAP = 6  # 이 폭 이상 연속 빈 컬럼이면 경계
    spans: list[tuple[int, int]] = []
    x = 0
    while x < w:
        if cols[x] > 0:
            x0 = x
            while x < w and not (cols[x] == 0 and _empty_run(cols, x, GAP)):
                x += 1
            spans.append((x0, x))
        else:
            x += 1
    # 면적 큰 순으로 정렬 후 x순 정렬 → 잡티 span 제거(상위 len(names)개)
    spans = sorted(spans, key=lambda s: -sum(cols[s[0]:s[1]]))[: len(names)]
    spans = sorted(spans, key=lambda s: s[0])
    assert len(spans) == len(names), f"분할 {len(spans)}개 (기대 {len(names)})"
    for (x0, x1), name in zip(spans, names):
        sub = im.crop((max(0, x0 - 4), 0, min(w, x1 + 4), h))
        # 배경 RGB가 0이 아니므로(예: 79,79,80) 알파 채널 기준으로만 trim.
        amask = sub.split()[3].point(lambda v: 255 if v > 16 else 0)
        bb = amask.getbbox()
        if bb:
            sub = sub.crop(bb)
        cw, ch = sub.size
        scale = target_h / ch
        sub = sub.resize((max(1, round(cw * scale)), target_h), Image.LANCZOS)
        sub.save(os.path.join(OUT, name), "PNG")
        print(f"  {name:18s} {sub.size}")


def _empty_run(cols: list[int], x: int, gap: int) -> bool:
    """x부터 gap 컬럼이 전부 비었는지(경계 판정)."""
    return all(c == 0 for c in cols[x : x + gap])


# ── (B) 흰배경 불기둥 ────────────────────────────────────────────────────
def remove_white_bg(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def is_white(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 0 and r > WHITE_TH and g > WHITE_TH and b > WHITE_TH

    for x in range(w):
        for y in (0, h - 1):
            if not visited[y * w + x] and is_white(x, y):
                q.append((x, y)); visited[y * w + x] = 1
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y * w + x] and is_white(x, y):
                q.append((x, y)); visited[y * w + x] = 1
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                visited[ny * w + nx] = 1
                if is_white(nx, ny):
                    q.append((nx, ny))
    return img


def process_white(src_name: str, out_name: str, target_h: int) -> None:
    im = remove_white_bg(Image.open(os.path.join(SRC, src_name)))
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    cw, ch = im.size
    scale = target_h / ch
    im = im.resize((max(1, round(cw * scale)), target_h), Image.LANCZOS)
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(0.8))
    im = Image.merge("RGBA", (r_, g_, b_, a_))
    im.save(os.path.join(OUT, out_name), "PNG")
    print(f"  {out_name:18s} {im.size}")


if __name__ == "__main__":
    print("[obstacles split]")
    split_by_alpha(
        os.path.join(SRC, "obstacles-src.png"),
        ["obs-car.png", "obs-barrel.png", "obs-debris.png"],
        target_h=320,
    )
    print("[flame pillars]")
    process_white("flame-pilar-1-src.png", "flame-pilar-1.png", target_h=360)
    process_white("flame-pilar-2-src.png", "flame-pilar-2.png", target_h=360)
    print("done.")
