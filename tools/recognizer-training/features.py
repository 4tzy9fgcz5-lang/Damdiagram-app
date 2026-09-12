"""
Stap 3: kenmerken per veld voor het kleine leermodel, en het opbouwen van
trainings-/testdata (synthetisch + de 6 echte testfoto's).

Kenmerken (allemaal relatief, geen vaste drempels):
  - std: spreiding binnen het venster (bestaand, bepaalt bezet/leeg-richting)
  - delta: midden t.o.v. de gefitte lichthelling over het bord (stap 2)
  - gradientRms: hoeveel scherpe randen (afdruk-omtrek) er in het veld zitten —
    dat verdwijnt niet zomaar onder een schaduw, in tegenstelling tot pure
    helderheid, en helpt dus juist bij de hardnekkige hoekgevallen.
  - cornerContrast: midden t.o.v. de 4 hoekjes van HETZELFDE veld (uit de eerste,
    losstaand te onbetrouwbare poging) — als extra, ondersteunend kenmerk voor het
    model, niet als enig signaal.
"""
import math
import numpy as np
from PIL import Image

FIELD_COUNT = 50


def field_to_coord(field):
    index = field - 1
    row = index // 5
    pos = index % 5
    col = pos * 2 + (1 if row % 2 == 0 else 0)
    return row, col


def median(values):
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return (s[mid - 1] + s[mid]) / 2 if n % 2 == 0 else s[mid]


def mad(values, med):
    return median([abs(v - med) for v in values])


def robust_sigma(values, med):
    # Ondergrens van 1 grijswaarde-eenheid (i.p.v. bijna 0): bij een heel vlak/
    # ruisloos synthetisch bord kan de spreiding anders bijna nul worden, waardoor
    # relatieve kenmerken (die hierdoor delen) astronomisch groot worden.
    return max(1.4826 * mad(values, med), 1.0)


def kmeans1d2(values):
    lo0, hi0 = min(values), max(values)
    if lo0 == hi0:
        return {"low": lo0, "high": hi0, "lowGroup": list(values), "highGroup": [], "gap": 0}
    centroids = [lo0, hi0]
    groups = [[], list(values)]
    for _ in range(50):
        nxt = [[], []]
        for v in values:
            d0, d1 = abs(v - centroids[0]), abs(v - centroids[1])
            nxt[0 if d0 <= d1 else 1].append(v)
        if not nxt[0] or not nxt[1]:
            break
        groups = nxt
        nc = [sum(groups[0]) / len(groups[0]), sum(groups[1]) / len(groups[1])]
        if nc == centroids:
            break
        centroids = nc
    lowIdx = 0 if centroids[0] <= centroids[1] else 1
    highIdx = 1 - lowIdx
    lowGroup, highGroup = groups[lowIdx], groups[highIdx]
    gap = (min(highGroup) - max(lowGroup)) if (highGroup and lowGroup) else 0
    return {"low": centroids[lowIdx], "high": centroids[highIdx], "lowGroup": lowGroup, "highGroup": highGroup, "gap": gap}


def fit_plane(points):
    Sxx = Sxy = Sx = Syy = Sy = Sn = Sxz = Syz = Sz = 0.0
    for x, y, z in points:
        Sxx += x * x; Sxy += x * y; Sx += x
        Syy += y * y; Sy += y; Sn += 1
        Sxz += x * z; Syz += y * z; Sz += z
    A = np.array([[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, Sn]])
    b = np.array([Sxz, Syz, Sz])
    try:
        a, bb, c = np.linalg.solve(A, b)
    except np.linalg.LinAlgError:
        a, bb, c = 0.0, 0.0, Sz / max(Sn, 1)
    return a, bb, c


TO_GRAY = np.array([0.299, 0.587, 0.114])
OUT_SIZE = 500
SQUARE = OUT_SIZE / 10
INSET = SQUARE * 0.26
CENTER_HALF = SQUARE * 0.1
CORNER_PATCH = SQUARE * 0.08
CORNER_INSET = SQUARE * 0.03

MIN_STD_GAP = 1.2


def image_to_gray(img: Image.Image) -> np.ndarray:
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    return arr @ TO_GRAY


