/**
 * SongSiphera — Queue Management Module
 * File: js/queue.js
 *
 * Implements audio queue management, Fisher-Yates shuffle with current-track preservation,
 * repeat modes ('none' | 'all' | 'one'), HTML5 drag-and-drop reordering,
 * and state synchronization with storage.
 */

window.SS = window.SS || {};

SS.queue = {
  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------
  tracks: [],
  currentIndex: -1,
  shuffleMode: false,
  repeatMode: 'none',   // 'none' | 'all' | 'one'
  originalOrder: [],
  dragSrcIndex: null,

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  init() {
    try {
      const saved = window.SS?.storage?.getQueue && SS.storage.getQueue();
      if (saved) {
        this.shuffleMode = Boolean(saved.shuffleMode);
        this.repeatMode = ['none', 'all', 'one'].includes(saved.repeatMode) ? saved.repeatMode : 'none';
        this.currentIndex = typeof saved.currentIndex === 'number' ? saved.currentIndex : -1;
      }
    } catch (err) {
      console.warn('[SS.queue] Error reading queue from storage:', err);
    }

    // Bind clear button
    const clearBtn = document.getElementById('queue-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clear();
      });
    }

    // Initial render
    this.render();
  },

  // ---------------------------------------------------------------------------
  // Core Queue Operations
  // ---------------------------------------------------------------------------
  setQueue(tracks, startIndex = 0) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
      this.clear();
      return;
    }

    this.originalOrder = [...tracks];
    const targetTrack = tracks[startIndex] || tracks[0];

    if (this.shuffleMode) {
      // Create shuffled list with targetTrack placed first
      const remaining = tracks.filter((_, i) => i !== startIndex);
      this.fisherYates(remaining);
      this.tracks = [targetTrack, ...remaining];
      this.currentIndex = 0;
    } else {
      this.tracks = [...tracks];
      this.currentIndex = Math.max(0, Math.min(startIndex, this.tracks.length - 1));
    }

    this.save();
    this.dispatchUpdate();
    this.render();
  },

  add(track) {
    if (!track) return;

    this.tracks.push(track);
    this.originalOrder.push(track);

    if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }

    this.save();
    this.dispatchUpdate();
    this.render();

    if (window.SS?.ui) {
      SS.ui.showToast(`Added "${track.title}" to queue`, 'info');
    }
  },

  addNext(track) {
    if (!track) return;

    const insertIndex = this.currentIndex >= 0 ? this.currentIndex + 1 : 0;
    this.tracks.splice(insertIndex, 0, track);
    this.originalOrder.push(track);

    if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }

    this.save();
    this.dispatchUpdate();
    this.render();

    if (window.SS?.ui) {
      SS.ui.showToast(`Playing next: "${track.title}"`, 'info');
    }
  },

  remove(index) {
    if (index < 0 || index >= this.tracks.length) return;

    const removed = this.tracks.splice(index, 1)[0];

    // Remove from originalOrder
    const origIndex = this.originalOrder.findIndex(t => t.id === removed.id);
    if (origIndex !== -1) {
      this.originalOrder.splice(origIndex, 1);
    }

    // Adjust currentIndex
    if (this.tracks.length === 0) {
      this.currentIndex = -1;
    } else if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex) {
      if (this.currentIndex >= this.tracks.length) {
        this.currentIndex = this.tracks.length - 1;
      }
    }

    this.save();
    this.dispatchUpdate();
    this.render();
  },

  clear() {
    this.tracks = [];
    this.originalOrder = [];
    this.currentIndex = -1;

    this.save();
    this.dispatchUpdate();
    this.render();

    if (window.SS?.ui) {
      SS.ui.showToast('Queue cleared', 'info');
    }
  },

  // ---------------------------------------------------------------------------
  // Playback Navigation
  // ---------------------------------------------------------------------------
  next() {
    if (this.tracks.length === 0) return null;

    if (this.repeatMode === 'one') {
      if (window.SS?.audioEngine) {
        SS.audioEngine.seek(0);
      }
      return this.getCurrent();
    }

    if (this.currentIndex < this.tracks.length - 1) {
      this.currentIndex++;
    } else if (this.repeatMode === 'all') {
      this.currentIndex = 0;
    } else {
      // 'none' and reached the end
      return null;
    }

    this.save();
    this.dispatchUpdate();
    this.render();
    return this.getCurrent();
  },

  prev() {
    if (this.tracks.length === 0) return null;

    // If more than 3 seconds into playback, seek back to 0
    const currentTime = window.SS?.audioEngine?.getCurrentTime ? SS.audioEngine.getCurrentTime() : 0;
    if (currentTime > 3) {
      if (window.SS?.audioEngine) {
        SS.audioEngine.seek(0);
      }
      return this.getCurrent();
    }

    // Otherwise navigate to previous track
    if (this.currentIndex > 0) {
      this.currentIndex--;
    } else if (this.repeatMode === 'all') {
      this.currentIndex = this.tracks.length - 1;
    } else {
      if (window.SS?.audioEngine) {
        SS.audioEngine.seek(0);
      }
      return this.getCurrent();
    }

    this.save();
    this.dispatchUpdate();
    this.render();
    return this.getCurrent();
  },

  getCurrent() {
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
      return this.tracks[this.currentIndex];
    }
    return null;
  },

  // ---------------------------------------------------------------------------
  // Modes: Shuffle & Repeat
  // ---------------------------------------------------------------------------
  toggleShuffle() {
    this.shuffleMode = !this.shuffleMode;
    const currentTrack = this.getCurrent();

    if (this.shuffleMode) {
      if (this.tracks.length > 1) {
        // Shuffle excluding currentTrack, then put currentTrack at index 0
        const others = this.tracks.filter(t => t.id !== currentTrack?.id);
        this.fisherYates(others);
        if (currentTrack) {
          this.tracks = [currentTrack, ...others];
          this.currentIndex = 0;
        } else {
          this.tracks = others;
        }
      }
    } else {
      // Restore original order
      if (this.originalOrder.length > 0) {
        this.tracks = [...this.originalOrder];
        if (currentTrack) {
          const newIdx = this.tracks.findIndex(t => t.id === currentTrack.id);
          this.currentIndex = newIdx !== -1 ? newIdx : 0;
        }
      }
    }

    this.save();
    this.dispatchUpdate();
    this.render();

    if (window.SS?.ui) {
      SS.ui.updateShuffleButton(this.shuffleMode);
      SS.ui.showToast(`Shuffle: ${this.shuffleMode ? 'On' : 'Off'}`, 'info');
    }
  },

  cycleRepeat() {
    const cycle = { 'none': 'all', 'all': 'one', 'one': 'none' };
    this.repeatMode = cycle[this.repeatMode] || 'none';

    this.save();
    this.dispatchUpdate();

    if (window.SS?.ui) {
      SS.ui.updateRepeatButton(this.repeatMode);
      const labels = { 'none': 'Off', 'all': 'All', 'one': 'Current Track' };
      SS.ui.showToast(`Repeat: ${labels[this.repeatMode]}`, 'info');
    }
  },

  reorder(fromIndex, toIndex) {
    if (fromIndex < 0 || fromIndex >= this.tracks.length ||
        toIndex < 0 || toIndex >= this.tracks.length ||
        fromIndex === toIndex) {
      return;
    }

    const currentTrack = this.getCurrent();
    const [moved] = this.tracks.splice(fromIndex, 1);
    this.tracks.splice(toIndex, 0, moved);

    // Update currentIndex to follow currentTrack
    if (currentTrack) {
      this.currentIndex = this.tracks.findIndex(t => t.id === currentTrack.id);
    }

    this.save();
    this.dispatchUpdate();
    this.render();
  },

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------
  fisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  save() {
    if (window.SS?.storage?.saveQueue) {
      SS.storage.saveQueue({
        trackIds: this.tracks.map(t => t.id),
        currentIndex: this.currentIndex,
        shuffleMode: this.shuffleMode,
        repeatMode: this.repeatMode
      });
    }
  },

  dispatchUpdate() {
    document.dispatchEvent(new CustomEvent('ss:queue-updated', {
      detail: {
        queue: this.tracks,
        currentIndex: this.currentIndex,
        shuffleMode: this.shuffleMode,
        repeatMode: this.repeatMode
      }
    }));
  },

  // ---------------------------------------------------------------------------
  // DOM Rendering
  // ---------------------------------------------------------------------------
  render() {
    const container = document.getElementById('queue-list');
    if (!container) return;

    container.innerHTML = '';

    if (this.tracks.length === 0) {
      container.innerHTML = `
        <div class="queue-empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
          <p class="queue-empty-text">Queue is empty</p>
          <span class="queue-empty-sub">Play a song or add tracks to queue</span>
        </div>
      `;
      return;
    }

    this.tracks.forEach((track, index) => {
      const isCurrent = index === this.currentIndex;
      const item = document.createElement('div');
      item.className = `queue-item glass card ${isCurrent ? 'playing' : ''}`;
      item.dataset.index = index;
      item.dataset.trackId = track.id;
      item.draggable = true;

      const durationStr = window.SS?.ui ? SS.ui.formatTime(track.duration) : `${Math.floor(track.duration || 0)}s`;

      const artHtml = track.artworkUrl
        ? `<img src="${track.artworkUrl}" class="queue-thumb-img" alt="${track.title}" />`
        : `<div class="queue-thumb-placeholder">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M9 18V5l12-2v13"></path>
               <circle cx="6" cy="18" r="3"></circle>
               <circle cx="18" cy="16" r="3"></circle>
             </svg>
           </div>`;

      item.innerHTML = `
        <div class="queue-drag-handle" title="Drag to reorder">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </div>
        <div class="queue-track-num">${isCurrent ? `
          <span class="queue-playing-indicator">
            <span class="bar"></span><span class="bar"></span><span class="bar"></span>
          </span>` : (index + 1)}
        </div>
        <div class="queue-thumb-wrap">
          ${artHtml}
        </div>
        <div class="queue-info">
          <div class="queue-title" title="${track.title}">${track.title}</div>
          <div class="queue-artist" title="${track.artist || 'Unknown'}">${track.artist || 'Unknown'}</div>
        </div>
        <div class="queue-duration">${durationStr}</div>
        <button type="button" class="btn-icon queue-remove" title="Remove from queue" aria-label="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      // Click on item -> play this track
      item.addEventListener('click', (e) => {
        if (e.target.closest('.queue-remove') || e.target.closest('.queue-drag-handle')) {
          return;
        }
        this.currentIndex = index;
        this.save();
        this.dispatchUpdate();
        this.render();
        if (window.SS?.app) {
          SS.app.playTrack(track);
        }
      });

      // Remove button click
      item.querySelector('.queue-remove')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.remove(index);
      });

      // HTML5 Drag-and-Drop Reordering
      item.addEventListener('dragstart', (e) => {
        this.dragSrcIndex = index;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index);
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const targetIndex = index;
        if (this.dragSrcIndex !== null && this.dragSrcIndex !== targetIndex) {
          this.reorder(this.dragSrcIndex, targetIndex);
        }
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        this.dragSrcIndex = null;
      });

      container.appendChild(item);
    });
  }
};
