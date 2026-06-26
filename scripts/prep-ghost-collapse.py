#!/usr/bin/env python3
"""ghost-collapse 전처리 — 엎어짐(고꾸라짐) 3프레임을 균등 스프라이트시트로.

원본(assets/images/ghost/ghost-collapse-1~3.png): RGB(알파 없음, 흰 배경) 1448×1086.
ghost-run과 동일한 'soft alpha'(흰색까지 거리 기반)로 배경을 부드럽게 제거하고,
3프레임을 동일 스케일로 묶어 하단 정렬(발/몸이 지면에 닿는 느낌) + 가로 중심 정렬.

스케일 기준: 가장 큰(=가장 곧게 선) 프레임의 높이를 RUN_H(=300, ghost-run과 동일)에
맞춰 모든 프레임에 같은 배율 적용 → 달리기→엎어짐 전환 시 크기가 튀지 않는다.

산출물: assets/game/ghost-collapse.png (RGBA, 3프레임 균등)
"""
from __future__ import annotations
from PIL import Image, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRCS = [
    os.path.join(ROOT, "assets", "images", "ghost", f"ghost-collapse-{i}.png")
    for i in (1, 2, 3)
]
OUT = os.path.join(ROOT, "assets", "game", "ghost-collapse.png")

RUN_H = 300   # ghost-run 프레임 높이와 동일 — 동일 배율로 크기 연속성 확보
PAD = 10      # 프레임 여백(px, 출력 기준)


def soft_alpha(img: Image.Image) -> Image.Image:
    """흰 배경 → 부드러운 알파(채도/어두움 기반). 경계가 매끈해 자글거림 없음."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = (mx - mn) / mx if mx > 0 else 0.0
            sat_c = min(1.0, sat / 0.30)
            dark_c = min(1.0, (255 - mx) / 70.0)
            a = max(sat_c, dark_c)
            if a < 0.05:
                a = 0.0
            px[x, y] = (r, g, b, int(255 * a))
    return img


def content_bbox(img: Image.Image):
    """알파 > 24 픽셀의 경계 상자."""
    a = img.split()[3]
    bbox = a.point(lambda v: 255 if v > 24 else 0).getbbox()
    return bbox


def main() -> None:
    crops = []
    for p in SRCS:
        im = soft_alpha(Image.open(p))
        bb = content_bbox(im)
        crops.append(im.crop(bb))

    # 동일 배율: 가장 높은(곧게 선) 프레임 = RUN_H
    max_src_h = max(c.height for c in crops)
    scale = RUN_H / max_src_h

    scaled = []
    for c in crops:
        nw = max(1, round(c.width * scale))
        nh = max(1, round(c.height * scale))
        s = c.resize((nw, nh), Image.LANCZOS)
        # 알파 가장자리 미세 블러 → 다운스케일 계단현상 제거(매끈)
        r_, g_, b_, a_ = s.split()
        a_ = a_.filter(ImageFilter.GaussianBlur(0.9))
        scaled.append(Image.merge("RGBA", (r_, g_, b_, a_)))

    fw = max(s.width for s in scaled) + PAD * 2
    fh = max(s.height for s in scaled) + PAD * 2

    out = Image.new("RGBA", (fw * len(scaled), fh), (0, 0, 0, 0))
    for i, s in enumerate(scaled):
        ox = int(i * fw + (fw - s.width) / 2)   # 가로 중심
        oy = int(fh - PAD - s.height)            # 하단 정렬(발/몸이 지면)
        out.paste(s, (ox, oy), s)
    out.save(OUT, "PNG")
    print(f"out {out.size}  frame {fw}x{fh} × {len(scaled)} → {OUT}")


if __name__ == "__main__":
    main()
