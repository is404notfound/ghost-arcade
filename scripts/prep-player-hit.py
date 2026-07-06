#!/usr/bin/env python3
"""player-hit 전처리 — 정면 충돌, 마젠타+시안 스파크.

소스(assets/images/player/player-hit-src.png): RGB 1024×1024, 배경 ~246 회색.

전략:
  1) soft_alpha (배경 gray-adjusted): dark_c 기준을 220으로 낮춰
     배경(rgb≈246) → alpha=0, 네이비 차체(mx<160) → alpha=1.
  2) 트림 앵커 = '바이크+라이더' bbox (dark body = mx < 160인 불투명 픽셀).
     스파크는 바이크 bbox 안쪽만 살리고, bbox 오른쪽(x > body_right)은 클립.
  3) [Tier B] 수평 방향: body 콘텐츠를 캔버스 중앙(0.5)에 배치.
     → GameScene setOrigin(0.5, ...) 사용 — jump 컷과 동일 originX.
  4) [Tier B] HIT_WHEEL_SCALE 배율 추가: 뒷바퀴 지름을 ride 기준으로 정규화.
  5) [Tier B] COMMON_CANVAS_H: player-jump1.png(prep-player-jump.py 산출물)의
     높이를 자동으로 읽어와 동기화. jump가 먼저 실행되어 있어야 한다.
  6) 뒷바퀴 하단을 jump 컷과 동일 비율 위치에 정렬 → 세 컷 모두 같은 originY.
  7) 스케일: TARGET_H × HIT_WHEEL_SCALE

산출: assets/game/player-hit.png (RGBA)
마지막에 GameScene 파라미터를 출력 → jump 스크립트 출력과 교차검증.
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC  = os.path.join(ROOT, "assets", "images", "player", "player-hit-src.png")
OUT  = os.path.join(ROOT, "assets", "game", "player-hit.png")

TARGET_H       = 300          # ride 출력 높이와 통일
RIDE_ART_H     = 96           # GameScene PLAYER_ART_H (동기화용)
ORIGIN_X_TARGET = 0.50       # [Tier B] jump 컷과 동일 originX 사용
DARK_BODY_MX   = 160         # '몸체 픽셀' 최대 밝기 상한 (스파크 제외 기준)

# [Tier B] 뒷바퀴 지름을 ride와 일치시키는 배율.
HIT_WHEEL_SCALE = 1.15

# [Tier B] 공통 캔버스 높이: prep-player-jump.py 산출물(player-jump1.png)에서 자동 취득.
# jump 스크립트를 먼저 실행한 뒤 이 스크립트를 돌릴 것.
_JUMP1_OUT = os.path.join(ROOT, "assets", "game", "player-jump1.png")
if os.path.exists(_JUMP1_OUT):
    COMMON_CANVAS_H = Image.open(_JUMP1_OUT).height
    print(f"[info] COMMON_CANVAS_H = {COMMON_CANVAS_H}  (player-jump1.png 높이에서 자동 취득)")
else:
    COMMON_CANVAS_H = round(TARGET_H * 1.60) + 20  # jump2 최대배율 + BOOST_PAD fallback
    print(f"[warn] player-jump1.png 없음 → COMMON_CANVAS_H fallback = {COMMON_CANVAS_H}")


# ─── 배경제거 ──────────────────────────────────────────────────────────────
def soft_alpha_gray(img: Image.Image) -> Image.Image:
    """흰/회색 배경 → 부드러운 알파.
    dark_c 기준을 220으로 낮춰 246-gray를 투명 처리한다.
    sat_c 는 기존과 동일(시안/마젠타 스파크 + 네이비 차체 보존)."""
    img = img.convert("RGBA")
    px  = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            mx  = max(r, g, b)
            mn  = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            sat_c  = min(1.0, sat / 0.30)
            dark_c = max(0.0, min(1.0, (220 - mx) / 100.0))
            a = max(sat_c, dark_c)
            if a < 0.05:
                a = 0.0
            px[x, y] = (r, g, b, int(255 * a))
    return img


# ─── bbox 헬퍼 ──────────────────────────────────────────────────────────────
def content_bbox(img: Image.Image):
    """알파 > 0 픽셀의 최소 bounding box (x0,y0,x1,y1)."""
    a = img.split()[3]
    return a.point(lambda v: 255 if v > 0 else 0).getbbox()  # (x0,y0,x1,y1)


def body_right_x(img: Image.Image, mx_thresh: int = DARK_BODY_MX) -> int:
    """바이크+라이더 dark body(mx < mx_thresh)의 우측 끝 x."""
    px   = img.load()
    w, h = img.size
    for x in range(w - 1, -1, -1):
        for y in range(0, h, 4):            # 4px 스텝으로 속도 확보
            r, g, b, a = px[x, y]
            if a > 0 and max(r, g, b) < mx_thresh:
                return x
    return w - 1


def body_centroid_x(img: Image.Image, mx_thresh: int = DARK_BODY_MX) -> float:
    """dark body 픽셀의 x 무게중심."""
    px   = img.load()
    w, h = img.size
    sx, cnt = 0.0, 0
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            r, g, b, a = px[x, y]
            if a > 0 and max(r, g, b) < mx_thresh:
                sx += x
                cnt += 1
    return (sx / cnt) if cnt > 0 else w / 2


def wheel_bottom_y(img: Image.Image, min_span: int = 40) -> int:
    """뒷바퀴 하단 y: 연속 불투명 폭 ≥ min_span인 최하단 행.
    없으면 단순 최하단 불투명 픽셀로 폴백."""
    px   = img.load()
    w, h = img.size
    for y in range(h - 1, -1, -1):
        span = max_span = 0
        for x in range(w):
            if px[x, y][3] > 24:
                span += 1
                max_span = max(max_span, span)
            else:
                span = 0
        if max_span >= min_span:
            return y
    # 폴백
    for y in range(h - 1, -1, -1):
        for x in range(w):
            if px[x, y][3] > 24:
                return y
    return h - 1


# ─── main ──────────────────────────────────────────────────────────────────
def main() -> None:
    raw = Image.open(SRC).convert("RGB")
    img = soft_alpha_gray(raw)

    # 1) 전체 콘텐츠 bbox (y 범위 결정용)
    bbox_all = content_bbox(img)
    if bbox_all is None:
        raise RuntimeError("알파 픽셀이 없습니다. 배경제거 실패.")
    x0_all, y0_all, x1_all, y1_all = bbox_all

    # 2) 바이크+라이더 우측 끝 (스파크 클립 경계)
    br_x = body_right_x(img)                       # 원본 x 좌표계
    print(f"body_right_x = {br_x}  (content_right = {x1_all})")

    # 3) y 방향: 전체 콘텐츠 bbox (라이더 전체 포함)
    crop_x0 = x0_all
    crop_x1 = br_x + 1   # body 우측까지만, 스파크 overflow 클립
    crop_y0 = y0_all
    crop_y1 = y1_all + 1

    img_crop = img.crop((crop_x0, crop_y0, crop_x1, crop_y1))
    cw, ch   = img_crop.size   # body bbox: 771 × 684 근처

    # 4) body centroid x (crop 기준)
    cx = body_centroid_x(img_crop) - 0  # crop 내 x (x0_all이 이미 0으로 됨)
    print(f"crop size = {img_crop.size}  body_centroid_x = {cx:.1f}")

    # 5) 왼쪽 패딩: centroid가 ORIGIN_X_TARGET 위치에 오도록
    #    (left_pad + cx) = ORIGIN_X_TARGET × (left_pad + cw)
    #    → 0.42 * left_pad = ORIGIN_X_TARGET * cw - cx
    denom = 1.0 - ORIGIN_X_TARGET
    numer = ORIGIN_X_TARGET * cw - cx
    left_pad = max(0, round(numer / denom))
    print(f"left_pad = {left_pad}px  (centroid → {(left_pad+cx)/(left_pad+cw):.3f})")

    total_w = left_pad + cw

    # 6) scale: [Tier B] HIT_WHEEL_SCALE을 곱해 뒷바퀴 지름을 ride 기준으로 확대
    scale = TARGET_H * HIT_WHEEL_SCALE / ch
    nh    = max(1, round(ch * scale))   # = round(TARGET_H * HIT_WHEEL_SCALE)

    # 6a) body 부분 리사이즈
    scaled_body = img_crop.resize(
        (max(1, round(cw * scale)), nh), Image.LANCZOS
    )
    # 알파 가장자리 블러
    r_, g_, b_, a_ = scaled_body.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(0.9))
    scaled_body = Image.merge("RGBA", (r_, g_, b_, a_))

    left_pad_scaled = max(0, round(left_pad * scale))

    # 6b) 중간 결과물 (투명 바탕 + body 배치)
    mid_w = left_pad_scaled + scaled_body.width
    mid   = Image.new("RGBA", (mid_w, nh), (0, 0, 0, 0))
    mid.paste(scaled_body, (left_pad_scaled, 0), scaled_body)

    # 7) [Tier B] 뒷바퀴 하단을 COMMON_CANVAS_H 캔버스의 jump와 동일 비율 위치에 정렬.
    wheel_y_mid = wheel_bottom_y(mid)
    # jump 스크립트의 공통 baseline fraction = common_bl / canvas_h.
    # 여기서는 COMMON_CANVAS_H 내에서 jump 캔버스와 동일 위치(wheel_y_mid 절대값)에 배치.
    # canvas 높이 = COMMON_CANVAS_H, wheel을 wheel_y_mid 위치에 맞춤.
    oy = 0  # 위 여백 (mid보다 COMMON_CANVAS_H가 더 크면 wheel 위치를 맞추도록 계산)
    target_wheel_y = wheel_y_mid  # 중간 이미지에서 wheel_y는 그대로 사용
    if COMMON_CANVAS_H > nh:
        # 아래 정렬: wheel_y_mid가 COMMON_CANVAS_H 내에서도 동일 위치가 되도록
        # jump common_bl ≈ COMMON_CANVAS_H - BOOST_PAD - 1
        # hit 도 동일 common_bl 위치에 wheel을 맞춤
        jump_common_bl = COMMON_CANVAS_H - 21  # BOOST_PAD=20 + 1
        oy = jump_common_bl - wheel_y_mid
        oy = max(0, oy)

    out_h = max(COMMON_CANVAS_H, oy + nh)
    out   = Image.new("RGBA", (mid_w, out_h), (0, 0, 0, 0))
    out.paste(mid, (0, oy), mid)

    # 최종 앵커 계산
    wheel_y_final = oy + wheel_y_mid
    body_cx_final = left_pad_scaled + (cx * scale)
    origin_x      = body_cx_final / out.width
    origin_y      = wheel_y_final / out.height

    print(f"\noutput: {out.size}")
    print(f"wheel_bottom_y = {wheel_y_final}  → originY fraction = {origin_y:.3f}")
    print(f"body_centroid x= {body_cx_final:.1f} / {out.width} → originX fraction = {origin_x:.3f}")

    out.save(OUT, "PNG")

    jump_hit_art_h = round(RIDE_ART_H * out_h / TARGET_H)
    frac = origin_y
    print(f"\n─── GameScene.ts 갱신 파라미터 ───────────────────────────────────")
    print(f"const JUMP_HIT_ART_H = {jump_hit_art_h};  // = {RIDE_ART_H} × {out_h}/{TARGET_H}")
    print(f"setOrigin({origin_x:.2f}, {frac:.2f})  // hit — jump ({ORIGIN_X_TARGET:.2f}, ~0.93)와 비교")
    print(f"\nsaved → {OUT}")


if __name__ == "__main__":
    main()
