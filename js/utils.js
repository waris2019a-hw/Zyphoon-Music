/** Shared helpers */

export function formatTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Extract YouTube playlist ID from various URL shapes */
export function extractPlaylistId(input) {
  if (!input) return null;
  const raw = String(input).trim();

  // Direct ID
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw) && !raw.includes('/') && !raw.includes('=')) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const list = url.searchParams.get('list');
    if (list) return list;
    // /playlist?list=...
    const m = url.pathname.match(/playlist\/([^/?#]+)/);
    if (m) return m[1];
  } catch {
    // not a URL — maybe "list=PLxxx"
    const m = raw.match(/[?&]list=([A-Za-z0-9_-]+)/);
    if (m) return m[1];
  }
  return null;
}

export function extractVideoId(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const v = url.searchParams.get('v');
    if (v) return v;
    const m = url.pathname.match(/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  } catch {
    const m = raw.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

/** Stable YouTube thumbnail (no API / CORS issues for <img>) */
export function thumbUrl(videoId, quality = 'hqdefault') {
  if (!videoId) return '';
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function pickThumbnail(videoThumbnails, preferred = ['maxres', 'sddefault', 'hqdefault', 'medium', 'default']) {
  if (!Array.isArray(videoThumbnails) || !videoThumbnails.length) return null;
  for (const q of preferred) {
    const found = videoThumbnails.find((t) => t.quality === q);
    if (found?.url) return found.url;
  }
  return videoThumbnails[0]?.url || null;
}

/** Normalize Invidious video object → app track shape */
export function normalizeTrack(video) {
  if (!video || !video.videoId) return null;
  return {
    videoId: video.videoId,
    title: video.title || 'ไม่มีชื่อ',
    artist: video.author || video.authorName || 'ไม่ทราบผู้สร้าง',
    durationSeconds: Number(video.lengthSeconds) || 0,
    thumbnail: thumbUrl(video.videoId, 'mqdefault'),
  };
}

export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
