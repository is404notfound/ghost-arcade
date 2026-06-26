#!/usr/bin/env python3
"""아포칼립스 장애물 전처리 — wreck-car / flame-barrel 흰 배경 제거.

원본(assets/images/obstacles/*-src.png): RGB(흰 배경) 일러스트.
prep-assets.py의 '저채도 flood-fill'은 검은 외곽선(채도0)까지 배경으로 먹어버려
일러스트엔 부적합 → 여기선 '흰색 전용 flood-fill'을 쓴다:
  테두리에서 시작해 '거의 흰색(모든 채널 > WHITE_TH)' 연결 영역만 투명화.
  → 어두운 외곽선·색이 있는 차체/드럼통은 보존, 내부에 갇힌 흰색도 보존.

산출물: assets/game/wreck-car.png, assets/game/flame-barrel.png (RGBA, content-trim).
"""
from __future__ import annotations
from PIL import Image, ImageFilter
from collections import deque
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets", "images", "obstacles")
OUT = os.path.join(ROOT, "assets", "game")

WHITE_TH = 232   # 이 값보다 모든 채널이 밝으면 '흰 배경 후보'


def remove_white_bg(img: Image.Image) -> Image.Image:
    """테두리 flood-fill로 흰 배경 연결 영역만 투명화 + 경계 부드러운 알파."""
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


def process(src_name: str, out_name: str, target_h: int) -> None:
    im = remove_white_bg(Image.open(os.path.join(SRC, src_name)))
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    cw, ch = im.size
    scale = target_h / ch
    im = im.resize((max(1, round(cw * scale)), target_h), Image.LANCZOS)
    # 알파 가장자리 미세 블러 → 계단현상 제거
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(0.8))
    im = Image.merge("RGBA", (r_, g_, b_, a_))
    im.save(os.path.join(OUT, out_name), "PNG")
    print(f"  {out_name:20s} {im.size}")


if __name__ == "__main__":
    process("wreck-car-src.png", "wreck-car.png", target_h=300)
    process("flame-barrel-src.png", "flame-barrel.png", target_h=340)
    print("done.")
