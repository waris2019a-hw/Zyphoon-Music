/** YouTube IFrame Player wrapper (ToS-compliant visible embed) */

import { thumbUrl, clamp } from './utils.js';
import { storage } from './storage.js';

const YT_API_SRC = 'https://www.youtube.com/iframe_api';

function loadIframeApi() {
  return new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const existing = document.querySelector(`script[src="${YT_API_SRC}"]`);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = YT_API_SRC;
      document.head.appendChild(tag);
    }
  });
}

/**
 * Player state machine:
 * - queue: Track[]
 * - index: number
 * - shuffle: boolean
 * - repeat: 'off' | 'all' | 'one'
 */
export class Player {
  constructor({ containerId = 'yt-player', onState, onError } = {}) {
    this.containerId = containerId;
    this.onState = onState || (() => {});
    this.onError = onError || (() => {});

    this.queue = [];
    this.index = -1;
    this.shuffle = false;
    this.repeat = 'off';
    this.shuffledOrder = null;
    this.player = null;
    this.ready = false;
    this.pendingTrack = null;
    this.volume = storage.getSettings().volume ?? 80;
    this.playing = false;
    this.currentDuration = 0;
  }

  async init() {
    const YT = await loadIframeApi();
    this.ready = true;
    await new Promise((resolve) => {
      this.player = new YT.Player(this.containerId, {
        width: '100%',
        height: '100%',
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin,
          enablejsapi: 1,
        },
        events: {
          onReady: (e) => {
            try {
              e.target.setVolume(this.volume);
            } catch { /* noop */ }
            resolve();
          },
          onStateChange: (e) => this._handleStateChange(e),
          onError: (e) => {
            this.onError(e?.data);
          },
        },
      });
    });

