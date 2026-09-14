export function formatDate(value, { withTime = false } = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!withTime) return date;
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

export function timeAgo(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function formatArea(value, unit) {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-IN')} ${unit || 'sq ft'}`;
}

export function truncateHash(hash, head = 12, tail = 10) {
  if (!hash) return '—';
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function truncateText(text, max = 90) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function initialsOf(name) {
  if (!name) return '??';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function buildQuery(params) {
  const q = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q[k] = v;
  });
  return q;
}