def extract_raw_features(gray: np.ndarray):
    """Basiskenmerken per veld (std/mean/centerMean/gradientRms/cornerContrast/cx/cy),
    onafhankelijk van bezet/leeg-beslissingen."""
    feats = {}
    for f in range(1, FIELD_COUNT + 1):
        row, col = field_to_coord(f)
        cx = col * SQUARE + SQUARE / 2
        cy = row * SQUARE + SQUARE / 2

        x0, y0 = int(round(col * SQUARE + INSET)), int(round(row * SQUARE + INSET))
        x1, y1 = int(round((col + 1) * SQUARE - INSET)), int(round((row + 1) * SQUARE - INSET))
        window = gray[y0:y1, x0:x1]
        mean = float(window.mean())
        std = float(window.std())

        cx0, cy0 = int(round(cx - CENTER_HALF)), int(round(cy - CENTER_HALF))
        cx1, cy1 = int(round(cx + CENTER_HALF)), int(round(cy + CENTER_HALF))
        centerMean = float(gray[cy0:cy1, cx0:cx1].mean())

        corner_vals = []
        for ox, oy in [(0, 0), (1, 0), (0, 1), (1, 1)]:
            ccx = col * SQUARE + CORNER_INSET + CORNER_PATCH + ox * (SQUARE - 2 * CORNER_INSET - 2 * CORNER_PATCH)
            ccy = row * SQUARE + CORNER_INSET + CORNER_PATCH + oy * (SQUARE - 2 * CORNER_INSET - 2 * CORNER_PATCH)
            x0c, y0c = int(round(ccx - CORNER_PATCH)), int(round(ccy - CORNER_PATCH))
            x1c, y1c = int(round(ccx + CORNER_PATCH)), int(round(ccy + CORNER_PATCH))
            corner_vals.extend(gray[y0c:y1c, x0c:x1c].flatten().tolist())
        cornerContrast = centerMean - median(corner_vals)

        gy, gx = np.gradient(window)
        gradientRms = float(np.sqrt(np.mean(gx * gx + gy * gy)))

        feats[f] = {
            "mean": mean, "std": std, "centerMean": centerMean,
            "cornerContrast": cornerContrast, "gradientRms": gradientRms,
            "cx": cx, "cy": cy,
        }
    return feats


def build_model_features(raw_feats):
    """Bootstrap zoals classify.js stap 1+2 (std-kmeans -> lege velden -> lichtvlak),
    daarna delta voor ALLE velden (niet alleen bezette) zodat het leermodel zelf mag
    beslissen of een veld leeg/wit/zwart is — ook als de ruwe std-splitsing een veld
    in de verkeerde hoek van de tweedeling zet (dat was precies het probleem bij de
    hardnekkige hoekgevallen)."""
    fields = list(range(1, FIELD_COUNT + 1))
    stds = [raw_feats[f]["std"] for f in fields]
    split = kmeans1d2(stds)

    if split["gap"] < MIN_STD_GAP or not split["highGroup"]:
        empty_fields = fields
    else:
        threshold = (split["low"] + split["high"]) / 2
        empty_fields = [f for f in fields if raw_feats[f]["std"] <= threshold]
        if len(empty_fields) < 6:
            empty_fields = fields

    if len(empty_fields) >= 6:
        a, b, c = fit_plane([(raw_feats[f]["cx"], raw_feats[f]["cy"], raw_feats[f]["centerMean"]) for f in empty_fields])
    else:
        a, b, c = 0.0, 0.0, median([raw_feats[f]["centerMean"] for f in fields])

    predicted = {f: a * raw_feats[f]["cx"] + b * raw_feats[f]["cy"] + c for f in fields}
    empty_residuals = [raw_feats[f]["centerMean"] - predicted[f] for f in empty_fields]
    noise_floor = robust_sigma(
        empty_residuals if len(empty_residuals) >= 2 else [raw_feats[f]["centerMean"] for f in fields],
        median(empty_residuals) if empty_residuals else 0,
    )

    std_med = median(stds)
    std_spread = robust_sigma(stds, std_med)

    # gradientRms is, anders dan de andere 3 kenmerken, een absolute maat (hangt af
    # van hoe scherp/wazig DEZE foto toevallig is) — gedeeld door de typische
    # gradient van de LEGE velden wordt het net als de rest een relatief kenmerk
    # ("hoeveel meer randstructuur dan de kale achtergrond"), wat ook synthetische en
    # echte foto's onderling beter vergelijkbaar maakt.
    empty_gradients = [raw_feats[f]["gradientRms"] for f in empty_fields]
    gradient_floor = max(median(empty_gradients) if empty_gradients else 1.0, 0.5)

    model_feats = {}
    for f in fields:
        delta = (raw_feats[f]["centerMean"] - predicted[f]) / noise_floor
        stdRel = (raw_feats[f]["std"] - std_med) / std_spread
        model_feats[f] = {
            "stdRel": stdRel,
            "delta": delta,
            "gradientRms": raw_feats[f]["gradientRms"] / gradient_floor,
            "cornerContrast": raw_feats[f]["cornerContrast"] / noise_floor,
        }
    return model_feats


FEATURE_NAMES = ["stdRel", "delta", "gradientRms", "cornerContrast"]


def feature_vector(model_feats, f):
    return [model_feats[f][name] for name in FEATURE_NAMES]
