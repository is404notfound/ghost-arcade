#!/usr/bin/env python3
"""ghost-run 스프라이트시트 전처리 v2 — 프레임 섞임 제거 + 부드러운 알파 + 정렬.

원본(assets/images/ghost/ghost-run-sheet-src.png): RGB(알파 없음) 6포즈 시트.
체커보드 투명 패턴이 흰색으로 구워져 있고, 포즈들이 균등 격자(362px)에 안 맞아
단순 격자 슬라이스 시 옆 포즈의 발끝이 섞여 들어왔다.

v2 전략:
  1) 포즈 6개의 실제 x 범위를 미리 측정(아래 POSES) → 격자 대신 포즈별 개별 크롭
     (옆 프레임 발끝 섞임 제거).
  2) y는 공통 범위(Y0..Y1)로 잘라 달리기 상하 움직임·발 baseline을 보존.
  3) 흰 배경 제거를 '하드 임계값'이 아닌 '흰색까지의 거리 기반 부드러운 알파'로 →
     경계 계단현상(자글거림) 제거 = 화질 개선.
  4) 각 포즈를 상체(머리·몸통) 가로 중심에 맞춰 정렬 → 달릴 때 몸통이 좌우로
     흔들리지 않게(다리 뻗음에 휘둘리지 않게).

산출물: assets/game/ghost-run.png (RGBA, 6프레임 균등)
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(ROOT, "assets", "images", "ghost", "ghost-run-sheet-src.png")
OUT = os.path.join(ROOT, "assets", "game", "ghost-run.png")

# 측정된 6포즈 x 범위 (scripts에서 column-profile로 산출). 격자 대신 이걸 쓴다.
POSES = [(42, 349), (457, 641), (711, 1011), (1097, 1330), (1359, 1732), (1759, 2065)]
Y0, Y1 = 138, 599            # 공통 세로 크롭 범위 (전 포즈 합집합)
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
