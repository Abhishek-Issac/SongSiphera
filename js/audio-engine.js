/**
 * SongSiphera — Premium Web Audio Player
 * Audio Playback Engine (js/audio-engine.js)
 *
 * Core audio graph implementation using Web Audio API:
 * HTMLAudioElement -> MediaElementSource -> [Equalizer Chain] -> AnalyserNode -> GainNode -> Destination
 * Includes a pure vanilla binary ID3v2 tag parser with APIC embedded artwork extraction.
 */

window.SS = window.SS || {};

SS.audioEngine = {
  // Web Audio Nodes and HTMLAudioElement
  audioContext: null,
  sourceNode: null,
  analyserNode: null,
  gainNode: null,
  audioElement: null,

  // Playback state
  currentTrack: null,
  isPlaying: false,

  // Internal references
  _currentObjectURL: null,
  _eqFirstNode: null,
  _eqLastNode: null,
  _freqDataArray: null,
  _timeDataArray: null,
  _isInitialized: false,

  // =========================================================================
  // Initialization & Audio Graph
  // =========================================================================

  /**
   * Initializes the audio context, creates DOM audio element, builds audio node graph.
   */
  init() {
    if (this._isInitialized) return;

    // 1. Create or retrieve audio element
    let el = document.getElementById('ss-hidden-audio') || document.getElementById('audio-element');
    if (!el) {
      el = document.createElement('audio');
      el.id = 'ss-hidden-audio';
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      el.style.display = 'none';
      document.body.appendChild(el);
    } else {
      el.id = 'ss-hidden-audio';
    }
    this.audioElement = el;

    // 2. Setup AudioContext (handle browser prefixes)
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioCtx();

    // 3. Create audio processing nodes
    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);

    // Analyser node configured for frequency and time-domain analysis
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 512; // 256 frequency bins
    this.analyserNode.smoothingTimeConstant = 0.82;

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0.8;

    // 4. Default graph connection: Source -> Analyser -> Gain -> Destination
    this.sourceNode.connect(this.analyserNode);
    this.analyserNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    // Reusable typed arrays for visualization performance
    this._freqDataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this._timeDataArray = new Uint8Array(this.analyserNode.fftSize);

    // 5. Setup native audio element event listeners
    this._bindAudioEvents();

    // 6. Handle autoplay policy unlock on first user gesture
    this._setupAutoplayUnlock();

    this._isInitialized = true;
    console.log('[SS.audioEngine] Audio engine initialized successfully.');
  },

  /**
   * Insert equalizer filter chain between sourceNode and analyserNode.
   * Called by SS.equalizer during initialization.
   * @param {AudioNode} firstFilter - First BiquadFilterNode in EQ chain
   * @param {AudioNode} lastFilter - Last BiquadFilterNode in EQ chain
   */
  insertEQChain(firstFilter, lastFilter) {
    if (!this.sourceNode || !this.analyserNode) {
      console.warn('[SS.audioEngine] Cannot insert EQ chain: nodes not ready.');
      return;
    }

    try {
      // Disconnect current source node output
      this.sourceNode.disconnect();

      this._eqFirstNode = firstFilter;
      this._eqLastNode = lastFilter;

      // Rewire: Source -> firstFilter ... lastFilter -> Analyser
      this.sourceNode.connect(firstFilter);
      lastFilter.connect(this.analyserNode);

      console.log('[SS.audioEngine] EQ filter chain inserted into audio graph.');
    } catch (err) {
      console.error('[SS.audioEngine] Error inserting EQ chain:', err);
      // Fallback: reconnect directly to analyser
      try {
        this.sourceNode.connect(this.analyserNode);
      } catch (e) {
        // Ignore fallback failure
      }
    }
  },

  /**
   * Bind event listeners to HTMLAudioElement.
   * @private
   */
  _bindAudioEvents() {
    const el = this.audioElement;

    el.addEventListener('timeupdate', () => {
      document.dispatchEvent(new CustomEvent('ss:timeupdate', {
        detail: {
          currentTime: this.getCurrentTime(),
          duration: this.getDuration()
        }
      }));
    });

    el.addEventListener('ended', () => {
      this.isPlaying = false;
      document.dispatchEvent(new CustomEvent('ss:track-ended'));
    });

    el.addEventListener('play', () => {
      this.isPlaying = true;
      document.dispatchEvent(new CustomEvent('ss:play', {
        detail: { track: this.currentTrack }
      }));
    });

    el.addEventListener('pause', () => {
      this.isPlaying = false;
      document.dispatchEvent(new CustomEvent('ss:pause'));
    });

    el.addEventListener('loadedmetadata', () => {
      if (this.currentTrack) {
        if (!this.currentTrack.duration || isNaN(this.currentTrack.duration)) {
          this.currentTrack.duration = el.duration;
        }
        if (!this.currentTrack.sampleRate) {
          this.currentTrack.sampleRate = this.audioContext?.sampleRate || 44100;
        }
      }
    });

    el.addEventListener('error', (e) => {
      console.error('[SS.audioEngine] Audio element playback error:', e);
      this.isPlaying = false;
    });
  },

  /**
   * Resumes AudioContext on initial user gesture to comply with browser autoplay policies.
   * @private
   */
  _setupAutoplayUnlock() {
    const unlock = () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          console.log('[SS.audioEngine] AudioContext resumed via user gesture.');
        });
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  },

  // =========================================================================
  // Track Loading & Playback Controls
  // =========================================================================

  /**
   * Loads an audio track into the playback engine.
   * Creates an object URL from track.fileHandle if present.
   * @param {object} track - Track model object
   * @returns {Promise<void>}
   */
  async loadTrack(track) {
    if (!track) return;
    this.init();

    // Revoke previous blob URL to prevent memory leaks
    if (this._currentObjectURL) {
      URL.revokeObjectURL(this._currentObjectURL);
      this._currentObjectURL = null;
    }

    let src = '';
    if (track.fileHandle instanceof File || track.fileHandle instanceof Blob) {
      this._currentObjectURL = URL.createObjectURL(track.fileHandle);
      src = this._currentObjectURL;
    } else if (track.url) {
      src = track.url;
    } else {
      throw new Error('[SS.audioEngine] No valid fileHandle or URL provided for track.');
    }

    this.currentTrack = track;
    this.audioElement.src = src;

    return new Promise((resolve) => {
      const onCanPlay = () => {
        this.audioElement.removeEventListener('canplay', onCanPlay);
        if (track.duration === 0 || !track.duration) {
          track.duration = this.audioElement.duration || 0;
        }
        document.dispatchEvent(new CustomEvent('ss:track-loaded', {
          detail: { track }
        }));
        resolve();
      };

      // In case metadata is already loaded
      if (this.audioElement.readyState >= 2) {
        onCanPlay();
      } else {
        this.audioElement.addEventListener('canplay', onCanPlay, { once: true });
      }
    });
  },

  /**
   * Start or resume audio playback.
   */
  async play() {
    if (!this.audioElement) return;

    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    try {
      await this.audioElement.play();
      this.isPlaying = true;
    } catch (err) {
      console.warn('[SS.audioEngine] Play request failed/aborted:', err);
    }
  },

  /**
   * Pause audio playback.
   */
  pause() {
    if (!this.audioElement) return;
    this.audioElement.pause();
    this.isPlaying = false;
  },

  /**
   * Toggle between play and pause states.
   */
  togglePlayback() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  },

  /**
   * Seek to target time in seconds.
   * @param {number} seconds
   */
  seek(seconds) {
    if (!this.audioElement || isNaN(seconds)) return;
    const clamped = Math.max(0, Math.min(seconds, this.getDuration()));
    this.audioElement.currentTime = clamped;

    document.dispatchEvent(new CustomEvent('ss:timeupdate', {
      detail: {
        currentTime: clamped,
        duration: this.getDuration()
      }
    }));
  },

  /**
   * Set master playback volume (0 to 1).
   * @param {number} val
   */
  setVolume(val) {
    const clamped = Math.max(0, Math.min(1, Number(val) || 0));
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(clamped, this.audioContext?.currentTime || 0);
    }
    if (this.audioElement) {
      this.audioElement.volume = clamped;
    }

    document.dispatchEvent(new CustomEvent('ss:volume-changed', {
      detail: { volume: clamped }
    }));
  },

  /**
   * Get current playback position in seconds.
   * @returns {number}
   */
  getCurrentTime() {
    return this.audioElement?.currentTime || 0;
  },

  /**
   * Get total track duration in seconds.
   * @returns {number}
   */
  getDuration() {
    const dur = this.audioElement?.duration;
    return (dur && !isNaN(dur) && isFinite(dur)) ? dur : (this.currentTrack?.duration || 0);
  },

  // =========================================================================
  // Real-time Audio Analysis
  // =========================================================================

  /**
   * Returns current frequency data array (0-255 values per bin).
   * @returns {Uint8Array}
   */
  getFrequencyData() {
    if (!this.analyserNode) {
      return new Uint8Array(256);
    }
    this.analyserNode.getByteFrequencyData(this._freqDataArray);
    return this._freqDataArray;
  },

  /**
   * Returns current time-domain waveform data array.
   * @returns {Uint8Array}
   */
  getTimeDomainData() {
    if (!this.analyserNode) {
      return new Uint8Array(512);
    }
    this.analyserNode.getByteTimeDomainData(this._timeDataArray);
    return this._timeDataArray;
  },

  /**
   * Computes normalized bass energy level (0-100) from lowest 10 frequency bins.
   * @returns {number}
   */
  getBassLevel() {
    const freq = this.getFrequencyData();
    let sum = 0;
    const count = 10;
    for (let i = 0; i < count; i++) {
      sum += freq[i];
    }
    const avg = sum / count;
    // Map average (0-255) to 0-100 range
    return Math.min(100, Math.max(0, Math.round((avg / 255) * 100)));
  },

  // =========================================================================
  // Master Real-Time Sound Telemetry & DSP Metrics (Part 16 & 17)
  // =========================================================================

  _bpmState: {
    lastBeatTime: 0,
    intervals: [],
    prevBassEnergy: 0,
    bpm: 120
  },

  /**
   * Computes rich real-time audio telemetry for the Now Playing Sound panel.
   * Calculates track bass percentage, peak/RMS dBFS, headroom, dominant musical note, and BPM.
   * @returns {object}
   */
  getSoundTelemetry() {
    const freq = this.getFrequencyData();
    const time = this.getTimeDomainData();

    // 1. Calculate frequency band energies & Track Bass Share
    // Total frequency bins = 256. With sampleRate ~44100 / 48000, each bin is ~86-93 Hz.
    // Bins 0-3 cover sub & low bass (<180 Hz)
    let lowEnergy = 0;
    let totalEnergy = 0;
    let maxBinVal = 0;
    let maxBinIdx = 0;

    for (let i = 0; i < freq.length; i++) {
      const val = freq[i];
      totalEnergy += val;
      if (i < 4) {
        lowEnergy += val;
      }
      if (val > maxBinVal && i > 0) {
        maxBinVal = val;
        maxBinIdx = i;
      }
    }

    // Ratio of low-frequency energy to total spectral energy
    const rawBassShare = totalEnergy > 10 ? (lowEnergy / totalEnergy) * 100 : 0;
    const trackBassPercent = Math.min(100, Math.max(0, Math.round(rawBassShare)));

    // 2. Calculate Peak & RMS from Time-Domain Data
    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < time.length; i++) {
      // Normalize uint8 (0-255, center 128) to -1.0 .. +1.0
      const norm = (time[i] - 128) / 128;
      const absVal = Math.abs(norm);
      if (absVal > peak) peak = absVal;
      sumSquares += norm * norm;
    }
    const rms = Math.sqrt(sumSquares / time.length);

    // Convert to dBFS
    const peakDbfs = peak > 0.0001 ? Math.max(-60, Math.round(20 * Math.log10(peak) * 10) / 10) : -60;
    const rmsDbfs = rms > 0.0001 ? Math.max(-60, Math.round(20 * Math.log10(rms) * 10) / 10) : -60;
    const headroom = Math.max(0, Math.round((0 - peakDbfs) * 10) / 10);
    const isSafe = peakDbfs < -0.3;

    // 3. Dominant Frequency & Musical Note Name
    const nyquist = (this.audioContext?.sampleRate || 44100) / 2;
    const binWidth = nyquist / freq.length;
    const dominantHz = Math.round(maxBinIdx * binWidth);

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let noteStr = '--';
    if (dominantHz > 30 && maxBinVal > 40) {
      const midiNum = Math.round(69 + 12 * Math.log2(dominantHz / 440));
      if (midiNum >= 12 && midiNum <= 127) {
        const octave = Math.floor(midiNum / 12) - 1;
        const noteIndex = midiNum % 12;
        noteStr = `${noteNames[noteIndex]}${octave}`;
      }
    }

    // 4. Rhythm & Onset / Beat Detection (adaptive flux)
    const now = performance.now();
    const currentBass = lowEnergy / 4;
    if (currentBass > 140 && (currentBass - this._bpmState.prevBassEnergy) > 30) {
      if (now - this._bpmState.lastBeatTime > 280) { // Max ~214 BPM
        const interval = now - this._bpmState.lastBeatTime;
        this._bpmState.lastBeatTime = now;
        if (interval > 300 && interval < 1500) {
          this._bpmState.intervals.push(interval);
          if (this._bpmState.intervals.length > 5) this._bpmState.intervals.shift();
          const avgInterval = this._bpmState.intervals.reduce((a, b) => a + b, 0) / this._bpmState.intervals.length;
          this._bpmState.bpm = Math.round(60000 / avgInterval);
        }
      }
    }
    this._bpmState.prevBassEnergy = currentBass;

    const boostPercent = window.SS?.equalizer?.bassBoost ?? 0;

    return {
      trackBassPercent,
      boostPercent,
      peakDbfs,
      rmsDbfs,
      headroom,
      isSafe,
      dominantHz,
      noteStr,
      bpm: this.isPlaying ? this._bpmState.bpm : 0,
      activeGraph: {
        eq: Boolean(window.SS?.equalizer?.currentPreset && window.SS.equalizer.currentPreset !== 'flat'),
        bassBoost: boostPercent > 0
      }
    };
  },

  // =========================================================================
  // Sleep Timer System (Part 16.7)
  // =========================================================================

  _sleepTimer: {
    active: false,
    targetTimestamp: 0,
    durationMinutes: 0,
    isEndOfTrack: false,
    intervalId: null,
    isFading: false
  },

  /**
   * Set or cancel the playback sleep timer.
   * @param {number} minutes - Duration in minutes (0 cancels timer)
   * @param {boolean} [isEndOfTrack=false] - Whether to stop at track conclusion
   */
  setSleepTimer(minutes, isEndOfTrack = false) {
    if (this._sleepTimer.intervalId) {
      clearInterval(this._sleepTimer.intervalId);
      this._sleepTimer.intervalId = null;
    }

    if (!minutes && !isEndOfTrack) {
      this._sleepTimer.active = false;
      this._sleepTimer.targetTimestamp = 0;
      this._sleepTimer.durationMinutes = 0;
      this._sleepTimer.isEndOfTrack = false;
      this._sleepTimer.isFading = false;
      document.dispatchEvent(new CustomEvent('ss:sleep-timer-updated', {
        detail: { active: false, remainingSeconds: 0 }
      }));
      return;
    }

    this._sleepTimer.active = true;
    this._sleepTimer.durationMinutes = minutes;
    this._sleepTimer.isEndOfTrack = Boolean(isEndOfTrack);
    this._sleepTimer.isFading = false;
    this._sleepTimer.targetTimestamp = isEndOfTrack ? 0 : Date.now() + minutes * 60 * 1000;

    if (!isEndOfTrack) {
      this._sleepTimer.intervalId = setInterval(() => {
        const remaining = Math.max(0, Math.round((this._sleepTimer.targetTimestamp - Date.now()) / 1000));
        
        // 30 seconds before expiration: begin smooth exponential gain fade-out
        if (remaining <= 30 && remaining > 0 && !this._sleepTimer.isFading && this.gainNode && this.audioContext) {
          this._sleepTimer.isFading = true;
          try {
            const currGain = this.gainNode.gain.value;
            this.gainNode.gain.setValueAtTime(currGain, this.audioContext.currentTime);
            this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + remaining);
          } catch (e) {
            // Ignore automation edge cases
          }
        }

        if (remaining <= 0) {
          clearInterval(this._sleepTimer.intervalId);
          this._sleepTimer.intervalId = null;
          this._sleepTimer.active = false;
          this.pause();
          // Restore gain node to normal
          if (this.gainNode) {
            const restoredVol = window.SS?.storage?.getSettings()?.volume || 0.8;
            this.gainNode.gain.setValueAtTime(restoredVol, this.audioContext?.currentTime || 0);
          }
          if (window.SS?.ui?.showToast) {
            window.SS.ui.showToast('Sleep timer reached — playback paused.', 'info');
          }
        }

        document.dispatchEvent(new CustomEvent('ss:sleep-timer-updated', {
          detail: { active: this._sleepTimer.active, remainingSeconds: remaining }
        }));
      }, 1000);
    }

    document.dispatchEvent(new CustomEvent('ss:sleep-timer-updated', {
      detail: {
        active: true,
        remainingSeconds: isEndOfTrack ? 0 : minutes * 60,
        isEndOfTrack
      }
    }));
  },

  /**
   * Get current sleep timer remaining state.
   * @returns {{active: boolean, remainingSeconds: number, isEndOfTrack: boolean}}
   */
  getSleepTimerState() {
    if (!this._sleepTimer.active) {
      return { active: false, remainingSeconds: 0, isEndOfTrack: false };
    }
    const remaining = this._sleepTimer.isEndOfTrack 
      ? Math.max(0, Math.round(this.getDuration() - this.getCurrentTime()))
      : Math.max(0, Math.round((this._sleepTimer.targetTimestamp - Date.now()) / 1000));
    return {
      active: true,
      remainingSeconds: remaining,
      isEndOfTrack: this._sleepTimer.isEndOfTrack
    };
  },

  // =========================================================================
  // Inline Pure Binary ID3v2 Parser
  // =========================================================================

  /**
   * Parses ID3v2.3 and ID3v2.4 tags from a File object.
   * Extracts Title, Artist, Album, Year, Track number, and APIC embedded artwork.
   * @param {File} file
   * @returns {Promise<{title: string, artist: string, album: string, year: string, artwork: string|null}>}
   */
  async parseID3(file) {
    const defaultTitle = file.name.replace(/\.[^/.]+$/, '').trim();
    const result = {
      title: defaultTitle,
      artist: 'Unknown Artist',
      album: 'Unknown Album',
      year: '',
      artwork: null
    };

    if (!file || typeof file.slice !== 'function') {
      return result;
    }

    try {
      // 1. Read first 10 bytes to inspect ID3 header
      const headerSlice = await file.slice(0, 10).arrayBuffer();
      if (headerSlice.byteLength < 10) return result;

      const headerView = new DataView(headerSlice);
      const isID3 = headerView.getUint8(0) === 0x49 && // 'I'
                    headerView.getUint8(1) === 0x44 && // 'D'
                    headerView.getUint8(2) === 0x33;   // '3'

      if (!isID3) return result;

      const majorVersion = headerView.getUint8(3); // 3 for 2.3, 4 for 2.4
      const flags = headerView.getUint8(5);
      const hasExtendedHeader = (flags & 0x40) !== 0;

      // Tag size is stored as 4 synchsafe bytes (7 bits per byte)
      const tagSize = ((headerView.getUint8(6) & 0x7f) << 21) |
                      ((headerView.getUint8(7) & 0x7f) << 14) |
                      ((headerView.getUint8(8) & 0x7f) << 7) |
                      (headerView.getUint8(9) & 0x7f);

      if (tagSize <= 0) return result;

      // 2. Read tag buffer (limit to max 12MB to protect memory from oversized art)
      const totalToRead = Math.min(file.size, 10 + tagSize, 12 * 1024 * 1024);
      const tagBuffer = await file.slice(0, totalToRead).arrayBuffer();
      const view = new DataView(tagBuffer);

      let offset = 10;
      const endOffset = Math.min(tagBuffer.byteLength, 10 + tagSize);

      // Handle extended header if present
      if (hasExtendedHeader && offset + 4 <= endOffset) {
        let extHeaderSize = 0;
        if (majorVersion === 4) {
          extHeaderSize = ((view.getUint8(offset) & 0x7f) << 21) |
                          ((view.getUint8(offset + 1) & 0x7f) << 14) |
                          ((view.getUint8(offset + 2) & 0x7f) << 7) |
                          (view.getUint8(offset + 3) & 0x7f);
        } else {
          extHeaderSize = view.getUint32(offset, false);
        }
        offset += extHeaderSize;
      }

      // Helper for decoding strings with proper character encoding
      const decodeString = (bytes, encodingByte) => {
        if (!bytes || bytes.length === 0) return '';
        try {
          if (encodingByte === 0) {
            // ISO-8859-1 (Latin1)
            let str = '';
            for (let i = 0; i < bytes.length; i++) {
              if (bytes[i] === 0) break;
              str += String.fromCharCode(bytes[i]);
            }
            return str.trim();
          } else if (encodingByte === 1) {
            // UTF-16 with BOM
            const decoder = new TextDecoder('utf-16');
            return decoder.decode(bytes).replace(/\0+$/, '').trim();
          } else if (encodingByte === 2) {
            // UTF-16BE without BOM
            const decoder = new TextDecoder('utf-16be');
            return decoder.decode(bytes).replace(/\0+$/, '').trim();
          } else if (encodingByte === 3) {
            // UTF-8
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(bytes).replace(/\0+$/, '').trim();
          }
        } catch (e) {
          console.warn('[SS.audioEngine] Text decoding error:', e);
        }
        return '';
      };

      // 3. Iterate through ID3 frames
      while (offset + 10 <= endOffset) {
        // Read Frame ID (4 ASCII characters)
        const frameId = String.fromCharCode(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2),
          view.getUint8(offset + 3)
        );

        // Padding reached (null bytes)
        if (frameId.charCodeAt(0) === 0 || /^[A-Z0-9]{4}$/.test(frameId) === false) {
          break;
        }

        // Frame size
        let frameSize = 0;
        if (majorVersion === 4) {
          // ID3v2.4 synchsafe integer
          frameSize = ((view.getUint8(offset + 4) & 0x7f) << 21) |
                      ((view.getUint8(offset + 5) & 0x7f) << 14) |
                      ((view.getUint8(offset + 6) & 0x7f) << 7) |
                      (view.getUint8(offset + 7) & 0x7f);
        } else {
          // ID3v2.3 32-bit regular integer
          frameSize = view.getUint32(offset + 4, false);
        }

        const frameBodyOffset = offset + 10;
        if (frameSize <= 0 || frameBodyOffset + frameSize > endOffset) {
          break;
        }

        const frameBytes = new Uint8Array(tagBuffer, frameBodyOffset, frameSize);

        // Frame interpretation
        if (frameId === 'TIT2') {
          // Title
          const encoding = frameBytes[0];
          const text = decodeString(frameBytes.subarray(1), encoding);
          if (text) result.title = text;
        } else if (frameId === 'TPE1') {
          // Artist
          const encoding = frameBytes[0];
          const text = decodeString(frameBytes.subarray(1), encoding);
          if (text) result.artist = text;
        } else if (frameId === 'TALB') {
          // Album
          const encoding = frameBytes[0];
          const text = decodeString(frameBytes.subarray(1), encoding);
          if (text) result.album = text;
        } else if (frameId === 'TYER' || frameId === 'TDRC') {
          // Year (TYER in 2.3, TDRC in 2.4)
          const encoding = frameBytes[0];
          const text = decodeString(frameBytes.subarray(1), encoding);
          if (text) result.year = text.substring(0, 4);
        } else if (frameId === 'APIC') {
          // Attached Picture (Artwork)
          try {
            const picEncoding = frameBytes[0];
            let picOffset = 1;

            // Extract MIME type (null-terminated Latin1 string)
            let mimeType = '';
            while (picOffset < frameBytes.length && frameBytes[picOffset] !== 0) {
              mimeType += String.fromCharCode(frameBytes[picOffset]);
              picOffset++;
            }
            picOffset++; // Skip null terminator

            // Picture type (e.g. 0x03 is front cover)
            const pictureType = frameBytes[picOffset];
            picOffset++;

            // Skip description string
            if (picEncoding === 1 || picEncoding === 2) {
              // 16-bit null terminator: 0x00 0x00
              while (picOffset + 1 < frameBytes.length) {
                if (frameBytes[picOffset] === 0 && frameBytes[picOffset + 1] === 0) {
                  picOffset += 2;
                  break;
                }
                picOffset += 2;
              }
            } else {
              // 8-bit null terminator: 0x00
              while (picOffset < frameBytes.length && frameBytes[picOffset] !== 0) {
                picOffset++;
              }
              picOffset++;
            }

            // Remaining bytes are raw image data
            if (picOffset < frameBytes.length) {
              const imageBytes = frameBytes.subarray(picOffset);

              // Auto-detect MIME if missing or generic
              if (!mimeType || mimeType === '-->') {
                if (imageBytes[0] === 0xff && imageBytes[1] === 0xd8) {
                  mimeType = 'image/jpeg';
                } else if (imageBytes[0] === 0x89 && imageBytes[1] === 0x50) {
                  mimeType = 'image/png';
                } else {
                  mimeType = 'image/jpeg';
                }
              }

              // Chunked base64 conversion to avoid call stack limits
              let binary = '';
              const chunkSize = 8192;
              for (let i = 0; i < imageBytes.length; i += chunkSize) {
                const sub = imageBytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, sub);
              }
              result.artwork = `data:${mimeType};base64,${btoa(binary)}`;
            }
          } catch (picErr) {
            console.warn('[SS.audioEngine] Error parsing APIC artwork:', picErr);
          }
        }

        // Advance to next frame (header is 10 bytes + frame size)
        offset += 10 + frameSize;
      }
    } catch (parseError) {
      console.warn('[SS.audioEngine] ID3 parser caught exception:', parseError);
    }

    return result;
  },

  // =========================================================================
  // Cleanup & Teardown
  // =========================================================================

  /**
   * Shuts down the audio engine and releases system resources.
   */
  destroy() {
    this.pause();
    if (this._currentObjectURL) {
      URL.revokeObjectURL(this._currentObjectURL);
      this._currentObjectURL = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this._isInitialized = false;
    this.currentTrack = null;
    console.log('[SS.audioEngine] Audio engine destroyed.');
  }
};
