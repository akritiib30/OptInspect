"""Detector: compares a test photo with a good reference and finds defects.

How it works (in plain words):
  1. Blur both photos a little, so camera noise does not look like a defect.
  2. Subtract them. Where they differ, the result is bright.
  3. Keep only the parts that clearly stand out above the normal noise.
  4. Each bright blob = one possible defect. Give it a box and a score 0..1.

The score is about "how far does this stand out above the noise?" (called SNR).
Boosting contrast boosts the noise too, so tools cannot cheat the score.
"""
import cv2
import numpy as np

SNR_SCALE = 12.0   # bigger = harder to reach a high score
CONFIRM_SCORE = 0.70   # at or above this: confirmed defect
DISMISS_SCORE = 0.15   # at or below this: looks normal, cleared
CAND_FRAC = 0.7        # calibrated mode: ignore differences weaker than this x 'normal'
WRONG_PHOTO_SHARE = 0.30   # if more of the photo than this differs, it is not this product
MIN_STRUCTURE = 0.85       # real photos of the product score 0.97+; wrong pictures score 0.15 or less
MERGE_GAP = 10     # blobs closer than about 2x this many pixels count as one defect
USE_ECC = True         # also fix small rotation when lining up photos
USE_BRIGHTNESS = True  # match the reference's lighting to the test photo
EDGE_K = 2.0           # how much to forgive mismatches near strong edges (0 = no forgiveness)


def background_noise(diff, inside_mask=None):
    """Typical size of random differences, ignoring the suspicious area."""
    values = diff if inside_mask is None else diff[~inside_mask]
    if values.size == 0:
        values = diff
    med = float(np.median(values))
    return med, max(0.5, med * 1.4826)


def snr(diff, inside_mask):
    """How many 'noise units' the strongest point of the area stands above the background."""
    ring = cv2.dilate(inside_mask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    med, sigma = background_noise(diff, ring)
    return max(0.0, (float(diff[inside_mask].max()) - med) / sigma)


def region_score(diff, inside_mask):
    """Score 0..1 without calibration: how strongly the area stands out above the noise."""
    return round(float(1 - np.exp(-snr(diff, inside_mask) / SNR_SCALE)), 2)


def score_from_peak(peak, normal):
    """Score 0..1 with calibration. 'normal' = the biggest difference ever seen on a good photo.
       peak <= normal         -> 0 .. DISMISS_SCORE   (looks like a normal photo)
       peak = 2 x normal      -> CONFIRM_SCORE        (twice as strong as anything normal)
       beyond                 -> approaches 1.0"""
    r = peak / max(normal, 1e-6)
    if r <= 1:
        s = DISMISS_SCORE * r
    elif r < 2:
        s = DISMISS_SCORE + (CONFIRM_SCORE - DISMISS_SCORE) * (r - 1)
    else:
        s = CONFIRM_SCORE + (1 - CONFIRM_SCORE) * (1 - np.exp(-(r - 2)))
    return round(float(s), 2)


def blurred_gray(img, k=5):
    return cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (k, k), 0)


def _gray32(img):
    g = img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return g.astype(np.float32)


