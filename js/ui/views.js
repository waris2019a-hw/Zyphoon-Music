/** UI views — Home / Search / Import / Library / Liked / Recent / Settings / Playlist detail */

import { escapeHtml, formatTime, thumbUrl } from '../utils.js';
import { storage } from '../storage.js';
import { fetchPlaylist, searchYouTube, getInstances } from '../api.js';
import { showError, showSuccess } from './toast.js';

function emptyState(icon, title, desc, actionHtml = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(desc)}</p>
      ${actionHtml}
    </div>
  `;
}

function trackRowHtml(track, index, { showLike = true, showAdd = true, playlists = [], playingId = null, playlistContextId = null } = {}) {
  const playing = playingId && playingId === track.videoId ? ' playing' : '';
  const addOptions = playlists
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
    .join('');

  return `
    <tr class="${playing}" data-video-id="${escapeHtml(track.videoId)}" data-index="${index}">
      <td class="track-num">${playing ? '▶' : index + 1}</td>
      <td class="hide-sm"><img class="track-thumb" src="${escapeHtml(track.thumbnail || thumbUrl(track.videoId))}" alt="" loading="lazy" /></td>
      <td class="track-title-cell">
        <div class="track-title">${escapeHtml(track.title)}</div>
        <div class="track-artist">${escapeHtml(track.artist)}</div>
      </td>
      <td class="track-duration hide-sm">${formatTime(track.durationSeconds)}</td>
      <td class="track-actions">
        ${showLike ? `<button class="icon-btn like-toggle ${storage.isLiked(track.videoId) ? 'liked active' : ''}" data-action="like" title="ถูกใจ" data-track='${escapeHtml(JSON.stringify(track))}'>${storage.isLiked(track.videoId) ? '♥' : '♡'}</button>` : ''}
        ${showAdd && playlists.length ? `
          <select class="add-to-playlist" data-action="add-to-playlist" data-track='${escapeHtml(JSON.stringify(track))}' title="เพิ่มเข้าเพลย์ลิสต์">
            <option value="">เพิ่มเข้า…</option>
            ${addOptions}
          </select>
        ` : ''}
        ${playlistContextId ? `<button class="icon-btn" data-action="remove-from-playlist" data-video-id="${escapeHtml(track.videoId)}" data-playlist-id="${escapeHtml(playlistContextId)}" title="ลบออกจากเพลย์ลิสต์">🗑</button>` : ''}
      </td>
    </tr>
  `;
}

function trackTableHtml(tracks, opts = {}) {
  if (!tracks.length) {
    return emptyState('🎧', 'ยังไม่มีเพลง', 'ลองนำเข้า playlist หรือค้นหาเพลงเพื่อเริ่มต้น');
  }
  const rows = tracks.map((t, i) => trackRowHtml(t, i, opts)).join('');
  return `
    <table class="track-table">
      <thead>
        <tr>
          <th class="track-num">#</th>
          <th class="hide-sm"></th>
          <th>ชื่อเพลง</th>
          <th class="hide-sm">เวลา</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function playlistCardHtml(pl, { onClickAttr = 'playlist' }) {
  const cover = pl.thumbnail
    ? `<img class="card-cover" src="${escapeHtml(pl.thumbnail)}" alt="" loading="lazy" />`
    : `<div class="card-cover placeholder">🎵</div>`;
  return `
    <div class="card" data-${onClickAttr}-id="${escapeHtml(pl.id)}">
      ${cover}
      <button class="card-play" data-action="play-playlist" data-playlist-id="${escapeHtml(pl.id)}" title="เล่น">▶</button>
      <div class="card-title">${escapeHtml(pl.name || pl.title || 'ไม่มีชื่อ')}</div>
      <div class="card-sub">${pl.trackCount != null ? `${pl.trackCount} เพลง` : (pl.tracks?.length != null ? `${pl.tracks.length} เพลง` : (pl.author ? escapeHtml(pl.author) : ''))}</div>
    </div>
  `;
}

