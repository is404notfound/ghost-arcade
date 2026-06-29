#!/usr/bin/env python3
"""ghost-run 스프라이트시트 전처리 v3 — 2026-06 새 소스(다크 퍼플 후드+골드 헤일로).

원본(assets/images/ghost/ghost-run-sheet-src.png): RGB 6포즈 시트, 2172×724.
흰 배경, 포즈 간 gap이 불균등 → 격자 슬라이스 대신 column-profile로 측정한
포즈별 실제 x 범위로 크롭.

전략:
  1) POSES: column-profile로 측정한 6포즈 실제 x 범위 (각 포즈 픽셀 덩어리 경계).
  2) Y 공통 범위(Y0..Y1) — 전 포즈 합집합 상하 여유 포함.
  3) 흰 배경 → 부드러운 알파 (채도+어두움 기반, 경계 계단현상 제거).
  4) 상체(머리·몸통) 가로 중심 정렬 → 달릴 때 몸통 좌우 떨림 제거.
     (발 높이가 프레임마다 다른 런사이클 특성상 하단 정렬은 위아래 떨림 유발)

산출물: assets/game/ghost-run.png (RGBA, 6프레임 균등)
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets", "images", "ghost", "ghost-run-sheet-src.png")
OUT = os.path.join(ROOT, "assets", "game", "ghost-run.png")

# column-profile(흰 배경 제외, 열당 10px 이상)으로 측정한 6포즈 실제 x 범위.
# 소스: 2172×724 RGB 시트 (2026-06, 다크 퍼플 후드+골드 헤일로).
POSES = [(29, 400), (494, 683), (802, 1034), (1092, 1464), (1558, 1746), (1868, 2098)]
Y0, Y1 = 127, 646            # 공통 세로 크롭 범위 — 전 포즈 캐릭터 합집합 + 여유
PAD = 16                     # 포즈 좌우 여백(px, 소스 기준)
TARGET_H = 300               # 출력 프레임 높이(px) — 레티나 여유, 다운스케일로 선명
TORSO_FRAC = 0.42            # 상체 정렬에 쓸 상단 비율(머리+몸통 영역)


def soft_alpha(img: Image.Image) -> Image.Image:
    """흰 배경 → 부드러운 알파. 채도/어두움 기반이라 경계가 매끈(안티에일리어싱)."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            # 채도 성분(색이 있을수록↑) + 어두움 성분(흰 배경 대비↑)
            sat_c = min(1.0, sat / 0.30)
            dark_c = min(1.0, (255 - mx) / 70.0)
            a = max(sat_c, dark_c)
            if a < 0.05:          # 배경 잔여 헤이즈 컷 (낮춰 가장자리 부드럽게)
                a = 0.0
            px[x, y] = (r, g, b, int(255 * a))
    return img


def torso_center_x(img: Image.Image) -> float:
    """상단 TORSO_FRAC 영역의 알파 가중 x 중심 — 달리기 중 안정적인 정렬 앵커."""
    px = img.load()
    w, h = img.size
    yend = int(h * TORSO_FRAC)
    sx = 0.0
    sw = 0.0
    for y in range(yend):
        for x in range(w):
            a = px[x, y][3]
            if a > 24:
                sx += x * a
                sw += a
    return sx / sw if sw > 0 else w / 2.0


def main() -> None:
    sheet = Image.open(SRC).convert("RGB")
    crop_h = Y1 - Y0
    scale = TARGET_H / crop_h

    # 1) 포즈별 크롭 + 부드러운 알파 + 스케일
    frames = []
    anchors = []  # 각 프레임의 상체중심 x (스케일 후)
    for (x0, x1) in POSES:
        cx0 = max(0, x0 - PAD)
        cx1 = min(sheet.width, x1 + PAD)
        fr = sheet.crop((cx0, Y0, cx1, Y1))
        fr = soft_alpha(fr)
        nw = max(1, round(fr.width * scale))
        fr = fr.resize((nw, TARGET_H), Image.LANCZOS)
        # 알파 가장자리 미세 블러 → 다운스케일 후 계단현상(자글거림) 제거.
        # RGB는 그대로 두고 알파만 페더링해 외곽이 매끈하게 풀린다.
        r_, g_, b_, a_ = fr.split()
        a_ = a_.filter(ImageFilter.GaussianBlur(0.9))
        fr = Image.merge("RGBA", (r_, g_, b_, a_))
        frames.append(fr)
        anchors.append(torso_center_x(fr))

    # 2) 프레임 폭 결정 — 모든 포즈가 상체중심 정렬 후 들어갈 최대 폭
    #    왼/오른쪽으로 필요한 최대 여유를 따로 구해 대칭이 아니어도 안 잘리게.
    left_need = max(a for a in anchors)
    right_need = max(fr.width - a for fr, a in zip(frames, anchors))
    fw = int(left_need + right_need) + 4
    cx = left_need + 2  # 캔버스 내 공통 앵커 x

    # 3) 합본 — 각 프레임을 상체중심(anchor)이 cx에 오도록 배치
    out = Image.new("RGBA", (fw * len(frames), TARGET_H), (0, 0, 0, 0))
    for i, (fr, a) in enumerate(zip(frames, anchors)):
        ox = int(i * fw + cx - a)
        out.paste(fr, (ox, 0), fr)
    out.save(OUT, "PNG")
    print(f"out {out.size}  frame {fw}x{TARGET_H} × {len(frames)} → {OUT}")


if __name__ == "__main__":
    main()
