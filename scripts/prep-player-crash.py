#!/usr/bin/env python3
"""player-dead 교체용 크래시 컷 전처리.

소스(assets/images/player/player-crash-src.png): RGB 1024×1024, 흰 배경.
  라이더가 오토바이에서 튕겨 날아가고 앞쪽에 시안/마젠타 임팩트 폭발.

전략:
  1) soft_alpha — 이슈 2에서 정한 강화 컷오프 적용 (near-white 뿌연 박스 방지).
  2) 트림: 전체 콘텐츠 bbox → 크롭.
  3) CRASH_SCALE 배율 적용 (ride 기준 뒷바퀴 지름과 비율 맞춤).
  4) 뒷바퀴 하단 앵커 → COMMON_CANVAS_H 내에서 jump 컷과 동일 baseline에 정렬.
  5) origin: x ≈ 0.42 (폭발이 오른쪽으로 향하도록 오토바이를 살짝 왼쪽에 배치).

산출: assets/game/player-dead.png (RGBA) — 기존 텍스처 키 재사용, 코드 배선 무변경.
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC  = os.path.join(ROOT, "assets", "images", "player", "player-crash-src.png")
OUT  = os.path.join(ROOT, "assets", "game", "player-dead.png")

TARGET_H     = 300    # ride 출력 높이와 통일
RIDE_ART_H   = 96     # GameScene PLAYER_ART_H (동기화용)
CRASH_SCALE  = 1.20   # 뒷바퀴 지름 기준 ride 대비 배율 (크래시는 가로로 넓으므로 약간만)

# 공통 캔버스 높이: player-jump1.png에서 자동 취득 (jump보다 나중에 실행)
_JUMP1_OUT = os.path.join(ROOT, "assets", "game", "player-jump1.png")
if os.path.exists(_JUMP1_OUT):
    COMMON_CANVAS_H = Image.open(_JUMP1_OUT).height
    print(f"[info] COMMON_CANVAS_H = {COMMON_CANVAS_H}  (player-jump1.png 높이에서 자동 취득)")
else:
    COMMON_CANVAS_H = 459  # jump 스크립트 기본 fallback
    print(f"[warn] player-jump1.png 없음 → COMMON_CANVAS_H fallback = {COMMON_CANVAS_H}")


# ─── 배경제거 (이슈 2 강화 컷오프) ──────────────────────────────────────────
def soft_alpha(img: Image.Image) -> Image.Image:
    """흰 배경 → 부드러운 알파 (강화 컷오프).

    - near-white(mx > 238 AND sat < 0.12) → 알파 0 강제
    - 그 외 잔류 알파 하한 컷: a < 0.35 → 0.0
      (시안/마젠타 폭발·네온 글로우는 sat가 높아 이 조건에 걸리지 않음)
    """
    img = img.convert("RGBA")
    px  = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            mx  = max(r, g, b)
            mn  = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            # near-white 배경 강제 제거
            if mx > 238 and sat < 0.12:
                px[x, y] = (r, g, b, 0)
                continue
            sat_c  = min(1.0, sat / 0.30)
            dark_c = min(1.0, (255 - mx) / 70.0)
            a = max(sat_c, dark_c)
            if a < 0.35:
                a = 0.0
            px[x, y] = (r, g, b, int(255 * a))
    return img


# ─── 앵커 헬퍼 ──────────────────────────────────────────────────────────────
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
    for y in range(h - 1, -1, -1):
        for x in range(w):
            if px[x, y][3] > 24:
                return y
    return h - 1


# ─── main ──────────────────────────────────────────────────────────────────
def main() -> None:
    raw = Image.open(SRC).convert("RGB")
    print(f"source size = {raw.size}")

    img = soft_alpha(raw)

    # faint 알파 검증
    pixels = list(img.getdata())
    total  = len(pixels)
    faint  = sum(1 for p in pixels if 0 < p[3] < 64)
    print(f"faint 비율 (배경제거 후) = {faint/total*100:.1f}%  (목표 <5%)")

    # 1) 콘텐츠 bbox → 크롭
    a_ch = img.split()[3]
    bbox = a_ch.point(lambda v: 255 if v > 0 else 0).getbbox()
    if bbox is None:
        raise RuntimeError("알파 픽셀이 없습니다. 배경제거 실패.")
    x0, y0, x1, y1 = bbox
    img_crop = img.crop((x0, y0, x1 + 1, y1 + 1))
    cw, ch   = img_crop.size
    print(f"crop bbox = {bbox}  crop size = {img_crop.size}")

    # 2) 스케일 적용
    scale = TARGET_H * CRASH_SCALE / ch
    nw    = max(1, round(cw * scale))
    nh    = max(1, round(ch * scale))
    img_scaled = img_crop.resize((nw, nh), Image.LANCZOS)

    # 알파 가장자리 블러 (계단현상 제거)
    r_, g_, b_, a_ = img_scaled.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(0.9))
    img_scaled = Image.merge("RGBA", (r_, g_, b_, a_))

    print(f"scaled size = {img_scaled.size}  (scale={scale:.3f})")

    # 3) 뒷바퀴 하단 앵커 → jump baseline에 정렬
    wheel_y = wheel_bottom_y(img_scaled)
    print(f"wheel_bottom_y (scaled) = {wheel_y}")

    jump_common_bl = COMMON_CANVAS_H - 21  # BOOST_PAD=20 + 1
    oy = max(0, jump_common_bl - wheel_y)

    out_h = max(COMMON_CANVAS_H, oy + nh)
    out   = Image.new("RGBA", (nw, out_h), (0, 0, 0, 0))
    out.paste(img_scaled, (0, oy), img_scaled)

    # 최종 앵커 좌표
    wheel_y_final = oy + wheel_y
    origin_y      = wheel_y_final / out_h
    # x: 0.42 — 오토바이가 왼쪽 중심, 폭발은 오른쪽으로 향함
    origin_x      = 0.42

    print(f"\noutput size = {out.size}")
    print(f"wheel_y_final = {wheel_y_final}  origin_y = {origin_y:.3f}")
    print(f"origin_x = {origin_x}")

    out.save(OUT, "PNG")

    jump_hit_art_h = round(RIDE_ART_H * out_h / TARGET_H)
    print(f"\n─── GameScene.ts 갱신 참고 파라미터 ────────────────────────────────")
    print(f"const DEAD_ART_SCALE = 1.1;  // player-dead 표시 크기 조정 시 참고")
    print(f"// dead 분기: setOrigin({origin_x:.2f}, {origin_y:.2f})")
    print(f"// JUMP_HIT_ART_H = {jump_hit_art_h}  (COMMON_CANVAS_H={out_h})")
    print(f"\nsaved → {OUT}")


if __name__ == "__main__":
    main()
