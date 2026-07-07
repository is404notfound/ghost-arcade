#!/usr/bin/env python3
"""player-jump1/2 전처리 — 1단·2단 점프 전용 컷 2장.

소스(assets/images/player/player-jump-src.png): RGB 1024×512, 흰 배경.
  좌(x<512) = jump1 (1단 점프),  우(x>=512) = jump2 (2단 점프).

전략:
  1) x=512 에서 좌/우 분할 → 각 512×512 크롭.
  2) soft_alpha: 채도/어두움 기반으로 흰 배경만 투명화.
  3) ★ baseline 앵커 = '뒷바퀴 하단' (부스트 꼬리 제외).
     아래에서 위로 스캔, 가로 연속 불투명 폭 ≥ MIN_WHEEL_SPAN 인 첫 행.
  4) [Tier B] WHEEL_SCALE 상수로 각 컷을 ride 기준 뒷바퀴 지름과 맞추도록 확대.
     jump1 × 1.50, jump2 × 1.60 → 소스 배율 self-contained 하게 구움.
  5) 두 컷의 뒷바퀴 하단을 공통 캔버스에서 동일 y에 정렬.
     부스트 꼬리는 하단 패딩(BOOST_PAD)으로 허용.
  6) 출력 캔버스 크기 및 GameScene 파라미터를 마지막에 출력.
     → GameScene.ts: JUMP_HIT_ART_H / setOrigin(0.5, frac) 에 사용.

산출: assets/game/player-jump1.png, assets/game/player-jump2.png (RGBA 단컷).
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC  = os.path.join(ROOT, "assets", "images", "player", "player-jump-src.png")
OUT1 = os.path.join(ROOT, "assets", "game", "player-jump1.png")
OUT2 = os.path.join(ROOT, "assets", "game", "player-jump2.png")

# player-ride: 소스 Y 크롭 336px → 출력 300px
RIDE_SRC_H = 336   # prep-player-sheet.py: Y0=220, Y1=556
TARGET_H   = 300   # ride 출력 높이와 일치
RIDE_ART_H = 96    # GameScene PLAYER_ART_H (동기화용 — 변경 시 함께 수정)

# [Tier B] 뒷바퀴 지름을 ride와 일치시키는 컷별 배율.
# ride 기준값으로 정규화해 GameScene에서 동일 setDisplaySize 사용 가능.
JUMP1_WHEEL_SCALE = 1.50
JUMP2_WHEEL_SCALE = 1.60   # 2단이 가장 작았으므로 더 크게

# 뒷바퀴 하단 판정: 가로 연속 불투명 폭 임계.
# 바퀴 직경 약 120px(소스 기준 1컷) → 스케일 후 ~107px.
# 부스트 방울 최대 ~30px.  40px을 임계로 잡으면 안전.
MIN_WHEEL_SPAN = 40   # 스케일 후 픽셀


def soft_alpha(img: Image.Image) -> Image.Image:
    """흰 배경 → 부드러운 알파(채도/어두움 기반). 경계가 매끈해 자글거림 없음.

    강화 컷오프(이슈 2):
      - near-white(mx > 238 AND sat < 0.12) → 알파 0 강제 (뿌연 박스 원인 제거).
      - 그 외 잔류 알파에도 하한 컷 상향: a < 0.35 → 0.0.
        (부스트 꼬리·머리카락 끝의 옅은 네온 글로우는 sat 높아 이 조건에 걸리지 않음)
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
            # near-white 픽셀: 밝고 채도가 낮으면 배경으로 간주 → 완전 투명
            if mx > 238 and sat < 0.12:
                px[x, y] = (r, g, b, 0)
                continue
            sat_c  = min(1.0, sat / 0.30)
            dark_c = min(1.0, (255 - mx) / 70.0)
            a = max(sat_c, dark_c)
            # 하한 컷 상향: 0.05 → 0.35 (faint 잔재 제거)
            if a < 0.35:
                a = 0.0
            px[x, y] = (r, g, b, int(255 * a))
    return img


