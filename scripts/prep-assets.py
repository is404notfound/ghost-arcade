#!/usr/bin/env python3
"""게임 에셋 전처리 — 원본(assets/images) → 게임용(assets/game).

하는 일:
  1) 배경 제거: 테두리에서 시작하는 flood-fill로 '저채도(회색/흰/검 체커보드)'
     연결 영역만 투명화. 네온(고채도 시안/보라/골드/마젠타) 본체는 보존.
  2) 부유 잔재 제거: 배경 제거 후 남는 작은 조각(예: 반짝이 artifact) 삭제.
     단 면적이 충분한 조각(헤일로 링, 바닥 글로우)은 유지.
  3) 프레임 정렬: 같은 캐릭터의 애니 프레임은 '공통 bbox + 공통 배율'로 잘라
     프레임 간 위치/크기가 흔들리지 않게 한다.
  4) 리사이즈: 게임 풋프린트의 약 3배 소스로 축소(메모리 절약·선명도 유지).

원본은 절대 건드리지 않는다(읽기 전용). 산출물만 assets/game/에 쓴다.
"""
from __future__ import annotations
from PIL import Image
from collections import deque
import os

SRC = os.path.join(os.path.dirname(__file__), "..", "assets", "images")
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "game")
os.makedirs(OUT, exist_ok=True)

SAT_BG = 0.16  # 이 값보다 채도가 낮으면 '배경 후보(회색)'


def saturation(r: int, g: int, b: int) -> float:
    mx = max(r, g, b)
    mn = min(r, g, b)
    return (mx - mn) / mx if mx > 0 else 0.0


def remove_bg(img: Image.Image) -> Image.Image:
    """테두리 flood-fill로 저채도 연결 배경을 투명화."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def is_bg(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 0 and saturation(r, g, b) < SAT_BG

    for x in range(w):
        for y in (0, h - 1):
            if not visited[y * w + x] and is_bg(x, y):
                q.append((x, y)); visited[y * w + x] = 1
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y * w + x] and is_bg(x, y):
                q.append((x, y)); visited[y * w + x] = 1

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx]:
                visited[ny * w + nx] = 1
                if is_bg(nx, ny):
                    q.append((nx, ny))
    return img


def drop_small_islands(img: Image.Image, min_frac: float = 0.01) -> Image.Image:
    """불투명 연결 조각 중 (가장 큰 조각 면적 × min_frac) 미만은 제거."""
    w, h = img.size
    px = img.load()
    visited = bytearray(w * h)
    comps: list[list[int]] = []
    for sy in range(h):
        for sx in range(w):
            idx = sy * w + sx
            if visited[idx] or px[sx, sy][3] <= 8:
                continue
            comp = []
            q = deque([(sx, sy)]); visited[idx] = 1
            while q:
                x, y = q.popleft(); comp.append(y * w + x)
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny * w + nx
                        if not visited[nidx] and px[nx, ny][3] > 8:
                            visited[nidx] = 1; q.append((nx, ny))
            comps.append(comp)
    if not comps:
        return img
    biggest = max(len(c) for c in comps)
    thr = biggest * min_frac
    for c in comps:
        if len(c) < thr:
            for p in c:
                px[p % w, p // w] = (0, 0, 0, 0)
    return img


def process_group(names: list[str], out_names: list[str], target_h: int,
                  clean_islands: bool = True):
    """애니 프레임 그룹: bg 제거 → 공통 bbox → 공통 배율로 리사이즈."""
    imgs = [remove_bg(Image.open(os.path.join(SRC, n))) for n in names]
    if clean_islands:
        imgs = [drop_small_islands(im) for im in imgs]
    # 공통 bbox (모든 프레임 합집합)
    union = None
    for im in imgs:
        bb = im.getbbox()
        if bb is None:
            continue
        union = bb if union is None else (
            min(union[0], bb[0]), min(union[1], bb[1]),
            max(union[2], bb[2]), max(union[3], bb[3]),
        )
    assert union is not None
    cropped = [im.crop(union) for im in imgs]
    cw, ch = cropped[0].size
    scale = target_h / ch
    tw = max(1, round(cw * scale))
    for im, on in zip(cropped, out_names):
        out = im.resize((tw, target_h), Image.LANCZOS)
        out.save(os.path.join(OUT, on), "PNG")
        print(f"  {on:24s} {out.size}")


def process_single(name: str, out_name: str, target_h: int,
                   clean_islands: bool = True):
    im = remove_bg(Image.open(os.path.join(SRC, name)))
    if clean_islands:
        im = drop_small_islands(im)
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    cw, ch = im.size
    scale = target_h / ch
    out = im.resize((max(1, round(cw * scale)), target_h), Image.LANCZOS)
    out.save(os.path.join(OUT, out_name), "PNG")
    print(f"  {out_name:24s} {out.size}")


if __name__ == "__main__":
    print("[player]")
    process_group(
        ["player-rider.png", "player-rider-jump.png",
         "player-rider-hit.png", "player-rider-dead.png"],
        ["player-ride.png", "player-jump.png",
         "player-hit.png", "player-dead.png"],
        target_h=192,
    )
    print("[ghost]")
    process_group(
        ["ghost-runner-pose-a.png", "ghost-runner-pose-b.png"],
        ["ghost-run-0.png", "ghost-run-1.png"],
        target_h=176,
    )
    print("[items / buildings / bg]")
    process_single("fuel-can.png", "fuel-can.png", target_h=84)
    process_single("building-kit-cap.png", "building-cap.png", target_h=360)
    process_single("building-kit-floor.png", "building-floor.png", target_h=360)
    process_single("bg-sun.png", "bg-sun.png", target_h=300)
    print("[meteors]")
    # 원본: assets/images/meteors/ — 흰 배경 제거 + RGBA 변환 + 리사이즈.
    # 표시 크기(@3x 기준): lg≈180px, mid≈120px, sm≈75px → setDisplaySize로 최종 조정.
    for src_name, out_name, th in [
        ("fx-meteor-lg.png", "fx-meteor-lg.png", 180),
        ("fx-meteor-mid.png", "fx-meteor-mid.png", 120),
        ("fx-meteor-sm.png", "fx-meteor-sm.png", 75),
    ]:
        src_path = os.path.join(SRC, "meteors", src_name)
        im = remove_bg(Image.open(src_path))
        im = drop_small_islands(im)
        bb = im.getbbox()
        if bb:
            im = im.crop(bb)
        cw, ch = im.size
        scale = th / ch
        out = im.resize((max(1, round(cw * scale)), th), Image.LANCZOS)
        out.save(os.path.join(OUT, out_name), "PNG")
        print(f"  {out_name:24s} {out.size}")
    print("done.")
