"""Decision log: a write-once diary of everything the system did and why.

Each line is one event. Each event also stores a fingerprint (hash) of the line before it,
so if anyone edits or deletes an old line, verify() will notice the chain is broken.
The same format could later be copied to an external store to anchor it.
"""
import hashlib
import json
import os
from datetime import datetime, timezone


class DecisionLog:
    def __init__(self, inspection_id, folder="logs"):
        os.makedirs(folder, exist_ok=True)
        self.path = os.path.join(folder, f"{inspection_id}.jsonl")
        self.inspection_id = inspection_id
        self.step = 0
        self.prev_hash = "start"

    @classmethod
    def resume(cls, inspection_id, folder="logs"):
        """Open an existing log and continue the chain where it stopped."""
        log = cls(inspection_id, folder)
        with open(log.path, encoding="utf-8") as f:
            lines = [ln.rstrip("\n") for ln in f if ln.strip()]
        log.step = json.loads(lines[-1])["step"]
        log.prev_hash = hashlib.sha256(lines[-1].encode()).hexdigest()
        return log

    def add(self, event, who="system", **details):
        self.step += 1
        row = {"inspection_id": self.inspection_id, "step": self.step,
               "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
               "who": who, "event": event, "details": details, "prev_hash": self.prev_hash}
        line = json.dumps(row, sort_keys=True)
        self.prev_hash = hashlib.sha256(line.encode()).hexdigest()
        with open(self.path, "a", encoding="utf-8") as f:   # 'a' = only ever add to the end
            f.write(line + "\n")
        with open(self.path + ".head", "w", encoding="utf-8") as f:   # where the chain ends now
            json.dump({"step": self.step, "hash": self.prev_hash}, f)
        return row


def verify(path):
    """True if no line of the log was changed, removed or reordered."""
    prev, count = "start", 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if json.loads(line)["prev_hash"] != prev:
                return False
            prev = hashlib.sha256(line.encode()).hexdigest()
            count += 1
    head_path = path + ".head"
    if os.path.exists(head_path):          # catches edits to, or deletion of, the LAST entries
        with open(head_path, encoding="utf-8") as f:
            head = json.load(f)
        return head["step"] == count and head["hash"] == prev
    return True                            # older log without a head file: chain check only
