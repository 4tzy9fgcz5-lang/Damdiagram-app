"""
Bouwt de trainings- en testset voor stap 3.

Trainingsdata: uitsluitend SYNTHETISCH (render_synthetic.py, duizenden voorbeelden,
inclusief de nieuwe hoek-schaduw-augmentatie voor precies de hardnekkige gevallen).

Testset: de 6 ECHTE testfoto's (300 velden) — strikt gescheiden van de training,
zoals het stappenplan vraagt. Dit is het enige eerlijke ijkpunt.
"""
import random
import sys
import os
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from render_synthetic import generate_sample
from features import image_to_gray, extract_raw_features, build_model_features, feature_vector, FIELD_COUNT

LABELS = {"empty": 0, "wit": 1, "zwart": 2}


def label_for(piece):
    if piece is None:
        return "empty"
    return "wit" if piece in ("wp", "wk") else "zwart"


def synthetic_dataset(n_samples, seed=0):
    rng = random.Random(seed)
    X, y = [], []
    for i in range(n_samples):
        board, photo, style, jitter = generate_sample(rng)
        gray = image_to_gray(photo)
        raw = extract_raw_features(gray)
        model_feats = build_model_features(raw)
        for f in range(1, FIELD_COUNT + 1):
            X.append(feature_vector(model_feats, f))
            y.append(LABELS[label_for(board[f])])
        if (i + 1) % 200 == 0:
            print(f"  {i + 1}/{n_samples} synthetische borden gegenereerd...")
    return np.array(X), np.array(y)


def real_test_set():
    # hergebruikt dezelfde BMP's + hoekcoördinaten als de rest van deze sessie
    scratchpad = "/private/tmp/claude-501/-Users-janvanderstar-Documents-Damdiagram-app/85dd771e-fafc-4ecb-b102-5b62800bb37d/scratchpad"
    sys.path.insert(0, scratchpad)
    from diagnose import read_bmp, warp_to_square
    from run_eval import PHOTOS, expected_board

    X, y, meta = [], [], []
    for name, info in PHOTOS.items():
        w, h, pixels = read_bmp(os.path.join(scratchpad, info["bmp"]))
        warped_raw = warp_to_square(pixels, w, h, info["corners"], 500)
        img = Image.frombytes("RGB", (500, 500), bytes(warped_raw))
        gray = image_to_gray(img)
        raw = extract_raw_features(gray)
        model_feats = build_model_features(raw)
        exp = expected_board(info)
        for f in range(1, FIELD_COUNT + 1):
            X.append(feature_vector(model_feats, f))
            lbl = "empty" if exp[f] is None else ("wit" if exp[f] == "wp" else "zwart")
            y.append(LABELS[lbl])
            meta.append((name, f))
    return np.array(X), np.array(y), meta


if __name__ == "__main__":
    print("Genereer synthetische trainingsset...")
    Xtr, ytr = synthetic_dataset(1500, seed=1)
    np.savez(os.path.join(os.path.dirname(__file__), "train_data.npz"), X=Xtr, y=ytr)
    print("Trainingsset:", Xtr.shape, "klassen:", np.bincount(ytr))

    print("Bouw echte testset (6 foto's)...")
    Xte, yte, meta = real_test_set()
    np.savez(os.path.join(os.path.dirname(__file__), "test_data.npz"), X=Xte, y=yte)
    print("Testset:", Xte.shape, "klassen:", np.bincount(yte))
