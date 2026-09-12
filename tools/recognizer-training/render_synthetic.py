"""
Genereert synthetische damdiagram-'foto's' voor het trainen van de fotoherkenning.

Drie stijlfamilies, elk met veel gerandomiseerde variatie, gebaseerd op de 6 echte
testfoto's in testdata/testfotos/:
  - "flat":        platte ovale schijfjes op een effen donker/licht geruit bord
                    (zoals IMG_0127, IMG_0377, IMG_0533).
  - "hatched_ring": donkere velden met diagonale arcering, wit = holle ring,
                    zwart = gevulde cirkel (zoals IMG_0497, IMG_0616).
  - "hatched_flat": donkere velden met diagonale arcering, platte ovale schijfjes
                    (zoals de aa98-foto).

Na het tekenen op hoge resolutie wordt een "hoekaanwijzing met kleine onnauwkeurigheid"
gesimuleerd (dezelfde manier waarop de app een foto rechttrekt) en volgen camera-achtige
effecten (wazigheid, ruis, belichting, jpeg-compressie) zodat het resultaat op een echte
foto begint te lijken in plaats van een schone tekening.
"""
import io
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from board import FIELD_COUNT, field_to_coord, is_white, is_king, random_board

RENDER = 900          # hoge-resolutie canvas waarop getekend wordt
BOARD_PX = 760         # grootte van het 10x10 bordpatroon zelf binnen dat canvas
MARGIN = (RENDER - BOARD_PX) // 2
SQUARE = BOARD_PX / 10
WARP_SIZE = 500         # zelfde als WARP_SIZE in de echte app (src/ui/photoImportView.js)

STYLES = ["flat", "hatched_ring", "hatched_flat"]


def true_corners():
    return [
        (MARGIN, MARGIN),
        (MARGIN + BOARD_PX, MARGIN),
        (MARGIN + BOARD_PX, MARGIN + BOARD_PX),
        (MARGIN, MARGIN + BOARD_PX),
    ]


def lerp_color(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def random_palette(rng):
    # Basistint: van neutraal grijs tot vergeeld/sepia oud papier.
    tint_choice = rng.random()
    if tint_choice < 0.4:
        paper = (rng.randint(235, 252),) * 3
    elif tint_choice < 0.75:
        base = rng.randint(215, 240)
        paper = (base + rng.randint(0, 8), base - rng.randint(0, 4), base - rng.randint(10, 25))
    else:
        base = rng.randint(190, 220)
        paper = (base, base, base)

    dark_delta = rng.randint(35, 90)
    dark = tuple(max(0, c - dark_delta) for c in paper)

    return {
        "paper": paper,
        "light_square": paper,
        "dark_square": dark,
        "border": (rng.randint(0, 20),) * 3,
        "white_fill": (min(255, paper[0] + rng.randint(0, 10)), min(255, paper[1] + rng.randint(0, 10)), min(255, paper[2] + rng.randint(0, 10))),
        "white_stroke": (rng.randint(10, 60),) * 3,
        "black_fill": (rng.randint(5, 35),) * 3,
        "black_stroke": (rng.randint(0, 30),) * 3,
    }


def draw_hatching(draw, x0, y0, x1, y1, color, rng, spacing=None, width=None):
    spacing = spacing or rng.uniform(6, 10)
    width = width or rng.uniform(1.0, 2.2)
    diag = int((x1 - x0) + (y1 - y0))
    offset = rng.uniform(0, spacing)
    d = -diag
    while d < diag:
        draw.line([(x0 + d, y1), (x0 + d + (y1 - y0), y0)], fill=color, width=int(round(width)))
        d += spacing
    # clip via mask wordt door de aanroeper geregeld (we tekenen al binnen het vakje-canvas)


def draw_board_background(img, draw, colors, style, rng):
    draw.rectangle([0, 0, RENDER, RENDER], fill=colors["paper"])
    b0, b1 = MARGIN, MARGIN + BOARD_PX
    border_w = rng.uniform(3, 7)
    draw.rectangle([b0, b0, b1, b1], outline=colors["border"], width=int(round(border_w)))

    for f in range(1, FIELD_COUNT + 1):
        row, col = field_to_coord(f)
        x0 = MARGIN + col * SQUARE
        y0 = MARGIN + row * SQUARE
        x1, y1 = x0 + SQUARE, y0 + SQUARE
        if style in ("hatched_ring", "hatched_flat"):
            draw.rectangle([x0, y0, x1, y1], fill=colors["light_square"])
            mask = Image.new("L", (int(SQUARE) + 2, int(SQUARE) + 2), 0)
            mdraw = ImageDraw.Draw(mask)
            draw_hatching(mdraw, 0, 0, int(SQUARE) + 2, int(SQUARE) + 2, 255, rng)
            tinted = Image.new("RGB", mask.size, colors["dark_square"])
            img.paste(tinted, (int(x0), int(y0)), mask)
        else:
            draw.rectangle([x0, y0, x1, y1], fill=colors["dark_square"])


def draw_piece_flat(draw, cx, cy, square, piece, colors, rng):
    white = is_white(piece)
    fill = colors["white_fill"] if white else colors["black_fill"]
    stroke = colors["white_stroke"] if white else colors["black_stroke"]
    sw = max(1, int(round(square * (0.02 if white else 0.015))))
    rx = square * rng.uniform(0.32, 0.38)
    ry = rx * rng.uniform(0.48, 0.6)
    rim = square * rng.uniform(0.18, 0.26)

    def disc(top_y):
        draw.rectangle([cx - rx, top_y, cx + rx, top_y + rim], fill=fill, outline=stroke, width=sw)
        draw.ellipse([cx - rx, top_y - ry, cx + rx, top_y + ry], fill=fill, outline=stroke, width=sw)

    if is_king(piece):
        gap = ry * 0.9
        disc(cy - rim - gap / 2)
        disc(cy - gap / 2)
    else:
        disc(cy - ry * 0.3)


def draw_piece_ring(draw, cx, cy, square, piece, colors, rng):
    white = is_white(piece)
    r = square * rng.uniform(0.28, 0.34)
    if white:
        sw = max(2, int(round(square * rng.uniform(0.05, 0.09))))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=colors["white_stroke"], width=sw)
        if rng.random() < 0.5:
            draw.ellipse([cx - r * 0.55, cy - r * 0.55, cx + r * 0.55, cy + r * 0.55],
                         outline=colors["white_stroke"], width=max(1, sw - 1))
    else:
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=colors["black_fill"], outline=colors["black_stroke"])
        if is_king(piece) and rng.random() < 0.6:
            r2 = r * 0.4
            draw.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=colors["white_fill"])