def wheel_bottom_y(img: Image.Image, min_span: int = MIN_WHEEL_SPAN) -> int:
    """뒷바퀴 하단 y: 아래에서 위로 스캔, 가로 연속 불투명 폭≥min_span인 첫 행.
    해당 행이 없으면 (부스트만 있는 드문 경우) 단순 최하단 불투명 픽셀로 폴백."""
    px   = img.load()
    w, h = img.size

    for y in range(h - 1, -1, -1):
        span = 0
        max_span = 0
        for x in range(w):
            if px[x, y][3] > 24:
                span += 1
                max_span = max(max_span, span)
            else:
                span = 0
        if max_span >= min_span:
            return y

    # 폴백: 단순 최하단 불투명
    for y in range(h - 1, -1, -1):
        for x in range(w):
            if px[x, y][3] > 24:
                return y
    return h - 1


def process_cut(crop_img: Image.Image, scale: float) -> tuple[Image.Image, int]:
    """크롭 → 알파 제거 → 리사이즈 → (이미지, 뒷바퀴 하단 y) 반환."""
    img = soft_alpha(crop_img)

    nw = max(1, round(img.width  * scale))
    nh = max(1, round(img.height * scale))
    img = img.resize((nw, nh), Image.LANCZOS)

    # 알파 가장자리 미세 블러 → 다운스케일 후 계단현상 제거
    r_, g_, b_, a_ = img.split()
    a_ = a_.filter(ImageFilter.GaussianBlur(0.9))
    img = Image.merge("RGBA", (r_, g_, b_, a_))

    bl = wheel_bottom_y(img)
    return img, bl


def main() -> None:
    sheet = Image.open(SRC).convert("RGB")
    W, H  = sheet.size           # 1024 × 512

    # x=512 에서 좌(jump1) / 우(jump2) 분할
    crop1 = sheet.crop((0,   0, W // 2, H))
    crop2 = sheet.crop((W // 2, 0, W,   H))

    # 기준 배율: ride와 동일한 소스 높이 대비 TARGET_H 비율.
    # 여기에 WHEEL_SCALE을 곱해 각 컷의 뒷바퀴 지름을 ride 기준으로 정규화한다.
    base_scale = TARGET_H / H    # 300 / 512 ≈ 0.586

    img1, bl1 = process_cut(crop1, base_scale * JUMP1_WHEEL_SCALE)
    img2, bl2 = process_cut(crop2, base_scale * JUMP2_WHEEL_SCALE)

    print(f"jump1: size={img1.size}  wheel_bottom_y={bl1}  (scale×{JUMP1_WHEEL_SCALE})")
    print(f"jump2: size={img2.size}  wheel_bottom_y={bl2}  (scale×{JUMP2_WHEEL_SCALE})")

    # 공통 baseline: 두 컷의 뒷바퀴 하단을 같은 y에 맞춤
    common_bl = max(bl1, bl2)

    # 캔버스 높이: baseline 아래로 부스트가 넘칠 여유 추가.
    # ★ 이 값이 prep-player-hit.py 가 읽어가는 COMMON_CANVAS_H가 된다.
    BOOST_PAD = 20
    canvas_h  = common_bl + 1 + BOOST_PAD

    # 각 컷의 캔버스 내 y 오프셋 (바퀴 하단 정렬)
    oy1 = common_bl - bl1
    oy2 = common_bl - bl2

    # 컷별로 단독 PNG 저장 (스프라이트시트 아님 — setTexture로 직접 전환)
    def save_single(img: Image.Image, oy: int, out_path: str) -> None:
        w = img.width
        canvas = Image.new("RGBA", (w, canvas_h), (0, 0, 0, 0))
        canvas.paste(img, (0, oy), img)
        canvas.save(out_path, "PNG")
        print(f"saved {canvas.size} → {out_path}")

    save_single(img1, oy1, OUT1)
    save_single(img2, oy2, OUT2)

    # wheel-baseline fraction: GameScene originY에 사용
    frac = common_bl / canvas_h
    jump_hit_art_h = round(RIDE_ART_H * canvas_h / TARGET_H)

    print(f"\nwheel_baseline fraction = {frac:.4f}  (common_bl={common_bl}, canvas_h={canvas_h})")
    print(f"\n─── GameScene.ts 갱신 파라미터 ───────────────────────────────────")
    print(f"const JUMP_HIT_ART_H = {jump_hit_art_h};  // = {RIDE_ART_H} × {canvas_h}/{TARGET_H}")
    print(f"setOrigin(0.5, {frac:.2f})  // jump1, jump2, hit 공통")


if __name__ == "__main__":
    main()
