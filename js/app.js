/** App bootstrap — routing, events, player init */

import { storage } from './storage.js';
import { Player } from './player.js';
import { fetchPlaylist, searchYouTube } from './api.js';
import { createViews } from './ui/views.js';
import { initPlayerBar } from './ui/playerBar.js';
import { showToast, showError, showSuccess } from './ui/toast.js';
import { thumbUrl } from './utils.js';

const state = {
  view: 'home',
  params: {},
};

const player = new Player({
  containerId: 'yt-player',
  onState: (evt) => {
    if (evt?.type === 'playing' && evt.track) {
      storage.pushRecent(evt.track);
      renderSidebar();
    }
  },
  onError: (code) => {
    const map = {
      2: 'ID วิดีโอไม่ถูกต้อง',
      5: 'ฝัง HTML5 ไม่สามารถเล่นวิดีโอนี้ได้',
      100: 'ไม่พบวิดีโอ หรือถูกลบไปแล้ว',
      101: 'เจ้าของวิดีโอไม่อนุญาตให้ฝัง',
      150: 'เจ้าของวิดีโอไม่อนุญาตให้ฝัง',
    };
    showError(map[code] || `เกิดข้อผิดพลาดในการเล่นวิดีโอ (code ${code})`);
  },
});

const api = {
  search: (q) => searchYouTube(q),
  fetchPlaylist: (input) => fetchPlaylist(input),
};

let views;
let playerBar;

function navigate(view, params = {}) {
  state.view = view;
  state.params = params;

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  switch (view) {
    case 'home': views.home(); break;
    case 'search': views.search(params.query || ''); break;
    case 'import': views.import(); break;
    case 'library': views.library(); break;
    case 'playlist': views.playlist(params.id); break;
    case 'liked': views.liked(); break;
    case 'recent': views.recent(); break;
    case 'settings': views.settings(); break;
    default: views.home();
  }

  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('view-root')?.scrollTo?.(0, 0);
}

function renderSidebar() {
  const list = document.getElementById('playlist-list');
  if (!list) return;
  const playlists = storage.getPlaylists();
  if (!playlists.length) {
    list.innerHTML = `<div class="hint" style="padding:8px 12px">ยังไม่มีเพลย์ลิสต์</div>`;
    return;
  }
  list.innerHTML = playlists.map((p) => {
    const cover = p.thumbnail || (p.tracks?.[0] ? thumbUrl(p.tracks[0].videoId) : '');
    return `
      <button class="playlist-item ${state.view === 'playlist' && state.params.id === p.id ? 'active' : ''}" data-playlist-id="${p.id}">
        ${cover
          ? `<img class="pl-cover" src="${cover}" alt="" loading="lazy" />`
          : `<div class="pl-cover placeholder">🎵</div>`}
        <div class="pl-info">
          <div class="pl-name">${p.name.replace(/[<>&]/g, '')}</div>
          <div class="pl-count">${p.tracks?.length || 0} เพลง</div>
        </div>
      </button>
    `;
  }).join('');
}

function playTracks(tracks, startIndex = 0, label = '') {
  const list = tracks.filter(Boolean);
  if (!list.length) {
    showError('ไม่มีเพลงในรายการ');
    return;
  }
  player.setQueue(list, startIndex);
  const t = player.getCurrentTrack();
  if (!t) return;
  storage.pushRecent(t);
  player.playTrack(t);
  playerBar?.updateUI();
  if (label) showToast(`กำลังเล่น: ${label}`, 'success', 2000);
}

function playPlaylistById(playlistId) {
  const pl = storage.getPlaylist(playlistId);
  if (!pl || !pl.tracks?.length) {
    showError('เพลย์ลิสต์นี้ยังไม่มีเพลง');
    return;
  }
  playTracks(pl.tracks, 0, pl.name);
}

