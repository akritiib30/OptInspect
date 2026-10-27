"""Run the whole inspection on every test photo and print a simple report."""
import cv2

from agent import inspect
from logger import verify

ref = cv2.imread("data/good.png")
for name in ["good_2", "defect_easy", "defect_tiny", "defect_shifted", "defect_faint"]:
    img = cv2.imread(f"data/{name}.png")
    r = inspect(img, ref, name)
    print(f"\n=== {name}: {r['verdict']}   (log: {r['log_path']}, intact: {verify(r['log_path'])})")
    for d in r["defects"]:
        print(f"   defect {d['defect']} at {d['box']}: {d['status']}  score {d['final_score']:.2f}"
              f"  tools tried: {d['tools_tried'] or '-'}")
