# Project Report: OptiInspect, an adaptive visual inspection agent

## 1. Overview
OptiInspect ("Inspection that takes a second look") is an inspection system that detects defects in product photos, scores how sure it is, and **adapts when unsure**: it re-inspects with zoom, contrast adjustment, or a re-comparison with a good reference, and escalates unresolved cases to a human who sees the exact region of concern. Every decision is recorded in a tamper-evident log.

**Status in one paragraph:** the full pipeline runs on one computer with OpenCV 5.0.0.93 and was evaluated on 83 real MVTec AD bottle photos. It uses no cloud service: the competition materials mention AWS, but this submission deliberately does not use it, and the choice of the next check is made by simple rules, not by an AI model.

## 2. Problem
Automated visual inspection often gives one confident answer even when it should not. Missing a defect is costly; false alarms waste review time. The goal: a system that knows when it is unsure, tries to resolve that itself, hands the rest to a person with evidence, and can be audited afterwards.

## 3. Method (what is implemented)

### 3.1 Comparing with a reference (`detector.py`)
1. **Alignment:** `cv2.phaseCorrelate` for rough shift, then `cv2.findTransformECC` (Euclidean) for fine shift and small rotation; falls back to the rough fix if ECC does not converge.
2. **Lighting match:** robust fit `test = a*reference + b`, ignoring pixels that disagree (defects).
3. **Edge-tolerant difference:** `GaussianBlur`, absolute difference, divided by `1 + EDGE_K * edge strength` (Sobel). Edges never line up perfectly; this was the single biggest improvement on real photos (AUROC 0.82 -> 0.98).
4. **Reference building:** median of 40 good training photos, each aligned to the first.
5. **Defect candidates:** threshold, morphological open, `findContours`, nearby blobs merged (one scratch = one defect).

### 3.2 Calibrated scoring
The first version divided by the photo's own noise estimate. On clean real photos this made leftover edge differences look "certain" (all 20 good bottles wrongly flagged). The fix is calibration: the biggest difference seen on 40 *other* good training photos defines "normal" (13.8 for bottle). Score: at most 0.15 when the peak is at or below normal; 0.70 at twice normal; approaching 1.0 beyond. Candidates weaker than 0.7 x normal are ignored.

### 3.3 Adaptive agent (`agent.py`, `tools.py`)
- Confirm at score >= 0.70; clear at <= 0.15; otherwise up to **3 extra checks** (zoom 4x, CLAHE contrast, re-compare with small shift search).
- A tool's score is the detector's score scaled by how much more the area stands out *with* the trick than *without* it, so a tool cannot invent evidence.
- **Safety rule:** checks may confirm but never dismiss. Without this rule, 3 real small defects were cleared by the checks in testing.
- The choice of the next check is made by a swappable decider. This project uses simple rules (small defects: zoom first; otherwise compare, then contrast, then zoom).

### 3.4 Input safety
Photos whose overall shape matches the reference below 0.85 (real photos: 0.97+; masks, screws, blank and noise images: 0.15 or less) or where over 30% of pixels differ are rejected as `INVALID_PHOTO`. Found after a user uploaded an answer-mask image and the system answered "defect confirmed, 1.00".

### 3.5 Human review and audit log
- Review page: whole photo with the box plus a zoomed crop; decisions defect / ok / not sure with an optional note. One review per defect; no overwriting. The signed-in person's name is stored with every decision and comment.
- `logger.py`: each event stores the hash of the previous line; a `.head` file records the final step count and hash, so editing or deleting the **last** entries is also detected (found by the smoke test; the original chain missed this).

## 4. OpenCV 5 usage
`phaseCorrelate`, `findTransformECC`, `warpAffine`, `GaussianBlur`, `Sobel`, `absdiff`, `morphologyEx`, `findContours`, `boundingRect`, `createCLAHE`, `resize`, `applyColorMap`, `imdecode`/`imread`. Installed version: `opencv-python 5.0.0.93`.