export function createViews({ navigate, player, api }) {
  const root = () => document.getElementById('view-root');

  function renderHome() {
    const playlists = storage.getPlaylists();
    const liked = storage.getLiked();
    const recent = storage.getRecent();
    const state = player.getState();
    const current = state.track;

    let html = `
      <h1 class="view-title">สวัสดี 👋</h1>
      <p class="view-subtitle">เล่นเพลงจาก YouTube playlist แบบมี UI คล้าย Spotify — ไม่ต้องใช้ API key</p>
    `;

    if (current) {
      html += `
        <div class="section-head"><h2>กำลังเล่น</h2></div>
        <div class="card-grid">
          ${playlistCardHtml({
            id: current.videoId,
            name: current.title,
            thumbnail: current.thumbnail || thumbUrl(current.videoId),
            trackCount: 1,
          }, { onClickAttr: 'video' })}
        </div>
      `;
    }

    html += `
      <div class="section-head">
        <h2>เพลย์ลิสต์ของฉัน</h2>
        <button class="btn btn-primary" data-nav="import">＋ นำเข้าจาก YouTube</button>
      </div>
    `;

    if (playlists.length) {
      html += `<div class="card-grid">${playlists.map((p) => playlistCardHtml({
        id: p.id,
        name: p.name,
        thumbnail: p.thumbnail || (p.tracks?.[0] ? thumbUrl(p.tracks[0].videoId) : ''),
        trackCount: p.tracks?.length || 0,
      })).join('')}</div>`;
    } else {
      html += emptyState(
        '📂',
        'ยังไม่มีเพลย์ลิสต์',
        'วางลิงก์ playlist YouTube เพื่อเริ่มต้น หรือค้นหาเพลงแล้วเพิ่มเอง',
        `<button class="btn btn-primary" data-nav="import">นำเข้า Playlist</button>`
      );
    }

    if (liked.length) {
      html += `
        <div class="section-head">
          <h2>เพลงที่ชอบ</h2>
          <button class="btn btn-ghost" data-nav="liked">ดูทั้งหมด</button>
        </div>
        ${trackTableHtml(liked.slice(0, 5), { playlists, playingId: current?.videoId })}
      `;
    }

    if (recent.length) {
      html += `
        <div class="section-head">
          <h2>เล่นล่าสุด</h2>
          <button class="btn btn-ghost" data-nav="recent">ดูทั้งหมด</button>
        </div>
        ${trackTableHtml(recent.slice(0, 5), { playlists, playingId: current?.videoId })}
      `;
    }

    root().innerHTML = html;
  }

  function renderSearch(query = '') {
    root().innerHTML = `
      <h1 class="view-title">ค้นหาเพลง</h1>
      <p class="view-subtitle">ค้นหาจาก YouTube แล้วเล่น หรือเพิ่มเข้าเพลย์ลิสต์ของคุณ</p>
      <div class="panel">
        <form id="search-form" class="form-row">
          <input id="search-input" type="search" placeholder="พิมพ์ชื่อเพลง, ศิลปิน, หรือลิงก์..." value="${escapeHtml(query)}" autofocus />
          <button class="btn btn-primary" type="submit">ค้นหา</button>
        </form>
      </div>
      <div id="search-results"></div>
    `;

    const form = document.getElementById('search-form');
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');

    async function doSearch(q) {
      if (!q.trim()) {
        results.innerHTML = emptyState('🔍', 'เริ่มพิมพ์เพื่อค้นหา', 'ตัวอย่าง: เพลงไทย, lofi, playlist ชื่อดัง');
        return;
      }
      results.innerHTML = `<div class="loading"><div class="spinner"></div>กำลังค้นหา…</div>`;
      try {
        const tracks = await api.search(q);
        const playlists = storage.getPlaylists();
        const current = player.getState().track;
        if (!tracks.length) {
          results.innerHTML = emptyState('😔', 'ไม่พบผลลัพธ์', `ไม่พบเพลงสำหรับ "${q}"`);
          return;
        }
        results.innerHTML = `
          <div class="section-head"><h2>ผลการค้นหา (${tracks.length})</h2></div>
          ${trackTableHtml(tracks, { playlists, playingId: current?.videoId })}
        `;
      } catch (err) {
        results.innerHTML = emptyState('⚠️', 'ค้นหาไม่สำเร็จ', err.message || String(err));
        showError(err.message || 'ค้นหาไม่สำเร็จ');
      }
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      doSearch(q);
    });

    if (query) doSearch(query);
    else {
      results.innerHTML = emptyState('🔍', 'เริ่มพิมพ์เพื่อค้นหา', 'ตัวอย่าง: เพลงไทย, lofi, playlist ชื่อดัง');
    }
  }

  function renderImport() {
    root().innerHTML = `
      <h1 class="view-title">นำเข้า Playlist จาก YouTube</h1>
      <p class="view-subtitle">วางลิงก์ playlist แล้วกดโหลด — รายการเพลงจะถูกบันทึกไว้ในเครื่องของคุณ</p>
      <div class="panel">
        <h2>เพิ่มจากลิงก์</h2>
        <form id="import-form" class="form-row">
          <input id="import-url" type="text" placeholder="https://youtube.com/playlist?list=PL..." />
          <button class="btn btn-primary" type="submit">โหลด Playlist</button>
        </form>
        <div class="hint">
          ตัวอย่างรูปแบบที่รองรับ:<br/>
          • https://www.youtube.com/playlist?list=PLxxxx<br/>
          • https://youtube.com/watch?v=xxx&list=PLxxxx<br/>
          • หรือใส่ Playlist ID ตรงๆ เช่น PLxxxx
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-ghost" type="button" id="btn-sample-playlist">ลองด้วยตัวอย่าง playlist</button>
        </div>
        <div id="import-status" class="hint"></div>
      </div>
      <div class="panel">
        <h2>สร้างเพลย์ลิสต์เปล่า</h2>
        <form id="new-empty-form" class="form-row">
          <input id="new-empty-name" type="text" placeholder="ชื่อเพลย์ลิสต์ เช่น เพลงโปรด" />
          <button class="btn btn-secondary" type="submit">สร้าง</button>
        </form>
      </div>
    `;

    const form = document.getElementById('import-form');
    const urlInput = document.getElementById('import-url');
    const status = document.getElementById('import-status');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = urlInput.value.trim();
      if (!url) return;
      status.textContent = 'กำลังโหลดข้อมูล playlist…';
      try {
        const playlist = await api.fetchPlaylist(url);
        const saved = storage.createPlaylist({
          name: playlist.title,
          source: 'imported',
          youtubePlaylistId: playlist.youtubePlaylistId,
        });
        storage.updatePlaylist(saved.id, {
          tracks: playlist.tracks,
          thumbnail: playlist.thumbnail,
          author: playlist.author,
        });
        showSuccess(`นำเข้า "${playlist.title}" แล้ว (${playlist.tracks.length} เพลง)`);
        navigate('playlist', { id: saved.id });
      } catch (err) {
        status.textContent = '';
        showError(err.message || 'นำเข้าไม่สำเร็จ');
      }
    });

    document.getElementById('btn-sample-playlist')?.addEventListener('click', () => {
      urlInput.value = 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI';
      urlInput.focus();
      showToast('ใส่ตัวอย่าง playlist ให้แล้ว — กด "โหลด Playlist" เพื่อลอง');
    });

    document.getElementById('new-empty-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('new-empty-name').value.trim() || 'เพลย์ลิสต์ใหม่';
      const pl = storage.createPlaylist({ name });
      showSuccess(`สร้าง "${name}" แล้ว`);
      navigate('playlist', { id: pl.id });
    });
  }

  function renderLibrary() {
    const playlists = storage.getPlaylists();
    root().innerHTML = `
      <h1 class="view-title">คลังเพลงของฉัน</h1>
      <p class="view-subtitle">${playlists.length} เพลย์ลิสต์ · จัดเก็บใน localStorage ของเบราว์เซอร์</p>
      <div class="section-head">
        <h2>เพลย์ลิสต์ทั้งหมด</h2>
        <button class="btn btn-primary" data-nav="import">＋ เพิ่มใหม่</button>
      </div>
    `;
    const wrap = root();
    if (!playlists.length) {
      wrap.insertAdjacentHTML('beforeend', emptyState(
        '📚',
        'คลังยังว่าง',
        'นำเข้า playlist จาก YouTube หรือค้นหาเพลงแล้วเพิ่มเอง',
        `<button class="btn btn-primary" data-nav="import">นำเข้า Playlist</button>`
      ));
    } else {
      wrap.insertAdjacentHTML('beforeend', `<div class="card-grid">${playlists.map((p) => playlistCardHtml({
        id: p.id,
        name: p.name,
        thumbnail: p.thumbnail || (p.tracks?.[0] ? thumbUrl(p.tracks[0].videoId) : ''),
        trackCount: p.tracks?.length || 0,
      })).join('')}</div>`);
    }
  }

  function renderPlaylist(playlistId) {
    const pl = storage.getPlaylist(playlistId);
    if (!pl) {
      root().innerHTML = emptyState('😕', 'ไม่พบเพลย์ลิสต์', 'เพลย์ลิสต์นี้อาจถูกลบไปแล้ว');
      return;
    }
    const tracks = pl.tracks || [];
    const playing = player.getState().track;
    const playlists = storage.getPlaylists();

    root().innerHTML = `
      <div class="playlist-hero">
        ${pl.thumbnail
          ? `<img class="hero-cover" src="${escapeHtml(pl.thumbnail)}" alt="" />`
          : `<div class="hero-cover placeholder">🎵</div>`}
        <div class="hero-meta">
          <div style="color:var(--text-subdued);font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">
            ${pl.source === 'imported' ? 'นำเข้าจาก YouTube' : 'เพลย์ลิสต์ของฉัน'}
          </div>
          <h1>${escapeHtml(pl.name)}</h1>
          <p>${escapeHtml(pl.author || '')} · ${tracks.length} เพลง${pl.youtubePlaylistId ? ` · <code>${escapeHtml(pl.youtubePlaylistId)}</code>` : ''}</p>
          <div class="hero-actions">
            <button class="btn btn-primary" data-action="play-playlist" data-playlist-id="${escapeHtml(pl.id)}">▶ เล่นทั้งหมด</button>
            ${pl.source === 'imported' && pl.youtubePlaylistId
              ? `<button class="btn btn-secondary" data-action="reimport-playlist" data-playlist-id="${escapeHtml(pl.id)}">🔄 โหลดข้อมูลใหม่</button>`
              : ''}
            <button class="btn btn-danger" data-action="delete-playlist" data-playlist-id="${escapeHtml(pl.id)}">ลบเพลย์ลิสต์</button>
          </div>
        </div>
      </div>
      ${trackTableHtml(tracks, { playlists, playingId: playing?.videoId, playlistContextId: pl.id })}
    `;
  }

  function renderLiked() {
    const liked = storage.getLiked();
    const playlists = storage.getPlaylists();
    const current = player.getState().track;
    root().innerHTML = `
      <h1 class="view-title">เพลงที่ชอบ</h1>
      <p class="view-subtitle">${liked.length} เพลง · บันทึกไว้ในเครื่องนี้</p>
      ${liked.length
        ? `<div class="hero-actions" style="margin-bottom:12px">
            <button class="btn btn-primary" data-action="play-liked">▶ เล่นทั้งหมด</button>
          </div>
          ${trackTableHtml(liked, { playlists, playingId: current?.videoId })}`
        : emptyState('❤️', 'ยังไม่มีเพลงที่ชอบ', 'กดหัวใจ ♡ บนเพลงเพื่อเพิ่มเข้ารายการนี้')}
    `;
  }

  function renderRecent() {
    const recent = storage.getRecent();
    const playlists = storage.getPlaylists();
    const current = player.getState().track;
    root().innerHTML = `
      <h1 class="view-title">เล่นล่าสุด</h1>
      <p class="view-subtitle">ประวัติการเล่นล่าสุดของคุณ</p>
      ${recent.length
        ? trackTableHtml(recent, { playlists, playingId: current?.videoId })
        : emptyState('🕘', 'ยังไม่มีประวัติ', 'เพลงที่คุณเล่นจะปรากฏที่นี่')}
    `;
  }

  function renderSettings() {
    const settings = storage.getSettings();
    const instances = getInstances();
    root().innerHTML = `
      <h1 class="view-title">ตั้งค่า</h1>
      <p class="view-subtitle">ปรับแต่งประสบการณ์การใช้งาน Zyhoon Music</p>
      <div class="panel">
        <h2>Invidious Instance</h2>
        <div class="setting-row">
          <div>
            <div class="label">เซิร์ฟเวอร์ที่ใช้ดึงข้อมูล</div>
            <div class="desc">ถ้าตัวปัจจุบันล่ม แอปจะสลับให้อัตโนมัติ</div>
          </div>
          <select id="setting-instance">
            ${instances.map((inst) => `
              <option value="${inst.index}" ${inst.index === settings.instanceIndex ? 'selected' : ''}>${escapeHtml(inst.label)}</option>
            `).join('')}
          </select>
        </div>
      </div>
      <div class="panel">
        <h2>ผู้เล่น</h2>
        <div class="setting-row">
          <div>
            <div class="label">ระดับเสียงเริ่มต้น</div>
            <div class="desc">ค่าปัจจุบัน: ${settings.volume}%</div>
          </div>
          <input type="range" id="setting-volume" min="0" max="100" value="${settings.volume}" style="min-width:160px" />
        </div>
        <div class="setting-row">
          <div>
            <div class="label">แสดงแผงวิดีโอ</div>
            <div class="desc">แสดง YouTube player ที่มองเห็นได้ (ตามข้อกำหนด YouTube)</div>
          </div>
          <select id="setting-show-video">
            <option value="true" ${settings.showVideo ? 'selected' : ''}>แสดง</option>
            <option value="false" ${!settings.showVideo ? 'selected' : ''}>ซ่อน</option>
          </select>
        </div>
      </div>
      <div class="panel">
        <h2>ข้อมูล</h2>
        <div class="setting-row">
          <div>
            <div class="label">ล้างข้อมูลทั้งหมด</div>
            <div class="desc">ลบเพลย์ลิสต์, เพลงที่ชอบ, ประวัติ และการตั้งค่า</div>
          </div>
          <button class="btn btn-danger" id="btn-clear-data">ล้างข้อมูล</button>
        </div>
        <div class="hint">
          แอปนี้ใช้ Invidious public API เพื่อดึง metadata (ชื่อเพลง, หน้าปก, ลำดับ) โดยไม่ต้องใช้ YouTube Data API key<br/>
          การเล่นเสียง/วิดีโอเป็นไปตามข้อกำหนด YouTube โดยใช้ official IFrame embed ที่มองเห็นได้
        </div>
      </div>
    `;

    document.getElementById('setting-instance').addEventListener('change', (e) => {
      storage.saveSettings({ instanceIndex: Number(e.target.value) });
      showSuccess('เปลี่ยน instance แล้ว');
    });
    document.getElementById('setting-volume').addEventListener('input', (e) => {
      const v = Number(e.target.value);
      storage.saveSettings({ volume: v });
      player.setVolume(v);
    });
    document.getElementById('setting-show-video').addEventListener('change', (e) => {
      const show = e.target.value === 'true';
      storage.saveSettings({ showVideo: show });
      document.getElementById('video-panel')?.classList.toggle('hidden', !show);
    });
    document.getElementById('btn-clear-data').addEventListener('click', () => {
      if (confirm('ต้องการล้างข้อมูลทั้งหมดจริงหรือ?')) {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('melody.'))
          .forEach((k) => localStorage.removeItem(k));
        showSuccess('ล้างข้อมูลแล้ว');
        navigate('home');
      }
    });
  }

  return {
    home: renderHome,
    search: renderSearch,
    import: renderImport,
    library: renderLibrary,
    playlist: renderPlaylist,
    liked: renderLiked,
    recent: renderRecent,
    settings: renderSettings,
    trackTableHtml,
    playlistCardHtml,
  };
}
