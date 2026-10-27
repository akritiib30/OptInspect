"""Test the detector on the real MVTec photos and see how good the scores are.

Run:  python eval_mvtec.py bottle          (folder containing train/ test/ ground_truth/)

It reports:
  - how often GOOD bottles are wrongly flagged (false alarms)
  - for each kind of defect: confirmed / sent to review / missed
  - AUROC: how well the score separates good from defective (1.0 perfect, 0.5 = coin flip)
  - how often a flagged box really sits on the defect (checked against MVTec's masks)
"""
import glob
import os
import sys

import cv2
import numpy as np

from agent import CONFIRM, DISMISS
import detector
from detector import build_reference as build_reference_from
from detector import calibrate, detect

SIZE = 256          # all photos are shrunk to this size, as in our practice photos
N_REF = 40          # how many good training photos to average into the reference
N_CAL = 40          # how many OTHER good training photos to learn 'normal' from


def load(path):
    img = cv2.imread(path)
    return cv2.resize(img, (SIZE, SIZE), interpolation=cv2.INTER_AREA)


def build_reference(root):
    files = sorted(glob.glob(os.path.join(root, "train", "good", "*.png")))
    if len(files) < N_REF + 10:
        sys.exit(f"Need at least {N_REF + 10} photos in {root}/train/good, found {len(files)}")
    return build_reference_from([load(f) for f in files[:N_REF]]), N_REF


def calibrate_normal(root, ref):
    """Use good training photos that were NOT used for the reference to learn what 'normal' is."""
    files = sorted(glob.glob(os.path.join(root, "train", "good", "*.png")))[N_REF:N_REF + N_CAL]
    return calibrate([load(f) for f in files], ref)


def auroc(good_scores, bad_scores):
    """Chance that a random defective photo scores higher than a random good one."""
    if not good_scores or not bad_scores:
        return float("nan")
    g, b = np.array(good_scores), np.array(bad_scores)
    wins = (b[:, None] > g[None, :]).sum() + 0.5 * (b[:, None] == g[None, :]).sum()
    return wins / (len(g) * len(b))


def outcome(defects):
    top = max((d["score"] for d in defects), default=0.0)
    if top >= CONFIRM:
        return "confirmed", top
    if top > DISMISS:
        return "review", top
    return "missed/clear", top


def on_defect(defects, mask_path):
    """Did any flagged box land on the real defect?"""
    if not os.path.exists(mask_path):
        return None
    mask = cv2.resize(cv2.imread(mask_path, 0), (SIZE, SIZE), interpolation=cv2.INTER_NEAREST) > 0
    for d in defects:
        x, y, w, h = d["box"]
        if mask[y:y + h, x:x + w].any():
            return True
    return False


def measure(root, ref=None, normal=None):
    """Run the detector on every test photo. Returns the raw numbers."""
    ref = build_reference(root)[0] if ref is None else ref
    kinds = sorted(k for k in os.listdir(os.path.join(root, "test")))
    good_scores, bad_scores, table, located = [], [], {}, []

    for kind in kinds:
        counts = {"confirmed": 0, "review": 0, "missed/clear": 0}
        for path in sorted(glob.glob(os.path.join(root, "test", kind, "*.png"))):
            defects = detect(load(path), ref, normal)
            result, top = outcome(defects)
            counts[result] += 1
            if kind == "good":
                good_scores.append(top)
            else:
                bad_scores.append(top)
                mask = os.path.join(root, "ground_truth", kind, os.path.basename(path).replace(".png", "_mask.png"))
                hit = on_defect(defects, mask) if defects else False
                if hit is not None:
                    located.append(hit)
        table[kind] = counts
    return table, good_scores, bad_scores, located


def main(root, edge_k=None):
    if edge_k is not None:
        detector.EDGE_K = edge_k
    ref, n = build_reference(root)
    normal = calibrate_normal(root, ref)
    print(f"Reference = median of {n} good training photos (lined up first)")
    print(f"Edge forgiveness = {detector.EDGE_K}")
    print(f"'Normal' level = {normal:.1f}  (biggest difference seen on {N_CAL} other good photos)\n")
    table, good_scores, bad_scores, located = measure(root, ref, normal)
    print(f"{'kind':18s}{'photos':>7s}{'confirmed':>11s}{'review':>8s}{'missed/clear':>14s}")
    for kind, c in table.items():
        print(f"{kind:18s}{sum(c.values()):>7d}{c['confirmed']:>11d}{c['review']:>8d}{c['missed/clear']:>14d}")

    g = table.get("good", {})
    n_good = sum(g.values()) or 1
    print(f"\nFalse alarms on good photos: {(g.get('confirmed', 0) + g.get('review', 0))}/{n_good}"
          f"  (confirmed wrongly: {g.get('confirmed', 0)})")
    print(f"AUROC (good vs defective): {auroc(good_scores, bad_scores):.2f}")
    if located:
        print(f"Flagged box really on the defect: {sum(located)}/{len(located)} defective photos")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "bottle",
         float(sys.argv[2]) if len(sys.argv) > 2 else None)