## 5. Evaluation
Data: MVTec AD "bottle", 83 test photos, shrunk to 256 px. Reference from 40 good training photos; "normal" calibrated on 40 different good training photos.

| Photo type | Photos | Confirmed | Sent to human | Missed / cleared |
|---|---:|---:|---:|---:|
| Good | 20 | 0 | 1 | 19 correctly OK |
| Broken, large | 20 | 20 | 0 | 0 |
| Broken, small | 22 | 19 | 3 | 0 |
| Contamination | 21 | 18 | 0 | 3 missed |

- 57/63 defects confirmed, 3 escalated, 3 missed, 0 good bottles wrongly confirmed.
- Detector-only AUROC about 0.98; flagged box on the true defect in 60/63.
- Automated check: `smoke_test.py` 136/136 (accounts and roles, sign-in lockout, CSRF, inspection, review with named reviewers, audit log and tamper detection, wrong inputs, export, product creation, image and file serving, security headers, and the three labs).
- The interface was also checked by eye in a browser at desktop, tablet and phone widths, in dark and light themes, with no console errors.

**Validity caveats:** the edge-forgiveness setting (2.0) was explored on these same test photos, so the figures are somewhat optimistic. A single product (bottle) was tested; other products need their own reference and calibration. Scores near 0.70 are sensitive (resize method alone moved one case from 0.68 to 0.71).

## 5a. Testing the agent: the labs
Three pages let a person probe the agent instead of trusting the table above. All run the real `agent.inspect()`.
- **Stress test.** A defect is painted onto a good photo (a soft blob or a thin line, blended toward white or black) and inspected live. A sweep paints the same mark at eight strengths. On the dark bottle photos a bright stain at one spot was confirmed from about 13% strength (the first look was unsure and the extra checks confirmed it), while a dark stain at that spot needed roughly 70% or more before the agent reacted at all. Dark marks on dark parts hide. This is a probe of the detector, not a measure of real defects, and it varies with position.
- **Challenge.** A person and the agent judge the same real test photos. The agent was tuned on these photos, so it has an advantage; it may also ask for help, which scores nothing.
- **Tolerance lab.** Each real test photo's scores are stored once (first look plus what every extra check would say), and the agent's own decision rule is replayed for any pair of decision lines. At the agent's lines it reproduces the measured table exactly (57 confirmed, 3 to a person, 3 missed; 19 good passed, 1 to a person), and at two other pairs of lines it matches the real agent photo by photo (tested). It shows the trade-off between missed defects, false alarms and workload for people. It does not retune the live system.

## 6. Deployment
A Flask app on one computer (127.0.0.1, debug off, 10 MB upload limit, safe file names) serving a React interface. Sign-in uses local accounts (scrypt password hashes, signed cookie sessions, CSRF header, three roles, lockout after repeated failures). No cloud service is used. See `ARCHITECTURE.md`.

## 7. Limitations
1. No cloud service is used, although the competition materials mention AWS. The next check is chosen by rules, not an AI model.
2. 3 faint contamination defects missed (never reach the extra checks).
3. Only bottle tested; 256 px downscale may hide tiny defects.
4. Wrong-photo check catches clearly wrong images only.
5. Accounts are local files: no email, no emailed password reset, no two-step sign-in; sign-up is open by default and the first account becomes the administrator.
6. Log is tamper-evident, not tamper-proof.
7. Local development server only.
8. The demo on the front page replays recorded scores; it does not analyse an uploaded photo.
9. The labs are probes: painted defects are synthetic, the challenge favours the agent, and the lab's decision lines were chosen on the same photos it replays.

## 8. Future work
Cloud hosting; trying an AI model to choose the next check and measuring whether it beats the simple rules; higher-resolution inspection of suspicious regions; email and two-step sign-in; anchoring the log in an external store; evaluation on more MVTec categories with a held-out tuning split.

## 9. Data and attribution
MVTec AD (Bergmann et al., CVPR 2019), CC BY-NC-SA 4.0, non-commercial. Dataset images are not redistributed in this project.
