# OptiInspect

**Inspection that takes a second look.**

OptiInspect is a visual inspection system built with **OpenCV 5**. It finds defects, scores its own confidence, **tries other ways of looking when unsure** (zoom, contrast, re-compare with a good reference), **escalates unresolved cases to a person** with the exact region shown, and keeps a **tamper-evident decision log** that records who did what.

Built for the OpenCV AI Competition 2026. **It runs entirely on one computer and uses no cloud service** (no AWS, no Bedrock).

## How it works
1. A photo is compared with a calibrated good-product reference.
2. Wrong inputs (answer masks, blank images, other products) are rejected as `INVALID_PHOTO`.
3. The detector lines up the photos, matches lighting, forgives small edge mismatches, and scores each difference from 0 to 1.
4. Score >= 0.70: confirmed defect. Score <= 0.15: normal. In between: the agent tries up to 3 extra checks.
5. **Safety rule:** extra checks may confirm a defect, never dismiss one. If they only lower the score, a person decides.
6. Unresolved cases go to the Review page (whole photo plus a zoomed view of the region). A person answers defect / ok / not sure.
7. Every step goes into a hash-linked log (`logs/*.jsonl` plus a `.head` file). The Audit log page reports whether it was altered.

## The app
A React app (served by the Flask backend) with a public front page and a signed-in workspace.

- **Front page:** a live animated scanner, an inspection demo you can run in the page (recorded scores, not a live upload), a walkthrough of how the agent decides, the results below, and FAQ.
- **Sign up / sign in:** local accounts. **The first account created becomes the administrator.**
- **Dashboard:** latest photo with its boxes, the agent's steps, defects waiting for a person, live counters, charts, system health.
- **Inspect:** drop a photo or a whole folder, paste an image, or take photos with a camera; choose the product and watch the pipeline run.
- **Inspections:** search, filter, list or grid view, CSV export (administrators can also download a full zip of results, logs and comments from Team). Each one opens to a viewer with Photo, Reference, Difference, Blend and Split views, zoom and pan, defect cards with the score track and every step, comments, and an inline decision.
- **Review:** the queue of unsure cases, with keys D, O, U, S.
- **Audit log:** timeline of every event, a "verify every log" check, filters.
- **Insights:** outcomes per day, how the extra checks help, people against the agent, and a heat map of where confirmed defects happen.
- **Products** (build a new product from 50 or more good photos), **Team** (administrator), **Settings**, **Help**.

