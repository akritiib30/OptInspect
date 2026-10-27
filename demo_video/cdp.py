"""A very small Chrome DevTools Protocol client written with only the Python standard library.

It starts Chrome (headless, with a throwaway profile), sends it commands over a WebSocket, drives the mouse and
keyboard like a person would, and saves the frames Chrome streams while the page changes (a "screencast").
"""
import base64
import json
import os
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request

CHROME_PATHS = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]

# A gold ring that follows the mouse, so people watching can see where the clicks are.
CURSOR_JS = """
(() => {
  const make = () => {
    if (document.getElementById('__cursor')) return;
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;width:26px;height:26px;border-radius:50%;' +
      'background:rgba(255,200,87,.30);border:2px solid #ffc857;transform:translate(-50%,-50%);left:-60px;top:-60px;' +
      'transition:transform .1s,background .1s;box-shadow:0 0 18px rgba(255,200,87,.5)';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'translate(-50%,-50%) scale(.6)'; c.style.background = 'rgba(255,200,87,.85)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = 'translate(-50%,-50%) scale(1)'; c.style.background = 'rgba(255,200,87,.30)'; }, true);
  };
  if (document.documentElement) make(); else addEventListener('DOMContentLoaded', make);
  window.__find = (sel, text, mode) => [...document.querySelectorAll(sel)].find(e => {
    if (e.disabled) return false;
    const x = (e.textContent || '').replace(/\\s+/g, ' ').trim();
    return mode === 'start' ? x.startsWith(text) : mode === 'has' ? x.includes(text) : x === text;
  }) || null;
  window.__center = (e) => { e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
})();
"""


class WebSocket:
    """Just enough of RFC 6455 to talk to Chrome: text messages, ping/pong, fragments."""

    def __init__(self, url):
        hostport, path = url[5:].split("/", 1)
        host, port = hostport.split(":")
        self.sock = socket.create_connection((host, int(port)), timeout=15)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                           f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("Chrome closed the connection")
            buf += chunk
        head, self.buf = buf.split(b"\r\n\r\n", 1)
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise ConnectionError("WebSocket handshake refused: " + head.split(b"\r\n")[0].decode())
        self.sock.settimeout(None)
        self.send_lock = threading.Lock()

    def _frame(self, opcode, data):
        header = bytearray([0x80 | opcode])
        n = len(data)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            header += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mask = os.urandom(4)
        header += mask
        return bytes(header) + bytes(b ^ mask[i % 4] for i, b in enumerate(data))

    def send(self, text):
        with self.send_lock:
            self.sock.sendall(self._frame(0x1, text.encode("utf-8")))

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(max(65536, n - len(self.buf)))
            if not chunk:
                raise ConnectionError("Chrome closed the connection")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        message = b""
        while True:
            b1, b2 = self._read(2)
            fin, op, n = b1 & 0x80, b1 & 0x0F, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n)
            if op == 0x8:
                raise ConnectionError("Chrome closed the connection")
            if op == 0x9:
                with self.send_lock:
                    self.sock.sendall(self._frame(0xA, payload))
                continue
            if op in (0x0, 0x1, 0x2):
                message += payload
                if fin:
                    return message.decode("utf-8")

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


