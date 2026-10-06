/** App config — Invidious instances + constants */

export const APP_NAME = 'Zyhoon Music';

/** Instances that typically enable CORS + API. Ordered by preference. */
export const INVIDIOUS_INSTANCES = [
  'https://invidious.f5.si',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
];

export const STORAGE_KEYS = {
  playlists: 'melody.playlists',
  liked: 'melody.liked',
  recent: 'melody.recent',
  settings: 'melody.settings',
  lastState: 'melody.lastState',
};

export const DEFAULT_SETTINGS = {
  instanceIndex: 0,
  volume: 80,
  autoplay: true,
  showVideo: true,
};

export const MAX_RECENT = 50;
export const PAGE_SIZE = 100; // Invidious playlist page size
export const SEARCH_PAGE_SIZE = 25;
