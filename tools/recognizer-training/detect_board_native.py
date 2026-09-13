"""
Prototype van de hoekdetectie ZONDER OpenCV — exact het algoritme dat straks in
vanilla JavaScript wordt overgezet, zodat ik het eerst hier kan valideren.

Stappen: grijswaarden -> Otsu-drempel (donker vs. licht) -> verbinden (dilatatie)
-> grootste samenhangende "donkere" vlek zoeken via de bounding-box-oppervlakte
(de dikke buitenrand van het bord is meestal veel groter dan een los stuk) ->
convex hull van die vlek -> kleinste omvattende rechthoek (rotating calipers) als
de 4 hoeken.
"""
import numpy as np
from PIL import Image


def to_gray(img: Image.Image) -> np.ndarray:
    arr = np.asarray(img.convert("RGB")).astype(np.float32)
    return arr @ np.array([0.299, 0.587, 0.114])


def otsu_threshold(gray: np.ndarray) -> float:
    hist, edges = np.histogram(gray, bins=256, range=(0, 256))
    hist = hist.astype(np.float64)
    total = hist.sum()
    sum_all = np.sum(np.arange(256) * hist)
    sum_bg = 0.0
    weight_bg = 0.0
    best_thresh = 0
    best_var = -1
    for t in range(256):
        weight_bg += hist[t]
        if weight_bg == 0:
            continue
        weight_fg = total - weight_bg
        if weight_fg == 0:
            break
        sum_bg += t * hist[t]
        mean_bg = sum_bg / weight_bg
        mean_fg = (sum_all - sum_bg) / weight_fg
        between_var = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
        if between_var > best_var:
            best_var = between_var
            best_thresh = t
    return float(best_thresh)


def dilate(mask: np.ndarray, iterations=2) -> np.ndarray:
    m = mask
    for _ in range(iterations):
        padded = np.pad(m, 1, mode="constant", constant_values=False)
        m = (
            padded[1:-1, 1:-1] | padded[:-2, 1:-1] | padded[2:, 1:-1] |
            padded[1:-1, :-2] | padded[1:-1, 2:] |
            padded[:-2, :-2] | padded[:-2, 2:] | padded[2:, :-2] | padded[2:, 2:]
        )
    return m


def largest_component_by_bbox(mask: np.ndarray, min_pixels=200):
    h, w = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    best_pts = None
    best_score = -1
    img_area = h * w

    for y0 in range(h):
        row = mask[y0]
        xs = np.nonzero(row & ~visited[y0])[0]
        for x0 in xs:
            if visited[y0, x0] or not mask[y0, x0]:
                continue
            # iteratieve flood fill (stack) om recursie-limiet te vermijden
            stack = [(y0, x0)]
            visited[y0, x0] = True
            minx, maxx, miny, maxy = x0, x0, y0, y0
            count = 0
            pts = []
            while stack:
                y, x = stack.pop()
                count += 1
                if count % 7 == 0:
                    pts.append((x, y))
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
                for dy, dx in ((-1,0),(1,0),(0,-1),(0,1)):
                    ny, nx = y+dy, x+dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        stack.append((ny, nx))
            if count < min_pixels:
                continue
            bbox_w = maxx - minx
            bbox_h = maxy - miny
            if bbox_w < 1 or bbox_h < 1:
                continue
            aspect = bbox_w / bbox_h
            if aspect < 0.55 or aspect > 1.8:
                continue
            bbox_area = bbox_w * bbox_h
            if bbox_area > img_area * 0.98 or bbox_area < img_area * 0.1:
                continue
            score = bbox_area
            if score > best_score:
                best_score = score
                best_pts = pts + [(minx,miny),(maxx,miny),(minx,maxy),(maxx,maxy)]
    return best_pts


def convex_hull(points):
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def min_area_rect(hull):
    # rotating calipers: voor elke hull-kant, bereken de bounding box uitgelijnd
    # met die kant, houd de kleinste oppervlakte bij.
    import math
    n = len(hull)
    if n < 3:
        return None
    best_area = float("inf")
    best_corners = None
    for i in range(n):
        p1 = hull[i]
        p2 = hull[(i + 1) % n]
        edge_angle = math.atan2(p2[1]-p1[1], p2[0]-p1[0])
        c, s = math.cos(-edge_angle), math.sin(-edge_angle)
        rotated = [(x*c - y*s, x*s + y*c) for x, y in hull]
        xs = [p[0] for p in rotated]
        ys = [p[1] for p in rotated]
        minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
        area = (maxx-minx) * (maxy-miny)
        if area < best_area:
            best_area = area
            cs, ss = math.cos(edge_angle), math.sin(edge_angle)
            corners_rot = [(minx,miny),(maxx,miny),(maxx,maxy),(minx,maxy)]
            best_corners = [(x*cs - y*ss, x*ss + y*cs) for x, y in corners_rot]
    return best_corners


def order_corners(pts):
    pts = sorted(pts, key=lambda p: p[1])
    top2 = sorted(pts[:2], key=lambda p: p[0])
    bot2 = sorted(pts[2:], key=lambda p: p[0])
    return [top2[0], top2[1], bot2[1], bot2[0]]  # TL, TR, BR, BL


def detect_board_corners_native(img: Image.Image, working_size=700):
    w0, h0 = img.size
    scale = min(1.0, working_size / max(w0, h0))
    small = img.resize((max(1,int(w0*scale)), max(1,int(h0*scale)))) if scale < 1.0 else img
    gray = to_gray(small)
    thresh = otsu_threshold(gray)
    mask = gray < thresh
    mask = dilate(mask, iterations=2)
    pts = largest_component_by_bbox(mask)
    if not pts:
        return None
    hull = convex_hull(pts)
    if len(hull) < 3:
        return None
    rect = min_area_rect(hull)
    if rect is None:
        return None
    ordered = order_corners(rect)
    return [(x/scale, y/scale) for x, y in ordered]


if __name__ == "__main__":
    import sys
    img = Image.open(sys.argv[1])
    print(detect_board_corners_native(img))