class Chrome:
    def __init__(self, width=1280, height=720, scale=1.5, port=9333, frames_dir=None):
        exe = next((p for p in CHROME_PATHS if os.path.exists(p)), None)
        if not exe:
            raise RuntimeError("Chrome or Edge was not found.")
        self.width, self.height, self.scale = width, height, scale
        self.profile = tempfile.mkdtemp(prefix="opti_chrome_")
        self.frames_dir = frames_dir or tempfile.mkdtemp(prefix="opti_frames_")
        os.makedirs(self.frames_dir, exist_ok=True)
        self.proc = subprocess.Popen([exe, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={self.profile}",
                                      f"--window-size={width},{height}", "--hide-scrollbars", "--mute-audio", "--no-first-run",
                                      "--no-default-browser-check", "--disable-extensions", "--force-color-profile=srgb",
                                      "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
                                      "--disable-backgrounding-occluded-windows", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        target = None
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2))
                target = next((t for t in tabs if t.get("type") == "page"), None)
                if target:
                    break
            except OSError:
                pass
            time.sleep(0.2)
        if not target:
            self.close()
            raise RuntimeError("Chrome did not start.")
        self.ws = WebSocket(target["webSocketDebuggerUrl"])
        self._id, self._waiters, self._id_lock = 0, {}, threading.Lock()
        self.frames, self.errors, self.t0, self.mx, self.my = [], [], None, 40, 40
        self._alive = True
        threading.Thread(target=self._reader, daemon=True).start()
        self.call("Page.enable")
        self.call("Runtime.enable")
        self.call("DOM.enable")
        self.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": scale, "mobile": False})
        self.call("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-color-scheme", "value": "dark"}]})
        self.call("Page.addScriptToEvaluateOnNewDocument", {"source": CURSOR_JS})

    # ----- plumbing -----
    def _reader(self):
        while self._alive:
            try:
                msg = json.loads(self.ws.recv())
            except Exception:
                break
            if "id" in msg:
                w = self._waiters.get(msg["id"])
                if w:
                    w[1] = msg
                    w[0].set()
            elif msg.get("method") == "Page.screencastFrame":
                p = msg["params"]
                path = os.path.join(self.frames_dir, f"{len(self.frames):06d}.jpg")
                with open(path, "wb") as f:
                    f.write(base64.b64decode(p["data"]))
                self.frames.append((time.time(), path))
                try:
                    self._send("Page.screencastFrameAck", {"sessionId": p["sessionId"]}, wait=False)
                except Exception:
                    break
            elif msg.get("method") == "Runtime.exceptionThrown":
                self.errors.append(msg["params"]["exceptionDetails"].get("exception", {}).get("description", "page exception"))
            elif msg.get("method") == "Runtime.consoleAPICalled" and msg["params"].get("type") == "error":
                self.errors.append(" ".join(str(a.get("value", a.get("description", ""))) for a in msg["params"].get("args", [])))

    def _send(self, method, params=None, wait=True, timeout=60):
        with self._id_lock:
            self._id += 1
            mid = self._id
        waiter = [threading.Event(), None]
        if wait:
            self._waiters[mid] = waiter
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        if not wait:
            return None
        if not waiter[0].wait(timeout):
            raise TimeoutError(f"{method} did not answer")
        res = self._waiters.pop(mid)[1]
        if "error" in res:
            raise RuntimeError(f"{method}: {res['error'].get('message')}")
        return res.get("result", {})

    def call(self, method, params=None, timeout=60):
        return self._send(method, params, True, timeout)

    # ----- the page -----
    def eval(self, expression, await_promise=False, timeout=60):
        r = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": await_promise}, timeout)
        if "exceptionDetails" in r:
            raise RuntimeError("page error: " + (r["exceptionDetails"].get("exception", {}).get("description") or r["exceptionDetails"].get("text", "")))
        return r["result"].get("value")

    def goto(self, url):
        self.call("Page.navigate", {"url": url})
        self.wait_until("document.readyState === 'complete' && !!document.querySelector('#root') && document.querySelector('#root').children.length > 0", 30)

    def wait_until(self, js, timeout=30, interval=0.1):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.eval(f"!!({js})"):
                    return True
            except RuntimeError:
                pass
            time.sleep(interval)
        raise TimeoutError(f"waited {timeout}s for: {js[:90]}")

    def point(self, selector, text=None, mode="eq"):
        """Where an element is (its centre in page pixels), after scrolling it into view. None if it is not there."""
        js = (f"(() => {{ const e = window.__find({json.dumps(selector)}, {json.dumps(text)}, {json.dumps(mode)}); return e ? window.__center(e) : null; }})()"
              if text is not None else
              f"(() => {{ const e = document.querySelector({json.dumps(selector)}); return e ? window.__center(e) : null; }})()")
        return self.eval(js)

    # ----- mouse and keyboard -----
    def _mouse(self, kind, x, y, buttons=0, button="none", clicks=0):
        self.call("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "buttons": buttons, "button": button, "clickCount": clicks})

    def glide(self, x, y, seconds=0.6, buttons=0):
        steps = max(6, int(seconds / 0.022))
        x0, y0 = self.mx, self.my
        for i in range(1, steps + 1):
            t = i / steps
            e = t * t * (3 - 2 * t)                                  # ease in and out
            self._mouse("mouseMoved", x0 + (x - x0) * e, y0 + (y - y0) * e, buttons, "left" if buttons else "none")
            time.sleep(seconds / steps)
        self.mx, self.my = x, y

    def click_at(self, x, y, settle=0.5):
        self.glide(x, y)
        time.sleep(0.15)
        self._mouse("mousePressed", x, y, 1, "left", 1)
        time.sleep(0.08)
        self._mouse("mouseReleased", x, y, 0, "left", 1)
        time.sleep(settle)

    def click(self, selector, text=None, mode="eq", settle=0.5, timeout=20):
        end = time.time() + timeout
        pt = None
        while time.time() < end:
            pt = self.point(selector, text, mode)
            if pt:
                break
            time.sleep(0.15)
        if not pt:
            raise TimeoutError(f"could not find {selector} {text or ''}")
        time.sleep(0.12)                                             # let the scroll settle, then measure again
        pt = self.point(selector, text, mode) or pt
        self.click_at(pt[0], pt[1], settle)

    def drag(self, x0, y0, path, seconds=1.0):
        """Press at (x0, y0), move through the points in path, release at the last one."""
        self.glide(x0, y0, 0.5)
        time.sleep(0.12)
        self._mouse("mousePressed", x0, y0, 1, "left", 1)
        for (x, y) in path:
            self.glide(x, y, seconds / max(1, len(path)), buttons=1)
        self._mouse("mouseReleased", self.mx, self.my, 0, "left", 1)

    def type(self, text, delay=0.05):
        for ch in text:
            self.call("Input.insertText", {"text": ch})
            time.sleep(delay)

    def key(self, key, code=None, vk=0, text=None):
        base = {"key": key, "code": code or key, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}
        self.call("Input.dispatchKeyEvent", {"type": "keyDown", **base, **({"text": text} if text else {})})
        self.call("Input.dispatchKeyEvent", {"type": "keyUp", **base})

    def scroll(self, total, seconds=2.0):
        steps = max(1, int(seconds / 0.04))
        for _ in range(steps):
            self.eval(f"window.scrollBy({{top: {total / steps}, behavior: 'instant'}})")
            time.sleep(0.04)

    def scroll_to_top(self):
        self.eval("window.scrollTo({top: 0, behavior: 'instant'})")

    def set_files(self, selector, paths):
        doc = self.call("DOM.getDocument", {"depth": 0})
        node = self.call("DOM.querySelector", {"nodeId": doc["root"]["nodeId"], "selector": selector})
        self.call("DOM.setFileInputFiles", {"files": paths, "nodeId": node["nodeId"]})

    def screenshot(self, path):
        with open(path, "wb") as f:
            f.write(base64.b64decode(self.call("Page.captureScreenshot", {"format": "png"})["data"]))

    # ----- recording -----
    def start_recording(self):
        self.t0 = time.time()
        self.call("Page.startScreencast", {"format": "jpeg", "quality": 88, "maxWidth": int(self.width * self.scale),
                                           "maxHeight": int(self.height * self.scale), "everyNthFrame": 2})

    def stop_recording(self):
        t_end = time.time() - self.t0
        try:
            self.call("Page.stopScreencast", timeout=10)
        except Exception:
            pass
        return t_end

    def close(self):
        self._alive = False
        try:
            self.ws.close()
        except Exception:
            pass
        if getattr(self, "proc", None):
            self.proc.terminate()
            try:
                self.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        shutil.rmtree(self.profile, ignore_errors=True)