def align(ref_img, test_img):
    """Move (and slightly rotate) the reference so it lines up with the test photo."""
    a, b = _gray32(ref_img), _gray32(test_img)
    (dx, dy), _ = cv2.phaseCorrelate(a, b)                        # rough: how far did it slide?
    h, w = ref_img.shape[:2]
    if USE_ECC:
        try:                                                      # fine: also fixes small rotation
            warp = np.float32([[1, 0, -dx], [0, 1, -dy]])
            crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5)
            _, warp = cv2.findTransformECC(cv2.GaussianBlur(b, (5, 5), 0), cv2.GaussianBlur(a, (5, 5), 0),
                                           warp, cv2.MOTION_EUCLIDEAN, crit, None, 5)
            return cv2.warpAffine(ref_img, warp, (w, h), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
                                  borderMode=cv2.BORDER_REPLICATE)
        except cv2.error:
            pass                                                  # did not converge: use the rough fix
    m = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(ref_img, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def match_brightness(ref_img, test_img):
    """Make the reference as bright as the test photo (lighting changes are not defects).
    Fits  test = a * reference + b  ignoring pixels that disagree a lot (the defects)."""
    r, t = _gray32(ref_img).ravel()[::5], _gray32(test_img).ravel()[::5]
    keep = np.ones(r.size, bool)
    a, b = 1.0, 0.0
    for _ in range(3):
        a, b = np.linalg.lstsq(np.stack([r[keep], np.ones(keep.sum())], 1), t[keep], rcond=None)[0]
        res = t - (a * r + b)
        keep = np.abs(res) < 2.5 * (1.4826 * np.median(np.abs(res[keep])) + 1e-3)
    a = float(np.clip(a, 0.7, 1.4))
    return np.clip(ref_img.astype(np.float32) * a + b, 0, 255).astype(np.uint8)


def compare(test_img, ref_img, k=5, edge_gain=1.0):
    """Difference map between two lined-up photos. Near strong edges, small mismatches are
    forgiven (edges never line up perfectly), so only real changes stay bright.
    edge_gain > 1 is for enlarged crops, where the same edge is spread over more pixels."""
    t = cv2.GaussianBlur(_gray32(test_img), (k, k), 0)
    r = cv2.GaussianBlur(_gray32(ref_img), (k, k), 0)
    diff = np.abs(t - r)
    if EDGE_K > 0:
        edge = np.hypot(cv2.Sobel(r, cv2.CV_32F, 1, 0), cv2.Sobel(r, cv2.CV_32F, 0, 1)) / 8.0
        edge = cv2.GaussianBlur(edge, (9, 9), 0)                  # how steep is the picture here?
        diff = diff / (1.0 + EDGE_K * edge * edge_gain)
    return diff


def prepare(test_img, ref_img):
    """Line up the reference with this test photo, in position and in brightness."""
    ref = align(ref_img, test_img)
    return match_brightness(ref, test_img) if USE_BRIGHTNESS else ref


def build_reference(images):
    """Average many good photos into one clean reference (aligned to the first one first)."""
    anchor = images[0]
    aligned = [anchor] + [align(im, anchor) for im in images[1:]]
    return np.median(np.stack(aligned), axis=0).astype(np.uint8)


def structure_match(test_img, aligned_ref):
    """How similar is the overall picture shape to the reference? 1 = same, 0 = unrelated.
    Blank or flat photos give 0."""
    a, b = _gray32(aligned_ref).ravel(), _gray32(test_img).ravel()
    if a.std() < 1e-3 or b.std() < 1e-3:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def share_unlike_reference(test_img, aligned_ref, normal):
    """What fraction of the photo differs from the reference by more than 'normal'?
    Real photos of the product (even broken ones) stay low; a wrong picture is far off."""
    return float((compare(test_img, aligned_ref) > normal).mean())


def calibrate(good_images, ref_img):
    """Learn what 'normal' looks like: the biggest difference seen on photos known to be good."""
    return max(float(compare(g, prepare(g, ref_img)).max()) for g in good_images)


def detect(test_img, ref_img, normal=None):
    """Return a list of defects: [{'box', 'area', 'score', 'peak'}].
    Pass normal=calibrate(...) for scores tuned to your product; without it, scores use a
    generic noise estimate (fine for clean practice photos, too eager on real ones)."""
    ref_img = prepare(test_img, ref_img)
    diff = compare(test_img, ref_img)

    med, sigma = background_noise(diff)
    limit = CAND_FRAC * normal if normal else med + 3.5 * sigma  # candidates must stand out
    mask = (diff > limit).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8))            # join touching pieces

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    blobs = []
    for c in contours:
        if cv2.contourArea(c) < 15:
            continue
        m = np.zeros(diff.shape, np.uint8)
        cv2.drawContours(m, [c], -1, 255, -1)
        blobs.append(m > 0)

    defects = []
    for m in merge_nearby(blobs):                                 # one scratch = one defect
        ys, xs = np.nonzero(m)
        box = (int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1))
        peak = float(diff[m].max())
        score = score_from_peak(peak, normal) if normal else region_score(diff, m)
        defects.append({"box": box, "area": int(m.sum()), "score": score, "peak": round(peak, 1)})
    return defects


def merge_nearby(blobs, gap=MERGE_GAP):
    """Join blobs that are close together, so a broken-up scratch becomes one defect."""
    def box(m):
        ys, xs = np.nonzero(m)
        return xs.min() - gap, ys.min() - gap, xs.max() + gap, ys.max() + gap

    blobs = list(blobs)
    merged = True
    while merged:
        merged = False
        for i in range(len(blobs)):
            for j in range(i + 1, len(blobs)):
                a, b = box(blobs[i]), box(blobs[j])
                if a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]:   # boxes overlap
                    blobs[i] = blobs[i] | blobs[j]
                    del blobs[j]
                    merged = True
                    break
            if merged:
                break
    return blobs


def draw(img, defects):
    """Draw a box and the score on a copy of the image."""
    out = img.copy()
    for d in defects:
        x, y, w, h = d["box"]
        cv2.rectangle(out, (x - 4, y - 4), (x + w + 4, y + h + 4), (0, 0, 255), 1)
        cv2.putText(out, f'{d["score"]:.2f}', (x, max(10, y - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
    return out


if __name__ == "__main__":
    import os
    os.makedirs("out", exist_ok=True)
    ref = cv2.imread("data/good.png")
    for name in ["good_2", "defect_easy", "defect_faint", "defect_tiny"]:
        img = cv2.imread(f"data/{name}.png")
        found = detect(img, ref)
        cv2.imwrite(f"out/{name}_result.png", draw(img, found))
        print(f"{name:14s} -> {len(found)} defect(s)", [(d["box"], d["score"]) for d in found])
