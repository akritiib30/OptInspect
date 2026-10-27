"""Makes a narrated demo video of OptiInspect, with nothing to download.

It starts a throwaway copy of the app (temporary accounts, inspections and logs, so your real data is never touched),
drives it in Chrome like a person would (a gold ring shows the mouse), speaks the script with the built-in Windows
voice, saves the screen as it changes, and joins picture and sound into demo_video/OptiInspect_demo.mp4 using the
video engine that is part of Windows.

Run from D:\\cv:   python demo_video\\make_demo.py            (about 15 minutes: 7 minutes of recording, then encoding)
Try the clicking only, fast, with no sound:   python demo_video\\make_demo.py --quick

Needs: Chrome, the bottle product built (python build_product.py bottle bottle), and the MVTec bottle folder (for the
challenge and the tolerance lab).
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import Chrome                                                    # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "OptiInspect_demo.mp4")
WORK = os.path.join(HERE, "work")
WINMUX = os.path.join(HERE, "WinMux.exe")
PORT = 5057
URL = f"http://127.0.0.1:{PORT}"
MASK = os.path.join(ROOT, "bottle", "ground_truth", "broken_large", "000_mask.png")
VOICE = "Microsoft Zira Desktop"
FPS = 30

# A test account that exists only on the throwaway copy.
NAME, EMAIL, PASSWORD = "Demo Admin", "demo@example.com", "Demo-Only-Pass-4821"

SCRIPT = {
    "intro": "OptiInspect is a visual inspector built with Open C V five. It finds defects, scores how sure it is, looks again when it is unsure, asks a person when it still cannot decide, and keeps a record that nobody can quietly change.",
    "landing": "The front page explains the idea. The little pictures show how each feature behaves, and further down are the measured results. There are even three labs for testing the agent yourself. The real thing is next.",
    "signup": "Accounts are local to this computer. The first account becomes the administrator. There are three roles: administrator, reviewer, and viewer.",
    "dash": "This is the dashboard. Nothing has been inspected yet, so let us inspect a first photo.",
    "good": "First, a normal bottle. The photo is lined up with a calibrated good reference, scored, and found to be fine.",
    "broken": "Now a broken bottle. The defects are found and each one is marked with a numbered box.",
    "steps": "The agent shows every step it took for each defect. When the first look is unsure, it compares again, boosts the contrast and zooms in, and each dot on this track is one look.",
    "heat": "The difference view shows where the photo departs from the good sample, and the split view lines the two up on the same spot. You can zoom and pan.",
    "small": "This one the agent cannot settle. After its extra checks the score stays low, and the system never clears a defect just because a check lowered the score. It hands the case to a person.",
    "review": "The reviewer sees the exact region, decides, and adds a note. The decision is saved under their name.",
    "audit": "Every step is written to an audit log. Each entry carries a fingerprint of the one before it, and this page checks that nothing was changed.",
    "mask": "Wrong inputs are refused instead of answered with a guess. This is an answer mask, not a photo of a bottle, so it is rejected, with the reason.",
    "stress": "Now the labs. In the stress test, a mark is painted on a clean bottle at eight strengths, and the real agent judges each one. It confirms this mark from thirteen percent strength, asks a person from nine percent, and notices nothing below that. Bright marks are easy on these dark photos, while dark marks would hide.",
    "paint": "I can also paint my own mark. The real agent inspects it as I paint, and shows every step of its reasoning.",
    "challenge": "In the challenge, you and the agent judge the same real photos. After each answer, the truth is revealed: the real defect outline, what the agent decided, and who scores. The agent may ask for help instead of guessing, which scores nothing.",
    "lab": "The tolerance lab replays all eighty three real photos. I can drag the agent's decision lines and see what it would have done: missed defects, false alarms, and how many photos need a person. At its own lines it misses three, raises no false alarms, and asks a person on four. Its settings were chosen on these same photos, so this shows the trade off, not a guarantee.",
    "insights": "Insights shows how the extra checks help, how people compare with the agent, and a heat map of where confirmed defects happen, which often points to one worn tool or one mould.",
    "outro": "On eighty three real M V Tec bottle photos, the agent confirmed fifty seven of sixty three defects, sent three to a person, and missed three faint ones. No good bottle was wrongly confirmed. Everything runs on one computer, with no cloud service. The test photos come from the M V Tec A D dataset, used here for non commercial research.",
}
ORDER = list(SCRIPT)

PEEK_JS = """
(async () => {
  const img = document.querySelector('.ch-photo img');
  const blob = await (await fetch(img.src)).blob();
  const me = await (await fetch('/api/auth/me')).json();
  const f = new FormData(); f.append('image', blob, 'peek.jpg'); f.append('product', 'bottle');
  const r = await (await fetch('/api/stress/try', { method: 'POST', headers: { 'X-CSRF-Token': me.csrf }, body: f })).json();
  const hit = (r.defects || []).filter(d => d.status === 'CONFIRMED').sort((a, b) => b.final_score - a.final_score)[0];
  if (!hit) return { defect: false };
  const [W, H] = r.work_size, [x, y, w, h] = hit.box;
  return { defect: true, x: (x + w / 2) / W, y: (y + h / 2) / H };
})()
"""
MORE_INSPECTIONS_JS = """
(async () => {
  const me = await (await fetch('/api/auth/me')).json();
  for (const n of ['broken_large_1', 'broken_small_1', 'contamination_0', 'contamination_1', 'good_1'])
    await fetch('/api/inspect-sample/bottle/' + n, { method: 'POST', headers: { 'X-CSRF-Token': me.csrf } });
  return 1;
})()
"""


def speak(scene, text):
    """Narration with the Windows voice: returns (wav path, seconds)."""
    txt, wav = os.path.join(WORK, f"{scene}.txt"), os.path.join(WORK, f"{scene}.wav")
    with open(txt, "w", encoding="utf-8") as f:
        f.write(text)
    ps = ("Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
          f"$s.SelectVoice('{VOICE}'); $s.Rate = 0; $s.SetOutputToWaveFile('{wav}'); $s.Speak([IO.File]::ReadAllText('{txt}')); $s.Dispose()")
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
    with wave.open(wav) as w:
        return wav, w.getnframes() / w.getframerate()


def wait_for_server():
    for _ in range(80):
        try:
            urllib.request.urlopen(f"{URL}/api/health", timeout=1)
            return
        except OSError:
            time.sleep(0.5)
    raise RuntimeError("the throwaway server did not start")


def encode(frames, t0, t_end, size, path):
    """Turn the saved screen frames into a steady 30 frames per second video (a frame is held until the next one arrives)."""
    if not frames:
        raise RuntimeError("no frames were recorded")
    vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"), FPS, size, [cv2.VIDEOWRITER_PROP_QUALITY, 100])
    if not vw.isOpened():
        raise RuntimeError("could not open the video writer")
    total, i, current, shown = int(t_end * FPS), -1, np.zeros((size[1], size[0], 3), np.uint8), None
    for k in range(total):
        t = k / FPS
        while i + 1 < len(frames) and frames[i + 1][0] - t0 <= t:
            i += 1
        if i != shown and i >= 0:
            img = cv2.imdecode(np.fromfile(frames[i][1], np.uint8), cv2.IMREAD_COLOR)
            current = img if img.shape[1] == size[0] and img.shape[0] == size[1] else cv2.resize(img, size, interpolation=cv2.INTER_AREA)
            shown = i
        vw.write(current)
    vw.release()
    return total / FPS


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="click through fast with no narration or video, to check the steps work")
    ap.add_argument("--scale", type=float, default=1.0, help="1 gives a 1280x720 video (Chrome streams 1280x720 frames, so a bigger value only enlarges them)")
    args = ap.parse_args()
    quick = args.quick
    pace = 0.12 if quick else 1.0

    for need in (MASK, os.path.join(ROOT, "products", "bottle")):
        if not os.path.exists(need):
            sys.exit(f"Missing {need}. Build the bottle product first (python build_product.py bottle bottle).")
    if not quick and not os.path.exists(WINMUX):
        sys.exit("WinMux.exe is missing. Build it with: powershell -NoProfile -File demo_video\\build_winmux.ps1")
    if os.path.isdir(WORK):
        shutil.rmtree(WORK)
    os.makedirs(WORK)

    narration = {}
    if not quick:
        print("Making the narration ...")
        narration = {k: speak(k, v) for k, v in SCRIPT.items()}
        print(f"  {sum(d for _, d in narration.values()):.0f} seconds of speech")

    tmp = tempfile.mkdtemp(prefix="opti_demo_")
    env = dict(os.environ, OPTI_PORT=str(PORT), OPTI_DATA_DIR=os.path.join(tmp, "userdata"),
               OPTI_STORE_DIR=os.path.join(tmp, "store"), OPTI_LOGS_DIR=os.path.join(tmp, "logs"))
    server = subprocess.Popen([sys.executable, "server.py"], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ch = None
    placed, failures = [], []

    def pause(s):
        time.sleep(s * pace)

    try:
        wait_for_server()
        ch = Chrome(1280, 720, args.scale, frames_dir=os.path.join(WORK, "frames"))
        ch.goto(URL)
        ch.start_recording()

        def nav(label):
            ch.click("a.nav-item .nav-label", label)
            pause(1.0)

        def inspect_sample(label, then_back=True):
            ch.wait_until("document.querySelector('.sample')", 20)
            ch.click(".sample", label)
            pause(0.8)
            ch.click("button", "Inspect 1 photo", "has", settle=0.2)
            ch.wait_until("location.pathname.startsWith('/app/inspections/') && document.querySelector('.vw .vp img')", 60)
            pause(1.5)

        def play_round():
            ch.wait_until("(() => { const i = document.querySelector('.ch-photo img'); return i && i.complete && i.naturalWidth > 0; })()", 20)
            pause(2.2)
            res = ch.eval(PEEK_JS, await_promise=True)             # the scripted player looks for a confirmed defect, like a good inspector would
            if res["defect"]:
                ch.key("d", "KeyD", 68, "d")
                pause(0.7)
                r = ch.eval("(() => { const b = document.querySelector('.ch-photo').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")
                ch.click_at(r[0] + res["x"] * r[2], r[1] + res["y"] * r[3], settle=0.4)
            else:
                ch.key("o", "KeyO", 79, "o")
            ch.wait_until("document.querySelector('.ch-truth')", 20)
            pause(4.5)

        def intro():
            ch.glide(640, 380, 1.0)
            pause(2.0)

        def landing():
            ch.eval("document.querySelector('#features').scrollIntoView({block: 'start', behavior: 'instant'}); window.scrollBy({top: -70, behavior: 'instant'})")
            for _ in range(4):
                pause(2.4)
                ch.scroll(620, 1.4)
            ch.eval("document.querySelector('#results').scrollIntoView({block: 'start', behavior: 'instant'}); window.scrollBy({top: -70, behavior: 'instant'})")
            pause(3.5)

        def signup():
            ch.scroll_to_top()
            pause(0.6)
            ch.click("a", "Get started")
            ch.wait_until("location.pathname === '/signup'")
            pause(1.0)
            for sel, text in (('input[placeholder="Ada Okafor"]', NAME), ('input[placeholder="you@company.com"]', EMAIL), ('input[placeholder="At least 8 characters"]', PASSWORD)):
                ch.click(sel, settle=0.2)
                ch.type(text, 0.045 * pace)
            pause(0.6)
            ch.click("button", "Create account", "start", settle=0.2)
            ch.wait_until("location.pathname.startsWith('/app')", 30)
            pause(1.5)
            ch.eval("fetch('/api/lab/data').then(() => 1)")          # let the tolerance lab prepare itself while the video goes on

        def dash():
            pause(2.5)
            nav("Inspect")

        def good():
            inspect_sample("Good 0")
            pause(3.0)
            nav("Inspect")

        def broken():
            inspect_sample("Broken large 0")
            pause(1.5)
            p = ch.point(".vbox")
            if p:
                ch.glide(p[0], p[1], 0.8)
            pause(1.0)

        def steps():
            ch.scroll(560, 2.5)
            pause(2.5)
            ch.scroll(300, 1.5)
            pause(1.5)

        def heat():
            ch.scroll_to_top()
            pause(0.6)
            ch.click(".seg button", "Difference", settle=2.2)
            ch.click(".seg button", "Split", settle=1.0)
            r = ch.eval("(() => { const b = document.querySelector('.vw-slider').getBoundingClientRect(); return [b.left, b.top + b.height / 2, b.width]; })()")
            ch.drag(r[0] + r[2] * 0.5, r[1], [(r[0] + r[2] * 0.85, r[1]), (r[0] + r[2] * 0.2, r[1])], 2.0)
            pause(1.0)
            ch.click(".seg button", "Photo", settle=0.5)
            nav("Inspect")

        def small():
            inspect_sample("Broken small 0")
            ch.scroll(520, 2.2)
            pause(2.5)

        def review():
            ch.scroll_to_top()
            nav("Review")
            ch.wait_until("window.__find('button', 'It is a defect', 'start')", 20)
            pause(2.0)
            ch.click(".filter-chip", "Chip or crack", settle=0.4)
            ch.click("button", "It is a defect", "start", settle=2.5)

        def audit():
            nav("Audit log")
            ch.wait_until("window.__find('button', 'Verify', 'start')", 20)
            pause(1.0)
            ch.click("button", "Verify", "start", settle=3.0)
            ch.scroll(520, 2.5)
            pause(1.0)

        def mask():
            ch.scroll_to_top()
            nav("Inspect")
            ch.wait_until("document.querySelector('.dropzone')", 20)
            ch.glide(640, 420, 0.6)
            ch.set_files("input[type=file]", [MASK])
            pause(1.6)
            ch.click("button", "Inspect 1 photo", "has", settle=0.2)
            ch.wait_until("location.pathname.startsWith('/app/inspections/')", 60)
            pause(2.0)
            ch.scroll(520, 2.2)
            pause(1.5)

        def stress():
            ch.scroll_to_top()
            nav("Stress test")
            ch.wait_until("document.querySelector('.painter-canvas')", 20)
            pause(1.5)
            ch.click("button", "Run the sweep", "start", settle=0.3)
            ch.wait_until("document.querySelector('.sweep-chart')", 40)
            pause(1.5)
            ch.eval("document.querySelector('.sweep-chart').scrollIntoView({block: 'center', behavior: 'instant'})")
            pause(6.0)

        def paint():
            ch.scroll_to_top()
            pause(0.5)
            r = ch.eval("(() => { const b = document.querySelector('.painter-canvas').getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; })()")
            at = lambda fx, fy: (r[0] + fx * r[2], r[1] + fy * r[3])
            ch.drag(*at(0.62, 0.30), [at(0.66, 0.36), at(0.70, 0.41), at(0.74, 0.46)], 1.4)
            ch.wait_until("document.querySelector('.st-stamp')", 20)
            pause(3.5)

        def challenge():
            ch.scroll_to_top()
            nav("Challenge")
            ch.click("button", "6 rounds", settle=0.5)
            ch.click("button", "Start", settle=0.5)
            play_round()
            ch.key("Enter", "Enter", 13, "\r")
            pause(0.8)
            play_round()

        def lab():
            nav("Tolerance lab")
            ch.wait_until("document.querySelector('.lb-svg')", 90)
            pause(2.5)
            p = ch.eval("(() => { const d = [...document.querySelectorAll('.lb-dot')][60]; d.scrollIntoView({block: 'center', behavior: 'instant'}); const r = d.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
            ch.glide(p[0], p[1], 0.9)
            pause(3.0)
            g = ch.point('.lb-line[aria-label="Confirm at or above"] circle')
            tx = ch.eval("(() => { const s = document.querySelector('.lb-svg'), r = s.getBoundingClientRect(); return r.left + ((236 + 0.38 * (968 - 236)) / 1000) * r.width; })()")
            ch.drag(g[0], g[1], [(g[0] + (tx - g[0]) * 0.6, g[1]), (tx, g[1])], 2.4)
            pause(3.0)
            ch.click("button", "Fewest mistakes", "has", settle=3.0)
            ch.click("button", "The agent's lines", "has", settle=2.0)

        def insights():
            ch.eval(MORE_INSPECTIONS_JS, await_promise=True)
            ch.scroll_to_top()
            nav("Insights")
            pause(2.0)
            ch.eval("document.querySelector('.hs').scrollIntoView({block: 'center', behavior: 'instant'})")
            pause(7.0)

        def outro():
            ch.scroll_to_top()
            nav("Dashboard")
            pause(3.0)
            ch.click("button[aria-label^='Switch to']", settle=2.5)
            ch.click("button[aria-label^='Switch to']", settle=1.5)

        scenes = {k: v for k, v in locals().items() if k in SCRIPT and callable(v)}
        for sid in ORDER:
            start = time.time() - ch.t0
            if not quick:
                placed.append((narration[sid][0], start + 0.5))
            print(f"  {sid:10s} at {start:6.1f}s" + (f", {narration[sid][1]:4.1f}s of speech" if not quick else ""))
            try:
                scenes[sid]()
            except Exception as e:                                           # keep recording; the shot is checked afterwards
                failures.append((sid, str(e)))
                try:
                    ch.screenshot(os.path.join(WORK, f"FAILED_{sid}.png"))
                except Exception:
                    pass
                print(f"    ! {sid}: {e}")
            if not quick:
                left = narration[sid][1] + 1.0 - (time.time() - ch.t0 - start)
                if left > 0:
                    time.sleep(left)
        time.sleep(1.5 * pace)
        t_end = ch.stop_recording()
        frames, t0, errors = list(ch.frames), ch.t0, list(ch.errors)
        print(f"Recorded {t_end:.0f} seconds, {len(frames)} frames, {len(errors)} page errors")
        for e in errors[:5]:
            print("   page error:", e[:160])
        ch.close(); ch = None
    finally:
        if ch:
            ch.close()
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(tmp, ignore_errors=True)

    if failures:
        print("\nSome steps did not work:")
        for sid, why in failures:
            print(f"  {sid}: {why}")
    if quick:
        print("\nQuick run finished" + (" with problems above." if failures else ": every step worked."))
        return 1 if failures else 0

    size = (int(1280 * args.scale), int(720 * args.scale))
    silent = os.path.join(WORK, "silent.mp4")
    print("Encoding the picture ...")
    seconds = encode(frames, t0, t_end, size, silent)
    print(f"  {seconds:.0f} s, {os.path.getsize(silent) / 1e6:.0f} MB")
    print("Joining picture and narration ...")
    clips = ";".join(f"{wav}@{at:.2f}" for wav, at in placed)
    subprocess.run([WINMUX, silent, OUT, "1080" if args.scale >= 1.4 else "720", clips, "3500000"], check=True)
    shutil.rmtree(os.path.join(WORK, "frames"), ignore_errors=True)
    os.remove(silent)
    print(f"\nDone: {OUT} ({os.path.getsize(OUT) / 1e6:.0f} MB, {seconds / 60:.1f} minutes)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
