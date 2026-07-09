#!/usr/bin/env python3
"""UI 에셋 전처리.

hp-frame-src.png (RGBA 투명배경, 1024×1024):
  알파 > 16 bbox 트림 → '종횡비 보존' 고해상 리사이즈 → fringe 정리 → 알파 soft → 저장.
  내부 투명, 외곽 시안+하트 프레임만 남음.
  시트 원본: hp-bar-sheet-src.png (프레임/fill/하트 3단) → 프레임만 슬라이스해 본 파일로 둠.

  ★ 이전 버그: 260×20(=13:1)로 강제 리사이즈해 원본 바(≈7.5:1)가 가로로 눌리고(비율 깨짐)
    저해상이라 화질도 뭉갬. → 원본 종횡비를 유지하고 고해상(@3x)으로 구워 crisp하게 만든다.
    GameScene은 이 종횡비에 맞춰 barH를 계산해 왜곡 없이 표시한다.

  ★ 2026-07 fringe 정리:
    가장자리 bright fringe(저알파+밝은 RGB)가 인게임에서 '자글거림/타일 잔상'으로 보임.
    하트·우측 상단 주변 dirty mid-alpha도 같이 걷. 프레임 본체(고알파 시안/화이트)는 보존.

fuel-can-src.png (RGB 흰 배경, 1024×1024):
  흰 배경 제거(R&G&B > 238 & sat < 0.12 → α0) → bbox 트림 → 104×104 정사각 캔버스 중앙 배치.
  26×26 표시 기준의 4배(@4x) — 고DPR에서도 선명. 종횡비 보존.

warn-bubble-src.png (RGB 흰 배경, ~1024×341, WARNING baked):
  흰 배경 제거 → fringe 정리 → bbox 트림 → 종횡비 보존 @3x 리사이즈.
  표시 폭 ~168 기준 → 504px. 글자·스파이크 프레임이 한 장에 구워져 있음.
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
# warn-bubble: 인게임 ~360px 표시 → @3x ≈ 1080 (소스 1024에 가깝게 유지해 다운스케일 뭉개짐 완화)
WARN_BUBBLE_TARGET_W = 1024
# 흰 스트로크 두께(소스 해상도 기준 px)
WARN_STROKE_PX = 5


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


def _defringe(im: Image.Image, alpha_hi: int = 130, lum_hi: int = 145, sat_max: float = 0.40) -> Image.Image:
    """저~중알파 + 밝은 픽셀 제거 (배경 fringe / 타일 잔상).

    시안 네온·하트 코어(고알파)는 남고, 가장자리로 번진 밝은 mid-alpha만 지운다.
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
            if lum >= lum_hi:
                px[x, y] = (r, g, b, 0)
            elif a < 95 and lum >= 110 and sat <= sat_max:
                px[x, y] = (r, g, b, 0)
    return im


def _outer_crust_cut(im: Image.Image, alpha_cut: int = 150, lum_hi: int = 130) -> Image.Image:
    """투명과 맞닿은 외곽의 밝은 mid-alpha 껍질 제거."""
    px = im.load()
    w, h = im.size
    kill: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a >= alpha_cut:
                continue
            if (r + g + b) / 3.0 < lum_hi:
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


def _hard_cut_alpha(im: Image.Image, min_alpha: int = 28) -> Image.Image:
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < min_alpha:
                px[x, y] = (r, g, b, 0)
    return im


def _clear_heart_top_black(im: Image.Image) -> Image.Image:
    """하트 상단 lobe에 남은 불투명 검정/거의검정·어두운 시안 띠를 투명화.

    소스/리사이즈 과정에서 하트 꼭대기 근처에 까만/짙은 청록 띠가 남는 경우가 있음
    (예: y≈15의 (0,21,33) 수평선). 우측 하트 구획 상단에서만 처리.
    밝은 시안 네온 림(mx 높음)은 보존.
    """
    px = im.load()
    w, h = im.size
    x0 = int(w * 0.88)
    y1 = int(h * 0.42)
    for y in range(0, y1):
        for x in range(x0, w):
            r, g, b, a = px[x, y]
            if a < 12:
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            # 거의 검정 / 어두운 청록 띠 — 밝은 네온(mx>70)은 남김
            if mx <= 48:
                px[x, y] = (r, g, b, 0)
            elif mx <= 60 and sat <= 0.45 and a < 220:
                px[x, y] = (r, g, b, 0)
    return im


