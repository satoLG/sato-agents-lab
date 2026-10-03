"""Shared, bounded SSE feed. Collection runs once per process, not per viewer."""
import json
import threading
import time

from flask import Response


class Feed:
    def __init__(self, producer, interval=2):
        self.producer = producer
        self.interval = interval
        self.condition = threading.Condition()
        self.value = None
        self.version = 0
        self.started = False
        self.viewers = 0

    def start(self):
        with self.condition:
            if not self.started:
                self.started = True
                threading.Thread(target=self._collect, daemon=True, name="lab-telemetry").start()

    def _collect(self):
        while True:
            with self.condition:
                self.condition.wait_for(lambda: self.viewers > 0)
            try:
                value = self.producer()
            except Exception:
                value = {"error": "Fonte temporariamente indisponível."}
            with self.condition:
                self.value = value
                self.version += 1
                self.condition.notify_all()
            time.sleep(self.interval)

    def messages(self):
        with self.condition:
            self.viewers += 1
            self.condition.notify_all()
        self.start()
        version = -1
        previous = {}
        try:
            while True:
                with self.condition:
                    self.condition.wait_for(lambda: self.version != version, timeout=15)
                    value, current = self.value, self.version
                if current == version or value is None:
                    yield ": heartbeat\n\n"
                    continue
                version = current
                payload = dict(value)
                # Catalogs and history usually do not change. Never resend them
                # merely because CPU or sample timestamps changed.
                if 'boards' in payload and payload['boards'] == previous.get('boards'):
                    payload.pop('boards')
                if 'channels' in payload:
                    changed = {key: channel for key, channel in payload['channels'].items()
                               if (channel.get('data'), channel.get('error')) !=
                                  (previous.get('channels', {}).get(key, {}).get('data'), previous.get('channels', {}).get(key, {}).get('error'))
                               or key not in previous.get('channels', {})}
                    if changed:
                        payload['channels'] = changed
                    else:
                        payload.pop('channels')
                previous = value
                yield f"id: {version}\nevent: telemetry\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        finally:
            with self.condition:
                self.viewers -= 1


def response(messages):
    return Response(messages, mimetype="text/event-stream", headers={
        "X-Accel-Buffering": "no", "Cache-Control": "no-store",
    })
