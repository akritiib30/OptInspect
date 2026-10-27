"""Build a 'product' from a folder of good photos: its reference photo, its calibration, and a few samples.

Run:  python build_product.py bottle bottle      (product name, MVTec-style folder)
Makes: products/bottle/reference.png, calibration.json, samples/*.png
"""
import glob
import json
import os
import shutil
import sys

import cv2

import detector
from eval_mvtec import N_CAL, N_REF, build_reference, calibrate_normal

name, root = sys.argv[1], sys.argv[2]
out = os.path.join("products", name)
os.makedirs(os.path.join(out, "samples"), exist_ok=True)

ref, _ = build_reference(root)
normal = calibrate_normal(root, ref)
cv2.imwrite(os.path.join(out, "reference.png"), ref)
with open(os.path.join(out, "calibration.json"), "w") as f:
    json.dump({"normal": normal, "edge_k": detector.EDGE_K, "n_reference": N_REF, "n_calibration": N_CAL,
               "source": f"{root}/train/good"}, f, indent=2)

# a few ready-made test photos for the web page (the first of each kind)
for kind in sorted(os.listdir(os.path.join(root, "test"))):
    files = sorted(glob.glob(os.path.join(root, "test", kind, "*.png")))[:2]
    for i, path in enumerate(files):
        shutil.copy(path, os.path.join(out, "samples", f"{kind}_{i}.png"))
print(f"Built products/{name}: normal level {normal:.1f}, edge forgiveness {detector.EDGE_K}")
