/** Bottom player bar binding */

import { formatTime, thumbUrl, clamp } from '../utils.js';
import { storage } from '../storage.js';

function $(id) {
  return document.getElementById(id);
}

export function initPlayerBar({ player, navigate }) {
  const els = {
    npThumb: $('np-thumb'),
    npTitle: $('np-title'),
    npArtist: $('np-artist'),
    btnLike: $('btn-like'),
    btnPlay: $('btn-play'),
    btnPrev: $('btn-prev'),
    btnNext: $('btn-next'),
    btnShuffle: $('btn-shuffle'),
    btnRepeat: $('btn-repeat'),
    btnMute: $('btn-mute'),
    btnShowVideo: $('btn-show-video'),
    btnToggleVideo: $('btn-toggle-video'),
    timeCurrent: $('time-current'),
    timeTotal: $('time-total'),
    seekBar: $('seek-bar'),
    seekFill: $('seek-fill'),
    seekThumb: $('seek-thumb'),
    volumeBar: $('volume-bar'),
    volumeFill: $('volume-fill'),
    volumeThumb: $('volume-thumb'),
    videoPanel: $('video-panel'),
  };

  let scrubbing = false;
  let scrubFraction = 0;
  let volumeScrubbing = false;

  function setVideoPanelVisible(visible) {
    els.videoPanel?.classList.toggle('hidden', !visible);
    storage.saveSettings({ showVideo: visible });
  }

  function bindDrag(bar, onMove, onEnd) {
    function posFromEvent(e) {
      const rect = bar.getBoundingClientRect();
      const clientX = e.touches?.[0]?.clientX ?? e.clientX;
      return clamp((clientX - rect.left) / rect.width, 0, 1);
    }
    function move(e) {
      if (!scrubbing && bar !== els.volumeBar) return;
      if (bar === els.volumeBar && !volumeScrubbing) return;
      e.preventDefault();
      onMove(posFromEvent(e));
    }
    function up(e) {
      if (bar === els.seekBar) scrubbing = false;
      if (bar === els.volumeBar) volumeScrubbing = false;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      onEnd?.(posFromEvent(e));
    }
    bar.addEventListener('pointerdown', (e) => {
      if (bar === els.seekBar) scrubbing = true;
      if (bar === els.volumeBar) volumeScrubbing = true;
      onMove(posFromEvent(e));
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  bindDrag(els.seekBar, (frac) => {
    scrubFraction = frac;
    els.seekFill.style.width = `${frac * 100}%`;
    els.seekThumb.style.left = `${frac * 100}%`;
    const dur = player.getDuration();
    els.timeCurrent.textContent = formatTime(dur * frac);
  }, (frac) => {
    player.seekFraction(frac);
    scrubFraction = 0;
  });

  bindDrag(els.volumeBar, (frac) => {
    const v = Math.round(frac * 100);
    els.volumeFill.style.width = `${v}%`;
    els.volumeThumb.style.left = `${v}%`;
    player.setVolume(v);
    updateMuteIcon(player.isMuted(), v);
  });

  els.btnPlay.addEventListener('click', () => player.togglePlay());
  els.btnPrev.addEventListener('click', () => player.prev());
  els.btnNext.addEventListener('click', () => player.next(false));

  els.btnShuffle.addEventListener('click', () => {
    const on = player.toggleShuffle();
    els.btnShuffle.classList.toggle('active', on);
  });

  els.btnRepeat.addEventListener('click', () => {
    const mode = player.cycleRepeat();
    els.btnRepeat.classList.toggle('active', mode !== 'off');
    els.btnRepeat.textContent = mode === 'one' ? '🔂' : '🔁';
  });

  els.btnMute.addEventListener('click', () => {
    const muted = player.toggleMute();
    updateMuteIcon(muted, player.volume);
  });

  els.btnShowVideo.addEventListener('click', () => {
    const hidden = els.videoPanel.classList.contains('hidden');
    setVideoPanelVisible(hidden);
  });

  els.btnToggleVideo.addEventListener('click', () => {
    setVideoPanelVisible(false);
  });

  els.btnLike.addEventListener('click', () => {
    const track = player.getCurrentTrack();
    if (!track) return;
    const liked = storage.toggleLike(track);
    els.btnLike.classList.toggle('liked', liked);
    els.btnLike.textContent = liked ? '♥' : '♡';
  });

  function updateMuteIcon(muted, volume) {
    if (muted || volume === 0) els.btnMute.textContent = '🔇';
    else if (volume < 40) els.btnMute.textContent = '🔉';
    else els.btnMute.textContent = '🔊';
  }

  function updateUI() {
    const st = player.getState();
    const track = st.track;

    if (track) {
      els.npThumb.src = track.thumbnail || thumbUrl(track.videoId);
      els.npTitle.textContent = track.title;
      els.npArtist.textContent = track.artist;
      const liked = storage.isLiked(track.videoId);
      els.btnLike.classList.toggle('liked', liked);
      els.btnLike.textContent = liked ? '♥' : '♡';
    } else {
      els.npTitle.textContent = 'ยังไม่ได้เล่นเพลง';
      els.npArtist.textContent = '—';
      els.btnLike.textContent = '♡';
      els.btnLike.classList.remove('liked');
    }

    els.btnPlay.textContent = st.playing ? '⏸' : '▶';
    els.btnShuffle.classList.toggle('active', st.shuffle);
    els.btnRepeat.classList.toggle('active', st.repeat !== 'off');
    els.btnRepeat.textContent = st.repeat === 'one' ? '🔂' : '🔁';

    const dur = st.duration || track?.durationSeconds || 0;
    const time = st.time || 0;
    els.timeTotal.textContent = formatTime(dur);
    if (!scrubbing) {
      els.timeCurrent.textContent = formatTime(time);
      const frac = dur ? clamp(time / dur, 0, 1) : 0;
      els.seekFill.style.width = `${frac * 100}%`;
      els.seekThumb.style.left = `${frac * 100}%`;
    }

    const vol = st.volume ?? 80;
    if (!volumeScrubbing) {
      els.volumeFill.style.width = `${vol}%`;
      els.volumeThumb.style.left = `${vol}%`;
    }
    updateMuteIcon(st.muted, vol);
  }

  // Progress ticker
  setInterval(updateUI, 400);

  // Initial settings
  const settings = storage.getSettings();
  els.volumeFill.style.width = `${settings.volume}%`;
  els.volumeThumb.style.left = `${settings.volume}%`;
  setVideoPanelVisible(settings.showVideo !== false);

  return {
    updateUI,
    setVideoPanelVisible,
  };
}
