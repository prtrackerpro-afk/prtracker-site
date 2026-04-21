"""
PLATE STUDY — Plate N°01
Single-page museum-quality artifact generator.

Renders at 3x supersample, then downsamples with LANCZOS for true-crisp
ring edges and typography. Output: plate-study.png (2400x3200).
"""

from __future__ import annotations

import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ============================================================================
# Paths
# ============================================================================

HERE    = os.path.dirname(os.path.abspath(__file__))
FONTS   = os.path.normpath(os.path.join(HERE, "..", ".claude", "skills",
                                        "canvas-design", "canvas-fonts"))
OUT_PNG = os.path.join(HERE, "plate-study.png")

# ============================================================================
# Canvas & tokens
# ============================================================================

W, H    = 2400, 3200
SCALE   = 3                    # supersample factor
SW, SH  = W * SCALE, H * SCALE

# Paper — cool cream, slightly warm
BG      = (244, 242, 234)
INK     = (13, 14, 20)
INK_2   = (60, 58, 62)
INK_3   = (120, 118, 118)
HAIR    = (25, 24, 30)        # for hairlines

# Plate specs (IWF Pantone / BRIEF)
# diam_mm = real Olympic spec (all 450 for competition, smaller for change plates).
PLATES = [
    {"roman": "I",    "kg": 25.00, "rgb": (218, 41, 28),   "hex": "DA291C", "diam_mm": 450, "thick_mm": 54},
    {"roman": "II",   "kg": 20.00, "rgb": (0, 87, 184),    "hex": "0057B8", "diam_mm": 450, "thick_mm": 45},
    {"roman": "III",  "kg": 15.00, "rgb": (255, 199, 44),  "hex": "FFC72C", "diam_mm": 400, "thick_mm": 34},
    {"roman": "IV",   "kg": 10.00, "rgb": (67, 176, 42),   "hex": "43B02A", "diam_mm": 325, "thick_mm": 24},
    {"roman": "V",    "kg": 5.00,  "rgb": (17, 17, 17),    "hex": "111111", "diam_mm": 228, "thick_mm": 18},
    {"roman": "VI",   "kg": 2.50,  "rgb": (37, 99, 235),   "hex": "2563EB", "diam_mm": 190, "thick_mm": 15},
    {"roman": "VII",  "kg": 1.25,  "rgb": (192, 197, 204), "hex": "C0C5CC", "diam_mm": 160, "thick_mm": 12},
]

# Concentric ring radii in design units (before scale), chosen so visual
# weight follows a gentle log curve of mass — not linear.
RADII = [900, 770, 655, 555, 470, 395, 335]      # outer→inner, all > 0
BAR_HOLE = 60

# ============================================================================
# Scale helpers
# ============================================================================

def s(x):
    return int(round(x * SCALE))

def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(os.path.join(FONTS, name), s(size))

# ============================================================================
# Typography
# ============================================================================

bs_hero    = font("BigShoulders-Bold.ttf", 300)    # PLATE / STUDY
bs_sub     = font("BigShoulders-Bold.ttf", 64)
bs_num_l   = font("BigShoulders-Bold.ttf", 48)     # roman numerals
serif_it_l = font("InstrumentSerif-Italic.ttf", 74)
serif_it_m = font("InstrumentSerif-Italic.ttf", 52)

mono_meta  = font("JetBrainsMono-Regular.ttf", 18)
mono_head  = font("JetBrainsMono-Regular.ttf", 20)
mono_cell  = font("JetBrainsMono-Regular.ttf", 18)
mono_cellB = font("JetBrainsMono-Bold.ttf", 18)
mono_tiny  = font("JetBrainsMono-Regular.ttf", 14)
mono_lead  = font("JetBrainsMono-Regular.ttf", 15)

# ============================================================================
# Base canvas — high-res draw surface
# ============================================================================

im = Image.new("RGB", (SW, SH), BG)
d  = ImageDraw.Draw(im)

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def text_w(text, fnt):
    bb = d.textbbox((0, 0), text, font=fnt)
    return bb[2] - bb[0]

def text_h(text, fnt):
    bb = d.textbbox((0, 0), text, font=fnt)
    return bb[3] - bb[1]

