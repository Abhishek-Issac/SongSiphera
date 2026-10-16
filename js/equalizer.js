/**
 * SongSiphera — Premium Web Audio Player
 * 10-Band Equalizer Engine (js/equalizer.js)
 *
 * Implements a high-precision 10-band parametric equalizer using Web Audio BiquadFilterNodes.
 * Features 19 audiophile presets, proportional intensity scaling, dynamic bass boost,
 * and seamless audio graph insertion into SS.audioEngine.
 */

window.SS = window.SS || {};

SS.equalizer = {
  // Center frequencies for the 10 bands (Hz)
  frequencies: [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],

  // BiquadFilterNode instances
  filters: [],

  // Current base band gains in dB (-12 to +12)
  currentBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],

  // Active preset name
  currentPreset: 'flat',

  // Bass boost level (0-100)
  bassBoost: 0,

  // Intensity multiplier (0-100, where 50 is 1.0x, 0 is flat, 100 is 2.0x)
  intensity: 50,

  // Equalizer presets definition
  presets: {
    'flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'bass-boost': [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
    'treble-boost': [0, 0, 0, 0, 0, 0, 2, 4, 6, 8],
    'vocal': [-2, -1, 0, 2, 4, 4, 3, 2, 0, -1],
    'rock': [5, 4, 2, 0, -1, -1, 0, 2, 4, 5],
    'pop': [-1, 1, 3, 4, 3, 0, -1, -2, -1, 0],
    'jazz': [4, 3, 1, 2, 0, -1, 0, 1, 3, 4],
    'classical': [5, 4, 3, 2, 0, 0, 0, 2, 3, 5],
    'electronic': [6, 5, 2, 0, -2, 0, 1, 4, 5, 6],
    'acoustic': [4, 3, 2, 1, 0, 0, 1, 2, 3, 3],
    'hip-hop': [7, 6, 3, 1, 0, -1, 0, 1, 2, 3],
    'r-and-b': [3, 6, 4, 1, -1, -1, 1, 2, 3, 2],
    'latin': [3, 2, 0, -1, 0, 1, 2, 0, 3, 4],
    'podcast': [-2, 0, 2, 4, 4, 3, 2, 1, 0, -1],
    // Mood-specific signature presets
    'chaos-vshape': [8, 6, 4, 0, -3, -2, 0, 3, 6, 8],
    'midnight-warm': [3, 4, 3, 2, 1, 0, -1, -1, 0, 1],
    'retro-vinyl': [2, 3, 4, 3, 1, 0, -1, -2, -4, -6],
    'pure-flat': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'neon-bass': [10, 8, 5, 2, 0, 1, 2, 4, 5, 6]
  },

  // Internal reference to AudioContext
  _audioContext: null,

  // =========================================================================
  // Initialization & Filter Chain Construction
  // =========================================================================

  /**
   * Builds 10 peaking BiquadFilterNodes, connects them sequentially,
   * inserts the chain into SS.audioEngine, and loads stored settings.
   * @param {AudioContext} [audioContext]
   */
  init(audioContext) {
    this._audioContext = audioContext || SS.audioEngine?.audioContext;

    if (!this._audioContext) {
      if (SS.audioEngine) {
        SS.audioEngine.init();
        this._audioContext = SS.audioEngine.audioContext;
      }
    }

    if (!this._audioContext) {
      console.warn('[SS.equalizer] AudioContext not available yet.');
      return;
    }

    // Clear any existing filters
    this.filters = [];

    // Create 10 BiquadFilterNodes
    for (let i = 0; i < this.frequencies.length; i++) {
      const filter = this._audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = this.frequencies[i];
      filter.Q.value = 1.4;
      filter.gain.value = 0;
      this.filters.push(filter);
    }

    // Connect filters in series: filter[0] -> filter[1] -> ... -> filter[9]
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }

    // Insert chain into audioEngine audio graph
    if (SS.audioEngine?.insertEQChain) {
      SS.audioEngine.insertEQChain(this.filters[0], this.filters[this.filters.length - 1]);
    }

    // Restore saved settings or defaults
    const saved = SS.storage?.getEQSettings();
    if (saved) {
      if (Array.isArray(saved.bands) && saved.bands.length === 10) {
        this.currentBands = [...saved.bands];
      }
      if (typeof saved.preset === 'string') {
        this.currentPreset = saved.preset;
      }
      if (typeof saved.bassBoost === 'number') {
        this.bassBoost = saved.bassBoost;
      }
      if (typeof saved.intensity === 'number') {
        this.intensity = saved.intensity;
      }
    }

    this._applyFilters();
    console.log('[SS.equalizer] Equalizer initialized with 10 bands.');
  },

  /**
   * Returns first and last filter in the series for audio routing.
   * @returns {{first: BiquadFilterNode|null, last: BiquadFilterNode|null}}
   */
  getFilterChain() {
    if (this.filters.length === 0) {
      return { first: null, last: null };
    }
    return {
      first: this.filters[0],
      last: this.filters[this.filters.length - 1]
    };
  },

  // =========================================================================
  // Gain Computation & Filter Updates
  // =========================================================================

  /**
   * Recalculates effective dB gains taking into account intensity scaling and bass boost,
   * then updates the Web Audio filter nodes smoothly.
   * @private
   */
  _applyFilters() {
    if (!this.filters || this.filters.length === 0) return;

    // Intensity scalar: 50 is 1.0x, 0 is 0.0x, 100 is 2.0x
    const intensityScale = this.intensity / 50;

    // Bass boost extra gains for the lowest 3 bands: 32Hz, 64Hz, 125Hz
    // Max extra gain is +12dB scaled per band
    const bassRatios = [1.0, 0.75, 0.45];
    const bassRatioScale = (this.bassBoost / 100) * 12;

    const ctx = this._audioContext;
    const now = ctx ? ctx.currentTime : 0;

    for (let i = 0; i < this.filters.length; i++) {
      let effectiveGain = this.currentBands[i] * intensityScale;

      if (i < 3) {
        effectiveGain += bassRatioScale * bassRatios[i];
      }

      // Hard clamp between -24dB and +24dB to protect audio equipment
      effectiveGain = Math.max(-24, Math.min(24, effectiveGain));

      const filter = this.filters[i];
      if (filter && filter.gain) {
        if (ctx) {
          filter.gain.setTargetAtTime(effectiveGain, now, 0.015);
        } else {
          filter.gain.value = effectiveGain;
        }
      }
    }
  },

  /**
   * Persists current EQ configuration to localStorage.
   * @private
   */
  _persist() {
    if (SS.storage?.saveEQSettings) {
      SS.storage.saveEQSettings({
        preset: this.currentPreset,
        bands: [...this.currentBands],
        bassBoost: this.bassBoost,
        intensity: this.intensity
      });
    }
  },

  /**
   * Dispatches ss:eq-changed event on document.
   * @private
   */
  _notify() {
    document.dispatchEvent(new CustomEvent('ss:eq-changed', {
      detail: {
        bands: this.getCurrentBands(),
        preset: this.currentPreset,
        bassBoost: this.bassBoost,
        intensity: this.intensity
      }
    }));
  },

  // =========================================================================
  // Public Control Methods
  // =========================================================================

  /**
   * Set gain for a specific band index (0 to 9).
   * @param {number} index - Band index (0: 32Hz ... 9: 16kHz)
   * @param {number} gainDB - Gain in decibels (-12 to +12)
   */
  setBand(index, gainDB) {
    if (index < 0 || index >= this.frequencies.length) return;

    const clampedGain = Math.max(-12, Math.min(12, Number(gainDB) || 0));
    this.currentBands[index] = clampedGain;
    this.currentPreset = 'custom';

    this._applyFilters();
    this._persist();
    this._notify();
  },

  /**
   * Apply an equalizer preset by name.
   * @param {string} name - Name of preset
   * @returns {boolean} True if preset found and applied
   */
  setPreset(name) {
    const presetGains = this.presets[name];
    if (!presetGains || !Array.isArray(presetGains)) {
      console.warn(`[SS.equalizer] Preset "${name}" not found.`);
      return false;
    }

    this.currentPreset = name;
    this.currentBands = [...presetGains];

    this._applyFilters();
    this._persist();
    this._notify();
    return true;
  },

  /**
   * Adjust Bass Boost level (0 to 100).
   * Adds up to +12dB additional boost to the first 3 bands.
   * @param {number} value - Boost percentage (0-100)
   */
  setBassBoost(value) {
    const clamped = Math.max(0, Math.min(100, Number(value) || 0));
    this.bassBoost = clamped;

    this._applyFilters();
    this._persist();
    this._notify();
  },

  /**
   * Adjust overall EQ Intensity (0 to 100).
   * 0 = flat response, 50 = 1x (standard preset gain), 100 = 2x exaggerated curve.
   * @param {number} value - Intensity percentage (0-100)
   */
  setIntensity(value) {
    const clamped = Math.max(0, Math.min(100, Number(value) || 0));
    this.intensity = clamped;

    this._applyFilters();
    this._persist();
    this._notify();
  },

  /**
   * Save the current EQ curve as a custom preset.
   * @param {string} name - Preset name
   */
  saveCustomPreset(name) {
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim().toLowerCase();
    this.presets[trimmed] = [...this.currentBands];
    this.currentPreset = trimmed;

    this._persist();
    this._notify();
    console.log(`[SS.equalizer] Saved custom preset "${trimmed}".`);
  },

  /**
   * Retrieve current base band gains (10 items).
   * @returns {number[]} Array of 10 dB values
   */
  getCurrentBands() {
    return [...this.currentBands];
  },

  /**
   * Returns dictionary of all registered presets.
   * @returns {object}
   */
  getPresets() {
    return { ...this.presets };
  }
};
