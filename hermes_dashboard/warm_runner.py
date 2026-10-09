"""One serial, tool-free Hermes child, with bounded lifetime and recovery."""
import atexit
import json
import logging
import queue
import subprocess
import threading
import time
from pathlib import Path

LOG = logging.getLogger(__name__)


def _stamp(path):
    try:
        stat = path.stat()
        return (str(path), stat.st_mtime_ns, stat.st_ctime_ns, stat.st_size)
    except OSError:
        return (str(path), None)


class WarmRunner:
    def __init__(self, python, script, root, timeout=240, startup_timeout=45):
        self.python, self.script, self.root = str(python), Path(script), Path(root)
        self.timeout, self.startup_timeout = timeout, startup_timeout
        self.process = None
        self.lock = threading.RLock()
        self.requests = 0
        self.last_metrics = {}
        atexit.register(self.close)

    def _version(self):
        return tuple(_stamp(p) for p in (
            self.root.parent / 'config.yaml', self.root.parent / '.env',
            self.root / 'cli.py', self.root / 'run_agent.py', self.script))

    def _read(self, process, events):
        try:
            while True:
                line = process.stdout.readline(1_000_001)
                if not line:
                    break
                if len(line) > 1_000_000:
                    raise ValueError('oversized worker event')
                events.put(json.loads(line))
        except Exception:
            events.put({'kind': 'protocol_error'})
        finally:
            events.put({'kind': 'eof'})

    def _next(self, deadline):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError('Hermes worker timed out')
        try:
            event = self.events.get(timeout=remaining)
        except queue.Empty:
            raise RuntimeError('Hermes worker timed out') from None
        if not isinstance(event, dict) or event.get('kind') in {'eof', 'protocol_error'}:
            raise RuntimeError('Hermes worker stopped unexpectedly')
        return event

    def start(self):
        with self.lock:
            version = self._version()
            if self.process and self.process.poll() is None and self.version == version:
                return True
            self.close()
            started = time.monotonic()
            self.events = queue.Queue()
            self.process = subprocess.Popen(
                [self.python, '-u', str(self.script), '--serve', '--root', str(self.root)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, cwd=self.root, bufsize=1)
            threading.Thread(target=self._read, args=(self.process, self.events), daemon=True).start()
            try:
                ready = self._next(started + self.startup_timeout)
                if ready.get('kind') != 'ready' or ready.get('protocol') != 1 or ready.get('tools_disabled') is not True:
                    raise RuntimeError('Hermes tool isolation failed at startup')
            except Exception:
                self.close()
                raise
            self.version, self.requests = version, 0
            LOG.info('Hermes warm worker ready pid=%s startup_s=%.3f', self.process.pid, time.monotonic() - started)
            return False

    def _rss_bytes(self):
        try:
            lines = Path(f'/proc/{self.process.pid}/status').read_text().splitlines()
            return next(int(line.split()[1]) * 1024 for line in lines if line.startswith('VmRSS:'))
        except (OSError, StopIteration, ValueError):
            return 0

    def run(self, payload, on_event):
        with self.lock:
            started = time.monotonic()
            try:
                reused = self.start()
                pid = self.process.pid
                self.process.stdin.write(json.dumps(payload, ensure_ascii=False) + '\n')
                self.process.stdin.flush()
                output = None
                while True:
                    event = self._next(started + self.timeout)
                    if event.get('request_id') != payload['id']:
                        raise RuntimeError('Hermes worker response mismatch')
                    kind = event.get('kind')
                    if kind in {'tool.started', 'tool.completed'}:
                        raise RuntimeError('Hermes tool isolation failed')
                    if kind == 'error':
                        raise RuntimeError('Hermes provider unavailable')
                    if kind == 'answer':
                        output = event.get('text')
                    elif kind == 'done':
                        break
                    elif kind in {'isolation', 'model', 'thinking', 'reply', 'notice'}:
                        on_event(kind, str(event.get('text') or ''))
                if not isinstance(output, str) or not output or len(output) > 10000:
                    raise RuntimeError('Hermes returned no usable response')
                self.requests += 1
                rss = self._rss_bytes()
                self.last_metrics = {'pid': pid, 'reused': reused, 'seconds': round(time.monotonic() - started, 3), 'rss_bytes': rss}
                if self.requests >= 100 or rss > 384 * 1024 * 1024:
                    self.close()
                return output
            except Exception:
                self.close()
                raise

    def close(self):
        with self.lock:
            process, self.process = self.process, None
            if process is not None:
                if process.poll() is None:
                    process.kill()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    LOG.warning('Hermes warm worker did not exit promptly')
                for stream in (process.stdin, process.stdout):
                    if stream:
                        stream.close()
