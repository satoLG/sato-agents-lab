"""Small in-memory cache for prepared, redacted source data; never answers."""
import copy
import json
import threading
import time
from collections import OrderedDict


class SourceCache:
    def __init__(self, max_bytes=16 * 1024 * 1024, max_entries=48):
        self.max_bytes, self.max_entries = max_bytes, max_entries
        self.entries = OrderedDict()
        self.bytes = 0
        self.lock = threading.RLock()

    def clear(self):
        with self.lock:
            self.entries.clear()
            self.bytes = 0

    def get(self, key, version, ttl, producer):
        with self.lock:
            now = time.monotonic()
            hit = self.entries.get(key)
            if hit and hit['version'] == version and now - hit['time'] < ttl:
                self.entries.move_to_end(key)
                return copy.deepcopy(hit['data']), self._freshness(hit, True)
            if hit:
                self.bytes -= self.entries.pop(key)['bytes']
            value = producer()
            item = {'data': value, 'version': version, 'time': time.monotonic(),
                    'observed': time.time(), 'ttl': ttl,
                    'bytes': len(json.dumps((key, version, value), ensure_ascii=False).encode('utf-8'))}
            size = item['bytes']
            if not (isinstance(value, dict) and value.get('error')) and size <= self.max_bytes:
                while self.entries and (len(self.entries) >= self.max_entries or self.bytes + size > self.max_bytes):
                    self.bytes -= self.entries.popitem(last=False)[1]['bytes']
                self.entries[key] = item
                self.bytes += size
            return copy.deepcopy(value), self._freshness(item, False)

    @staticmethod
    def _freshness(item, cached):
        return {'observed_at': item['observed'], 'max_age_seconds': item['ttl'],
                'age_seconds': round(max(0, time.monotonic() - item['time']), 3), 'cached': cached}
