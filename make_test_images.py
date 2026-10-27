"""Makes fake 'bottle' photos so we can test without the big dataset.

Creates in the data/ folder:
  good.png            a perfect bottle (our reference)
  good_2.png          another perfect bottle (tiny noise differences only)
  defect_easy.png     a big dark spot (easy to see)
  defect_faint.png    a faint scratch (hard to see -> agent should struggle)
  defect_tiny.png     a tiny dot (small -> needs zoom)
"""
import os

import cv2
import numpy as np

SIZE = 256
os.makedirs("data", exist_ok=True)


def make_bottle(seed):
    """Draw a simple bottle shape on a grey background, plus camera noise."""
    rng = np.random.default_rng(seed)
    img = np.full((SIZE, SIZE, 3), 200, dtype=np.uint8)           # grey background
    cv2.rectangle(img, (100, 20), (156, 70), (90, 140, 90), -1)    # bottle neck
    cv2.ellipse(img, (128, 160), (60, 90), 0, 0, 360, (90, 140, 90), -1)  # bottle body
    noise = rng.normal(0, 6, img.shape)                            # camera noise
    return np.clip(img + noise, 0, 255).astype(np.uint8)


good = make_bottle(seed=1)
cv2.imwrite("data/good.png", good)
cv2.imwrite("data/good_2.png", make_bottle(seed=2))

easy = make_bottle(seed=3)
cv2.circle(easy, (110, 150), 14, (30, 30, 30), -1)                 # big dark spot
cv2.imwrite("data/defect_easy.png", easy)

faint = make_bottle(seed=4)
cv2.line(faint, (100, 190), (150, 215), (80, 130, 80), 2)          # barely darker line
cv2.imwrite("data/defect_faint.png", faint)

tiny = make_bottle(seed=5)
cv2.circle(tiny, (140, 120), 3, (40, 40, 40), -1)                  # tiny dot
cv2.imwrite("data/defect_tiny.png", tiny)

shifted = make_bottle(seed=6)
cv2.circle(shifted, (120, 140), 6, (55, 95, 55), -1)               # a medium dent
shifted = np.roll(shifted, (2, 3), axis=(0, 1))                    # camera moved a little
cv2.imwrite("data/defect_shifted.png", shifted)

print("Done. Look inside the data folder.")
