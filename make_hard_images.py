"""Makes a harder fake dataset in the same folder layout as MVTec AD (so eval_mvtec.py runs on it).

Unlike our first practice photos, every photo here is a little different, like real life:
  - bottle position moves a few pixels, and rotates a little
  - lighting changes (brightness and a gradient across the photo)
  - bottle colour varies slightly
Defects: broken_large (blob), scratch (thin faint line), contamination (small dots).

Result:  bottle_fake/train/good, bottle_fake/test/<kind>, bottle_fake/ground_truth/<kind>
"""
import os

import cv2
import numpy as np

SIZE = 256
OUT = "bottle_fake"
rng = np.random.default_rng(42)


def inside_body(x, y):
    return ((x - 128) / 52) ** 2 + ((y - 160) / 82) ** 2 < 1


def random_point():
    while True:
        x, y = rng.integers(80, 176), rng.integers(80, 240)
        if inside_body(x, y):
            return int(x), int(y)


def draw_defect(img, mask, kind, body):
    x, y = random_point()
    if kind == "broken_large":
        r = int(rng.integers(8, 17))
        color = tuple(int(c) for c in rng.choice([30, 60, 235], 1)[0] * np.ones(3))
        cv2.circle(img, (x, y), r, color, -1); cv2.circle(mask, (x, y), r, 255, -1)
    elif kind == "scratch":
        ang, length = rng.uniform(0, np.pi), int(rng.integers(25, 46))
        x2, y2 = int(x + length * np.cos(ang)), int(y + length * np.sin(ang))
        dark = int(rng.integers(25, 46))
        color = tuple(int(max(0, c - dark)) for c in body)
        cv2.line(img, (x, y), (x2, y2), color, 2); cv2.line(mask, (x, y), (x2, y2), 255, 3)
    elif kind == "contamination":
        for _ in range(int(rng.integers(3, 7))):
            px, py = x + int(rng.integers(-12, 13)), y + int(rng.integers(-12, 13))
            cv2.circle(img, (px, py), int(rng.integers(2, 4)), (35, 50, 70), -1)
            cv2.circle(mask, (px, py), 4, 255, -1)


def render(kind=None):
    jitter = rng.integers(-12, 13, 3)
    body = tuple(int(np.clip(c + j, 0, 255)) for c, j in zip((90, 140, 90), jitter))
    img = np.full((SIZE, SIZE, 3), 200, np.uint8)
    cv2.rectangle(img, (100, 20), (156, 70), body, -1)
    cv2.ellipse(img, (128, 160), (60, 90), 0, 0, 360, body, -1)
    mask = np.zeros((SIZE, SIZE), np.uint8)
    if kind and kind != "good":
        draw_defect(img, mask, kind, body)

    # camera and lighting changes (applied to the photo and the answer mask together)
    angle, dx, dy = rng.uniform(-3, 3), rng.uniform(-4, 4), rng.uniform(-4, 4)
    m = cv2.getRotationMatrix2D((128, 128), angle, 1.0); m[:, 2] += (dx, dy)
    img = cv2.warpAffine(img, m, (SIZE, SIZE), borderMode=cv2.BORDER_REPLICATE)
    mask = cv2.warpAffine(mask, m, (SIZE, SIZE), flags=cv2.INTER_NEAREST)
    gradient = np.linspace(1 - rng.uniform(0, .08), 1 + rng.uniform(0, .08), SIZE)[None, :, None]
    img = img.astype(np.float32) * rng.uniform(0.9, 1.1) * gradient
    img = np.clip(img + rng.normal(0, 6, img.shape), 0, 255).astype(np.uint8)
    return img, mask


def save(path, img):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv2.imwrite(path, img)


for i in range(60):
    save(f"{OUT}/train/good/{i:03d}.png", render()[0])
for i in range(20):
    save(f"{OUT}/test/good/{i:03d}.png", render()[0])
for kind in ["broken_large", "scratch", "contamination"]:
    for i in range(15):
        img, mask = render(kind)
        save(f"{OUT}/test/{kind}/{i:03d}.png", img)
        save(f"{OUT}/ground_truth/{kind}/{i:03d}_mask.png", mask)
print("Done: bottle_fake/")
