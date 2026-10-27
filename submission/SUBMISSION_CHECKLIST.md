# Submission checklist

I do not know this competition's exact required deliverables. **Check the official page and rules first.** The competition materials list AWS technology; this project does not use it, so make sure the rules allow that.

## Verified
- [x] All Python files compile.
- [x] `python smoke_test.py`: 136/136 pass (accounts and roles, lockout, CSRF, inspection, human review, tamper detection, invalid photos, export, product creation, security headers, stress test, challenge, tolerance lab).
- [x] `npm run build` in `frontend/` succeeds; `frontend/dist` is the build the server serves.
- [x] Interface checked in a browser on a throwaway copy: front page, sign-up, every signed-in page including the three labs, command palette, camera capture (with a stand-in camera), dark and light themes, and phone and tablet width (no sideways scrolling on any page). No console errors.
- [x] `python eval_agent.py bottle`: 57 confirmed, 3 sent to review, 3 missed, 0 good bottles wrongly confirmed.
- [x] `.gitignore` excludes datasets, derived MVTec files, logs, accounts and the session key (`userdata/`), `node_modules`.
- [x] README, report, architecture, demo script written. No document claims AWS or Bedrock use.

## You must do before submitting
1. [ ] Read the competition rules: required items, repository, video length, whether AWS is required, deadline.
2. [ ] Run `python server.py`, open http://127.0.0.1:5000, create your account (the first account is the administrator), then record the demo with `DEMO_SCRIPT.md`, or use the ready-made narrated video `demo_video/OptiInspect_demo.mp4` (made by `demo_video/make_demo.py`; the voice is synthetic, so say so). Upload it to YouTube or Vimeo if the entry form asks for a link. Take 3 to 4 screenshots (front page, result with boxes and steps, review screen, audit log).
3. [ ] If a repository is required: `git init`, check `git status` shows no dataset folders, no `products/bottle`, no `userdata/` and no `node_modules/`, then commit and push.
4. [ ] Add a code license if you publish (not yet chosen).
5. [ ] Keep the MVTec attribution (CC BY-NC-SA 4.0). Do not upload dataset images.

## Disclose
- No cloud service is used. The next check is chosen by simple rules.
- 3 faint contamination defects are missed; only the bottle product was tested.
- The edge-forgiveness setting was explored on the same test photos, so results are somewhat optimistic.
- Accounts are local files (no email, no two-step sign-in); sign-up is open by default. The log is tamper-evident, not tamper-proof.
- The front-page demo replays recorded scores; it is not a live upload.
- The labs are probes. Painted defects are synthetic, the challenge favours the agent (it was tuned on those photos), and the tolerance lab replays the same photos the settings were chosen on.

## Archived
`archive_aws/` holds earlier Amazon Bedrock code, and `archive_old_ui/` holds the first plain-JavaScript interface that the React app replaced. Neither is part of the submission. Do not mention the AWS code as a feature.