### The labs
Three pages for testing the agent yourself. They run the same agent as the rest of the app and write nothing to your record (except the stress test's Save button).
- **Stress test:** paint a bright or dark mark onto a good photo, and the agent inspects it as you paint, with its steps and score track. A sweep paints the same mark at eight strengths and shows where the agent stops noticing, asks a person, or confirms. On the bottle photos (which are dark), a bright stain at one spot was confirmed from about 13% strength, while a dark one there needed roughly 70% or more before the agent reacted at all (one spot on one photo; it varies with position).
- **Challenge:** you and the agent judge the same real MVTec test photos, round by round. Say defect or fine, point at the defect, then see the real defect outline, the agent's boxes and who scored. The agent may ask for help instead of guessing, which scores nothing. It has a home advantage: it was tuned on these same photos. A leaderboard keeps the best game per person on this computer.
- **Tolerance lab:** drag the agent's two decision lines over all 83 real test photos and see how many defects it would miss, how many false alarms it would raise, and how many photos would need a person, with a trade-off map of every pair of lines. The replay uses the agent's own rule on stored scores; at three different pairs of lines it matches the real agent photo by photo (checked in `smoke_test.py`).

The challenge and the tolerance lab need the MVTec bottle folder next to `server.py`; without it they say so and the rest of the app works normally.
- Command palette (Ctrl+K), notifications, dark / light / system theme, reduced-motion option, works at phone width.

Roles: **administrator** (everything, including people and products), **reviewer** (inspect, decide, comment), **viewer** (read only).

## Run it
Tested with Python 3.14 on Windows. The built app is included (`frontend/dist`), so Node is not needed to run it.
```powershell
pip install -r requirements.txt
python server.py          # open http://127.0.0.1:5000 and create your account
```
Without the dataset, only the uncalibrated `demo` product (synthetic photos) is available.

Account help from the command line:
```powershell
python manage_users.py list
python manage_users.py create someone@example.com "Their Name" --role reviewer
python manage_users.py reset someone@example.com        # sets a new temporary password
python manage_users.py role someone@example.com viewer  # change someone's role
```

### Changing the interface
Needs Node.js (built and tested with Node 24).
```powershell
cd frontend
npm install
npm run dev       # live reload on http://127.0.0.1:5173 (the API proxy expects python server.py running)
npm run build     # writes frontend/dist, which server.py serves
```

### Using the real bottle product
The MVTec AD dataset is **not included** (license CC BY-NC-SA 4.0). Download the `bottle` category yourself, place the folder `bottle/` (with `train/`, `test/`, `ground_truth/`) next to `server.py`, then:
```powershell
python build_product.py bottle bottle     # builds products/bottle (reference + calibration + samples)
python server.py
```

## Tests (need the bottle dataset and product built)
```powershell
python smoke_test.py             # 136 end-to-end checks: accounts, roles, CSRF, lockout, inspection, review, audit log, tamper detection, wrong inputs, export, security headers, and the three labs
python eval_mvtec.py bottle      # detector only, 83 real photos
python eval_agent.py bottle      # full agent, 83 real photos
```
The smoke test writes everything (including its test accounts) to a temporary folder and deletes it afterwards, so it never touches your accounts or inspections.

### Making the demo video
`python demo_video\make_demo.py` records a narrated video of the real app with nothing to download: it starts a throwaway copy of the app, drives it in Chrome, speaks the script with the built-in Windows voice, and joins picture and sound with the video engine that is part of Windows (build the small joiner once with `powershell -NoProfile -File demo_video\build_winmux.ps1`). Add `--quick` to check the clicking without recording. The narration is a synthetic voice; say so if you publish it. `submission/VIDEO_SCRIPT_FOR_AI.md` has a script and screenshot list for AI presenter websites.

## Results (83 real MVTec bottle photos, full agent)

| Photo type | Photos | Confirmed | Sent to a person | Missed / cleared |
|---|---:|---:|---:|---:|
| Good | 20 | 0 | 1 | 19 correctly OK |
| Broken, large | 20 | 20 | 0 | 0 |
| Broken, small | 22 | 19 | 3 | 0 |
| Contamination | 21 | 18 | 0 | 3 missed |

57 of 63 defects confirmed, 3 escalated, 3 missed, 0 good bottles wrongly confirmed. Detector-only AUROC about 0.98. Flagged box on the real defect in 60 of 63.
**Caveat:** the "edge forgiveness" setting was chosen while looking at these same test photos, so figures are somewhat optimistic. The "normal" level was calibrated on separate good training photos.

## Limitations
- The competition materials list AWS services; this project does not use any. The tool-choosing step uses simple rules, not an AI model. (The unused Bedrock code is kept in `archive_aws/`; it was never run against a real AWS account.)
- Accounts are local files on one machine: no email, no password recovery by email, no two-step sign-in. Sign-up is open by default (an administrator can close it in Team), and the first account becomes the administrator.
- The demo on the front page replays recorded scores; it does not analyse a photo.
- Stress-test results depend on where the mark is and on its colour: the bottle photos are dark, so dark marks hide. Painted marks are a probe of the detector, not a measure of real-world defects.
- The tolerance lab only moves the two decision lines. It does not retune the detector, and the live system keeps the lines it was built with. Because the lines and the edge setting were chosen on these photos, lines that look perfect there would do worse on new ones.
- Camera capture needs a camera, a browser that allows it (Chrome or Edge), and the app opened at 127.0.0.1.
- 3 faint contamination defects are missed (the detector's first look scores them too low).
- Only the bottle product is tested. Photos are shrunk to 256 px, which can hide tiny defects.
- The wrong-photo check rejects clearly wrong pictures; a similar-looking different item could pass.
- The log is tamper-evident, not tamper-proof: someone able to rewrite both the log and its `.head` file defeats it.
- The server is for one machine (127.0.0.1, debug off), not production.

## Built with
OpenCV 5.0.0.93, NumPy, Flask, React 19, Vite, React Router, Framer Motion, Lucide icons, Bricolage Grotesque (SIL Open Font License). See `submission/BUILT_WITH.md`.

## Attribution
Evaluated on MVTec AD: Bergmann, Fauser, Sattlegger, Steger, "MVTec AD: A Comprehensive Real-World Dataset for Unsupervised Anomaly Detection", CVPR 2019. License CC BY-NC-SA 4.0 (non-commercial). Code license: not yet chosen.
