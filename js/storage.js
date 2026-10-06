/** localStorage persistence */

import { STORAGE_KEYS, DEFAULT_SETTINGS, MAX_RECENT } from './config.js';
import { uid } from './utils.js';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('localStorage write failed', key, err);
  }
}

export const storage = {
  // --- Playlists ---
  getPlaylists() {
    return read(STORAGE_KEYS.playlists, []);
  },

  savePlaylists(list) {
    write(STORAGE_KEYS.playlists, list);
  },

  createPlaylist({ name, source = 'custom', youtubePlaylistId = null }) {
    const playlists = storage.getPlaylists();
    const pl = {
      id: uid(),
      name: name || 'เพลย์ลิสต์ใหม่',
      source, // 'custom' | 'imported'
      youtubePlaylistId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tracks: [],
    };
    playlists.unshift(pl);
    storage.savePlaylists(playlists);
    return pl;
  },

  updatePlaylist(id, patch) {
    const playlists = storage.getPlaylists();
    const idx = playlists.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    playlists[idx] = { ...playlists[idx], ...patch, updatedAt: Date.now() };
    storage.savePlaylists(playlists);
    return playlists[idx];
  },

  deletePlaylist(id) {
    const playlists = storage.getPlaylists().filter((p) => p.id !== id);
    storage.savePlaylists(playlists);
  },

  getPlaylist(id) {
    return storage.getPlaylists().find((p) => p.id === id) || null;
  },

  addTrackToPlaylist(playlistId, track) {
    const pl = storage.getPlaylist(playlistId);
    if (!pl) return false;
    if (pl.tracks.some((t) => t.videoId === track.videoId)) return false;
    pl.tracks.push(track);
    pl.updatedAt = Date.now();
    storage.updatePlaylist(playlistId, { tracks: pl.tracks });
    return true;
  },

  removeTrackFromPlaylist(playlistId, videoId) {
    const pl = storage.getPlaylist(playlistId);
    if (!pl) return false;
    const tracks = pl.tracks.filter((t) => t.videoId !== videoId);
    storage.updatePlaylist(playlistId, { tracks });
    return true;
  },

  // --- Liked ---
  getLiked() {
    return read(STORAGE_KEYS.liked, []);
  },

  isLiked(videoId) {
    return storage.getLiked().some((t) => t.videoId === videoId);
  },

  toggleLike(track) {
    const liked = storage.getLiked();
    const idx = liked.findIndex((t) => t.videoId === track.videoId);
    if (idx >= 0) {
      liked.splice(idx, 1);
      storage.saveWriteLiked(liked);
      return false;
    }
    liked.unshift(track);
    storage.saveWriteLiked(liked.slice(0, 200));
    return true;
  },

  saveWriteLiked(list) {
    write(STORAGE_KEYS.liked, list);
  },

  // --- Recent ---
  getRecent() {
    return read(STORAGE_KEYS.recent, []);
  },

  pushRecent(track) {
    const recent = storage.getRecent().filter((t) => t.videoId !== track.videoId);
    recent.unshift(track);
    storage.writeRecent(recent.slice(0, MAX_RECENT));
  },

  writeRecent(list) {
    write(STORAGE_KEYS.recent, list);
  },

  // --- Settings ---
  getSettings() {
    return { ...DEFAULT_SETTINGS, ...read(STORAGE_KEYS.settings, {}) };
  },

  saveSettings(patch) {
    const next = { ...storage.getSettings(), ...patch };
    write(STORAGE_KEYS.settings, next);
    return next;
  },

  // --- Last playing state ---
  getLastState() {
    return read(STORAGE_KEYS.lastState, null);
  },

  saveLastState(state) {
    write(STORAGE_KEYS.lastState, state);
  },
};
