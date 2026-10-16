/**
 * SongSiphera — Premium Web Audio Player
 * Master UI & Interaction Controller (js/ui.js)
 *
 * Manages all DOM interactions, navigation views, player expansions,
 * queue slide-in, synchronized seeking, real-time volume controls,
 * custom glass context menus, animated toasts, and keyboard shortcuts.
 */

window.SS = window.SS || {};

SS.ui = {
  // ---------------------------------------------------------------------------
  // State Properties
  // ---------------------------------------------------------------------------
  currentView: 'home',
  isNowPlayingExpanded: false,
  isQueueOpen: false,
  isSeeking: false,
  previousVolume: 0.8,
  dragState: null,

  // ---------------------------------------------------------------------------
  // Master Initialization
  // ---------------------------------------------------------------------------
  init() {
    console.log('[SS.ui] Initializing Master UI Controller...');

    // 1. Navigation & Sidebar
    this._bindNavigation();

    // 2. Playback Controls (Mini Bar & Full Overlay)
    this._bindPlaybackControls();

    // 3. Volume & Audio Parameters
    this._bindVolumeControls();

    // 4. File Ingestion & Drag-and-Drop
    this._bindFileInputs();
    this.initDragAndDrop();

    // 5. Progress Bars & Scrubbing
    this.initProgressBarSeek();

    // 6. Equalizer Sliders & Presets
    this._bindEqualizerControls();

    // 7. Visualizer Modes & Buttons
    this._bindVisualizerControls();

    // 8. Queue Drawer Panel
    this._bindQueueControls();

    // 9. Playlist Modal & Actions
    this._bindPlaylistControls();

    // 10. Settings View Actions
    this._bindSettingsControls();

    // 11. Context Menus & Global Keyboard Shortcuts
    this._bindContextMenuDismiss();
    this.initKeyboardShortcuts();

    // 12. Document Custom Event Bus Listeners
    this._bindCustomEventListeners();

    // 13. Window Resize Handler
    window.addEventListener('resize', () => {
      if (window.SS?.visualizer?.resize) {
        window.SS.visualizer.resize();
      }
    });

    console.log('[SS.ui] UI Controller successfully initialized.');
  },

  // =========================================================================
  // View Navigation
  // =========================================================================

  /**
   * Switches the active viewport section with fluid animated transitions.
   * @param {string} viewName - Target section name ('home','library','playlists','equalizer','visualizer','settings')
   */
  switchView(viewName) {
    if (!viewName) return;

    // Remove active state from all nav buttons and views
    const allNavs = document.querySelectorAll('.nav-item');
    allNavs.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    const allViews = document.querySelectorAll('.view-section');
    allViews.forEach((view) => {
      view.classList.remove('active');
    });

    // Activate matching section
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
      targetView.classList.add('active');
    }

    // Update root data-view attribute for CSS scoped styles
    const app = document.getElementById('app');
    if (app) {
      app.setAttribute('data-view', viewName);
    }

    const prevView = this.currentView;
    this.currentView = viewName;

    // Visualizer Lifecycle
    if (viewName === 'visualizer') {
      if (window.SS?.visualizer?.start) {
        window.SS.visualizer.start();
      }
    } else if (prevView === 'visualizer') {
      if (window.SS?.visualizer?.stop && !this.isNowPlayingExpanded) {
        window.SS.visualizer.stop();
      }
    }

    // Close mobile sidebar upon navigation
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
    }
  },

  /**
   * Expands the immersive Fullscreen Now Playing overlay.
   */
  expandNowPlaying() {
    const fullOverlay = document.getElementById('now-playing-full');
    if (!fullOverlay) return;

    fullOverlay.classList.remove('hidden');
    // Micro-delay to allow CSS transition to calculate
    requestAnimationFrame(() => {
      fullOverlay.classList.add('visible');
    });

    this.isNowPlayingExpanded = true;
    document.body.style.overflow = 'hidden';

    // Start mini visualizer if audio is active
    if (window.SS?.audioEngine?.isPlaying && window.SS?.visualizer?.start) {
      window.SS.visualizer.start();
    }
  },

  /**
   * Collapses the Fullscreen Now Playing overlay.
   */
  collapseNowPlaying() {
    const fullOverlay = document.getElementById('now-playing-full');
    if (!fullOverlay) return;

    fullOverlay.classList.remove('visible');
    this.isNowPlayingExpanded = false;
    document.body.style.overflow = '';

    setTimeout(() => {
      if (!this.isNowPlayingExpanded) {
        fullOverlay.classList.add('hidden');
      }
    }, 450);

    // If leaving visualizer view as well, stop render loop
    if (this.currentView !== 'visualizer' && window.SS?.visualizer?.stop) {
      window.SS.visualizer.stop();
    }
  },

  /**
   * Toggles the right-side slide-in Queue panel.
   * @param {boolean} [forceState]
   */
  toggleQueue(forceState) {
    const panel = document.getElementById('queue-panel');
    if (!panel) return;

    const shouldOpen = typeof forceState === 'boolean' ? forceState : !this.isQueueOpen;
    this.isQueueOpen = shouldOpen;

    panel.classList.toggle('open', shouldOpen);

    // Update active highlight on toggle buttons
    const btnMini = document.getElementById('btn-queue-toggle');
    const btnFull = document.getElementById('btn-queue-full');
    if (btnMini) btnMini.classList.toggle('active', shouldOpen);
    if (btnFull) btnFull.classList.toggle('active', shouldOpen);

    if (shouldOpen && window.SS?.queue?.render) {
      window.SS.queue.render();
    }
  },

  // =========================================================================
  // Playback & Track Info Sync
  // =========================================================================

  /**
   * Updates track metadata in the persistent bottom Now Playing Bar.
   * @param {object} track - Track model object
   */
  updateNowPlayingBar(track) {
    if (!track) return;

    const artwork = document.getElementById('np-artwork-mini');
    const title = document.getElementById('np-title-mini');
    const artist = document.getElementById('np-artist-mini');

    const defaultArt = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' fill='%23888' viewBox='0 0 24 24'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E";

    if (artwork) {
      artwork.src = track.artworkUrl || defaultArt;
    }
    if (title) {
      title.textContent = track.title || 'Untitled Track';
      title.title = track.title || 'Untitled Track';
    }
    if (artist) {
      artist.textContent = track.artist || 'Unknown Artist';
      artist.title = track.artist || 'Unknown Artist';
    }

    // Highlight active row in library
    this._highlightActiveTrack(track.id);
  },

  /**
   * Updates track metadata in the expanded Fullscreen Player.
   * @param {object} track - Track model object
   */
  updateNowPlayingFull(track) {
    if (!track) return;

    const fullBg = document.getElementById('np-full-bg');
    const fullArt = document.getElementById('np-artwork-full');
    const fullTitle = document.getElementById('np-title-full');
    const fullArtist = document.getElementById('np-artist-full');
    const fullAlbum = document.getElementById('np-album-full');

    const formatBadge = document.getElementById('info-format');
    const bitrateBadge = document.getElementById('info-bitrate');
    const sampleRateBadge = document.getElementById('info-samplerate');

    const defaultLargeArt = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320' fill='%23777' viewBox='0 0 24 24'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E";
    const artSrc = track.artworkUrl || defaultLargeArt;

    if (fullArt) fullArt.src = artSrc;
    if (fullBg) {
      fullBg.style.backgroundImage = track.artworkUrl ? `url("${track.artworkUrl}")` : 'none';
    }

    if (fullTitle) fullTitle.textContent = track.title || 'Untitled';
    if (fullArtist) fullArtist.textContent = track.artist || 'Unknown Artist';
    if (fullAlbum) fullAlbum.textContent = track.album || 'Unknown Album';

    // Acoustic badges
    if (formatBadge) {
      formatBadge.textContent = track.format ? track.format.toUpperCase() : 'AUDIO';
    }
    if (bitrateBadge) {
      bitrateBadge.textContent = track.bitrate ? `${track.bitrate} kbps` : 'High-Res Audio';
    }
    if (sampleRateBadge) {
      const rateKHz = track.sampleRate ? (track.sampleRate / 1000).toFixed(1) : '44.1';
      sampleRateBadge.textContent = `${rateKHz} kHz • Lossless`;
    }
  },

  /**
   * Updates playback progress bars, numeric timestamps, and sub-bass intensity meter.
   * @param {number} currentTime
   * @param {number} duration
   */
  updateProgress(currentTime, duration) {
    if (this.isSeeking) return;

    const cur = Math.max(0, currentTime || 0);
    const dur = Math.max(0, duration || 0);
    const percent = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

    // Mini bar progress fill
    const miniFill = document.getElementById('np-progress-fill');
    if (miniFill) {
      miniFill.style.width = `${percent}%`;
    }

    // Full player progress fill
    const fullFill = document.getElementById('np-progress-fill-full');
    if (fullFill) {
      fullFill.style.width = `${percent}%`;
    }

    // Numeric timestamps
    const curTimeEl = document.getElementById('np-time-current');
    const totTimeEl = document.getElementById('np-time-total');
    if (curTimeEl) curTimeEl.textContent = this.formatTime(cur);
    if (totTimeEl) totTimeEl.textContent = this.formatTime(dur);

    // Real-time dynamic sub-bass energy meter & DSP telemetry (Part 16 & 17)
    if (window.SS?.audioEngine?.getSoundTelemetry) {
      const telemetry = window.SS.audioEngine.getSoundTelemetry();
      
      const bassFill = document.getElementById('bass-meter-fill');
      if (bassFill) {
        bassFill.style.width = `${telemetry.trackBassPercent}%`;
      }

      const bassStats = document.getElementById('bass-meter-stats');
      if (bassStats) {
        bassStats.textContent = `Track: ${telemetry.trackBassPercent}% · Boost: +${telemetry.boostPercent}%`;
      }

      const liveBassEl = document.getElementById('info-live-bass');
      if (liveBassEl) {
        liveBassEl.textContent = `Bass: ${telemetry.trackBassPercent}%`;
      }

      const headroomEl = document.getElementById('info-headroom');
      if (headroomEl) {
        headroomEl.textContent = `${telemetry.headroom} dB ${telemetry.isSafe ? 'Safe' : 'Hot'}`;
        headroomEl.style.color = telemetry.isSafe ? 'var(--text-primary)' : 'var(--accent)';
      }

      const bpmEl = document.getElementById('info-bpm');
      if (bpmEl) {
        bpmEl.textContent = telemetry.bpm > 0 ? `~${telemetry.bpm} BPM` : '-- BPM';
      }

      const noteEl = document.getElementById('info-note');
      if (noteEl) {
        noteEl.textContent = telemetry.noteStr !== '--' ? `Key: ${telemetry.noteStr}` : `Pitch: ${telemetry.dominantHz} Hz`;
      }

      // Signal Path Block Activations
      const sigEq = document.getElementById('signal-eq');
      if (sigEq) {
        sigEq.classList.toggle('active', telemetry.activeGraph.eq);
      }
      const sigBass = document.getElementById('signal-bass');
      if (sigBass) {
        sigBass.classList.toggle('active', telemetry.activeGraph.bassBoost);
      }
    } else {
      const bassFill = document.getElementById('bass-meter-fill');
      if (bassFill && window.SS?.audioEngine?.getBassLevel) {
        bassFill.style.width = `${window.SS.audioEngine.getBassLevel()}%`;
      }
    }

    // Lyrics time synchronization
    if (window.SS?.lyrics?.sync) {
      window.SS.lyrics.sync(cur);
    }
  },

  /**
   * Toggles play/pause icon states in both mini bar and full overlay.
   * @param {boolean} isPlaying
   */
  updatePlayButton(isPlaying) {
    // Mini bar button
    const miniPlay = document.querySelector('#btn-play-pause .svg-play');
    const miniPause = document.querySelector('#btn-play-pause .svg-pause');
    if (miniPlay) miniPlay.classList.toggle('hidden', isPlaying);
    if (miniPause) miniPause.classList.toggle('hidden', !isPlaying);

    // Full overlay button
    const fullPlay = document.querySelector('#btn-play-pause-full .svg-play-large');
    const fullPause = document.querySelector('#btn-play-pause-full .svg-pause-large');
    if (fullPlay) fullPlay.classList.toggle('hidden', isPlaying);
    if (fullPause) fullPause.classList.toggle('hidden', !isPlaying);
  },

  /**
   * Updates shuffle button visual state.
   * @param {boolean} isActive
   */
  updateShuffleButton(isActive) {
    const btn = document.getElementById('btn-shuffle');
    if (btn) btn.classList.toggle('active', Boolean(isActive));
  },

  /**
   * Updates repeat mode button state ('none','all','one').
   * @param {string} mode
   */
  updateRepeatButton(mode) {
    const btn = document.getElementById('btn-repeat');
    if (!btn) return;

    btn.classList.toggle('active', mode !== 'none');

    // Remove any previous custom badge
    const existingBadge = btn.querySelector('.repeat-one-indicator');
    if (existingBadge) existingBadge.remove();

    if (mode === 'one') {
      const badge = document.createElement('span');
      badge.className = 'repeat-one-indicator';
      badge.textContent = '1';
      badge.style.position = 'absolute';
      badge.style.fontSize = '9px';
      badge.style.fontWeight = 'bold';
      badge.style.top = '6px';
      badge.style.right = '6px';
      badge.style.color = 'var(--accent)';
      btn.style.position = 'relative';
      btn.appendChild(badge);
      btn.title = 'Repeat: Single Track';
    } else if (mode === 'all') {
      btn.title = 'Repeat: All Tracks';
    } else {
      btn.title = 'Repeat: Off';
    }
  },

  /**
   * Updates master volume slider and speaker icon.
   * @param {number} level - Value 0 to 1
   */
  updateVolumeControls(level) {
    const clamped = Math.max(0, Math.min(1, level));

    const slider = document.getElementById('volume-slider');
    if (slider && !this.isSeeking) {
      slider.value = clamped;
    }

    this.updateVolumeIcon(clamped);
  },

  /**
   * Updates the volume SVG icon paths dynamically based on loudness tier.
   * @param {number} level - Value 0 to 1
   */
  updateVolumeIcon(level) {
    const icon = document.getElementById('volume-icon');
    if (!icon) return;

    if (level === 0) {
      // Muted speaker with X
      icon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      `;
    } else if (level < 0.4) {
      // Low volume (1 wave)
      icon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      `;
    } else {
      // High volume (2 waves)
      icon.innerHTML = `
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      `;
    }
  },

  // =========================================================================
  // Library Rendering
  // =========================================================================

  /**
   * Renders track collection into #library-grid with staggered animations and context menu triggers.
   * @param {Array<object>} tracks
   */
  renderLibrary(tracks) {
    const grid = document.getElementById('library-grid');
    const emptyState = document.getElementById('library-empty');
    if (!grid) return;

    grid.innerHTML = '';

    if (!tracks || tracks.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      grid.style.display = 'none';

      const countBadge = document.getElementById('storage-library-count');
      if (countBadge) countBadge.textContent = '0 tracks indexed';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    grid.style.display = 'grid';

    const currentTrackId = window.SS?.audioEngine?.currentTrack?.id;
    const countBadge = document.getElementById('storage-library-count');
    if (countBadge) {
      countBadge.textContent = `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'} indexed`;
    }

    const defaultArt = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' fill='%23888' viewBox='0 0 24 24'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E";

    tracks.forEach((track, index) => {
      const isCurrent = track.id === currentTrackId;
      const row = document.createElement('div');
      row.className = `track-item glass card ${isCurrent ? 'playing' : ''}`;
      row.dataset.trackId = track.id;
      row.style.animationDelay = `${Math.min(index * 25, 400)}ms`;

      const artSrc = track.artworkUrl || defaultArt;
      const durationStr = this.formatTime(track.duration);

      row.innerHTML = `
        <span class="track-format-tag">${track.format || 'AUDIO'}</span>
        <span class="track-duration">${durationStr}</span>
        <div class="track-artwork-slot">
          <img class="track-artwork" src="${artSrc}" alt="${track.title}" loading="lazy" />
          <button type="button" class="track-play-btn" title="Play Track">
            <svg viewBox="0 0 24 24" fill="currentColor" class="svg-icon">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
        </div>
        <div class="track-info">
          <div class="track-title" title="${track.title}">${track.title}</div>
          <div class="track-artist" title="${track.artist || 'Unknown'}">${track.artist || 'Unknown Artist'}</div>
        </div>
        <button type="button" class="track-more-btn" title="Track Options" aria-label="More options">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="2"></circle>
            <circle cx="19" cy="12" r="2"></circle>
            <circle cx="5" cy="12" r="2"></circle>
          </svg>
        </button>
      `;

      // Play on card double click
      row.addEventListener('dblclick', () => {
        if (window.SS?.queue && window.SS?.app) {
          window.SS.queue.setQueue(tracks, index);
          window.SS.app.playTrack(track);
        }
      });

      // Play on play button click
      row.querySelector('.track-play-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.SS?.queue && window.SS?.app) {
          window.SS.queue.setQueue(tracks, index);
          window.SS.app.playTrack(track);
        }
      });

      // Context menu on more button
      row.querySelector('.track-more-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showTrackContextMenu(e.clientX, e.clientY, track);
      });

      // Right-click context menu
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showTrackContextMenu(e.clientX, e.clientY, track);
      });

      grid.appendChild(row);
    });
  },

  /**
   * Displays context menu tailored for a specific track.
   * @private
   */
  _showTrackContextMenu(x, y, track) {
    const playlists = window.SS?.playlist?.getAll() || [];

    const items = [
      {
        label: 'Play Now',
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
        action: () => {
          if (window.SS?.app) window.SS.app.playTrack(track);
        }
      },
      {
        label: 'Play Next',
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>`,
        action: () => {
          if (window.SS?.queue) window.SS.queue.addNext(track);
        }
      },
      {
        label: 'Add to Queue',
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
        action: () => {
          if (window.SS?.queue) window.SS.queue.add(track);
        }
      },
      { separator: true }
    ];

    // Add playlists options
    if (playlists.length > 0) {
      playlists.forEach((pl) => {
        items.push({
          label: `Add to "${pl.name}"`,
          icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>`,
          action: () => {
            if (window.SS?.playlist) window.SS.playlist.addTrack(pl.id, track.id);
          }
        });
      });
    } else {
      items.push({
        label: 'Create Playlist with Track...',
        icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
        action: () => {
          this.showModal('modal-create-playlist');
        }
      });
    }

    items.push({ separator: true });
    items.push({
      label: 'Remove from Library',
      icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>`,
      action: () => {
        if (window.SS?.app) window.SS.app.removeFromLibrary(track.id);
      }
    });

    this.showContextMenu(x, y, items);
  },

  /**
   * Highlights the actively playing track in the library view.
   * @private
   */
  _highlightActiveTrack(trackId) {
    const rows = document.querySelectorAll('.track-item');
    rows.forEach((row) => {
      row.classList.toggle('playing', row.dataset.trackId === trackId);
    });
  },

  // =========================================================================
  // Popups: Context Menu & Modals
  // =========================================================================

  /**
   * Displays floating context menu at given client coordinates.
   * @param {number} x
   * @param {number} y
   * @param {Array<object>} items - [{label, icon, action, separator}]
   */
  showContextMenu(x, y, items) {
    const menu = document.getElementById('context-menu');
    const container = document.getElementById('context-menu-items');
    if (!menu || !container || !items) return;

    container.innerHTML = '';

    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        container.appendChild(sep);
        return;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'context-menu-item';
      btn.innerHTML = `
        <span class="context-item-icon">${item.icon || ''}</span>
        <span class="context-item-label">${item.label || ''}</span>
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideContextMenu();
        if (typeof item.action === 'function') {
          item.action();
        }
      });

      container.appendChild(btn);
    });

    menu.classList.remove('hidden');

    // Clamp coordinates to prevent clipping viewport edges
    const menuWidth = 240;
    const menuHeight = items.length * 36;
    const posX = x + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 16 : x;
    const posY = y + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 16 : y;

    menu.style.left = `${Math.max(12, posX)}px`;
    menu.style.top = `${Math.max(12, posY)}px`;
  },

  /**
   * Hides the active context menu.
   */
  hideContextMenu() {
    const menu = document.getElementById('context-menu');
    if (menu) menu.classList.add('hidden');
  },

  /**
   * Opens modal overlay and activates specified card dialog.
   * @param {string} modalId
   */
  showModal(modalId) {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');

    // Clear inputs inside create playlist modal if activated
    if (modalId === 'modal-create-playlist') {
      const nameInp = document.getElementById('modal-playlist-name');
      const descInp = document.getElementById('modal-playlist-desc');
      if (nameInp) {
        nameInp.value = '';
        setTimeout(() => nameInp.focus(), 50);
      }
      if (descInp) descInp.value = '';
    }
  },

  /**
   * Closes active modal dialog.
   */
  hideModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');
  },

  // =========================================================================
  // Toast Notification Stack
  // =========================================================================

  /**
   * Displays an animated toast message with color-coded accent strip.
   * @param {string} message
   * @param {'info'|'success'|'error'} [type='info']
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type} glass`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Entrance animation
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    // Dismissal timeout
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  },

  // =========================================================================
  // Scrubbing & Seeking Controller
  // =========================================================================

  /**
   * Initializes smooth scrubbing on both mini and full progress tracks.
   */
  initProgressBarSeek() {
    const miniTrack = document.getElementById('np-progress-track');
    const fullTrack = document.getElementById('np-progress-full');

    const handleSeek = (trackEl, clientX) => {
      const rect = trackEl.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const dur = window.SS?.audioEngine?.getDuration() || 0;
      const targetTime = fraction * dur;

      // Update UI fills directly for fluid 60fps tracking
      const percent = fraction * 100;
      const miniFill = document.getElementById('np-progress-fill');
      const fullFill = document.getElementById('np-progress-fill-full');
      const curTimeEl = document.getElementById('np-time-current');

      if (miniFill) miniFill.style.width = `${percent}%`;
      if (fullFill) fullFill.style.width = `${percent}%`;
      if (curTimeEl) curTimeEl.textContent = this.formatTime(targetTime);

      return targetTime;
    };

    [miniTrack, fullTrack].forEach((trackEl) => {
      if (!trackEl) return;

      let isDown = false;
      let targetSeconds = 0;

      const onStart = (e) => {
        isDown = true;
        this.isSeeking = true;
        const x = e.touches ? e.touches[0].clientX : e.clientX;
        targetSeconds = handleSeek(trackEl, x);
      };

      const onMove = (e) => {
        if (!isDown) return;
        const x = e.touches ? e.touches[0].clientX : e.clientX;
        targetSeconds = handleSeek(trackEl, x);
      };

      const onEnd = () => {
        if (!isDown) return;
        isDown = false;
        this.isSeeking = false;
        if (window.SS?.audioEngine?.seek) {
          window.SS.audioEngine.seek(targetSeconds);
        }
      };

      trackEl.addEventListener('mousedown', onStart);
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);

      trackEl.addEventListener('touchstart', onStart, { passive: true });
      window.addEventListener('touchmove', onMove, { passive: true });
      window.addEventListener('touchend', onEnd);
    });
  },

  // =========================================================================
  // Drag & Drop Ingestion
  // =========================================================================

  /**
   * Configures drag and drop overlay for audio files.
   */
  initDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    if (!dropZone) return;

    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      dropZone.style.display = 'flex';
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('dragleave', (e) => {
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        dropZone.style.display = 'none';
      }
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      dropZone.style.display = 'none';

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        if (window.SS?.app?.handleFilesAdded) {
          window.SS.app.handleFilesAdded(e.dataTransfer.files);
        }
      }
    });
  },

  // =========================================================================
  // Global Keyboard Shortcuts
  // =========================================================================

  /**
   * Configures hotkeys for fluid keyboard control.
   */
  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore key events if focused in text inputs
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          window.SS?.audioEngine?.togglePlayback();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          if (window.SS?.audioEngine) {
            window.SS.audioEngine.seek(window.SS.audioEngine.getCurrentTime() - 5);
          }
          break;

        case 'ArrowRight':
          e.preventDefault();
          if (window.SS?.audioEngine) {
            window.SS.audioEngine.seek(window.SS.audioEngine.getCurrentTime() + 5);
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (window.SS?.audioEngine) {
            const vol = (window.SS.audioEngine.audioElement?.volume || 0.8) + 0.05;
            window.SS.audioEngine.setVolume(vol);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (window.SS?.audioEngine) {
            const vol = (window.SS.audioEngine.audioElement?.volume || 0.8) - 0.05;
            window.SS.audioEngine.setVolume(vol);
          }
          break;

        case 'KeyJ':
          if (window.SS?.queue && window.SS?.app) {
            const curTime = window.SS.audioEngine?.getCurrentTime() || 0;
            if (curTime > 3) {
              window.SS.audioEngine?.seek(0);
            } else {
              const prev = window.SS.queue.prev();
              if (prev) window.SS.app.playTrack(prev);
            }
          }
          break;

        case 'KeyL':
          if (window.SS?.queue && window.SS?.app) {
            const next = window.SS.queue.next();
            if (next) window.SS.app.playTrack(next);
          }
          break;

        case 'KeyM':
          // Toggle mute
          if (window.SS?.audioEngine) {
            const cur = window.SS.audioEngine.gainNode?.gain?.value ?? 0.8;
            if (cur > 0) {
              this.previousVolume = cur;
              window.SS.audioEngine.setVolume(0);
            } else {
              window.SS.audioEngine.setVolume(this.previousVolume || 0.8);
            }
          }
          break;

        case 'KeyF':
          // Toggle full player overlay
          if (this.isNowPlayingExpanded) {
            this.collapseNowPlaying();
          } else {
            this.expandNowPlaying();
          }
          break;

        case 'KeyQ':
          // Toggle queue drawer
          this.toggleQueue();
          break;

        case 'Escape':
          this.hideContextMenu();
          this.hideModal();
          if (this.isQueueOpen) this.toggleQueue(false);
          if (this.isNowPlayingExpanded) this.collapseNowPlaying();
          break;

        default:
          break;
      }
    });
  },

  // =========================================================================
  // Internal Binding Helpers
  // =========================================================================

  _bindNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.switchView(btn.dataset.view);
      });
    });

    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('open');
      });
    }
  },

  _bindPlaybackControls() {
    // Mini bar controls
    const playPauseBtn = document.getElementById('btn-play-pause');
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        window.SS?.audioEngine?.togglePlayback();
      });
    }

    const prevBtn = document.getElementById('btn-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const cur = window.SS?.audioEngine?.getCurrentTime() || 0;
        if (cur > 3) {
          window.SS?.audioEngine?.seek(0);
        } else {
          const prev = window.SS?.queue?.prev();
          if (prev) window.SS?.app?.playTrack(prev);
        }
      });
    }

    const nextBtn = document.getElementById('btn-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const next = window.SS?.queue?.next();
        if (next) window.SS?.app?.playTrack(next);
      });
    }

    // Full player controls
    const playPauseFull = document.getElementById('btn-play-pause-full');
    if (playPauseFull) {
      playPauseFull.addEventListener('click', () => {
        window.SS?.audioEngine?.togglePlayback();
      });
    }

    const prevFull = document.getElementById('btn-prev-full');
    if (prevFull) {
      prevFull.addEventListener('click', () => {
        const cur = window.SS?.audioEngine?.getCurrentTime() || 0;
        if (cur > 3) {
          window.SS?.audioEngine?.seek(0);
        } else {
          const prev = window.SS?.queue?.prev();
          if (prev) window.SS?.app?.playTrack(prev);
        }
      });
    }

    const nextFull = document.getElementById('btn-next-full');
    if (nextFull) {
      nextFull.addEventListener('click', () => {
        const next = window.SS?.queue?.next();
        if (next) window.SS?.app?.playTrack(next);
      });
    }

    const shuffleBtn = document.getElementById('btn-shuffle');
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => {
        window.SS?.queue?.toggleShuffle();
      });
    }

    const repeatBtn = document.getElementById('btn-repeat');
    if (repeatBtn) {
      repeatBtn.addEventListener('click', () => {
        window.SS?.queue?.cycleRepeat();
      });
    }

    // Now Playing expansion toggle
    const miniMeta = document.querySelector('.np-meta-mini');
    if (miniMeta) {
      miniMeta.addEventListener('click', () => {
        this.expandNowPlaying();
      });
    }

    const closeFullBtn = document.getElementById('np-full-close');
    if (closeFullBtn) {
      closeFullBtn.addEventListener('click', () => {
        this.collapseNowPlaying();
      });
    }

    // Lyrics toggle
    const lyricsToggle = document.getElementById('btn-lyrics-toggle');
    if (lyricsToggle) {
      lyricsToggle.addEventListener('click', () => {
        window.SS?.lyrics?.toggle();
      });
    }

    // Quick EQ shortcut from full player
    const eqQuick = document.getElementById('btn-eq-quick');
    if (eqQuick) {
      eqQuick.addEventListener('click', () => {
        this.collapseNowPlaying();
        this.switchView('equalizer');
      });
    }

    // Mini visualizer canvas toggle inside full player
    const vizToggle = document.getElementById('btn-viz-toggle');
    if (vizToggle) {
      vizToggle.addEventListener('click', () => {
        const miniViz = document.getElementById('np-mini-viz');
        if (miniViz) {
          miniViz.classList.toggle('hidden');
          const isHidden = miniViz.classList.contains('hidden');
          this.showToast(isHidden ? 'Mini visualizer hidden' : 'Mini visualizer active', 'info');
        }
      });
    }

    // TV Fullscreen Mode — toggle real browser fullscreen + immersive class
    const tvFullBtn = document.getElementById('btn-tv-fullscreen');
    if (tvFullBtn) {
      tvFullBtn.addEventListener('click', () => {
        this.toggleTVFullscreen();
      });

      // Listen for browser-level fullscreen exit (Esc or browser chrome)
      document.addEventListener('fullscreenchange', () => {
        const app = document.getElementById('app');
        if (!document.fullscreenElement && app) {
          app.classList.remove('tv-fullscreen-mode');
          tvFullBtn.classList.remove('active');
        }
      });
    }
  },

  /**
   * Toggles immersive TV fullscreen: enters real browser fullscreen,
   * hides sidebar and bottom bar, maximises the now-playing overlay.
   */
  toggleTVFullscreen() {
    const app = document.getElementById('app');
    const tvBtn = document.getElementById('btn-tv-fullscreen');
    if (!app) return;

    const isCurrentlyFull = !!document.fullscreenElement;

    if (isCurrentlyFull) {
      // Exit
      document.exitFullscreen().catch(() => {});
      app.classList.remove('tv-fullscreen-mode');
      if (tvBtn) tvBtn.classList.remove('active');
    } else {
      // Enter
      const target = document.documentElement;
      const rfs = target.requestFullscreen
        || target.webkitRequestFullscreen
        || target.mozRequestFullScreen
        || target.msRequestFullscreen;

      if (rfs) {
        rfs.call(target).then(() => {
          app.classList.add('tv-fullscreen-mode');
          if (tvBtn) tvBtn.classList.add('active');
        }).catch(() => {
          // Fallback: just add the class even if fullscreen API fails
          app.classList.add('tv-fullscreen-mode');
          if (tvBtn) tvBtn.classList.add('active');
        });
      } else {
        app.classList.add('tv-fullscreen-mode');
        if (tvBtn) tvBtn.classList.add('active');
      }
    }
  },

  _bindVolumeControls() {
    const volToggle = document.getElementById('btn-volume-toggle');
    if (volToggle) {
      volToggle.addEventListener('click', () => {
        const curVol = window.SS?.audioEngine?.gainNode?.gain?.value ?? 0.8;
        if (curVol > 0) {
          this.previousVolume = curVol;
          window.SS?.audioEngine?.setVolume(0);
        } else {
          window.SS?.audioEngine?.setVolume(this.previousVolume || 0.8);
        }
      });
    }

    const volSlider = document.getElementById('volume-slider');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        window.SS?.audioEngine?.setVolume(val);
      });
    }
  },

  _bindFileInputs() {
    const addFilesBtn = document.getElementById('add-files-btn');
    const fileInput = document.getElementById('file-input');
    if (addFilesBtn && fileInput) {
      addFilesBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          window.SS?.app?.handleFilesAdded(e.target.files);
        }
      });
    }

    const addFolderBtn = document.getElementById('add-folder-btn');
    const folderInput = document.getElementById('folder-input');
    if (addFolderBtn && folderInput) {
      addFolderBtn.addEventListener('click', () => folderInput.click());
      folderInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          window.SS?.app?.handleFilesAdded(e.target.files);
        }
      });
    }

    const searchInput = document.getElementById('library-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        const matches = window.SS?.app?.search(query) || [];
        this.renderLibrary(matches);
      });
    }
  },

  _bindEqualizerControls() {
    // 10-band vertical sliders
    const bands = document.querySelectorAll('.eq-band');
    bands.forEach((band, index) => {
      const slider = band.querySelector('input[type=range]');
      const valText = band.querySelector('.eq-value');

      if (slider) {
        slider.addEventListener('input', () => {
          const val = parseFloat(slider.value);
          if (valText) {
            valText.textContent = (val > 0 ? '+' : '') + val.toFixed(1);
          }
          window.SS?.equalizer?.setBand(index, val);
        });

        // Double-click / double-tap to reset band to 0.0 dB (Part 16.5)
        slider.addEventListener('dblclick', () => {
          slider.value = 0;
          if (valText) valText.textContent = '+0.0';
          window.SS?.equalizer?.setBand(index, 0);
          this.showToast(`Reset ${band.dataset.freq} Hz to 0 dB`, 'info');
        });

        // Arrow key stepping (Arrow: 0.5dB, Shift+Arrow: 2.0dB)
        slider.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            const step = e.shiftKey ? 2.0 : 0.5;
            slider.value = Math.min(12, parseFloat(slider.value) + step);
            slider.dispatchEvent(new Event('input'));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const step = e.shiftKey ? 2.0 : 0.5;
            slider.value = Math.max(-12, parseFloat(slider.value) - step);
            slider.dispatchEvent(new Event('input'));
          }
        });
      }
    });

    // Preset dropdown
    const presetSelect = document.getElementById('eq-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        window.SS?.equalizer?.setPreset(e.target.value);
      });
    }

    // Sub-bass boost slider
    const bassBoost = document.getElementById('bass-boost-slider');
    const bassVal = document.getElementById('bass-boost-value');
    if (bassBoost) {
      bassBoost.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (bassVal) bassVal.textContent = `${Math.round(val)}%`;
        window.SS?.equalizer?.setBassBoost(val);
      });

      // Double-click reset to 0%
      bassBoost.addEventListener('dblclick', () => {
        bassBoost.value = 0;
        if (bassVal) bassVal.textContent = '0%';
        window.SS?.equalizer?.setBassBoost(0);
        this.showToast('Sub-Bass Drive reset to 0%', 'info');
      });
    }

    // EQ intensity slider
    const intensity = document.getElementById('intensity-slider');
    const intVal = document.getElementById('intensity-value');
    if (intensity) {
      intensity.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (intVal) intVal.textContent = `${Math.round(val)}%`;
        window.SS?.equalizer?.setIntensity(val);
      });

      // Double-click reset to 100%
      intensity.addEventListener('dblclick', () => {
        intensity.value = 100;
        if (intVal) intVal.textContent = '100%';
        window.SS?.equalizer?.setIntensity(100);
        this.showToast('EQ Intensity reset to 100%', 'info');
      });
    }
  },

  _bindVisualizerControls() {
    const vizButtons = document.querySelectorAll('.viz-mode-btn');
    vizButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (window.SS?.visualizer?.setMode) {
          window.SS.visualizer.setMode(mode);
        }
        vizButtons.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
  },

  _bindQueueControls() {
    const btnQueueMini = document.getElementById('btn-queue-toggle');
    const btnQueueFull = document.getElementById('btn-queue-full');
    const btnQueueClose = document.getElementById('queue-panel-close');
    const btnQueueClear = document.getElementById('queue-clear');

    if (btnQueueMini) btnQueueMini.addEventListener('click', () => this.toggleQueue());
    if (btnQueueFull) btnQueueFull.addEventListener('click', () => this.toggleQueue());
    if (btnQueueClose) btnQueueClose.addEventListener('click', () => this.toggleQueue(false));
    if (btnQueueClear) {
      btnQueueClear.addEventListener('click', () => {
        window.SS?.queue?.clear();
      });
    }
  },

  _bindPlaylistControls() {
    const createBtn = document.getElementById('create-playlist-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        this.showModal('modal-create-playlist');
      });
    }

    const cancelBtn = document.getElementById('modal-playlist-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideModal());

    const submitBtn = document.getElementById('modal-playlist-submit');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const nameInp = document.getElementById('modal-playlist-name');
        const descInp = document.getElementById('modal-playlist-desc');
        const name = nameInp?.value?.trim();
        const desc = descInp?.value?.trim();

        if (name) {
          window.SS?.playlist?.create(name, desc);
          this.hideModal();
        } else {
          this.showToast('Please provide a playlist name', 'error');
        }
      });
    }

    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.hideModal();
      });
    }

    // Detail view Play All button
    const playAllBtn = document.getElementById('playlist-play-all-btn');
    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => {
        const pl = window.SS?.playlist?.currentPlaylist;
        if (pl) {
          const tracks = window.SS.playlist.getTracksForPlaylist(pl.id);
          if (tracks.length > 0 && window.SS?.queue && window.SS?.app) {
            window.SS.queue.setQueue(tracks, 0);
            window.SS.app.playTrack(tracks[0]);
          } else {
            this.showToast('Playlist is empty', 'info');
          }
        }
      });
    }

    // Detail view Delete button
    const deleteBtn = document.getElementById('playlist-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const pl = window.SS?.playlist?.currentPlaylist;
        if (pl && confirm(`Delete playlist "${pl.name}"?`)) {
          window.SS.playlist.delete(pl.id);
        }
      });
    }
  },

  _bindSettingsControls() {
    const clearLibBtn = document.getElementById('btn-clear-library');
    if (clearLibBtn) {
      clearLibBtn.addEventListener('click', () => {
        if (confirm('Clear the entire music library? Audio files will need to be re-added.')) {
          if (window.SS?.app?.clearLibrary) {
            window.SS.app.clearLibrary();
          } else {
            window.SS.app.library = [];
            window.SS.app.libraryMeta = [];
            window.SS.storage.saveLibraryMeta([]);
            this.renderLibrary([]);
            this.showToast('Library cleared', 'info');
          }
        }
      });
    }

    const resetBtn = document.getElementById('btn-reset-settings');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset settings to factory defaults?')) {
          localStorage.clear();
          if (window.SS?.cookies?.clearAll) window.SS.cookies.clearAll();
          window.location.reload();
        }
      });
    }

    // Cookies clear button (Part 7)
    const clearCookiesBtn = document.getElementById('btn-clear-cookies');
    if (clearCookiesBtn) {
      clearCookiesBtn.addEventListener('click', () => {
        if (window.SS?.cookies?.clearAll) {
          window.SS.cookies.clearAll();
          this.refreshCookieDiagnostics();
          this.showToast('All functional cookies cleared', 'info');
        }
      });
    }
    this.refreshCookieDiagnostics();

    // Sleep Timer Controls & Modal (Part 16.7)
    const sleepBtn = document.getElementById('btn-sleep-timer');
    if (sleepBtn) {
      sleepBtn.addEventListener('click', () => {
        this.showModal('modal-sleep-timer');
        this.updateSleepTimerModal();
      });
    }

    const sleepCloseBtn = document.getElementById('modal-sleep-close');
    if (sleepCloseBtn) {
      sleepCloseBtn.addEventListener('click', () => {
        this.hideModal();
      });
    }

    const sleepOptButtons = document.querySelectorAll('.sleep-opt-btn');
    sleepOptButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.sleep;
        if (val === '0') {
          window.SS?.audioEngine?.setSleepTimer(0);
          this.showToast('Sleep timer turned off', 'info');
        } else if (val === 'track') {
          window.SS?.audioEngine?.setSleepTimer(0, true);
          this.showToast('Sleep timer set: Stop after current track', 'info');
        } else {
          const mins = parseInt(val, 10);
          window.SS?.audioEngine?.setSleepTimer(mins);
          this.showToast(`Sleep timer set: ${mins} minutes`, 'info');
        }
        this.updateSleepTimerModal();
      });
    });

    const sleepSetting = document.getElementById('setting-sleep-timer');
    if (sleepSetting) {
      sleepSetting.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '0') {
          window.SS?.audioEngine?.setSleepTimer(0);
        } else if (val === 'track') {
          window.SS?.audioEngine?.setSleepTimer(0, true);
        } else {
          window.SS?.audioEngine?.setSleepTimer(parseInt(val, 10));
        }
      });
    }

    document.addEventListener('ss:sleep-timer-updated', (e) => {
      const { active, remainingSeconds, isEndOfTrack } = e.detail;
      const sleepBtnEl = document.getElementById('btn-sleep-timer');
      if (sleepBtnEl) {
        sleepBtnEl.classList.toggle('active', active);
      }
      const sleepSettingEl = document.getElementById('setting-sleep-timer');
      if (sleepSettingEl && !active) {
        sleepSettingEl.value = '0';
      }
      this.updateSleepTimerModal();
    });
  },

  /**
   * Refreshes the cookie diagnostics displays in Settings view.
   */
  refreshCookieDiagnostics() {
    const idEl = document.getElementById('cookie-client-id');
    const countEl = document.getElementById('cookie-active-count');
    if (window.SS?.cookies) {
      if (idEl) idEl.textContent = window.SS.cookies.getOrCreateClientId();
      if (countEl) {
        const keys = Object.keys(window.SS.cookies.getAll());
        countEl.textContent = `${keys.length} active cookies (${keys.join(', ') || 'none'})`;
      }
    }
  },

  /**
   * Updates the Sleep Timer modal dialog status and active buttons.
   */
  updateSleepTimerModal() {
    const statusEl = document.getElementById('sleep-timer-status');
    const state = window.SS?.audioEngine?.getSleepTimerState
      ? window.SS.audioEngine.getSleepTimerState()
      : { active: false, remainingSeconds: 0 };

    if (!statusEl) return;

    if (!state.active) {
      statusEl.textContent = 'Timer is inactive';
      statusEl.style.color = 'var(--text-tertiary)';
    } else if (state.isEndOfTrack) {
      statusEl.textContent = `Stopping at end of current track (~${this.formatTime(state.remainingSeconds)} remaining)`;
      statusEl.style.color = 'var(--accent)';
    } else {
      const mins = Math.floor(state.remainingSeconds / 60);
      const secs = state.remainingSeconds % 60;
      statusEl.textContent = `Fading out in ${mins}:${secs.toString().padStart(2, '0')}`;
      statusEl.style.color = 'var(--accent)';
    }
  },

  _bindContextMenuDismiss() {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#context-menu')) {
        this.hideContextMenu();
      }
    });
  },

  _bindCustomEventListeners() {
    // Playback events
    document.addEventListener('ss:play', () => {
      this.updatePlayButton(true);
      if (this.currentView === 'visualizer' && window.SS?.visualizer?.start) {
        window.SS.visualizer.start();
      }
    });

    document.addEventListener('ss:pause', () => {
      this.updatePlayButton(false);
    });

    document.addEventListener('ss:timeupdate', (e) => {
      this.updateProgress(e.detail.currentTime, e.detail.duration);
    });

    document.addEventListener('ss:track-loaded', (e) => {
      this.updateNowPlayingBar(e.detail.track);
      this.updateNowPlayingFull(e.detail.track);
    });

    // Queue & Playlists
    document.addEventListener('ss:queue-updated', () => {
      if (window.SS?.queue?.render) window.SS.queue.render();
    });

    document.addEventListener('ss:playlist-updated', () => {
      if (window.SS?.playlist?.render) window.SS.playlist.render();
      if (window.SS?.playlist?.renderSidebarList) window.SS.playlist.renderSidebarList();
    });

    // EQ changes
    document.addEventListener('ss:eq-changed', (e) => {
      this.syncEQControls(e.detail);
    });

    // Volume changed
    document.addEventListener('ss:volume-changed', (e) => {
      this.updateVolumeControls(e.detail.volume);
    });

    // Mood changed
    document.addEventListener('ss:mood-changed', (e) => {
      this.syncMoodControls(e.detail.mood);
    });
  },

  /**
   * Synchronizes EQ view sliders with current EQ settings.
   */
  syncEQControls(detail) {
    if (!detail) return;

    if (Array.isArray(detail.bands)) {
      const bands = document.querySelectorAll('.eq-band');
      bands.forEach((band, i) => {
        const slider = band.querySelector('input[type=range]');
        const valText = band.querySelector('.eq-value');
        if (slider && detail.bands[i] !== undefined) {
          slider.value = detail.bands[i];
        }
        if (valText && detail.bands[i] !== undefined) {
          const val = detail.bands[i];
          valText.textContent = (val > 0 ? '+' : '') + val.toFixed(1);
        }
      });
    }

    if (detail.preset) {
      const select = document.getElementById('eq-preset-select');
      if (select) select.value = detail.preset;
    }

    if (typeof detail.bassBoost === 'number') {
      const slider = document.getElementById('bass-boost-slider');
      const text = document.getElementById('bass-boost-value');
      if (slider) slider.value = detail.bassBoost;
      if (text) text.textContent = `${Math.round(detail.bassBoost)}%`;
    }

    if (typeof detail.intensity === 'number') {
      const slider = document.getElementById('intensity-slider');
      const text = document.getElementById('intensity-value');
      if (slider) slider.value = detail.intensity;
      if (text) text.textContent = `${Math.round(detail.intensity)}%`;
    }
  },

  /**
   * Synchronizes active state of mood buttons.
   */
  syncMoodControls(moodName) {
    const buttons = document.querySelectorAll('.mood-btn');
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mood === moodName);
    });
  },

  /**
   * Formats seconds into 'm:ss' or 'h:mm:ss' representation.
   * @param {number} seconds
   * @returns {string}
   */
  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) {
      return '0:00';
    }
    const total = Math.floor(seconds);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const padSecs = secs < 10 ? `0${secs}` : secs;

    if (hrs > 0) {
      const padMins = mins < 10 ? `0${mins}` : mins;
      return `${hrs}:${padMins}:${padSecs}`;
    }
    return `${mins}:${padSecs}`;
  }
};
