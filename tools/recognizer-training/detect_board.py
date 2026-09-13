"""
Prototype: automatische hoekdetectie van het dambord in een foto.

Aanpak: het bord heeft in vrijwel elke boekstijl een opvallende, dikke zwarte
buitenrand rond het 10x10-patroon. Die rand geeft een sterke, min-of-meer
vierkante contour die met klassieke randdetectie (geen ML, geen trainingsdata
nodig) betrouwbaar te vinden moet zijn.

Stappen: grijswaarden -> lichte vervaging -> randdetectie (Canny) -> dilatatie
(randstukjes verbinden) -> contouren zoeken -> de contour kiezen die het best op
een vierkant lijkt EN een groot deel van het beeld beslaat.
"""
import cv2
import numpy as np


def order_corners(pts):
    pts = np.array(pts, dtype=np.float32)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).flatten()
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(diff)]
    bl = pts[np.argmax(diff)]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def detect_board_corners(image_bgr, working_size=900):
    h0, w0 = image_bgr.shape[:2]
    scale = min(1.0, working_size / max(h0, w0))
    small = cv2.resize(image_bgr, (int(w0 * scale), int(h0 * scale))) if scale < 1.0 else image_bgr.copy()
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    best = None
    best_score = -1
    for lo, hi in [(30, 100), (50, 150), (10, 60)]:
        edges = cv2.Canny(blur, lo, hi)
        edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=2)
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        img_area = small.shape[0] * small.shape[1]
        for c in contours:
            area = cv2.contourArea(c)
            if area < img_area * 0.15:
                continue
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) != 4:
                continue
            if not cv2.isContourConvex(approx):
                continue
            pts = approx.reshape(4, 2).astype(np.float32)
            ordered = order_corners(pts)
            w1 = np.linalg.norm(ordered[1] - ordered[0])
            w2 = np.linalg.norm(ordered[2] - ordered[3])
            h1 = np.linalg.norm(ordered[3] - ordered[0])
            h2 = np.linalg.norm(ordered[2] - ordered[1])
            avg_w, avg_h = (w1 + w2) / 2, (h1 + h2) / 2
            if avg_w < 1 or avg_h < 1:
                continue
            aspect = avg_w / avg_h
            if aspect < 0.7 or aspect > 1.43:
                continue
            fill = area / (avg_w * avg_h)
            if fill < 0.85:
                continue
            score = area * fill
            if score > best_score:
                best_score = score
                best = ordered

    if best is None:
        return None
    return (best / scale).tolist()


if __name__ == "__main__":
    import sys, os
    path = sys.argv[1]
    img = cv2.imread(path)
    corners = detect_board_corners(img)
    print(corners)