    if (this.pendingTrack) {
      const t = this.pendingTrack;
      this.pendingTrack = null;
      this.playTrack(t, this.queue, this.index);
    }
  }

  setQueue(tracks, startIndex = 0) {
    this.queue = tracks.filter(Boolean);
    this.index = clamp(startIndex, 0, Math.max(0, this.queue.length - 1));
    if (this.shuffle) {
      this.shuffledOrder = this._buildShuffledOrder();
      const pos = this.shuffledOrder.indexOf(this.index);
      this.index = pos >= 0 ? this.shuffledOrder[pos] : this.index;
    } else {
      this.shuffledOrder = null;
    }
  }

  _buildShuffledOrder() {
    const order = this.queue.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // Keep current index first if possible
    const cur = order.indexOf(this.index);
    if (cur > 0) {
      [order[cur], order[0]] = [order[0], order[cur]];
    }
    return order;
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    this.shuffledOrder = this.shuffle ? this._buildShuffledOrder() : null;
    return this.shuffle;
  }

  cycleRepeat() {
    const order = ['off', 'all', 'one'];
    const i = order.indexOf(this.repeat);
    this.repeat = order[(i + 1) % order.length];
    return this.repeat;
  }

  getCurrentTrack() {
    if (this.index < 0 || this.index >= this.queue.length) return null;
    return this.queue[this.index];
  }

  playTrack(track, queue = null, index = null) {
    if (queue) this.queue = queue.filter(Boolean);
    if (index != null) this.index = clamp(index, 0, Math.max(0, this.queue.length - 1));

    // If no queue given, find track in current queue
    if (!queue && index == null && track) {
      const found = this.queue.findIndex((t) => t.videoId === track.videoId);
      if (found >= 0) this.index = found;
      else {
        this.queue = [track];
        this.index = 0;
      }
    }

    const current = this.getCurrentTrack();
    if (!current) return;

    if (!this.ready || !this.player) {
      this.pendingTrack = current;
      return;
    }

    try {
      this.player.loadVideoById({
        videoId: current.videoId,
        startSeconds: 0,
      });
      const settings = storage.getSettings();
      this.player.setVolume(settings.volume ?? this.volume);
    } catch (err) {
      this.onError(err?.message || err);
    }
  }

  play() {
    if (!this.ready || !this.player) {
      if (this.getCurrentTrack()) this.playTrack(this.getCurrentTrack());
      return;
    }
    // If never loaded a video, play current
    const state = this.player.getPlayerState?.();
    if (state === -1 || state == null) {
      const t = this.getCurrentTrack();
      if (t) this.playTrack(t);
      return;
    }
    this.player.playVideo();
  }

  pause() {
    if (!this.ready || !this.player) return;
    this.player.pauseVideo();
  }

  togglePlay() {
    if (!this.ready || !this.player) {
      this.play();
      return;
    }
    const state = this.player.getPlayerState?.();
    // 1 = playing, 3 = buffering
    if (state === 1 || state === 3) this.pause();
    else this.play();
  }

  next(auto = false) {
    if (!this.queue.length) return;
    if (auto && this.repeat === 'one') {
      const t = this.getCurrentTrack();
      if (t) this.playTrack(t);
      return;
    }

    if (this.shuffle && this.shuffledOrder) {
      const pos = this.shuffledOrder.indexOf(this.index);
      let nextPos = pos + 1;
      if (nextPos >= this.shuffledOrder.length) {
        if (this.repeat === 'all') {
          this.shuffledOrder = this._buildShuffledOrder();
          nextPos = 0;
        } else if (auto) {
          this.pause();
          return;
        } else {
          nextPos = 0;
        }
      }
      this.index = this.shuffledOrder[nextPos];
    } else {
      let nextIndex = this.index + 1;
      if (nextIndex >= this.queue.length) {
        if (this.repeat === 'all') nextIndex = 0;
        else if (auto) {
          this.pause();
          return;
        } else nextIndex = 0;
      }
      this.index = nextIndex;
    }

    const t = this.getCurrentTrack();
    if (t) this.playTrack(t);
  }

  prev() {
    if (!this.queue.length) return;
    const state = this.player?.getPlayerState?.();
    // If >3s in, restart track
    const cur = this.player?.getCurrentTime?.() || 0;
    if (cur > 3 && state === 1) {
      this.player.seekTo(0, true);
      return;
    }

    if (this.shuffle && this.shuffledOrder) {
      const pos = this.shuffledOrder.indexOf(this.index);
      const prevPos = pos > 0 ? pos - 1 : this.shuffledOrder.length - 1;
      this.index = this.shuffledOrder[prevPos];
    } else {
      this.index = this.index > 0 ? this.index - 1 : this.queue.length - 1;
    }
    const t = this.getCurrentTrack();
    if (t) this.playTrack(t);
  }

  seek(seconds) {
    if (!this.ready || !this.player) return;
    const dur = this.getDuration() || 0;
    const target = clamp(seconds, 0, dur || seconds);
    this.player.seekTo(target, true);
  }

  seekFraction(frac) {
    const dur = this.getDuration();
    if (!dur) return;
    this.seek(dur * clamp(frac, 0, 1));
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 100);
    storage.saveSettings({ volume: this.volume });
    if (this.ready && this.player) {
      try {
        this.player.setVolume(this.volume);
        if (this.volume > 0) this.player.unMute?.();
      } catch { /* noop */ }
    }
    return this.volume;
  }

  toggleMute() {
    if (!this.ready || !this.player) return false;
    const muted = this.player.isMuted?.();
    if (muted) {
      this.player.unMute?.();
      this.player.setVolume(this.volume);
      return false;
    }
    this.player.mute?.();
    return true;
  }

  isMuted() {
    if (!this.ready || !this.player) return false;
    return !!this.player.isMuted?.();
  }

  getDuration() {
    if (!this.ready || !this.player) {
      const t = this.getCurrentTrack();
      return t?.durationSeconds || this.currentDuration || 0;
    }
    try {
      const d = this.player.getDuration?.() || 0;
      if (d) this.currentDuration = d;
      return d || this.currentDuration || 0;
    } catch {
      return this.currentDuration || 0;
    }
  }

  getCurrentTime() {
    if (!this.ready || !this.player) return 0;
    try {
      return this.player.getCurrentTime?.() || 0;
    } catch {
      return 0;
    }
  }

  getState() {
    if (!this.ready || !this.player) {
      return {
        playing: this.playing,
        time: 0,
        duration: this.getDuration(),
        track: this.getCurrentTrack(),
        volume: this.volume,
        muted: false,
        shuffle: this.shuffle,
        repeat: this.repeat,
        queueLength: this.queue.length,
      };
    }
    let state = -1;
    try { state = this.player.getPlayerState?.() ?? -1; } catch { /* noop */ }
    this.playing = state === 1 || state === 3;
    return {
      playing: this.playing,
      time: this.getCurrentTime(),
      duration: this.getDuration(),
      track: this.getCurrentTrack(),
      volume: this.volume,
      muted: this.isMuted(),
      shuffle: this.shuffle,
      repeat: this.repeat,
      queueLength: this.queue.length,
      ytState: state,
    };
  }

  _handleStateChange(e) {
    const YT = window.YT;
    const s = e?.data;
    if (!YT) return;

    if (s === YT.PlayerState.ENDED) {
      this.playing = false;
      this.next(true);
      return;
    }
    if (s === YT.PlayerState.PLAYING) {
      this.playing = true;
      this.onState({ type: 'playing', track: this.getCurrentTrack() });
      return;
    }
    if (s === YT.PlayerState.PAUSED) {
      this.playing = false;
      this.onState({ type: 'paused', track: this.getCurrentTrack() });
      return;
    }
    if (s === YT.PlayerState.BUFFERING) {
      this.onState({ type: 'buffering', track: this.getCurrentTrack() });
    }
  }
}

export function trackThumbnail(track) {
  return track?.thumbnail || thumbUrl(track?.videoId);
}