def draw_pieces(img, draw, board, colors, style, rng):
    piece_fn = draw_piece_ring if style == "hatched_ring" else draw_piece_flat
    for f in range(1, FIELD_COUNT + 1):
        piece = board[f]
        if not piece:
            continue
        row, col = field_to_coord(f)
        cx = MARGIN + col * SQUARE + SQUARE / 2
        cy = MARGIN + row * SQUARE + SQUARE / 2
        piece_fn(draw, cx, cy, SQUARE, piece, colors, rng)


def render_clean(board, style, rng):
    colors = random_palette(rng)
    img = Image.new("RGB", (RENDER, RENDER), colors["paper"])
    draw = ImageDraw.Draw(img)
    draw_board_background(img, draw, colors, style, rng)
    draw_pieces(img, draw, board, colors, style, rng)
    return img


# ---- perspectief: hoeken met kleine onnauwkeurigheid, net als een gebruiker die tikt ----

def jittered_corners(rng, jitter_px):
    corners = true_corners()
    if jitter_px <= 0:
        return corners
    return [(x + rng.uniform(-jitter_px, jitter_px), y + rng.uniform(-jitter_px, jitter_px)) for x, y in corners]


def pil_perspective_coeffs(src_quad, dst_size):
    # PIL's QUAD-transform verwacht coëfficiënten die dst -> src afbeelden.
    w = h = dst_size
    dst_quad = [(0, 0), (w, 0), (w, h), (0, h)]
    A = []
    b = []
    for (X, Y), (x, y) in zip(dst_quad, src_quad):
        A.append([X, Y, 1, 0, 0, 0, -X * x, -Y * x])
        b.append(x)
        A.append([0, 0, 0, X, Y, 1, -X * y, -Y * y])
        b.append(y)
    A = np.array(A, dtype=np.float64)
    b = np.array(b, dtype=np.float64)
    coeffs = np.linalg.solve(A, b)
    return coeffs.tolist()


def warp_to_canonical(img, corners, out_size=WARP_SIZE):
    coeffs = pil_perspective_coeffs(corners, out_size)
    return img.transform((out_size, out_size), Image.PERSPECTIVE, coeffs, resample=Image.BILINEAR)