async function handleGlobalClick(e) {
  const navBtn = e.target.closest('[data-view]');
  if (navBtn) {
    navigate(navBtn.dataset.view);
    return;
  }

  const navLink = e.target.closest('[data-nav]');
  if (navLink) {
    navigate(navLink.dataset.nav);
    return;
  }

  const playlistItem = e.target.closest('[data-playlist-id].playlist-item');
  if (playlistItem && !e.target.closest('[data-action]')) {
    navigate('playlist', { id: playlistItem.dataset.playlistId });
    return;
  }

  // Card click → open playlist
  const card = e.target.closest('.card[data-playlist-id]');
  if (card && !e.target.closest('[data-action]')) {
    navigate('playlist', { id: card.dataset.playlistId });
    return;
  }

  const videoCard = e.target.closest('.card[data-video-id]');
  if (videoCard && !e.target.closest('[data-action]')) {
    const track = storage.getRecent().find((t) => t.videoId === videoCard.dataset.videoId)
      || storage.getLiked().find((t) => t.videoId === videoCard.dataset.videoId);
    if (track) playTracks([track], 0);
    return;
  }

  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.action;

  if (action === 'play-playlist') {
    e.stopPropagation();
    playPlaylistById(actionEl.dataset.playlistId);
    return;
  }

  if (action === 'play-liked') {
    playTracks(storage.getLiked(), 0, 'เพลงที่ชอบ');
    return;
  }

  if (action === 'delete-playlist') {
    const id = actionEl.dataset.playlistId;
    const pl = storage.getPlaylist(id);
    if (pl && confirm(`ลบเพลย์ลิสต์ "${pl.name}"?`)) {
      storage.deletePlaylist(id);
      showSuccess('ลบเพลย์ลิสต์แล้ว');
      renderSidebar();
      navigate('library');
    }
    return;
  }

  if (action === 'reimport-playlist') {
    const id = actionEl.dataset.playlistId;
    const pl = storage.getPlaylist(id);
    if (!pl?.youtubePlaylistId) return;
    showToast('กำลังโหลดข้อมูลใหม่…');
    try {
      const fresh = await api.fetchPlaylist(pl.youtubePlaylistId);
      storage.updatePlaylist(id, {
        tracks: fresh.tracks,
        thumbnail: fresh.thumbnail,
        author: fresh.author,
        name: fresh.title || pl.name,
      });
      showSuccess('อัปเดตเพลย์ลิสต์แล้ว');
      navigate('playlist', { id });
      renderSidebar();
    } catch (err) {
      showError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    }
    return;
  }

  if (action === 'remove-from-playlist') {
    const { playlistId, videoId } = actionEl.dataset;
    storage.removeTrackFromPlaylist(playlistId, videoId);
    showSuccess('ลบเพลงออกจากเพลย์ลิสต์แล้ว');
    navigate('playlist', { id: playlistId });
    renderSidebar();
    return;
  }

  if (action === 'like') {
    e.stopPropagation();
    try {
      const track = JSON.parse(actionEl.dataset.track);
      const liked = storage.toggleLike(track);
      actionEl.textContent = liked ? '♥' : '♡';
      actionEl.classList.toggle('liked', liked);
      actionEl.classList.toggle('active', liked);
      showToast(liked ? 'เพิ่มในเพลงที่ชอบแล้ว' : 'นำออกจากเพลงที่ชอบแล้ว', 'success', 1800);
    } catch { /* noop */ }
    return;
  }
}

function handleTrackRowDblClick(e) {
  const tr = e.target.closest('tr[data-video-id]');
  if (!tr) return;
  const videoId = tr.dataset.videoId;
  // Prefer data from like button if present, else reconstruct
  const likeBtn = tr.querySelector('[data-action="like"]');
  let track = null;
  if (likeBtn?.dataset?.track) {
    try { track = JSON.parse(likeBtn.dataset.track); } catch { /* noop */ }
  }
  if (!track) {
    // Fallback: collect from current view tables via data attributes on row children
    const title = tr.querySelector('.track-title')?.textContent || 'ไม่มีชื่อ';
    const artist = tr.querySelector('.track-artist')?.textContent || '';
    track = {
      videoId,
      title,
      artist,
      durationSeconds: 0,
      thumbnail: thumbUrl(videoId, 'mqdefault'),
    };
  }
  playTracks([track], 0);
}

function handleAddToPlaylist(e) {
  const sel = e.target.closest('select[data-action="add-to-playlist"]');
  if (!sel) return;
  const playlistId = sel.value;
  if (!playlistId) return;
  try {
    const track = JSON.parse(sel.dataset.track);
    const ok = storage.addTrackToPlaylist(playlistId, track);
    const pl = storage.getPlaylist(playlistId);
    if (ok) showSuccess(`เพิ่ม "${track.title}" ลง ${pl?.name || 'เพลย์ลิสต์'}`);
    else showToast('เพลงนี้อยู่ในเพลย์ลิสต์แล้ว');
  } catch (err) {
    showError('เพิ่มเพลงไม่สำเร็จ');
  }
  sel.value = '';
  renderSidebar();
}

