"""Tests the Bedrock decision code with a SIMULATED Bedrock (no AWS account, no network).

This proves our code handles good answers, bad answers and outages. It does NOT prove that real
Bedrock works: for that, run check_bedrock.py once AWS credentials exist.
Run:  python test_bedrock_offline.py
"""
import os
import sys
from unittest.mock import MagicMock

import cv2

os.environ["BEDROCK_MODEL_ID"] = "simulated-model"
from agent import RuleDecider, inspect
from bedrock_decider import BedrockDecider

ref = cv2.imread("products/bottle/reference.png")
img = cv2.resize(cv2.imread("bottle/test/broken_small/000.png"), (256, 256))
defect = {"area": 80, "box": (100, 100, 20, 20)}
history = [{"by": "detector", "score": 0.5, "reason": "first look"}]
ok = []


def check(name, cond):
    ok.append(cond)
    print(f"[{'PASS' if cond else 'FAIL'}] {name}")


def reply(tool):
    return {"output": {"message": {"content": [{"toolUse": {"input": {"tool": tool, "reason": "r"}}}]}}}


d = BedrockDecider(RuleDecider())
d.client = MagicMock()

d.client.converse.return_value = reply("contrast")
tool, _ = d.choose(defect, [], history, img, ref)
check("valid answer is used", tool == "contrast" and d.last_who == "bedrock-agent")

sent = d.client.converse.call_args.kwargs
has_image = any("image" in block for block in sent["messages"][0]["content"])
check("request includes the region picture", has_image)
check("request forces a structured answer", sent["toolConfig"]["toolChoice"] == {"tool": {"name": "pick_check"}})

d.client.converse.return_value = reply("delete_everything")
tool, why = d.choose(defect, [], history, img, ref)
check("tool outside the allowed list falls back to rules", d.last_who == "rule-fallback" and tool in ("zoom", "compare", "contrast"))

d.client.converse.return_value = reply("zoom")
tool, _ = d.choose(defect, ["zoom"], history, img, ref)
check("already-used tool is not accepted again", d.last_who == "rule-fallback" and tool != "zoom")

d.client.converse.side_effect = Exception("network down")
tool, why = d.choose(defect, [], history, img, ref)
check("outage falls back and says so", d.last_who == "rule-fallback" and "unavailable" in why)

d.client.converse.side_effect = None
d.client.converse.return_value = reply("zoom")
r = inspect(img, ref, "mock", decider=d, normal=__import__("json").load(open("products/bottle/calibration.json"))["normal"],
            out_dir=os.path.join(os.environ.get("TEMP", "."), "bd_test"), log_dir=os.path.join(os.environ.get("TEMP", "."), "bd_test"))
check("full inspection completes with the simulated Bedrock", r["verdict"] in ("DEFECT", "NEEDS_REVIEW", "OK"))

print(f"\n{sum(ok)}/{len(ok)} checks passed")
sys.exit(0 if all(ok) else 1)
