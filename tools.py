"""The three tools the agent can use when the detector is unsure.

Every tool takes: the test photo, the (already lined-up) reference photo, the box of the
suspicious area, and optionally the detector's peak and the calibrated 'normal' level.
Every tool returns: {'tool', 'score', 'image'}
  score = new confidence after looking again (same 0..1 scale as the detector)
  image = a picture of what the tool saw (later we show this to the AI and to humans)

How a tool can change the score: it measures how strongly the area stands out from its
surroundings, once with a plain look and once with its own trick (zoom / contrast / re-compare).
If the trick makes the area stand out MORE than the plain look, the score goes up; if the
plain look was fooled by something that the trick removes, it goes down. A tool cannot invent
evidence: its trick is applied to the area AND its surroundings alike.
"""
import cv2
import numpy as np

from detector import compare, region_score, score_from_peak, snr

PAD = 24  # extra pixels around the box, so we can measure normal noise nearby


def _crop(img, box, pad=PAD):
    x, y, w, h = box
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(img.shape[1], x + w + pad), min(img.shape[0], y + h + pad)
    return img[y0:y1, x0:x1], (x - x0, y - y0, w, h)   # crop + box position inside crop


def _inside_mask(shape, box, scale=1):
    x, y, w, h = [int(v * scale) for v in box]
    m = np.zeros(shape[:2], bool)
    m[y:y + h, x:x + w] = True
    return m


def _diff_picture(diff):
    """Turn a difference map into a colour picture (bright = big difference)."""
    d = np.clip(diff * 255 / max(1.0, float(diff.max())), 0, 255).astype(np.uint8)
    return cv2.applyColorMap(d, cv2.COLORMAP_INFERNO)


def _final_score(tool_diff, base_diff, inside, base_inside, peak, normal):
    """Turn what the tool saw into a score on the detector's scale."""
    if normal is None or peak is None:                  # uncalibrated: plain noise-based score
        return region_score(tool_diff, inside)
    base = max(snr(base_diff, base_inside), 1e-3)
    factor = float(np.clip(snr(tool_diff, inside) / base, 0.25, 4.0))
    return score_from_peak(peak * factor, normal)


def zoom(test_img, ref_img, box, peak=None, normal=None, factor=4):
    """Look closer: enlarge the area. Small defects stop being blurred away."""
    t0, b = _crop(test_img, box)
    r0, _ = _crop(ref_img, box)
    base = compare(t0, r0)
    t = cv2.resize(t0, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)
    r = cv2.resize(r0, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)
    diff = compare(t, r, k=9, edge_gain=factor)
    score = _final_score(diff, base, _inside_mask(diff.shape, b, factor), _inside_mask(base.shape, b),
                         peak, normal)
    return {"tool": "zoom", "score": score, "image": t}


def adjust_contrast(test_img, ref_img, box, peak=None, normal=None):
    """Make faint marks easier to see by stretching local brightness (CLAHE)."""
    t0, b = _crop(test_img, box)
    r0, _ = _crop(ref_img, box)
    base = compare(t0, r0)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
    t = clahe.apply(cv2.cvtColor(t0, cv2.COLOR_BGR2GRAY))
    r = clahe.apply(cv2.cvtColor(r0, cv2.COLOR_BGR2GRAY))
    diff = compare(t, r)
    score = _final_score(diff, base, _inside_mask(diff.shape, b), _inside_mask(base.shape, b), peak, normal)
    big = cv2.resize(t, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    return {"tool": "contrast", "score": score, "image": cv2.cvtColor(big, cv2.COLOR_GRAY2BGR)}


def compare_reference(test_img, ref_img, box, peak=None, normal=None, max_shift=3):
    """Compare with the good sample again, after fixing small misalignment.
    Tries sliding the reference by a few pixels and keeps the shift that matches best
    in the normal (non-suspicious) area, so a tiny camera shift is not mistaken for a defect."""
    pad = PAD + max_shift
    t, b = _crop(test_img, box, pad)
    r, _ = _crop(ref_img, box, pad)
    inside = _inside_mask(t.shape, b)
    ring = cv2.dilate(inside.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    m = max_shift

    base = compare(t, r)[m:-m, m:-m]
    base_inside = inside[m:-m, m:-m]
    best = None
    for dy in range(-max_shift, max_shift + 1):
        for dx in range(-max_shift, max_shift + 1):
            d = compare(t, np.roll(r, (dy, dx), axis=(0, 1)))[m:-m, m:-m]
            cost = float(d[~ring[m:-m, m:-m]].mean())    # how well the normal parts match
            if best is None or cost < best[0]:
                best = (cost, d)
    diff = best[1]
    score = _final_score(diff, base, base_inside, base_inside, peak, normal)
    side_by_side = np.hstack([t[m:-m, m:-m], r[m:-m, m:-m], _diff_picture(diff)])
    return {"tool": "compare", "score": score,
            "image": cv2.resize(side_by_side, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)}


TOOLS = {"zoom": zoom, "contrast": adjust_contrast, "compare": compare_reference}