function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal">${html}</div>`;
  root.classList.remove('hidden');
}

function closeModal() {
  const root = document.getElementById('modal-root');
  root.classList.add('hidden');
  root.innerHTML = '';
}

function promptNewPlaylist() {
  openModal(`
    <h3>สร้างเพลย์ลิสต์ใหม่</h3>
    <div class="form-row">
      <input id="modal-pl-name" type="text" placeholder="ชื่อเพลย์ลิสต์" autofocus />
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" id="modal-cancel">ยกเลิก</button>
      <button class="btn btn-primary" id="modal-ok">สร้าง</button>
    </div>
  `);
  const input = document.getElementById('modal-pl-name');
  input?.focus();
  document.getElementById('modal-cancel').onclick = closeModal;
  document.getElementById('modal-ok').onclick = () => {
    const name = input.value.trim() || 'เพลย์ลิสต์ใหม่';
    const pl = storage.createPlaylist({ name });
    closeModal();
    showSuccess(`สร้าง "${name}" แล้ว`);
    renderSidebar();
    navigate('playlist', { id: pl.id });
  };
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('modal-ok').click();
  });
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    if (e.target.closest('.modal')) {
      if (e.key === 'Escape') closeModal();
      return;
    }

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        player.togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        player.seek(player.getCurrentTime() + 5);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        player.seek(player.getCurrentTime() - 5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        player.setVolume(player.volume + 5);
        playerBar?.updateUI();
        break;
      case 'ArrowDown':
        e.preventDefault();
        player.setVolume(player.volume - 5);
        playerBar?.updateUI();
        break;
      case 'KeyN':
        player.next(false);
        break;
      case 'KeyP':
        player.prev();
        break;
      default:
        break;
    }
  });
}

function bindChrome() {
  document.getElementById('btn-menu')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
  });

  document.getElementById('btn-new-playlist')?.addEventListener('click', promptNewPlaylist);

  document.getElementById('global-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = e.target.value.trim();
      navigate('search', { query: q });
    }
  });

  document.getElementById('modal-root')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-root') closeModal();
  });

  document.getElementById('view-root')?.addEventListener('click', handleGlobalClick);
  document.getElementById('view-root')?.addEventListener('dblclick', handleTrackRowDblClick);
  document.getElementById('view-root')?.addEventListener('change', handleAddToPlaylist);
  document.getElementById('view-root')?.addEventListener('click', (e) => {
    // like button also works on single click inside table — already handled in handleGlobalClick
  });

  // Handle clicks on like selects etc. that are inside rows — ensure row dblclick doesn't conflict
  document.getElementById('sidebar')?.addEventListener('click', (e) => {
    if (e.target.closest('.playlist-item')) {
      // handled by view-root? sidebar is outside — bind here
      const item = e.target.closest('[data-playlist-id]');
      if (item) navigate('playlist', { id: item.dataset.playlistId });
    }
  });

  document.addEventListener('click', (e) => {
    // data-view / data-nav from sidebar + any
    const navBtn = e.target.closest('.sidebar [data-view]');
    if (navBtn) {
      e.preventDefault();
      navigate(navBtn.dataset.view);
      return;
    }
    const playlistItem = e.target.closest('.playlist-item[data-playlist-id]');
    if (playlistItem) {
      navigate('playlist', { id: playlistItem.dataset.playlistId });
      return;
    }
  });
}

async function main() {
  views = createViews({ navigate, player, api });
  playerBar = initPlayerBar({ player, navigate });

  bindChrome();
  bindKeyboard();
  renderSidebar();

  // Init YouTube player in background
  try {
    await player.init();
    playerBar.updateUI();
  } catch (err) {
    console.error(err);
    showError('โหลด YouTube player ไม่สำเร็จ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
  }

  navigate('home');

  // Restore last track (paused)
  const last = storage.getLastState();
  if (last?.track?.videoId) {
    player.setQueue([last.track], 0);
    player.pendingTrack = last.track;
    playerBar.updateUI();
  }

  window.addEventListener('beforeunload', () => {
    const st = player.getState();
    if (st.track) {
      storage.saveLastState({ track: st.track, time: st.time });
    }
  });

  // Periodically save queue position
  setInterval(() => {
    const st = player.getState();
    if (st.track) storage.saveLastState({ track: st.track, time: st.time });
  }, 10000);
}

main().catch((err) => {
  console.error(err);
  showError(err.message || 'เกิดข้อผิดพลาดในการเริ่มต้นแอป');
});
