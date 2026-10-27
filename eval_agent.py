"""Run the FULL agent (detector + tools + decisions) on every real test photo.

Run:  python eval_agent.py bottle        (needs: python build_product.py bottle bottle)
Compares the detector alone with the finished agent, so we can see whether the tools help.
"""
import glob
import json
import os
import shutil
import sys
import tempfile

import cv2

from agent import RuleDecider, inspect
from eval_mvtec import load

name = sys.argv[1]
ref = cv2.imread(f"products/{name}/reference.png")
normal = json.load(open(f"products/{name}/calibration.json"))["normal"]
work = tempfile.mkdtemp()                                  # logs and pictures go here, then are deleted

rows = {}
for kind in sorted(os.listdir(f"{name}/test")):
    counts = {"CONFIRMED": 0, "NEEDS_REVIEW": 0, "CLEARED/OK": 0}
    moved = {"up": 0, "down": 0}
    for path in sorted(glob.glob(f"{name}/test/{kind}/*.png")):
        r = inspect(load(path), ref, f"{kind}", RuleDecider(), out_dir=work, normal=normal, log_dir=work)
        statuses = [d["status"] for d in r["defects"]]
        worst = "CONFIRMED" if "CONFIRMED" in statuses else "NEEDS_REVIEW" if "NEEDS_REVIEW" in statuses else "CLEARED/OK"
        counts[worst] += 1
        for d in r["defects"]:
            if d["tools_tried"]:
                moved["up" if d["final_score"] > d["history"][0]["score"] else "down"] += 1
    rows[kind] = (counts, moved)

print(f"{'kind':16s}{'photos':>7s}{'confirmed':>11s}{'review':>8s}{'cleared/ok':>12s}   tools: score up / down")
for kind, (c, m) in rows.items():
    print(f"{kind:16s}{sum(c.values()):>7d}{c['CONFIRMED']:>11d}{c['NEEDS_REVIEW']:>8d}{c['CLEARED/OK']:>12d}"
          f"   {m['up']} / {m['down']}")
shutil.rmtree(work, ignore_errors=True)
