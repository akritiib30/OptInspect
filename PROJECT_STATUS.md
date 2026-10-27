# Project status

OptiInspect ("Inspection that takes a second look"), OpenCV AI Competition 2026. Folder: `D:\cv`.
**The project is complete as a self-contained local system. It uses no cloud service.**

## Done
- Detector (alignment, lighting match, edge-tolerant difference, calibrated scoring), 3 tools, adaptive agent with a safety rule, hash-linked audit log with `.head` file, wrong-photo rejection, real MVTec bottle product (reference + calibration).
- Local accounts: sign up, sign in, three roles (administrator, reviewer, viewer), lockout, CSRF, password change, people management, command-line help (`manage_users.py`).
- React app: animated front page with an in-page demo, sign in / sign up, Dashboard, Inspect (batch upload), Inspections (list and grid), Inspection detail (Photo / Reference / Difference / Blend / Split, zoom, comments), Review, Audit log (verify everything), Insights, Products (create from your own photos), Team, Settings, Help, command palette, notifications, dark and light themes, phone layout.
- Labs: Stress test (paint a defect, live verdict, sensitivity sweep), Challenge (you against the agent, with a leaderboard), Tolerance lab (move the decision lines over all 83 real photos). Plus a defect heat map in Insights and camera capture in Inspect.
- Tests: `python smoke_test.py` (136 checks), `python eval_agent.py bottle` (83 real photos).
- Submission files in `D:\cv\submission\` (README, PROJECT_REPORT, ARCHITECTURE, DEMO_SCRIPT, SUBMISSION_CHECKLIST, BUILT_WITH).

## Results (83 real photos, full agent)
57 of 63 defects confirmed, 3 sent to a person, 3 missed, 0 good bottles wrongly confirmed. Detector-only AUROC about 0.98.

## Run
`python server.py`, then open http://127.0.0.1:5000 (the built app is in `frontend/dist`). To change the interface: `cd frontend; npm install; npm run build`.

## Left for the author
Read the competition rules (it lists AWS), create your account, record the demo (`submission/DEMO_SCRIPT.md`), screenshots, GitHub (`git init`, check `git status` first).

## Not used / archived
Amazon Bedrock and all AWS work: code kept in `archive_aws/`, never run against real AWS, not part of the submission. The first interface (plain JavaScript) is kept in `archive_old_ui/`.

## Limits to disclose
Rules choose the next check (no AI model); 3 faint contamination misses; only bottle tested; settings partly tuned on the test photos; accounts are local files (no email, no two-step sign-in, open sign-up by default); the front-page demo is recorded, not live; log is tamper-evident not tamper-proof.
