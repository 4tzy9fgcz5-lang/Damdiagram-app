"""
Stap 3: klein, navolgbaar leermodel (multinomiale logistische regressie, GEEN
neuraal netwerk) op de 4 berekende kenmerken. Traint in seconden op de synthetische
set, getoetst op de 6 echte testfoto's (strikt gescheiden van de training).
"""
import json
import os
import numpy as np

from features import FEATURE_NAMES

CLASSES = ["leeg", "wit", "zwart"]


def softmax(Z):
    Z = Z - Z.max(axis=1, keepdims=True)
    E = np.exp(Z)
    return E / E.sum(axis=1, keepdims=True)


def robust_scale(X):
    # Mediaan/MAD i.p.v. gemiddelde/std: minder gevoelig voor de lange staart van
    # extreme (maar geldige) synthetische voorbeelden, zodat de schaal beter
    # aansluit bij echte foto's.
    med = np.median(X, axis=0)
    mad = np.median(np.abs(X - med), axis=0)
    return med, np.maximum(1.4826 * mad, 1e-3)


def train(X, y, n_classes=3, lr=0.3, epochs=400, l2=1e-3, clip=8.0):
    mu, sigma = robust_scale(X)
    Xs = np.clip((X - mu) / sigma, -clip, clip)

    n, d = Xs.shape
    W = np.zeros((d, n_classes))
    b = np.zeros(n_classes)
    Y = np.eye(n_classes)[y]

    for epoch in range(epochs):
        Z = Xs @ W + b
        P = softmax(Z)
        grad_Z = (P - Y) / n
        grad_W = Xs.T @ grad_Z + l2 * W
        grad_b = grad_Z.sum(axis=0)
        W -= lr * grad_W
        b -= lr * grad_b
        if (epoch + 1) % 100 == 0:
            loss = -np.mean(np.log(np.clip(P[np.arange(n), y], 1e-9, 1)))
            print(f"  epoch {epoch + 1}: loss={loss:.4f}")

    return W, b, mu, sigma


def predict(X, W, b, mu, sigma, clip=8.0):
    Xs = np.clip((X - mu) / sigma, -clip, clip)
    P = softmax(Xs @ W + b)
    return P.argmax(axis=1), P


def evaluate(X, y, meta, W, b, mu, sigma):
    pred, P = predict(X, W, b, mu, sigma)
    correct = (pred == y).sum()
    print(f"\nTOTAAL: {correct}/{len(y)} ({correct/len(y)*100:.1f}%)")

    # ten-onrechte-zwart: waarheid leeg(0) of wit(1), voorspeld zwart(2)
    zwart_fout = np.sum((pred == 2) & (y != 2))
    zwart_gemist = np.sum((y == 2) & (pred != 2))
    print(f"ten-onrechte-zwart: {zwart_fout}   zwart-gemist: {zwart_gemist}")

    per_photo = {}
    for (photo, field), p, t in zip(meta, pred, y):
        per_photo.setdefault(photo, [0, 0])
        per_photo[photo][1] += 1
        if p == t:
            per_photo[photo][0] += 1
    for photo, (c, n) in per_photo.items():
        print(f"  {photo:10s}: {c}/{n} ({c/n*100:.1f}%)")

    print("\nFouten (per veld):")
    for (photo, field), p, t in zip(meta, pred, y):
        if p != t:
            print(f"  {photo} veld {field}: verwacht {CLASSES[t]}, gekregen {CLASSES[p]}")

    return correct / len(y), zwart_fout, zwart_gemist


if __name__ == "__main__":
    here = os.path.dirname(__file__)
    train_d = np.load(os.path.join(here, "train_data.npz"))
    Xtr, ytr = train_d["X"], train_d["y"]

    print("Training multinomiale logistische regressie...")
    W, b, mu, sigma = train(Xtr, ytr)

    print("\nGeleerde gewichten (per kenmerk, per klasse leeg/wit/zwart):")
    for i, name in enumerate(FEATURE_NAMES):
        print(f"  {name:16s}  {W[i][0]:+7.3f}  {W[i][1]:+7.3f}  {W[i][2]:+7.3f}")
    print(f"  {'(bias)':16s}  {b[0]:+7.3f}  {b[1]:+7.3f}  {b[2]:+7.3f}")

    import sys
    sys.path.insert(0, "/private/tmp/claude-501/-Users-janvanderstar-Documents-Damdiagram-app/85dd771e-fafc-4ecb-b102-5b62800bb37d/scratchpad")
    from build_dataset import real_test_set
    Xte, yte, meta = real_test_set()

    print("\n=== Evaluatie op de 6 ECHTE testfoto's (strikt gescheiden van training) ===")
    acc, zf, zg = evaluate(Xte, yte, meta, W, b, mu, sigma)

    weights_out = {
        "featureNames": FEATURE_NAMES,
        "classes": ["empty", "wp", "bp"],
        "mu": mu.tolist(),
        "sigma": sigma.tolist(),
        "W": W.tolist(),
        "b": b.tolist(),
        "clip": 8.0,
    }
    with open(os.path.join(here, "model_weights.json"), "w") as fh:
        json.dump(weights_out, fh, indent=2)
    print("\nGewichten opgeslagen in model_weights.json")
