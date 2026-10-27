"""The agent: when the detector is unsure, it tries other ways of looking.

For every defect the detector finds:
  score >= CONFIRM  -> confirmed defect, done
  score <= DISMISS  -> looks like noise, cleared
  in between        -> unsure: pick a tool, run it, re-score. Repeat up to MAX_TRIES.
  still unsure      -> escalate to a human, with a picture of the exact region.

WHO picks the tool is a swappable piece (a "decider"). This project uses simple rules
(RuleDecider below). Another decider with the same choose() method can be plugged in.
"""
import os
import uuid

import cv2

from detector import CONFIRM_SCORE as CONFIRM
from detector import DISMISS_SCORE as DISMISS
from detector import (MIN_STRUCTURE, WRONG_PHOTO_SHARE, detect, prepare, share_unlike_reference,
                      structure_match)
from logger import DecisionLog
from tools import TOOLS

MAX_TRIES = 3
# A missed defect is worse than a false alarm. So extra checks may CONFIRM a defect, but when
# they only make it look less likely, a human decides instead of the system clearing it.
TOOLS_CAN_DISMISS = False


class RuleDecider:
    """Simple stand-in for the AI brain. Returns which tool to try and why."""
    who = "rule-agent"

    def choose(self, defect, tried, history, test_img=None, ref_img=None):
        remaining = [t for t in TOOLS if t not in tried]
        if defect["area"] < 100 and "zoom" in remaining:
            return "zoom", "defect is small, so look closer first"
        for tool, why in [("compare", "re-check against the good sample, fixing small shifts"),
                          ("contrast", "faint mark, boost local contrast"),
                          ("zoom", "last option, look closer")]:
            if tool in remaining:
                return tool, why
        return None, "no tools left"


def get_decider():
    """The decider the agent uses unless one is passed in."""
    return RuleDecider()


def make_review_image(img, box, path):
    """Picture for the human: whole photo with the region circled, next to a zoomed crop."""
    x, y, w, h = box
    marked = img.copy()
    cv2.rectangle(marked, (x - 6, y - 6), (x + w + 6, y + h + 6), (0, 0, 255), 2)
    pad = 20
    crop = img[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad]
    crop = cv2.resize(crop, (marked.shape[0], marked.shape[0]), interpolation=cv2.INTER_CUBIC)
    cv2.imwrite(path, cv2.hconcat([marked, crop]))


def inspect(test_img, ref_img, name="photo", decider=None, out_dir="out/evidence", normal=None,
            log_dir="logs", actor=None):
    decider = decider or get_decider()
    inspection_id = f"{name}-{uuid.uuid4().hex[:6]}"
    log = DecisionLog(inspection_id, log_dir)
    log.add("inspection_started", who=actor or "system", photo=name, calibrated=normal is not None,
            normal_level=None if normal is None else round(normal, 1))

    results = []
    ref_img = prepare(test_img, ref_img)           # line the reference up once; tools reuse it
    if normal is not None:                         # e.g. a mask, a blank image, another product
        shape = structure_match(test_img, ref_img)
        share = share_unlike_reference(test_img, ref_img, normal)
        if shape < MIN_STRUCTURE or share > WRONG_PHOTO_SHARE:
            reason = (f"the picture shape matches the reference only {shape:.2f} (real photos: 0.97+)"
                      if shape < MIN_STRUCTURE else f"{share:.0%} of the photo differs from the reference")
            log.add("input_rejected", structure_match=round(shape, 2), share_unlike=round(share, 2),
                    reason=reason)
            log.add("inspection_finished", verdict="INVALID_PHOTO")
            return {"inspection_id": inspection_id, "verdict": "INVALID_PHOTO", "defects": [],
                    "log_path": log.path, "reason": reason}
    defects = detect(test_img, ref_img, normal)
    log.add("detector_finished", defects_found=len(defects))

    for i, d in enumerate(defects):
        score, tried = d["score"], []
        history = [{"by": "detector", "score": d["score"], "reason": "first look"}]
        log.add("defect_found", defect=i, box=list(d["box"]), area=d["area"], score=score)

        while CONFIRM > score > DISMISS and len(tried) < MAX_TRIES:
            tool, reason = decider.choose(d, tried, history, test_img, ref_img)
            if tool is None:
                break
            log.add("tool_chosen", who=getattr(decider, "last_who", decider.who), defect=i,
                    tool=tool, reason=reason, score_before=score)
            res = TOOLS[tool](test_img, ref_img, d["box"], d["peak"], normal)
            tried.append(tool)
            history.append({"by": tool, "score": res["score"], "reason": reason})
            log.add("tool_result", defect=i, tool=tool, score_before=score, score_after=res["score"])
            score = res["score"]

        if score >= CONFIRM:
            status = "CONFIRMED"
        elif score <= DISMISS and (not tried or TOOLS_CAN_DISMISS):
            status = "CLEARED"
        else:
            status = "NEEDS_REVIEW"     # includes: tools lowered the score, but a human must agree
        item = {"defect": i, "box": d["box"], "final_score": score, "status": status,
                "tools_tried": tried, "history": history}
        if status == "NEEDS_REVIEW":
            os.makedirs(out_dir, exist_ok=True)
            item["review_image"] = os.path.join(out_dir, f"{inspection_id}_defect{i}.png")
            make_review_image(test_img, d["box"], item["review_image"])
        log.add("decision", defect=i, status=status, final_score=score, tools_tried=tried,
                review_image=item.get("review_image"))
        results.append(item)

    statuses = {r["status"] for r in results}
    verdict = "DEFECT" if "CONFIRMED" in statuses else "NEEDS_REVIEW" if "NEEDS_REVIEW" in statuses else "OK"
    log.add("inspection_finished", verdict=verdict)
    return {"inspection_id": inspection_id, "verdict": verdict, "defects": results,
            "log_path": log.path}
