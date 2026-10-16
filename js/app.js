/**
 * SongSiphera — Premium Web Audio Player
 * Master Application Controller (js/app.js)
 *
 * Bootstraps all audio and visual subsystems, manages in-memory track library
 * and storage persistence, handles file ingestion and ID3 parsing, coordinates
 * playback lifecycles, and powers the curated Home view.
 */

window.SS = window.SS || {};

SS.app = {
  // ---------------------------------------------------------------------------
  // Application State
  // ---------------------------------------------------------------------------
  library: [],        // In-memory track objects with active File handles
  libraryMeta: [],    // Serializable metadata without File handles
  recentlyPlayed: [], // Chronological history of recently played tracks

  // ---------------------------------------------------------------------------
  // Master Bootstrap & Subsystem Initialization
  // ---------------------------------------------------------------------------
  /**
   * Initializes all SongSiphera audio, visual, theme, and UI modules in strict sequence.
   */
  async init() {
    console.log('[SS.app] Bootstrapping SongSiphera...');

    try {
      // 1. Audio Processing Engine & Graph
      if (window.SS?.audioEngine?.init) {
        window.SS.audioEngine.init();
      }

      // 2. 10-Band Parametric Equalizer
      if (window.SS?.equalizer?.init && window.SS?.audioEngine?.audioContext) {
        window.SS.equalizer.init(window.SS.audioEngine.audioContext);
      }

      // 3. Fullscreen Visualizer Engine
      const vizCanvas = document.getElementById('visualizer-canvas');
      if (vizCanvas && window.SS?.visualizer?.init) {
        window.SS.visualizer.init(vizCanvas);
      }

      // 4. Mini Spectrum Visualizer (Equalizer view & Full Player)
      const eqMiniCanvas = document.getElementById('eq-viz-mini');
      if (eqMiniCanvas && window.SS?.visualizer?.initMini) {
        window.SS.visualizer.initMini(eqMiniCanvas);
      }

      const npMiniCanvas = document.getElementById('np-mini-viz');
      if (npMiniCanvas && window.SS?.visualizer?.initMini) {
        window.SS.visualizer.initMini(npMiniCanvas);
      }

      // 5. Dynamic Organic Fluid Canvas Background
      const fluidCanvas = document.getElementById('fluid-bg');
      if (fluidCanvas && window.SS?.fluidBg?.init) {
        window.SS.fluidBg.init(fluidCanvas);
        window.SS.fluidBg.start();
      }

      // 6. Time-Synchronized Lyrics Engine
      if (window.SS?.lyrics?.init) {
        window.SS.lyrics.init();
      }

      // 7. Playlist Manager
      if (window.SS?.playlist?.init) {
        window.SS.playlist.init();
      }

      // 8. Playback Queue System
      if (window.SS?.queue?.init) {
        window.SS.queue.init();
      }

      // 9. Aesthetic Aura Themes Engine
      if (window.SS?.themes?.init) {
        window.SS.themes.init();
      }

      // 10. Master UI & DOM Controller
      if (window.SS?.ui?.init) {
        window.SS.ui.init();
      }

      // -----------------------------------------------------------------------
      // State Restoration
      // -----------------------------------------------------------------------

      // Load persistent library metadata
      this.libraryMeta = window.SS?.storage?.getLibraryMeta() || [];
      // Hydrate initial library from metadata and restore cached audio blobs from IndexedDB
      this.library = [];
      for (const meta of this.libraryMeta) {
        let fileHandle = null;
        if (window.SS?.storage?.getAudioBlob) {
          try {
            const blob = await window.SS.storage.getAudioBlob(meta.id);
            if (blob) {
              fileHandle = new File([blob], `${meta.title}.${(meta.format || 'mp3').toLowerCase()}`, { type: blob.type || 'audio/mpeg' });
            }
          } catch (e) {
            console.warn(`[SS.app] Failed to restore audio blob for ${meta.id}:`, e);
          }
        }
        this.library.push({
          ...meta,
          fileHandle
        });
      }

      // Restore last played track & position (visible instantly on startup)
      const lastState = window.SS?.storage?.getLastPlayedState ? window.SS.storage.getLastPlayedState() : null;
      if (lastState && lastState.trackId) {
        const lastTrack = this.getTrackById(lastState.trackId);
        if (lastTrack) {
          if (window.SS?.audioEngine?.loadTrack) {
            window.SS.audioEngine.loadTrack(lastTrack).then(() => {
              if (lastState.currentTime > 0 && window.SS?.audioEngine?.audioElement) {
                window.SS.audioEngine.audioElement.currentTime = lastState.currentTime;
              }
            });
          }
          if (window.SS?.ui) {
            window.SS.ui.updateNowPlayingBar(lastTrack);
            window.SS.ui.updateNowPlayingFull(lastTrack);
          }
        }
      }

      // Restore volume settings
      const settings = window.SS?.storage?.getSettings() || { volume: 0.8 };
      const restoredVol = typeof settings.volume === 'number' ? settings.volume : 0.8;
      if (window.SS?.audioEngine?.setVolume) {
        window.SS.audioEngine.setVolume(restoredVol);
      }
      if (window.SS?.ui?.updateVolumeControls) {
        window.SS.ui.updateVolumeControls(restoredVol);
      }

      // Render sidebar playlist items
      if (window.SS?.playlist?.renderSidebarList) {
        window.SS.playlist.renderSidebarList();
      }

      // Initial Library & Home View population
      if (window.SS?.ui) {
        window.SS.ui.renderLibrary(this.library);
      }
      this.renderHomeSections();

      // Determine initial view: show Home if library is empty, or keep Home as starting view
      if (window.SS?.ui) {
        window.SS.ui.switchView('home');
      }

      // Bind global event listeners
      this._bindGlobalEvents();

      console.log(`[SS.app] SongSiphera initialized successfully with ${this.library.length} indexed tracks.`);
    } catch (err) {
      console.error('[SS.app] Critical initialization failure:', err);
    }
  },

  // =========================================================================
  // File Ingestion & Metadata Analysis
  // =========================================================================

  /**
   * Processes user-selected or dropped audio files, extracts ID3 tags and embedded artwork,
   * generates track objects, updates storage, and transitions to the library view.
   * @param {FileList|Array<File>} fileList
   */
  async handleFilesAdded(fileList) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const audioExtensions = ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'webm', 'mp4'];

    const audioFiles = files.filter((file) => {
      if (file.type && file.type.startsWith('audio/')) return true;
      const ext = file.name.split('.').pop().toLowerCase();
      return audioExtensions.includes(ext);
    });

    if (audioFiles.length === 0) {
      if (window.SS?.ui) {
        window.SS.ui.showToast('No valid audio files detected', 'error');
      }
      return;
    }

    if (window.SS?.ui) {
      window.SS.ui.showToast(`Analyzing ${audioFiles.length} audio ${audioFiles.length === 1 ? 'file' : 'files'}...`, 'info');
    }

    let addedCount = 0;

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];

      try {
        // Parse ID3v2 metadata & embedded artwork
        let tags = {
          title: file.name.replace(/\.[^/.]+$/, '').trim(),
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          year: '',
          artwork: null
        };

        if (window.SS?.audioEngine?.parseID3) {
          tags = await window.SS.audioEngine.parseID3(file);
        }

        const ext = file.name.split('.').pop().toUpperCase();
        const trackId = crypto.randomUUID
          ? crypto.randomUUID()
          : `trk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Construct full in-memory track object
        const track = {
          id: trackId,
          title: tags.title || file.name.replace(/\.[^/.]+$/, '').trim(),
          artist: tags.artist || 'Unknown Artist',
          album: tags.album || 'Unknown Album',
          year: tags.year || '',
          duration: 0,
          artworkUrl: tags.artwork || null,
          fileHandle: file,
          format: ext || 'AUDIO',
          bitrate: 0,
          sampleRate: 44100,
          addedAt: Date.now()
        };

        // If duplicate by filename and size, update existing fileHandle
        const existingIndex = this.library.findIndex(
          (t) => t.title === track.title && t.artist === track.artist
        );

        if (existingIndex !== -1) {
          this.library[existingIndex].fileHandle = file;
          this.library[existingIndex].artworkUrl = track.artworkUrl || this.library[existingIndex].artworkUrl;
          if (window.SS?.storage?.saveAudioBlob) {
            await window.SS.storage.saveAudioBlob(this.library[existingIndex].id, file);
          }
        } else {
          this.library.push(track);
          if (window.SS?.storage?.saveAudioBlob) {
            await window.SS.storage.saveAudioBlob(trackId, file);
          }

          // Serializable metadata without DOM File handle
          const { fileHandle, ...meta } = track;
          this.libraryMeta.push(meta);
          addedCount++;
        }
      } catch (err) {
        console.warn(`[SS.app] Failed to parse tags for "${file.name}":`, err);
      }
    }

    // Persist metadata to storage
    if (window.SS?.storage?.saveLibraryMeta) {
      window.SS.storage.saveLibraryMeta(this.libraryMeta);
    }

    // Dispatch library updated event
    document.dispatchEvent(new CustomEvent('ss:library-updated', {
      detail: { tracks: this.library }
    }));

    // Update UI components
    if (window.SS?.ui) {
      window.SS.ui.renderLibrary(this.library);
      window.SS.ui.switchView('library');
      window.SS.ui.showToast(`Added ${addedCount} ${addedCount === 1 ? 'track' : 'tracks'} to library`, 'success');
    }

    this.renderHomeSections();
  },

  // =========================================================================
  // Playback Lifecycles
  // =========================================================================

  /**
   * Loads track into audio engine, begins playback, extracts ambient palette,
   * updates now-playing bars, lyrics, and document title.
   * @param {object} track - Track model object
   */
  async playTrack(track) {
    if (!track) return;

    // Check if session fileHandle exists
    if (!track.fileHandle && !track.url) {
      if (window.SS?.ui) {
        window.SS.ui.showToast(
          'Track file not in active session. Please re-add the file to listen.',
          'error'
        );
      }
      return;
    }

    try {
      // 1. Load track into Web Audio playback engine
      if (window.SS?.audioEngine?.loadTrack) {
        await window.SS.audioEngine.loadTrack(track);
      }

      // 2. Start playback
      if (window.SS?.audioEngine?.play) {
        await window.SS.audioEngine.play();
      }

      // Save last played state
      if (window.SS?.storage?.saveLastPlayedState) {
        window.SS.storage.saveLastPlayedState({
          trackId: track.id,
          currentTime: 0
        });
      }

      // 3. Update UI states
      if (window.SS?.ui) {
        window.SS.ui.updateNowPlayingBar(track);
        window.SS.ui.updateNowPlayingFull(track);
        window.SS.ui.updatePlayButton(true);
      }

      // 4. Extract dominant colors for organic fluid canvas background
      if (track.artworkUrl && window.SS?.fluidBg?.extractColors) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const colors = window.SS.fluidBg.extractColors(img);
            if (colors && window.SS.fluidBg.updateColors) {
              window.SS.fluidBg.updateColors(colors);
            }
          } catch (e) {
            console.warn('[SS.app] Failed to extract fluid background colors:', e);
          }
        };
        img.src = track.artworkUrl;
      }

      // 5. Load time-synchronized lyrics
      if (window.SS?.lyrics?.loadForTrack) {
        window.SS.lyrics.loadForTrack(track);
      }

      // 6. Update browser title
      document.title = `${track.title} • ${track.artist} — SongSiphera`;

      // 7. Track playback history
      this._recordRecentlyPlayed(track);
      this.renderHomeSections();

      // 8. Start visualizer if visualizer view is open
      if (window.SS?.ui?.currentView === 'visualizer' && window.SS?.visualizer?.start) {
        window.SS.visualizer.start();
      }
    } catch (err) {
      console.error('[SS.app] Error playing track:', err);
      if (window.SS?.ui) {
        window.SS.ui.showToast('Playback error: unable to decode audio source', 'error');
      }
    }
  },

  // =========================================================================
  // Library Management
  // =========================================================================

  /**
   * Adds single track to in-memory library and persistent storage.
   * @param {object} track
   */
  addToLibrary(track) {
    if (!track) return;
    this.library.push(track);

    const { fileHandle, ...meta } = track;
    this.libraryMeta.push(meta);

    if (window.SS?.storage?.saveLibraryMeta) {
      window.SS.storage.saveLibraryMeta(this.libraryMeta);
    }

    document.dispatchEvent(new CustomEvent('ss:library-updated', {
      detail: { tracks: this.library }
    }));
  },

  /**
   * Removes track from library, queue, and any user playlists.
   * @param {string} trackId
   */
  removeFromLibrary(trackId) {
    const index = this.library.findIndex((t) => t.id === trackId);
    if (index === -1) return;

    const [removed] = this.library.splice(index, 1);
    this.libraryMeta = this.libraryMeta.filter((t) => t.id !== trackId);

    // Save metadata
    if (window.SS?.storage?.saveLibraryMeta) {
      window.SS.storage.saveLibraryMeta(this.libraryMeta);
    }

    // Remove track from all playlists
    const playlists = window.SS?.playlist?.getAll() || [];
    playlists.forEach((pl) => {
      if (pl.trackIds.includes(trackId) && window.SS?.playlist?.removeTrack) {
        window.SS.playlist.removeTrack(pl.id, trackId);
      }
    });

    // Remove track from queue
    if (window.SS?.queue?.tracks) {
      const qIndex = window.SS.queue.tracks.findIndex((t) => t.id === trackId);
      if (qIndex !== -1) {
        window.SS.queue.remove(qIndex);
      }
    }

    // Re-render UI
    if (window.SS?.ui) {
      window.SS.ui.renderLibrary(this.library);
      window.SS.ui.showToast(`Removed "${removed.title}" from library`, 'info');
    }

    this.renderHomeSections();

    document.dispatchEvent(new CustomEvent('ss:library-updated', {
      detail: { tracks: this.library }
    }));
  },

  /**
   * Purges entire indexed library.
   */
  clearLibrary() {
    this.library = [];
    this.libraryMeta = [];
    this.recentlyPlayed = [];

    if (window.SS?.storage?.saveLibraryMeta) {
      window.SS.storage.saveLibraryMeta([]);
    }
    if (window.SS?.storage?.clearAudioBlobs) {
      window.SS.storage.clearAudioBlobs();
    }
    if (window.SS?.storage?.remove) {
      window.SS.storage.remove('last_played_state');
    }

    if (window.SS?.ui) {
      window.SS.ui.renderLibrary([]);
      window.SS.ui.showToast('Music library cleared', 'info');
    }

    this.renderHomeSections();

    document.dispatchEvent(new CustomEvent('ss:library-updated', {
      detail: { tracks: [] }
    }));
  },

  /**
   * Filters tracks matching query string across title, artist, and album.
   * @param {string} query
   * @returns {Array<object>}
   */
  search(query) {
    if (!query || !query.trim()) {
      return this.library;
    }

    const q = query.trim().toLowerCase();
    return this.library.filter((t) => {
      const title = (t.title || '').toLowerCase();
      const artist = (t.artist || '').toLowerCase();
      const album = (t.album || '').toLowerCase();
      return title.includes(q) || artist.includes(q) || album.includes(q);
    });
  },

  /**
   * Finds track by ID from active library or metadata.
   * @param {string} id
   * @returns {object|null}
   */
  getTrackById(id) {
    return this.library.find((t) => t.id === id) || this.libraryMeta.find((t) => t.id === id) || null;
  },

  // =========================================================================
  // Home View Curation
  // =========================================================================

  /**
   * Populates Recently Played and Quick Picks sections on the Home view.
   */
  renderHomeSections() {
    const recentGrid = document.getElementById('recently-played-grid');
    const quickGrid = document.getElementById('quick-picks-grid');

    const defaultArt = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' fill='%23666' viewBox='0 0 24 24'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E";

    // 1. Recently Played Grid
    if (recentGrid) {
      recentGrid.innerHTML = '';
      const recentTracks = this.recentlyPlayed.length > 0
        ? this.recentlyPlayed
        : this.library.slice(0, 6);

      if (recentTracks.length === 0) {
        recentGrid.innerHTML = `
          <div class="empty-home-hint card glass">
            <p>Your audio sessions will appear here once you play music.</p>
          </div>
        `;
      } else {
        recentTracks.forEach((track) => {
          const card = document.createElement('div');
          card.className = 'curated-card glass card';
          const art = track.artworkUrl || defaultArt;

          card.innerHTML = `
            <div class="curated-art-wrap">
              <img src="${art}" alt="${track.title}" class="curated-img" loading="lazy" />
              <button type="button" class="curated-play-badge btn-icon" title="Play">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
            </div>
            <div class="curated-info">
              <span class="curated-title" title="${track.title}">${track.title}</span>
              <span class="curated-artist" title="${track.artist}">${track.artist}</span>
            </div>
          `;

          card.addEventListener('click', () => {
            if (window.SS?.queue) {
              window.SS.queue.setQueue([track], 0);
            }
            this.playTrack(track);
          });

          recentGrid.appendChild(card);
        });
      }
    }

    // 2. Quick Picks Grid
    if (quickGrid) {
      quickGrid.innerHTML = '';
      const picks = [...this.library].reverse().slice(0, 6);

      if (picks.length === 0) {
        quickGrid.innerHTML = `
          <div class="empty-home-hint card glass">
            <p>Load audio tracks into your vault to unlock quick recommendations.</p>
          </div>
        `;
      } else {
        picks.forEach((track) => {
          const card = document.createElement('div');
          card.className = 'curated-card glass card';
          const art = track.artworkUrl || defaultArt;

          card.innerHTML = `
            <div class="curated-art-wrap">
              <img src="${art}" alt="${track.title}" class="curated-img" loading="lazy" />
              <button type="button" class="curated-play-badge btn-icon" title="Play">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
            </div>
            <div class="curated-info">
              <span class="curated-title" title="${track.title}">${track.title}</span>
              <span class="curated-artist" title="${track.artist}">${track.artist}</span>
            </div>
          `;

          card.addEventListener('click', () => {
            if (window.SS?.queue) {
              window.SS.queue.setQueue(this.library, this.library.indexOf(track));
            }
            this.playTrack(track);
          });

          quickGrid.appendChild(card);
        });
      }
    }
  },

  // =========================================================================
  // Internal Helpers & Listeners
  // =========================================================================

  /**
   * Pushes track to front of recently played history.
   * @private
   */
  _recordRecentlyPlayed(track) {
    if (!track) return;
    this.recentlyPlayed = [track, ...this.recentlyPlayed.filter((t) => t.id !== track.id)].slice(0, 8);
  },

  /**
   * Binds system-wide events on document.
   * @private
   */
  _bindGlobalEvents() {
    // Save playback time updates for session restoration
    document.addEventListener('ss:timeupdate', (e) => {
      if (window.SS?.storage?.saveLastPlayedState && window.SS?.audioEngine?.currentTrack) {
        window.SS.storage.saveLastPlayedState({
          trackId: window.SS.audioEngine.currentTrack.id,
          currentTime: e.detail.currentTime
        });
      }
    });

    // Automatic track transition when current audio ends
    document.addEventListener('ss:track-ended', () => {
      console.log('[SS.app] Track playback completed. Advancing queue...');
      if (window.SS?.queue) {
        const nextTrack = window.SS.queue.next();
        if (nextTrack) {
          this.playTrack(nextTrack);
        } else {
          if (window.SS?.audioEngine) {
            window.SS.audioEngine.pause();
          }
          if (window.SS?.ui) {
            window.SS.ui.updatePlayButton(false);
          }
        }
      }
    });

    // Save volume changes to local settings
    document.addEventListener('ss:volume-changed', (e) => {
      if (window.SS?.storage?.saveSettings) {
        window.SS.storage.saveSettings({ volume: e.detail.volume });
      }
    });
  }
};

// ===========================================================================
// Application Entry Point
// ===========================================================================
document.addEventListener('DOMContentLoaded', () => {
  SS.app.init();
});
