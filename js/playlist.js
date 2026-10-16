/**
 * SongSiphera — Playlist Management Module
 * File: js/playlist.js
 *
 * Handles creation, persistence, rendering, reordering, and track management
 * for user playlists with dynamic canvas artwork generation.
 */

window.SS = window.SS || {};

SS.playlist = {
  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------
  playlists: [],
  currentPlaylist: null,
  dragSrcIndex: null,

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  init() {
    try {
      this.playlists = (window.SS?.storage?.getPlaylists && SS.storage.getPlaylists()) || [];
    } catch (err) {
      console.warn('[SS.playlist] Error loading playlists from storage:', err);
      this.playlists = [];
    }

    // Bind back button on playlist detail view
    const backBtn = document.getElementById('playlist-detail-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.closeDetail();
      });
    }

    // Initial render
    this.render();
    this.renderSidebarList();
  },

  // ---------------------------------------------------------------------------
  // CRUD Operations
  // ---------------------------------------------------------------------------
  create(name, description = '') {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      if (window.SS?.ui) SS.ui.showToast('Playlist name cannot be empty', 'error');
      return null;
    }

    const playlist = {
      id: crypto.randomUUID ? crypto.randomUUID() : `pl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: trimmedName,
      description: (description || '').trim(),
      trackIds: [],
      createdAt: Date.now(),
      artworkUrl: null
    };

    this.playlists.push(playlist);
    this.save();

    document.dispatchEvent(new CustomEvent('ss:playlist-updated', {
      detail: { playlists: this.playlists }
    }));

    if (window.SS?.ui) {
      SS.ui.showToast(`Playlist "${playlist.name}" created`, 'success');
    }

    return playlist;
  },

  delete(id) {
    const index = this.playlists.findIndex(p => p.id === id);
    if (index === -1) return false;

    const [deleted] = this.playlists.splice(index, 1);
    this.save();

    if (this.currentPlaylist && this.currentPlaylist.id === id) {
      this.closeDetail();
    }

    document.dispatchEvent(new CustomEvent('ss:playlist-updated', {
      detail: { playlists: this.playlists }
    }));

    if (window.SS?.ui) {
      SS.ui.showToast(`Playlist "${deleted.name}" deleted`, 'info');
    }

    return true;
  },

  rename(id, newName) {
    const playlist = this.getById(id);
    if (!playlist) return false;

    const trimmed = (newName || '').trim();
    if (!trimmed) {
      if (window.SS?.ui) SS.ui.showToast('Name cannot be empty', 'error');
      return false;
    }

    playlist.name = trimmed;
    this.save();

    document.dispatchEvent(new CustomEvent('ss:playlist-updated', {
      detail: { playlists: this.playlists }
    }));

    if (this.currentPlaylist && this.currentPlaylist.id === id) {
      const titleEl = document.getElementById('playlist-detail-name');
      if (titleEl) titleEl.textContent = trimmed;
    }

    if (window.SS?.ui) {
      SS.ui.showToast(`Playlist renamed to "${trimmed}"`, 'success');
    }

    return true;
  },

  addTrack(playlistId, trackId) {
    const playlist = this.getById(playlistId);
    if (!playlist) return false;

    if (playlist.trackIds.includes(trackId)) {
      if (window.SS?.ui) {
        SS.ui.showToast(`Track is already in "${playlist.name}"`, 'info');
      }
      return false;
    }

    playlist.trackIds.push(trackId);
    this.save();

    document.dispatchEvent(new CustomEvent('ss:playlist-updated', {
      detail: { playlists: this.playlists }
    }));

    if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
      this.renderDetail(playlistId);
    }

    if (window.SS?.ui) {
      SS.ui.showToast(`Added to "${playlist.name}"`, 'success');
    }

    return true;
  },

  removeTrack(playlistId, trackId) {
    const playlist = this.getById(playlistId);
    if (!playlist) return false;

    const idx = playlist.trackIds.indexOf(trackId);
    if (idx === -1) return false;

    playlist.trackIds.splice(idx, 1);
    this.save();

    document.dispatchEvent(new CustomEvent('ss:playlist-updated', {
      detail: { playlists: this.playlists }
    }));

    if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
      this.renderDetail(playlistId);
    }

    if (window.SS?.ui) {
      SS.ui.showToast(`Removed track from "${playlist.name}"`, 'info');
    }

    return true;
  },

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------
  getAll() {
    return this.playlists;
  },

  getById(id) {
    return this.playlists.find(p => p.id === id) || null;
  },

  getTracksForPlaylist(id) {
    const playlist = this.getById(id);
    if (!playlist) return [];

    const library = window.SS?.app?.library || [];
    const libraryMeta = window.SS?.app?.libraryMeta || [];

    const tracks = [];
    for (const trackId of playlist.trackIds) {
      // Find matching track from active library first
      let track = library.find(t => t.id === trackId);
      if (!track) {
        // Fallback to library metadata if file handle is not active
        track = libraryMeta.find(t => t.id === trackId);
      }
      if (track) {
        tracks.push(track);
      }
    }
    return tracks;
  },

  save() {
    if (window.SS?.storage?.savePlaylists) {
      SS.storage.savePlaylists(this.playlists);
    }
  },

  // ---------------------------------------------------------------------------
  // Art Generation Utility
  // Deterministic canvas gradient based on playlist name
  // ---------------------------------------------------------------------------
  generatePlaceholderArt(name) {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');

    // Hash name to generate pleasing hue
    let hash = 0;
    const str = name || 'SongSiphera';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 45) % 360;

    // Linear diagonal gradient
    const grad = ctx.createLinearGradient(0, 0, 300, 300);
    grad.addColorStop(0, `hsl(${h1}, 75%, 45%)`);
    grad.addColorStop(1, `hsl(${h2}, 85%, 25%)`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 300, 300);

    // Overlay stylized musical glyph
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(220, 80, 100, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 84px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = (str.trim().charAt(0) || 'P').toUpperCase();
    ctx.fillText(initial, 150, 155);
    ctx.restore();

    return canvas.toDataURL('image/png');
  },

  // ---------------------------------------------------------------------------
  // Rendering: Playlists Grid
  // ---------------------------------------------------------------------------
  render() {
    const grid = document.getElementById('playlists-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Card: "Create Playlist"
    const newCard = document.createElement('div');
    newCard.className = 'playlist-card playlist-card-new glass card';
    newCard.innerHTML = `
      <div class="playlist-art-wrap playlist-new-art">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </div>
      <div class="playlist-info">
        <h4 class="playlist-title">New Playlist</h4>
        <p class="playlist-count">Create a collection</p>
      </div>
    `;
    newCard.addEventListener('click', () => {
      if (window.SS?.ui) {
        SS.ui.showModal('modal-create-playlist');
      }
    });
    grid.appendChild(newCard);

    // Render existing playlists
    this.playlists.forEach(pl => {
      const tracks = this.getTracksForPlaylist(pl.id);
      const count = pl.trackIds.length;
      const firstArtwork = tracks.find(t => t.artworkUrl)?.artworkUrl;
      const artworkSrc = firstArtwork || pl.artworkUrl || this.generatePlaceholderArt(pl.name);

      const card = document.createElement('div');
      card.className = 'playlist-card glass card';
      card.dataset.playlistId = pl.id;

      card.innerHTML = `
        <div class="playlist-art-wrap">
          <img src="${artworkSrc}" alt="${pl.name}" class="playlist-art-img" loading="lazy" />
          <button type="button" class="btn-icon playlist-play-badge" title="Play Playlist" aria-label="Play Playlist">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
        </div>
        <div class="playlist-info">
          <h4 class="playlist-title" title="${pl.name}">${pl.name}</h4>
          <p class="playlist-count">${count} ${count === 1 ? 'track' : 'tracks'}</p>
        </div>
      `;

      // Play entire playlist on badge click
      card.querySelector('.playlist-play-badge')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (tracks.length > 0 && window.SS?.queue && window.SS?.app) {
          SS.queue.setQueue(tracks, 0);
          SS.app.playTrack(tracks[0]);
        } else if (window.SS?.ui) {
          SS.ui.showToast('This playlist is empty', 'info');
        }
      });

      // Navigate to detail view
      card.addEventListener('click', () => {
        this.renderDetail(pl.id);
      });

      // Context menu
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.SS?.ui) return;

        SS.ui.showContextMenu(e.clientX, e.clientY, [
          {
            label: 'Open Playlist',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
            action: () => this.renderDetail(pl.id)
          },
          {
            label: 'Play All',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
            action: () => {
              if (tracks.length > 0 && window.SS?.queue && window.SS?.app) {
                SS.queue.setQueue(tracks, 0);
                SS.app.playTrack(tracks[0]);
              }
            }
          },
          {
            label: 'Rename',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
            action: () => {
              const newName = prompt('Enter new playlist name:', pl.name);
              if (newName !== null) this.rename(pl.id, newName);
            }
          },
          {
            label: 'Delete Playlist',
            icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
            action: () => {
              if (confirm(`Are you sure you want to delete "${pl.name}"?`)) {
                this.delete(pl.id);
              }
            }
          }
        ]);
      });

      grid.appendChild(card);
    });
  },

  // ---------------------------------------------------------------------------
  // Rendering: Playlist Detail View
  // ---------------------------------------------------------------------------
  renderDetail(id) {
    const playlist = this.getById(id);
    if (!playlist) return;

    this.currentPlaylist = playlist;

    const grid = document.getElementById('playlists-grid');
    const detail = document.getElementById('playlist-detail');
    const nameEl = document.getElementById('playlist-detail-name');
    const descEl = document.getElementById('playlist-detail-desc');
    const tracksContainer = document.getElementById('playlist-detail-tracks');

    if (grid) grid.classList.add('hidden');
    if (detail) detail.classList.remove('hidden');

    if (nameEl) nameEl.textContent = playlist.name;
    if (descEl) descEl.textContent = playlist.description || 'No description';

    if (!tracksContainer) return;
    tracksContainer.innerHTML = '';

    const tracks = this.getTracksForPlaylist(id);

    if (tracks.length === 0) {
      tracksContainer.innerHTML = `
        <div class="playlist-empty-state">
          <p class="playlist-empty-msg">No tracks in this playlist yet.</p>
          <button type="button" class="btn-ghost" id="playlist-browse-library">Browse Library</button>
        </div>
      `;
      tracksContainer.querySelector('#playlist-browse-library')?.addEventListener('click', () => {
        if (window.SS?.ui) SS.ui.switchView('library');
      });
      return;
    }

    // Render list of tracks
    tracks.forEach((track, index) => {
      const row = document.createElement('div');
      row.className = 'track-row glass';
      row.draggable = true;
      row.dataset.index = index;
      row.dataset.trackId = track.id;

      const durationStr = window.SS?.ui ? SS.ui.formatTime(track.duration) : `${Math.floor(track.duration || 0)}s`;

      row.innerHTML = `
        <div class="track-row-handle" title="Drag to reorder">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </div>
        <div class="track-row-index">${index + 1}</div>
        <button type="button" class="btn-icon track-row-play" title="Play">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
        <div class="track-row-meta">
          <div class="track-row-title">${track.title}</div>
          <div class="track-row-artist">${track.artist || 'Unknown Artist'}</div>
        </div>
        <div class="track-row-album">${track.album || ''}</div>
        <div class="track-row-duration">${durationStr}</div>
        <div class="track-row-actions">
          <button type="button" class="btn-icon track-row-remove" title="Remove from playlist">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      // Play track
      row.querySelector('.track-row-play')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.SS?.queue && window.SS?.app) {
          SS.queue.setQueue(tracks, index);
          SS.app.playTrack(track);
        }
      });

      // Double click to play
      row.addEventListener('dblclick', () => {
        if (window.SS?.queue && window.SS?.app) {
          SS.queue.setQueue(tracks, index);
          SS.app.playTrack(track);
        }
      });

      // Remove track from playlist
      row.querySelector('.track-row-remove')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeTrack(id, track.id);
      });

      // HTML5 Drag-and-Drop Reordering
      row.addEventListener('dragstart', (e) => {
        this.dragSrcIndex = index;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index);
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const targetIndex = index;
        if (this.dragSrcIndex !== null && this.dragSrcIndex !== targetIndex) {
          const movedId = playlist.trackIds.splice(this.dragSrcIndex, 1)[0];
          playlist.trackIds.splice(targetIndex, 0, movedId);
          this.save();
          this.renderDetail(id);
        }
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        this.dragSrcIndex = null;
      });

      tracksContainer.appendChild(row);
    });
  },

  closeDetail() {
    this.currentPlaylist = null;
    const grid = document.getElementById('playlists-grid');
    const detail = document.getElementById('playlist-detail');
    if (detail) detail.classList.add('hidden');
    if (grid) grid.classList.remove('hidden');
    this.render();
  },

  // ---------------------------------------------------------------------------
  // Rendering: Sidebar Playlist List
  // ---------------------------------------------------------------------------
  renderSidebarList() {
    const container = document.getElementById('sidebar-playlist-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.playlists.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.className = 'sidebar-empty-hint';
      emptyItem.textContent = 'No playlists';
      container.appendChild(emptyItem);
      return;
    }

    this.playlists.forEach(pl => {
      const li = document.createElement('li');
      li.className = 'sidebar-playlist-item';
      li.dataset.playlistId = pl.id;

      li.innerHTML = `
        <button type="button" class="sidebar-playlist-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
          <span class="sidebar-pl-name">${pl.name}</span>
        </button>
      `;

      li.querySelector('.sidebar-playlist-btn')?.addEventListener('click', () => {
        if (window.SS?.ui) {
          SS.ui.switchView('playlists');
        }
        this.renderDetail(pl.id);
      });

      container.appendChild(li);
    });
  }
};
