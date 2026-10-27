# Script for an AI video website (HeyGen and similar)

This is an honest script. It shows only what OptiInspect really does. It does **not** mention AWS, Bedrock, Lambda or IAM
as features, because the project uses none of them. If you want to mention them, the only true way is as future work
(see the last line of the closing).

## First, which tool to use in HeyGen

Your screenshot shows **Creative Studio > Video > "Describe your shot"**. That box *invents* new footage from a
sentence. If you describe your app there, it will draw an imaginary interface with garbled text, not your real one,
and a judge will see that it does not match your project.

Use it only for a **presenter** (an avatar that speaks your script) and put your **real screenshots or screen
recording** behind or beside them:
1. Open the **Avatar** area (left bar), choose an avatar and a voice, and paste the narration below as the script.
2. Upload your real screenshots (list below) as the scene backgrounds or as pictures next to the presenter.
3. Keep the video between 3 and 5 minutes.

The better option is a real screen recording of the running app with a voice on top. That is what the recorder in
`demo_video/make_demo.py` makes for you with no website at all.

## Screenshots to capture (press Windows + Shift + S, run `python server.py`, open http://127.0.0.1:5000)

| File name | What to show |
|---|---|
| 01-front-page.png | The front page top (name, tagline, animated scanner) |
| 02-features.png | The "What it does" cards (including Try to fool it, You against the agent, Move the lines yourself) |
| 03-signup.png | The sign-up page |
| 04-dashboard.png | The dashboard after a few inspections |
| 05-good-bottle.png | An inspection of **Good 0**: verdict Passed |
| 06-broken-bottle.png | An inspection of **Broken large 0**: numbered boxes on the photo |
| 07-agent-steps.png | The defect card with the score track and the steps (Detector, Compare, Contrast, Zoom) |
| 08-difference-split.png | The Difference heat map, or the Split view |
| 09-needs-a-person.png | **Broken small 0**: "Needs a person" |
| 10-review.png | The Review page with the zoomed region |
| 11-audit-intact.png | The Audit log after "Verify every log": "Every log is intact" |
| 12-not-the-product.png | The answer-mask photo refused as "Not the product" |
| 13-stress-sweep.png | Stress test, after "Run the sweep" |
| 14-challenge-reveal.png | Challenge, after answering a round (green defect outline) |
| 15-tolerance-lab.png | Tolerance lab with the two gold decision lines |
| 16-hotspots.png | Insights: the heat map "Where defects happen" |
| 17-results.png | The home page "How it did on real photos" section |

## Narration (paste this as the script, about 4 minutes)

OptiInspect is a visual inspector built with OpenCV 5. It finds defects, scores how sure it is, looks again when it is
unsure, asks a person when it still cannot decide, and keeps a record that nobody can quietly change.

Accounts are local to one computer. The first account becomes the administrator, and there are three roles:
administrator, reviewer and viewer.

First, a normal bottle. The photo is lined up with a calibrated good reference, scored, and found to be fine. Now a
broken bottle: the defects are found and each one is marked with a numbered box.

For every defect the agent shows each step it took. When the first look is unsure, it compares again, boosts the
contrast and zooms in. A check can raise a score, but it can never clear a defect. If the checks only make a defect
look less likely, the case goes to a person, who sees the exact region, decides, and adds a note under their own name.

Every step is written to an audit log. Each entry carries a fingerprint of the one before it, and one click checks that
nothing was changed. Wrong inputs, like this answer mask, are refused instead of answered with a guess.

There are three labs for testing the agent yourself. In the stress test, a mark is painted on a clean bottle at eight
strengths and the real agent judges each one. In the challenge, you and the agent judge the same real photos. In the
tolerance lab, you drag the agent's decision lines over all eighty three real photos and see what it would have done.

On eighty three real MVTec AD bottle photos, the agent confirmed fifty seven of sixty three defects, sent three to a
person, and missed three faint ones. No good bottle was wrongly confirmed. The settings were chosen on those same
photos, so the results are somewhat optimistic, and only bottles were tested.

Everything runs on one computer, with no cloud service. The test photos come from the MVTec AD dataset, used here for
non-commercial research. Moving the system to a cloud service is future work, not part of this project.

## A short prompt you can paste into the presenter or "describe" box

Presenter in a clean modern studio, friendly and calm, speaking directly to the camera, medium shot, slow gentle
camera movement. The presenter explains a software project called OptiInspect. Do not invent any software screens,
logos, charts, cloud icons or text: leave the area beside the presenter empty, because real screenshots of the
application will be placed there. No Amazon, AWS or cloud logos anywhere.

## Do not

- Do not put AWS, Bedrock, Lambda, IAM or any cloud logo in the video. They are not in the project.
- Do not let the AI draw the interface. Always use your real screenshots or recording.
- Do not say the agent is an AI model. It uses OpenCV and simple rules.
- Do not remove "settings were chosen on the same photos" and "only bottles were tested". They keep you credible.