def prep_hp_frame() -> None:
    im = Image.open(os.path.join(SRC, "hp-frame-src.png")).convert("RGBA")
    # bbox 트림 (알파 > 10 — 약한 네온 글로우도 포함)
    amask = im.split()[3].point(lambda v: 255 if v > 10 else 0)
    bb = amask.getbbox()
    if bb:
        im = im.crop(bb)
    # ★ 종횡비 보존 리사이즈(목표 폭 기준, 높이는 비례)
    cw, ch = im.size
    tw = HP_FRAME_TARGET_W
    th = max(1, round(ch * tw / cw))
    im = im.resize((tw, th), Image.LANCZOS)
    # ★ 2026-07: fringe 컷을 완화. 이전엔 hard_cut/outer_crust를 세게 돌려
    #   네온 선이 점선처럼 끊기고(듬성듬성) 글로우가 사라졌다.
    #   밝은 저알파 fringe만 가볍게 걷고, 시안 글로우(중알파)는 보존.
    # ★ 좌측 라운드 캡을 자르면 인게임에서 HP바 왼쪽이 직선으로 잘려 보이므로
    #   어두운 패딩 트림은 하지 않는다(라운드 보존 우선).
    im = _defringe(im, alpha_hi=90, lum_hi=170, sat_max=0.25)
    im = _hard_cut_alpha(im, min_alpha=18)
    # ★ 하트 상단 까만 영역(prep/소스 아티팩트) 제거
    im = _clear_heart_top_black(im)
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(0.6))
    im = Image.merge("RGBA", (r_, g_, b_, a_))
    im = _hard_cut_alpha(im, min_alpha=14)
    im = _clear_heart_top_black(im)  # 블러 후 재잔여 제거
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


def _add_white_stroke(im: Image.Image, width: int = 5) -> Image.Image:
    """실루엣 바깥에 흰 스트로크를 깐다 (알파 마스크 팽창 → 흰 밑판 + 원본 합성)."""
    from PIL import ImageChops, ImageFilter as IF

    alpha = im.split()[3]
    # MaxFilter는 홀수 커널 — 팽창으로 스트로크 두께 확보
    k = max(3, width * 2 + 1)
    if k % 2 == 0:
        k += 1
    expanded = alpha.filter(IF.MaxFilter(k))
    # 스트로크만 = 팽창 − 원본 알파
    stroke_a = ImageChops.subtract(expanded, alpha)
    stroke = Image.new("RGBA", im.size, (255, 255, 255, 0))
    stroke.putalpha(stroke_a)
    # 스트로크를 살짝 소프트해 톱니 완화
    sr, sg, sb, sa = stroke.split()
    sa = sa.filter(IF.GaussianBlur(0.6))
    stroke = Image.merge("RGBA", (sr, sg, sb, sa))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.alpha_composite(stroke)
    out.alpha_composite(im)
    return out


def prep_warn_bubble() -> None:
    """암전 WARNING 뱃지 — 흰 배경 → RGBA + 흰 스트로크, 고해상 유지."""
    im = Image.open(os.path.join(SRC, "warn-bubble-src.png")).convert("RGBA")
    # 흰/밝은 회색 배경 제거 (JPEG 압축으로 순백이 아닐 수 있음)
    im = _remove_white_bg(im, thresh=220, sat_thresh=0.12)
    # 네온 핑크 글로우 가장자리의 밝은 fringe만 가볍게 컷
    im = _defringe(im, alpha_hi=100, lum_hi=200, sat_max=0.20)
    im = _hard_cut_alpha(im, min_alpha=20)
    # bbox 트림 (약한 글로우 포함)
    amask = im.split()[3].point(lambda v: 255 if v > 10 else 0)
    bb = amask.getbbox()
    if bb:
        im = im.crop(bb)
    cw, ch = im.size
    tw = WARN_BUBBLE_TARGET_W
    th = max(1, round(ch * tw / cw))
    # 소스≈목표면 리사이즈 스킵 — 불필요한 LANCZOS 뭉개짐 방지
    if abs(cw - tw) > 2 or abs(ch - th) > 2:
        im = im.resize((tw, th), Image.LANCZOS)
    else:
        tw, th = cw, ch
    # 알파 살짝만 — 과블러는 화질 저하 원인
    r_, g_, b_, a_ = im.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(0.35))
    im = Image.merge("RGBA", (r_, g_, b_, a_))
    im = _hard_cut_alpha(im, min_alpha=14)
    # 흰 스트로크 — 인게임 대비·윤곽 선명도
    pad = WARN_STROKE_PX + 4
    canvas = Image.new("RGBA", (im.size[0] + pad * 2, im.size[1] + pad * 2), (0, 0, 0, 0))
    canvas.paste(im, (pad, pad), im)
    im = _add_white_stroke(canvas, width=WARN_STROKE_PX)
    out_path = os.path.join(OUT, "warn-bubble.png")
    im.save(out_path, "PNG")
    print(f"  warn-bubble.png → {im.size}  (content≈{tw}×{th}, white stroke)")


if __name__ == "__main__":
    print("[ui assets]")
    prep_hp_frame()
    prep_fuel_can()
    prep_warn_bubble()
    print("done.")
