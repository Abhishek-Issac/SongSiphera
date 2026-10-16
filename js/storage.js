/**
 * SongSiphera — Premium Web Audio Player
 * Storage Module (js/storage.js)
 *
 * Provides a robust, prefixed localStorage persistence layer with graceful
 * error handling, automatic JSON serialization/deserialization, and safe defaults.
 */

window.SS = window.SS || {};

SS.storage = {
  // Key prefix to prevent namespace collisions
  PREFIX: 'ss_',

  /**
   * Helper: Prepends prefix to key name.
   * @param {string} key
   * @returns {string}
   */
  _prefixKey(key) {
    return key.startsWith(this.PREFIX) ? key : `${this.PREFIX}${key}`;
  },

  /**
   * Retrieve and deserialize a value from localStorage.
   * @param {string} key - Raw or unprefixed key name
   * @param {*} [defaultValue=null] - Value returned if key is missing or parsing fails
   * @returns {*}
   */
  get(key, defaultValue = null) {
    try {
      const fullKey = this._prefixKey(key);
      const raw = localStorage.getItem(fullKey);
      if (raw === null || raw === undefined) {
        return defaultValue;
      }
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[SS.storage] Failed to get key "${key}":`, err);
      return defaultValue;
    }
  },

  /**
   * Serialize and persist a value to localStorage.
   * @param {string} key - Key name
   * @param {*} value - Value to serialize
   * @returns {boolean} True if write succeeded, false otherwise
   */
  set(key, value) {
    try {
      const fullKey = this._prefixKey(key);
      localStorage.setItem(fullKey, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`[SS.storage] Failed to set key "${key}":`, err);
      return false;
    }
  },

  /**
   * Remove an item from localStorage.
   * @param {string} key
   */
  remove(key) {
    try {
      const fullKey = this._prefixKey(key);
      localStorage.removeItem(fullKey);
    } catch (err) {
      console.warn(`[SS.storage] Failed to remove key "${key}":`, err);
    }
  },

  // =========================================================================
  // IndexedDB Audio Blob Cache (Persistent Local Library Files)
  // =========================================================================
  _idbPromise: null,

  _getDB() {
    if (this._idbPromise) return this._idbPromise;
    this._idbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('SongSipheraDB', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('audio_blobs')) {
          db.createObjectStore('audio_blobs');
        }
      };
    });
    return this._idbPromise;
  },

  async saveAudioBlob(id, blob) {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('audio_blobs', 'readwrite');
        const store = transaction.objectStore('audio_blobs');
        const request = store.put(blob, id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('[SS.storage] Failed to save audio blob:', err);
      return false;
    }
  },

  async getAudioBlob(id) {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('audio_blobs', 'readonly');
        const store = transaction.objectStore('audio_blobs');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('[SS.storage] Failed to get audio blob:', err);
      return null;
    }
  },

  async removeAudioBlob(id) {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('audio_blobs', 'readwrite');
        const store = transaction.objectStore('audio_blobs');
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('[SS.storage] Failed to remove audio blob:', err);
    }
  },

  async clearAudioBlobs() {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('audio_blobs', 'readwrite');
        const store = transaction.objectStore('audio_blobs');
        const request = store.clear();
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('[SS.storage] Failed to clear audio blobs:', err);
      return false;
    }
  },

  // =========================================================================
  // Last Played State Persistence
  // =========================================================================

  getLastPlayedState() {
    return this.get('last_played_state', {
      trackId: null,
      currentTime: 0
    });
  },

  saveLastPlayedState(data) {
    const current = this.getLastPlayedState();
    this.set('last_played_state', { ...current, ...data });
  },

  // =========================================================================
  // Library Metadata
  // =========================================================================

  /**
   * Load stored music library metadata.
   * @returns {Array<object>} Array of track metadata objects
   */
  getLibraryMeta() {
    return this.get('library_meta', []);
  },

  /**
   * Persist music library metadata.
   * Strips out non-serializable File handles before storing.
   * @param {Array<object>} tracks
   */
  saveLibraryMeta(tracks) {
    if (!Array.isArray(tracks)) return;
    const serializable = tracks.map(t => {
      // Exclude session-only fileHandle
      const { fileHandle, ...meta } = t;
      return meta;
    });
    this.set('library_meta', serializable);
  },

  // =========================================================================
  // Playlists
  // =========================================================================

  /**
   * Load user playlists.
   * @returns {Array<object>}
   */
  getPlaylists() {
    return this.get('playlists', []);
  },

  /**
   * Save user playlists.
   * @param {Array<object>} playlists
   */
  savePlaylists(playlists) {
    this.set('playlists', Array.isArray(playlists) ? playlists : []);
  },

  // =========================================================================
  // Playback Queue
  // =========================================================================

  /**
   * Load queue configuration and current state.
   * @returns {{trackIds: string[], currentIndex: number, shuffleMode: boolean, repeatMode: string}}
   */
  getQueue() {
    return this.get('queue', {
      trackIds: [],
      currentIndex: -1,
      shuffleMode: false,
      repeatMode: 'none'
    });
  },

  /**
   * Save playback queue state.
   * @param {object} data
   */
  saveQueue(data) {
    const current = this.getQueue();
    this.set('queue', { ...current, ...data });
  },

  // =========================================================================
  // Mood / Theme
  // =========================================================================

  /**
   * Load active mood theme.
   * Checks cookies first for instant server/client parity, falls back to localStorage.
   * @returns {string} Mood identifier ('default','chaos','midnight','retro','pure','neon')
   */
  getMood() {
    const fromCookie = window.SS?.cookies?.get && window.SS.cookies.get('ap_profile');
    if (fromCookie) return fromCookie;
    return this.get('mood', 'default');
  },

  /**
   * Persist active mood theme to both localStorage and cookies.
   * @param {string} mood
   */
  saveMood(mood) {
    if (typeof mood === 'string') {
      this.set('mood', mood);
      if (window.SS?.cookies?.set) {
        window.SS.cookies.set('ap_profile', mood);
      }
    }
  },

  // =========================================================================
  // Equalizer Settings
  // =========================================================================

  /**
   * Load 10-band EQ settings, preset, bass boost, and intensity.
   * @returns {{preset: string, bands: number[], bassBoost: number, intensity: number}}
   */
  getEQSettings() {
    return this.get('eq_settings', {
      preset: 'flat',
      bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      bassBoost: 0,
      intensity: 50
    });
  },

  /**
   * Save 10-band EQ settings to localStorage and cookies.
   * @param {object} data
   */
  saveEQSettings(data) {
    const current = this.getEQSettings();
    const updated = { ...current, ...data };
    this.set('eq_settings', updated);
    if (window.SS?.cookies?.set) {
      if (updated.preset) window.SS.cookies.set('ap_eq_preset', updated.preset);
      if (updated.bassBoost !== undefined) window.SS.cookies.set('ap_bass', updated.bassBoost);
    }
  },

  // =========================================================================
  // General Application Settings
  // =========================================================================

  /**
   * Load general player settings.
   * @returns {{volume: number, vizMode: string}}
   */
  getSettings() {
    const defaults = {
      volume: 0.8,
      vizMode: 'bars',
      theme: 'auto',
      motion: 'full',
      density: 'comfortable',
      sleepTimer: 0
    };
    const saved = this.get('settings', defaults);
    // Overlay cookie values if present
    if (window.SS?.cookies?.get) {
      const cookieVol = window.SS.cookies.get('ap_vol');
      if (cookieVol !== null) saved.volume = parseFloat(cookieVol) / 100;
      const cookieTheme = window.SS.cookies.get('ap_theme');
      if (cookieTheme) saved.theme = cookieTheme;
      const cookieMotion = window.SS.cookies.get('ap_motion');
      if (cookieMotion) saved.motion = cookieMotion;
    }
    return saved;
  },

  /**
   * Save general player settings to localStorage and cookies.
   * @param {object} data
   */
  saveSettings(data) {
    const current = this.getSettings();
    const updated = { ...current, ...data };
    this.set('settings', updated);
    if (window.SS?.cookies?.set) {
      if (updated.volume !== undefined) {
        window.SS.cookies.set('ap_vol', Math.round(updated.volume * 100));
      }
      if (updated.vizMode) {
        window.SS.cookies.set('ap_viz_mode', updated.vizMode);
      }
      if (updated.theme) {
        window.SS.cookies.set('ap_theme', updated.theme);
      }
      if (updated.motion) {
        window.SS.cookies.set('ap_motion', updated.motion);
      }
    }
  }
};
