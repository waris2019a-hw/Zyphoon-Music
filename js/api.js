/** Invidious API client with instance failover */

import { INVIDIOUS_INSTANCES, PAGE_SIZE, SEARCH_PAGE_SIZE } from './config.js';
import { extractPlaylistId, normalizeTrack } from './utils.js';
import { storage } from './storage.js';

function currentInstance() {
  const { instanceIndex } = storage.getSettings();
  const list = INVIDIOUS_INSTANCES;
  return list[instanceIndex] || list[0];
}

function orderedInstances() {
  const preferred = currentInstance();
  const rest = INVIDIOUS_INSTANCES.filter((i) => i !== preferred);
  return [preferred, ...rest];
}

async function fetchJson(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Try each instance until one succeeds */
export async function apiFetch(path) {
  const errors = [];
  for (const base of orderedInstances()) {
    const url = `${base}${path}`;
    try {
      const data = await fetchJson(url);
      return { data, instance: base };
    } catch (err) {
      errors.push({ base, err: String(err?.message || err) });
    }
  }
  const detail = errors.map((e) => `${e.base}: ${e.err}`).join(' | ');
  throw new Error(`ไม่สามารถเชื่อมต่อ Invidious ได้ (${detail})`);
}

export function getInstances() {
  return INVIDIOUS_INSTANCES.map((url, index) => ({
    url,
    index,
    label: url.replace(/^https?:\/\//, ''),
  }));
}

/**
 * Load a YouTube playlist by URL or ID.
 * Fetches pages until done or a safety cap.
 */
export async function fetchPlaylist(playlistInput) {
  const playlistId = extractPlaylistId(playlistInput);
  if (!playlistId) {
    throw new Error('URL หรือ Playlist ID ไม่ถูกต้อง');
  }

  const firstPath = `/api/v1/playlists/${encodeURIComponent(playlistId)}?page=1&hl=th`;
  const { data, instance } = await apiFetch(firstPath);

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    // Some instances return error objects
    throw new Error(data?.error || 'ไม่พบเพลย์ลิสต์นี้');
  }

  let videos = Array.isArray(data.videos) ? [...data.videos] : [];
  let page = 1;
  const maxPages = 8; // safety cap (~800 items)

  // Invidious returns ~100 videos per page; continue if videoCount suggests more
  const expected = Number(data.videoCount) || videos.length;
  while (videos.length < expected && page < maxPages) {
    page += 1;
    try {
      const { data: next } = await apiFetch(
        `/api/v1/playlists/${encodeURIComponent(playlistId)}?page=${page}&hl=th`
      );
      const chunk = Array.isArray(next?.videos) ? next.videos : [];
      if (!chunk.length) break;
      videos = videos.concat(chunk);
    } catch {
      break;
    }
  }

  const tracks = videos.map(normalizeTrack).filter(Boolean);

  let cover = '';
  if (data.playlistThumbnail) cover = data.playlistThumbnail;
  else if (tracks[0]?.videoId) cover = `https://i.ytimg.com/vi/${tracks[0].videoId}/hqdefault.jpg`;

  const playlist = {
    youtubePlaylistId: playlistId,
    title: data.title || 'เพลย์ลิสต์ YouTube',
    author: data.author || 'ไม่ทราบผู้สร้าง',
    description: data.description || '',
    videoCount: data.videoCount || tracks.length,
    thumbnail: cover,
    tracks,
    instance,
  };

  return playlist;
}

/** Search YouTube via Invidious */
export async function searchYouTube(query, { page = 1 } = {}) {
  const q = encodeURIComponent(query);
  const path = `/api/v1/search?q=${q}&type=video&page=${page}&hl=th`;
  const { data } = await apiFetch(path);
  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => item?.type === 'video' && item.videoId)
    .map((item) => ({
      ...normalizeTrack(item),
      viewCount: item.viewCount || 0,
      publishedText: item.publishedText || '',
    }))
    .filter(Boolean);
}

/** Suggest search terms (optional enhancement) */
export async function suggestSearch(query) {
  const q = encodeURIComponent(query);
  const { data } = await apiFetch(`/api/v1/search/suggestions?q=${q}&hl=th`);
  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

export function searchPageSize() {
  return SEARCH_PAGE_SIZE;
}

export function playlistPageSize() {
  return PAGE_SIZE;
}