# ---- camera-achtige effecten ----

def apply_lighting_gradient(img, rng):
    w, h = img.size
    arr = np.asarray(img).astype(np.float32)
    angle = rng.uniform(0, 2 * math.pi)
    strength = rng.uniform(0.0, 0.35)
    xs, ys = np.meshgrid(np.linspace(-1, 1, w), np.linspace(-1, 1, h))
    grad = xs * math.cos(angle) + ys * math.sin(angle)
    grad = (grad - grad.min()) / (grad.max() - grad.min() + 1e-6)
    factor = 1.0 + strength * (grad - 0.5) * 2
    arr = arr * factor[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def apply_corner_shadow(img, rng):
    # Simuleert een hardnekkig geval uit de echte testfoto's: een fors donkerdere
    # hoek/rand (schaduw van een hand, een niet-platliggende bladzijde) die veel
    # sterker en lokaler is dan de vlakke lichthelling hierboven — precies het
    # scenario waar een zuivere helderheids-vergelijking op vastloopt.
    w, h = img.size
    arr = np.asarray(img).astype(np.float32)
    cx = rng.choice([0.0, 1.0]) * w
    cy = rng.choice([0.0, 1.0]) * h
    xs, ys = np.meshgrid(np.arange(w), np.arange(h))
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / math.hypot(w, h)
    radius = rng.uniform(0.35, 0.65)
    strength = rng.uniform(0.35, 0.65)
    falloff = np.clip(1.0 - dist / radius, 0, 1) ** 1.5
    factor = 1.0 - strength * falloff
    arr = arr * factor[..., None]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def apply_noise(img, rng, sigma=None):
    sigma = sigma if sigma is not None else rng.uniform(1.5, 9.0)
    arr = np.asarray(img).astype(np.float32)
    noise = np.random.default_rng(rng.randint(0, 2**31 - 1)).normal(0, sigma, arr.shape)
    arr = arr + noise
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def apply_jpeg(img, rng, quality=None):
    quality = quality if quality is not None else rng.randint(45, 95)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def simulate_photo(clean_img, rng, corner_jitter_px=None):
    if corner_jitter_px is None:
        corner_jitter_px = rng.choice([0, 0, rng.uniform(2, 8), rng.uniform(8, 22), rng.uniform(22, 40)])

    # Geen aparte beeldrotatie: onafhankelijke hoek-jitter per punt geeft vanzelf
    # ook lichte rotatie/scheefstand (net als een foto onder een hoek), zonder de
    # rand-artefacten die "roteren + daarna vast rechttrekken" oplevert.
    corners = jittered_corners(rng, corner_jitter_px)
    warped = warp_to_canonical(clean_img, corners, WARP_SIZE)

    if rng.random() < 0.85:
        warped = apply_lighting_gradient(warped, rng)
    if rng.random() < 0.3:
        warped = apply_corner_shadow(warped, rng)

    blur_r = rng.choice([0, 0, rng.uniform(0.3, 1.2), rng.uniform(1.2, 2.5)])
    if blur_r > 0:
        warped = warped.filter(ImageFilter.GaussianBlur(blur_r))

    if rng.random() < 0.7:
        warped = apply_noise(warped, rng)

    if rng.random() < 0.6:
        warped = apply_jpeg(warped, rng)

    # lichte contrast/helderheid-variatie
    arr = np.asarray(warped).astype(np.float32)
    contrast = rng.uniform(0.85, 1.2)
    brightness = rng.uniform(-15, 15)
    mean = arr.mean()
    arr = (arr - mean) * contrast + mean + brightness
    warped = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

    return warped, corner_jitter_px


def generate_sample(rng, style=None):
    style = style or rng.choice(STYLES)
    board = random_board(rng)
    clean = render_clean(board, style, rng)
    photo, jitter = simulate_photo(clean, rng)
    return board, photo, style, jitter


if __name__ == "__main__":
    import os
    rng = random.Random(42)
    out_dir = os.path.join(os.path.dirname(__file__), "samples")
    os.makedirs(out_dir, exist_ok=True)
    for i in range(9):
        style = STYLES[i % 3]
        board, photo, style, jitter = generate_sample(rng, style=style)
        photo.save(os.path.join(out_dir, f"sample_{i:02d}_{style}_jit{jitter:.0f}.png"))
    print("klaar, 9 voorbeelden weggeschreven naar", out_dir)