def hairline(xy_start, xy_end, color=HAIR, width=1):
    d.line([xy_start, xy_end], fill=color, width=s(width))

def dashed(x1, y1, x2, y2, color=INK_3, width=1, dash=6, gap=6):
    """Draw a dashed line at design coords."""
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    step = dash + gap
    n = int(length // step)
    for i in range(n + 1):
        sx = x1 + ux * (i * step)
        sy = y1 + uy * (i * step)
        ex = sx + ux * dash
        ey = sy + uy * dash
        if (sx - x1) * ux + (sy - y1) * uy > length:
            break
        # clip
        if math.hypot(ex - x1, ey - y1) > length:
            ex, ey = x2, y2
        d.line([(s(sx), s(sy)), (s(ex), s(ey))], fill=color, width=s(width))

def tick(x, y, size=28, flip_x=False, flip_y=False, color=INK, width=2):
    dx = -1 if flip_x else 1
    dy = -1 if flip_y else 1
    d.line([(s(x), s(y)), (s(x + dx * size), s(y))], fill=color, width=s(width))
    d.line([(s(x), s(y)), (s(x), s(y + dy * size))], fill=color, width=s(width))

def ellipse(cx, cy, r, fill=None, outline=None, out_w=1):
    bbox = [s(cx - r), s(cy - r), s(cx + r), s(cy + r)]
    d.ellipse(bbox, fill=fill, outline=outline, width=s(out_w) if outline else 0)

def draw_text(xy, txt, fnt, fill=INK, anchor="la"):
    x, y = xy
    d.text((s(x), s(y)), txt, font=fnt, fill=fill, anchor=anchor)

# ============================================================================
# 01 — Corner registration marks & safe frame
# ============================================================================

M = 140  # margin
tick(M, M, size=36)
tick(W - M, M, size=36, flip_x=True)
tick(M, H - M, size=36, flip_y=True)
tick(W - M, H - M, size=36, flip_x=True, flip_y=True)

# ============================================================================
# 02 — Top meta rail
# ============================================================================

top_y = M - 48
draw_text((M, top_y), "/ / / PLATE STUDY   ·   VOL. I   ·   SHEET 01 / 07", mono_meta, INK_2)
right_meta = "OBS.  F.S.   ·   PÔRTO ALEGRE — BR   ·   2026·04·21"
draw_text((W - M - text_w(right_meta, mono_meta) / SCALE, top_y),
          right_meta, mono_meta, INK_2)

# ============================================================================
# 03 — Hero title (left) + subtitle (right)
# ============================================================================

hero_x = M
hero_y = M + 60
draw_text((hero_x, hero_y),         "PLATE",  bs_hero, INK)
draw_text((hero_x, hero_y + 250),   "STUDY.", bs_hero, INK)

# Subtitle (italic serif) — upper right
sub_lines = ["Seven bodies,", "observed in silent", "orbit through the", "quiet kilogram."]
sub_x = W - M
sub_y = M + 100
for i, line in enumerate(sub_lines):
    draw_text((sub_x - text_w(line, serif_it_l) / SCALE, sub_y + i * 78),
              line, serif_it_l, INK)

# Small caption below the subtitle
cap = "— from a survey of discrete weighted bodies in private orbit."
draw_text((sub_x - text_w(cap, mono_meta) / SCALE, sub_y + len(sub_lines) * 78 + 18),
          cap, mono_meta, INK_3)

# Dashed rule under the header
dashed(M, M + 620, W - M, M + 620, color=INK_3, dash=10, gap=8)
draw_text((M, M + 632), "H·01  —  INDEX", mono_tiny, INK_3)
rr = "N / 07"
draw_text((W - M - text_w(rr, mono_tiny) / SCALE, M + 632), rr, mono_tiny, INK_3)

# ============================================================================
# 04 — Left column: specimen index
# ============================================================================

col_x      = M
col_y_top  = M + 720
col_width  = 560

draw_text((col_x, col_y_top), "SPECIMEN  /  07 BODIES  /  OBSERVED AT REST",
          mono_head, INK)

# column rule
hairline((s(col_x), s(col_y_top + 40)),
         (s(col_x + col_width), s(col_y_top + 40)),
         color=INK, width=2)

# Table header
thdr_y = col_y_top + 60
draw_text((col_x,         thdr_y), "№",        mono_tiny, INK_3)
draw_text((col_x + 75,    thdr_y), "MASS",     mono_tiny, INK_3)
draw_text((col_x + 220,   thdr_y), "Ø  MM",    mono_tiny, INK_3)
draw_text((col_x + 340,   thdr_y), "THK",      mono_tiny, INK_3)
draw_text((col_x + 430,   thdr_y), "REF",      mono_tiny, INK_3)

row_y = thdr_y + 38
row_h = 66
for p in PLATES:
    # color swatch (tiny square)
    sw_x, sw_y = col_x + 0, row_y - 2
    sw = 20
    d.rectangle([s(sw_x - 8), s(sw_y + 8), s(sw_x - 8 + sw), s(sw_y + 8 + sw)],
                fill=p["rgb"])

    # roman
    draw_text((col_x + 36, row_y),        p["roman"],                   bs_num_l, INK)
    # mass
    draw_text((col_x + 120, row_y + 9),   f"{p['kg']:>5.2f} KG",        mono_cellB, INK)
    # diameter
    draw_text((col_x + 220, row_y + 9),   f"{p['diam_mm']}",            mono_cell, INK_2)
    # thickness
    draw_text((col_x + 340, row_y + 9),   f"{p['thick_mm']} MM",        mono_cell, INK_2)
    # hex
    draw_text((col_x + 430, row_y + 9),   f"#{p['hex']}",               mono_cell, INK_2)
    row_y += row_h

# Bottom rule of the table
hairline((s(col_x), s(row_y + 4)),
         (s(col_x + col_width), s(row_y + 4)),
         color=INK, width=2)

# Note
draw_text((col_x, row_y + 22),
          "∑  m  =  78·75  KG   ·   σ  =  SILENT", mono_cell, INK)
draw_text((col_x, row_y + 52),
          "observed at 00·00·00 UT.  no breath recorded.",
          mono_tiny, INK_3)

# ============================================================================
# 05 — Central monument: concentric rings
# ============================================================================

# Bias the disc into the right half so left column has room.
DISC_CX = 1660
DISC_CY = 1740

# Paint rings outer→inner. Each smaller circle overpaints the center of the
# previous, leaving a visible ring.
for plate, r in zip(PLATES, RADII):
    ellipse(DISC_CX, DISC_CY, r, fill=plate["rgb"])

# Central bar-hole (paper)
ellipse(DISC_CX, DISC_CY, BAR_HOLE, fill=BG)

# Fine hairline between each ring, for bindery-like precision
for r in RADII:
    ellipse(DISC_CX, DISC_CY, r, outline=(0, 0, 0), out_w=1)
# and inside hole edge
ellipse(DISC_CX, DISC_CY, BAR_HOLE, outline=INK, out_w=1)

# Center crosshair (very small, 12px long arms)
arm = 18
hairline((s(DISC_CX - arm), s(DISC_CY)), (s(DISC_CX + arm), s(DISC_CY)),
         color=INK, width=2)
hairline((s(DISC_CX), s(DISC_CY - arm)), (s(DISC_CX), s(DISC_CY + arm)),
         color=INK, width=2)

# Outer encompassing circle — dashed, 40px beyond the outermost ring
outer_frame_r = RADII[0] + 46
N_DASH = 180
for i in range(N_DASH):
    a0 = (i / N_DASH) * 2 * math.pi
    a1 = a0 + (0.55 / N_DASH) * 2 * math.pi
    x0 = DISC_CX + outer_frame_r * math.cos(a0)
    y0 = DISC_CY + outer_frame_r * math.sin(a0)
    x1 = DISC_CX + outer_frame_r * math.cos(a1)
    y1 = DISC_CY + outer_frame_r * math.sin(a1)
    d.line([(s(x0), s(y0)), (s(x1), s(y1))], fill=INK_2, width=s(1))

# Compass notations at four poles (N/E/S/W)
for ang_deg, glyph in ((270, "N"), (0, "E"), (90, "S"), (180, "W")):
    a = math.radians(ang_deg)
    rx = DISC_CX + (outer_frame_r + 34) * math.cos(a)
    ry = DISC_CY + (outer_frame_r + 34) * math.sin(a)
    draw_text((rx, ry - 10), glyph, mono_cell, INK, anchor="mm")

# Roman numeral labels floating just outside the outer ring at 12 o'clock,
# angled slightly so they read like orbit indices.
# Placed along a vertical stack on the RIGHT of the disc.
leader_x = DISC_CX + RADII[0] + 60      # start of leader lines
label_x  = DISC_CX + RADII[0] + 110     # start of caption text
# Radii (midpoints of each ring annulus), used as the y-anchor for labels.
# Place labels at the right side, y = DISC_CY - (mean_radius_of_ring)
for idx, (plate, r_outer) in enumerate(zip(PLATES, RADII)):
    r_inner = RADII[idx + 1] if idx + 1 < len(RADII) else BAR_HOLE
    r_mid   = (r_outer + r_inner) / 2
    # stagger alternately right/left for breathing room
    side = 1 if idx % 2 == 0 else -1
    ly   = DISC_CY - r_mid if idx % 2 == 0 else DISC_CY + r_mid
    # we'll ALWAYS go right, to keep visual unity
    ly   = DISC_CY - r_mid - (2 if idx % 2 == 0 else -2)
    # tiny leader: from ring edge at 3 o'clock-ish angle toward label
    ring_edge_x = DISC_CX + r_mid
    ring_edge_y = DISC_CY
    # Not drawing leaders here — too noisy. The side column already is the key.

# ============================================================================
# 06 — Bottom dashed rule + anchor phrase (italic serif)
# ============================================================================

bottom_rule_y = H - M - 420
dashed(M, bottom_rule_y, W - M, bottom_rule_y, color=INK_3, dash=10, gap=8)

phrase = "no silêncio, o peso."
px = (W - text_w(phrase, serif_it_l) / SCALE) / 2
py = bottom_rule_y + 90
draw_text((px, py), phrase, serif_it_l, INK)

# Flank the phrase with tiny tick marks — like a pull-quote in a journal
tick_w = 70
tick_h = 2
tick_ly = py + 58
phrase_w = text_w(phrase, serif_it_l) / SCALE
left_tick_x  = (W - phrase_w) / 2 - tick_w - 24
right_tick_x = (W + phrase_w) / 2 + 24
d.rectangle([s(left_tick_x), s(tick_ly),
             s(left_tick_x + tick_w), s(tick_ly + tick_h)],
            fill=INK_3)
d.rectangle([s(right_tick_x), s(tick_ly),
             s(right_tick_x + tick_w), s(tick_ly + tick_h)],
            fill=INK_3)

# sub-phrase
sub_phrase = "— F.S., field journal, April."
draw_text(((W - text_w(sub_phrase, mono_meta) / SCALE) / 2,
           py + 130),
          sub_phrase, mono_meta, INK_3)

# ============================================================================
# 07 — Bottom meta rail (colophon)
# ============================================================================

foot_y = H - M - 44
draw_text((M, foot_y), "PR·TRACKER   /   PLATE STUDY   /   N°01",
          mono_meta, INK_2)
foot_right = "EDITION 001 / 049   ·   OFFSET ON COTTON   ·   PRINT 2026.Q2"
draw_text((W - M - text_w(foot_right, mono_meta) / SCALE, foot_y),
          foot_right, mono_meta, INK_2)

# ============================================================================
# Finalise — downsample for crisp edges
# ============================================================================

final = im.resize((W, H), Image.LANCZOS)

# A very faint paper grain — almost subliminal, adds tactile depth
noise = Image.effect_noise((W, H), 2).convert("L")
noise = noise.filter(ImageFilter.GaussianBlur(0.6))
noise = noise.point(lambda v: 248 if v > 128 else 244)  # barely perceptible
noise_rgb = Image.merge("RGB", (noise, noise, noise))
final = Image.blend(final, noise_rgb, 0.04)

final.save(OUT_PNG, "PNG", optimize=True)
print(f"written: {OUT_PNG}  ({W}x{H})")
