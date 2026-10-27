# Demo script (about 6 minutes; cut the labs scenes for a 4 minute version)

The inspection scores below come from the engine and are repeatable (checked on 2026-10-27). The screens were rebuilt afterwards as a React app, so **rehearse once** and adjust the wording to what you see.

## Before recording
1. In PowerShell:
   ```powershell
   cd D:\cv
   Remove-Item store, logs -Recurse -ErrorAction SilentlyContinue
   python server.py
   ```
   (Press Ctrl+C first if an old server is running. Clearing `store` and `logs` gives an empty history. Your account stays, because accounts live in `userdata`.)
2. Open http://127.0.0.1:5000 in Chrome with a wide window.
3. First time only: click **Get started** and make your account. The first account becomes the administrator. Then sign out so the recording can start from the front page.
4. Keep this file path ready for the last inspection: `D:\cv\bottle\ground_truth\broken_large\000_mask.png`.

## Script

| Time | Action | Say | You should see |
|---|---|---|---|
| 0:00 | Front page | "OptiInspect is a visual inspector built with OpenCV 5. It finds defects, scores how sure it is, looks again when unsure, asks a person when it still cannot decide, and keeps a record nobody can quietly change." | The animated scanner and the tagline "Inspection that takes a second look." |
| 0:25 | Scroll to the in-page demo and run it | "This demo replays recorded scores so you can see the idea without a login. The real thing is next." | The lens scan, boxes, and the agent's steps |
| 0:45 | **Sign in** | "Accounts are local. There are three roles: administrator, reviewer and viewer." | Dashboard: "Nothing inspected yet" |
| 1:00 | **Inspect**. Under "Or use a real test photo", click **Good 0**, then **Inspect 1 photo** | "First, a normal bottle." | Pipeline animation, then the result: **Passed**, no defects |
| 1:20 | **Inspect**, **Broken large 0**, **Inspect 1 photo**, then open the result | "Now a broken bottle." | **Defect found**, numbered boxes on the photo |
| 1:30 | Defect 1 card on the right | "The first look was unsure, 0.53. The agent tried a fresh comparison, 0.44, then contrast, 0.24, and then zoom raised it to 0.93, so it is confirmed. Each dot on this track is one look." | Steps: Detector 0.53, Compare 0.44, Contrast 0.24, Zoom 0.93, **Defect confirmed** |
| 1:55 | Click **Difference**, then **Split** and drag the handle | "The heat map shows where it differs from the good sample. The split view compares the good sample with this photo on the same spot. You can zoom and pan." | Heat map, then the split view |
| 2:20 | **Inspect**, **Broken small 0**, **Inspect 1 photo** | "This one it cannot settle. After extra checks the score stays low, and the system never clears a defect just because a check lowered the score." | **Needs a person** (Detector 0.68, Compare 0.68, Contrast 0.07) |
| 2:35 | **Review** (or the button on the dashboard) | "The person sees the whole photo and a zoomed view of the exact region." | The review screen with the zoomed region |
| 2:50 | Type a short note, click **It is a defect** | "The decision is saved with my name and the note." | A saved message and an empty queue |
| 3:05 | **Audit log**, then **Verify again** | "Every step is recorded: what the detector found, which checks the agent chose and why, and who decided. Each entry carries a fingerprint of the one before it, and the page confirms nothing was changed." | Green "Every log is intact", timeline with your name on the review |
| 3:30 | **Inspect**, add `000_mask.png` from your computer, **Inspect 1 photo** | "Wrong inputs are refused instead of answered with a guess. This is an answer mask, not a photo." | **Not the product**, with the reason |
| 3:45 | **Stress test** (Labs). Leave **Good 0** selected, choose **Bright** and click **Run the sweep** | "Can you fool it? Here I paint the same bright mark on a clean bottle at eight strengths, and the real agent judges each one." | A chart: the first three marks are not noticed, then a person is asked, then confirmed. Text: "On its own it confirms the mark from 13% strength. It asks a person from 9%. Up to 6% it did not notice anything." |
| 4:15 | Paint a stroke on the photo (drag across the rim), or click **Bright chip** | "It inspects as I paint. This is the same agent, with the same steps." | The mark, a box, the verdict, and the score track with each check |
| 4:35 | **Challenge**, **Start** (6 rounds). Answer one round: press **D**, then click the damage | "Now me against the agent on real test photos. After each answer I see the truth, the real defect outline, and what the agent decided." | The photo, then the reveal: green defect outline, the agent's boxes, both scores |
| 5:05 | **Tolerance lab**. Wait for "Replaying the real photos" to finish, then drag the **confirm** line down | "Every real photo, placed by the agent's first look. I move its decision lines and see what it would have done: missed defects, false alarms, and how many need a person. At its own lines it misses three and raises no false alarms." | Dots changing colour as the line moves, and the numbers below updating |
| 5:35 | Click **Fewest mistakes**, then **The agent's lines** | "It can find the best trade-off, but these lines were chosen on these same photos, so I would not trust them on new ones." | The lines jump, then return |
| 5:50 | **Dashboard** | "Everything runs on one computer with OpenCV 5 on real MVTec bottle photos: 57 of 63 defects confirmed, 3 sent to a person, 3 missed, and no good bottle wrongly confirmed. It uses no cloud service." | Latest photo, counters and the live feed |

## Notes
- If a scene shows a different score, do not edit it: clear `store` and `logs`, restart the server, and run the steps in the same order.
- The `Not the product` photo can be uploaded at any point.
- On first use the tolerance lab replays all 83 photos (about 10 seconds); do that once before recording so the scene is instant. Press **Ctrl+K** at any time to jump to a page. Switching to the light theme (sun icon, top right) makes a good closing shot.
