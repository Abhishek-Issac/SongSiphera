/**
 * SongSiphera — Premium Web Audio Player
 * Audio Visualizer Engine (js/visualizer.js)
 *
 * Implements a 60fps hardware-accelerated canvas visualizer featuring 6 modes:
 * 1. bars      - 64-band frequency spectrum with rounded caps and gradient mirror reflection
 * 2. wave      - Smooth cubic-bezier oscilloscope waveform with triple-draw glow effect
 * 3. circular  - 128-radial-bar spectrum ring pulsing with real-time sub-bass energy
 * 4. particles - 150-particle swarm with bass explosion forces, treble jitter & node links
 * 5. galaxy    - 3-arm logarithmic spiral galaxy with nebula clouds and star twinkle
 * 6. terrain   - 3D retro synthwave wireframe grid with perspective scroll & scanlines
 *
 * Also provides multi-instance mini visualizers for EQ view (#eq-viz-mini)
 * and Now Playing overlay (#np-mini-viz).
 */

window.SS = window.SS || {};

SS.visualizer = {
  // ---------------------------------------------------------------------------
  // Canvas & Context References
  // ---------------------------------------------------------------------------
  canvas: null,
  ctx: null,

  // Mini Visualizer references
  miniCanvas: null,
  miniCtx: null,
  miniInstances: [], // Array of { canvas, ctx, prevBars: Float32Array }

  // ---------------------------------------------------------------------------
  // Visualizer State
  // ---------------------------------------------------------------------------
  mode: 'bars', // 'bars' | 'wave' | 'circular' | 'particles' | 'galaxy' | 'terrain'
  isActive: false,
  animationFrame: null,

  // Render timing & animation state
  _time: 0,
  _dpr: 1,
  _width: 0,
  _height: 0,

  // Mode-specific persistent data structures
  _barsPrev: new Float32Array(64),
  _circularAngle: 0,
  _galaxyAngle: 0,
  _galaxyStars: [],
  _galaxyNebulae: [],
  _galaxyBackdrop: [],
  _particles: [],
  _terrainZ: 0,
  _terrainCols: 40,
  _terrainRows: 30,

  // Cached CSS theme colors
  _cachedPrimary: '#0071e3',
  _cachedSecondary: '#ff2d55',
  _lastColorFetchTime: 0,

  // Bound animation frame callback
  _boundLoop: null,
  _resizeObserver: null,

  // =========================================================================
  // 1. Initialization & Lifecycle
  // =========================================================================

  /**
   * Initializes the visualizer module, binds canvas, sets up resize handlers,
   * restores user's preferred visualizer mode, and starts animation loop.
   * @param {HTMLCanvasElement} [canvasElement] - Optional canvas override
   */
  init(canvasElement) {
    this.canvas = canvasElement || document.getElementById('visualizer-canvas');
    if (!this.canvas) {
      console.warn('[SS.visualizer] Main canvas element (#visualizer-canvas) not found.');
      return;
    }

    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this._dpr = window.devicePixelRatio || 1;

    // Restore saved visualizer mode or fallback to 'bars'
    try {
      const savedSettings = SS.storage?.getSettings();
      if (savedSettings && typeof savedSettings.vizMode === 'string') {
        const validModes = ['bars', 'wave', 'circular', 'particles', 'galaxy', 'terrain'];
        if (validModes.includes(savedSettings.vizMode)) {
          this.mode = savedSettings.vizMode;
        }
      }
    } catch (e) {
      this.mode = 'bars';
    }

    // Initialize simulation entities
    this._initParticles();
    this._initGalaxy();

    // Auto-detect mini canvases in DOM
    const eqMini = document.getElementById('eq-viz-mini');
    if (eqMini) this.initMini(eqMini);

    const npMini = document.getElementById('np-mini-viz');
    if (npMini) this.initMini(npMini);

    // Initial resize to parent container
    this.resize();

    // Setup window & ResizeObserver events
    this._setupResizeHandlers();

    // Setup DOM button click events & audio state triggers
    this._bindEvents();

    // Sync UI buttons to active mode
    this._updateModeUI(this.mode);

    // Bind loop
    this._boundLoop = this._loop.bind(this);

    // Start rendering (draws idle states when no audio is playing)
    this.start();

    console.log(`[SS.visualizer] Initialized in "${this.mode}" mode.`);
  },

  /**
   * Initializes a secondary mini visualizer canvas.
   * @param {HTMLCanvasElement} canvasElement
   */
  initMini(canvasElement) {
    if (!canvasElement) return;

    // Check if already registered
    const exists = this.miniInstances.some(inst => inst.canvas === canvasElement);
    if (exists) return;

    const ctx = canvasElement.getContext('2d', { alpha: true });
    const instance = {
      canvas: canvasElement,
      ctx: ctx,
      prevBars: new Float32Array(16)
    };

    this.miniInstances.push(instance);

    // Keep primary mini reference for backward compatibility
    if (!this.miniCanvas) {
      this.miniCanvas = canvasElement;
      this.miniCtx = ctx;
    }

    this._resizeMini(instance);
  },

  /**
   * Begins the requestAnimationFrame rendering loop.
   */
  start() {
    if (this.isActive && this.animationFrame) return;
    this.isActive = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.animationFrame = requestAnimationFrame(this._boundLoop || this._loop.bind(this));
  },

  /**
   * Pauses the visualizer rendering loop.
   */
  stop() {
    this.isActive = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  },

  /**
   * Switches visualizer render mode.
   * @param {string} newMode - 'bars' | 'wave' | 'circular' | 'particles' | 'galaxy' | 'terrain'
   */
  setMode(newMode) {
    const validModes = ['bars', 'wave', 'circular', 'particles', 'galaxy', 'terrain'];
    if (!validModes.includes(newMode)) {
      console.warn(`[SS.visualizer] Unknown mode "${newMode}".`);
      return;
    }

    this.mode = newMode;
    this._updateModeUI(newMode);

    // Persist choice to localStorage
    try {
      SS.storage?.saveSettings({ vizMode: newMode });
    } catch (e) {
      // Ignore storage errors
    }

    // Broadcast mode change
    document.dispatchEvent(new CustomEvent('ss:viz-mode-changed', {
      detail: { mode: newMode }
    }));

    // Reset mode-specific states for clean transition
    if (newMode === 'particles') {
      this._initParticles();
    } else if (newMode === 'bars') {
      this._barsPrev.fill(0);
    }

    // Ensure animation loop is spinning
    if (!this.isActive) {
      this.start();
    }
  },

  /**
   * Resizes canvas dimensions to match container width & height with devicePixelRatio.
   */
  resize() {
    if (!this.canvas) return;

    const parent = this.canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };

    const width = Math.max(300, Math.floor(rect.width || window.innerWidth));
    const height = Math.max(200, Math.floor(rect.height || window.innerHeight));

    this._dpr = window.devicePixelRatio || 1;
    this._width = width;
    this._height = height;

    this.canvas.width = Math.floor(width * this._dpr);
    this.canvas.height = Math.floor(height * this._dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    // Scale context to devicePixelRatio for crisp Retina rendering
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this._dpr, this._dpr);

    // Resize registered mini visualizers as well
    this.miniInstances.forEach(inst => this._resizeMini(inst));
  },

  /**
   * Resize single mini visualizer canvas.
   * @private
   */
  _resizeMini(inst) {
    if (!inst?.canvas) return;
    const rect = inst.canvas.getBoundingClientRect();
    const w = Math.max(80, Math.floor(rect.width || 120));
    const h = Math.max(30, Math.floor(rect.height || 60));

    const dpr = window.devicePixelRatio || 1;
    inst.canvas.width = Math.floor(w * dpr);
    inst.canvas.height = Math.floor(h * dpr);
    inst.canvas.style.width = `${w}px`;
    inst.canvas.style.height = `${h}px`;

    inst.ctx.setTransform(1, 0, 0, 1, 0, 0);
    inst.ctx.scale(dpr, dpr);
    inst.w = w;
    inst.h = h;
  },

  // =========================================================================
  // 2. Main Render Pipeline
  // =========================================================================

  /**
   * Internal requestAnimationFrame tick handler.
   * @private
   */
  _loop() {
    if (!this.isActive) return;

    this._time += 1;
    this._refreshThemeColors();

    this.render();
    this.renderMini();

    this.animationFrame = requestAnimationFrame(this._boundLoop);
  },

  /**
   * Main render dispatch: reads frequency/waveform data from SS.audioEngine
   * and delegates to the active mode renderer.
   */
  render() {
    if (!this.ctx || !this.canvas) return;

    const w = this._width;
    const h = this._height;

    // Clear main viewport canvas
    this.ctx.clearRect(0, 0, w, h);

    // Fetch live audio analysis data
    const freqData = SS.audioEngine?.getFrequencyData ? SS.audioEngine.getFrequencyData() : null;
    const timeData = SS.audioEngine?.getTimeDomainData ? SS.audioEngine.getTimeDomainData() : null;

    // Render corresponding mode
    switch (this.mode) {
      case 'bars':
        this.renderBars(freqData);
        break;
      case 'wave':
        this.renderWave(timeData);
        break;
      case 'circular':
        this.renderCircular(freqData);
        break;
      case 'particles':
        this.renderParticles(freqData);
        break;
      case 'galaxy':
        this.renderGalaxy(freqData);
        break;
      case 'terrain':
        this.renderTerrain(freqData);
        break;
      default:
        this.renderBars(freqData);
    }
  },

  // =========================================================================
  // 3. Mode 1: Spectrum Bars (bars)
  // =========================================================================

  /**
   * Mode 1: 64 frequency bars across width with 2px gap, rounded top caps,
   * CSS theme accent color, smooth 70/30 falloff, and subtle mirror reflection.
   * @param {Uint8Array|null} freqData
   */
  renderBars(freqData) {
    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;
    const isPlaying = SS.audioEngine?.isPlaying || false;

    const numBars = 64;
    const gap = 2;
    const padding = 16;
    const availableWidth = w - (padding * 2) - ((numBars - 1) * gap);
    const barWidth = Math.max(1.5, availableWidth / numBars);

    // Baseline placed slightly below vertical center (55% height)
    const centerY = Math.floor(h * 0.55);
    const maxBarHeight = centerY - 30;
    const maxMirrorHeight = Math.floor((h - centerY) * 0.55);

    // Linear gradient for upper bars: accent to secondary
    const barGrad = ctx.createLinearGradient(0, centerY, 0, centerY - maxBarHeight);
    barGrad.addColorStop(0, this._cachedPrimary);
    barGrad.addColorStop(1, this._cachedSecondary);

    // Linear gradient for mirror reflection: primary (0.2 alpha) fading down to 0
    const mirrorGrad = ctx.createLinearGradient(0, centerY, 0, centerY + maxMirrorHeight);
    mirrorGrad.addColorStop(0, this._getPrimaryWithAlpha(0.22));
    mirrorGrad.addColorStop(1, this._getPrimaryWithAlpha(0.0));

    // Draw subtle glowing center dividing line
    ctx.save();
    ctx.strokeStyle = this._getPrimaryWithAlpha(0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, centerY);
    ctx.lineTo(w - padding, centerY);
    ctx.stroke();
    ctx.restore();

    // Iterate across 64 bars
    for (let i = 0; i < numBars; i++) {
      let targetVal = 0;

      if (freqData && isPlaying) {
        // Map 64 bars over 256 frequency bins with a perceptual curve (more detail in bass/mids)
        const binIndex = Math.floor(Math.pow(i / numBars, 1.35) * 200);
        targetVal = freqData[Math.min(255, binIndex)] || 0;
      } else {
        // Gentle breathing idle wave
        const idleWave = Math.sin(this._time * 0.04 + i * 0.16) * 10 +
                         Math.cos(this._time * 0.02 + i * 0.08) * 6 + 14;
        targetVal = Math.max(4, idleWave);
      }

      // Smooth falloff: blend 70% new + 30% previous frame value
      this._barsPrev[i] = (this._barsPrev[i] * 0.3) + (targetVal * 0.7);
      const val = this._barsPrev[i];

      const barHeight = Math.max(2, (val / 255) * maxBarHeight);
      const mirrorHeight = Math.max(1, (val / 255) * maxMirrorHeight);

      const x = padding + (i * (barWidth + gap));
      const cornerRadius = Math.min(barWidth / 2, 4);

      // --- Draw Upper Bar ---
      ctx.fillStyle = barGrad;
      this._drawRoundedBar(ctx, x, centerY - barHeight, barWidth, barHeight, cornerRadius, true, false);

      // --- Draw Mirror Reflection Below Baseline ---
      ctx.fillStyle = mirrorGrad;
      this._drawRoundedBar(ctx, x, centerY + 2, barWidth, mirrorHeight, cornerRadius, false, true);
    }
  },

  /**
   * Helper: Draws a bar with optionally rounded top or bottom caps.
   * @private
   */
  _drawRoundedBar(ctx, x, y, width, height, radius, roundTop, roundBottom) {
    if (height <= 0 || width <= 0) return;
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    if (roundTop && !roundBottom) {
      // Rounded top cap, flat bottom
      ctx.moveTo(x, y + height);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + width - r, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx.lineTo(x + width, y + height);
      ctx.closePath();
    } else if (roundBottom && !roundTop) {
      // Flat top, rounded bottom cap
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y);
      ctx.lineTo(x + width, y + height - r);
      ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx.lineTo(x + r, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx.closePath();
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fill();
  },

  // =========================================================================
  // 4. Mode 2: Oscilloscope Waveform (wave)
  // =========================================================================

  /**
   * Mode 2: Smooth cubic bezier curve through time domain data,
   * triple-draw glow effect (6px/0.2, 3px/0.5, 1.5px/1.0),
   * gradient stroke from primary to secondary, subtle 25% background grid.
   * @param {Uint8Array|null} timeData
   */
  renderWave(timeData) {
    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;
    const isPlaying = SS.audioEngine?.isPlaying || false;

    const centerY = h * 0.5;
    const maxAmplitude = h * 0.42;

    // --- 1. Background Grid ---
    ctx.save();
    ctx.lineWidth = 1;

    // Thin grid lines at 25%, 50%, and 75%
    const gridY = [h * 0.25, h * 0.5, h * 0.75];
    gridY.forEach((gy, idx) => {
      ctx.beginPath();
      if (idx === 1) {
        // Center line: slightly brighter
        ctx.strokeStyle = this._getPrimaryWithAlpha(0.18);
        ctx.setLineDash([4, 4]);
      } else {
        ctx.strokeStyle = this._getPrimaryWithAlpha(0.08);
        ctx.setLineDash([2, 6]);
      }
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    });

    // Vertical subtle markers
    ctx.strokeStyle = this._getPrimaryWithAlpha(0.04);
    ctx.setLineDash([1, 10]);
    for (let gx = w * 0.1; gx < w; gx += w * 0.1) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    ctx.restore();

    // --- 2. Build Waveform Sample Points ---
    const numPoints = 80;
    const points = [];

    for (let i = 0; i < numPoints; i++) {
      const x = (i / (numPoints - 1)) * w;
      let y = centerY;

      if (timeData && isPlaying) {
        // Sample down from time-domain buffer
        const sampleIndex = Math.floor((i / numPoints) * timeData.length);
        const raw = timeData[sampleIndex] ?? 128;
        const normalized = (raw - 128) / 128; // -1.0 to +1.0
        y = centerY + (normalized * maxAmplitude);
      } else {
        // Idle gentle breathing sine composite
        const wave1 = Math.sin((i * 0.08) + (this._time * 0.05)) * 14;
        const wave2 = Math.cos((i * 0.14) - (this._time * 0.03)) * 8;
        y = centerY + wave1 + wave2;
      }

      points.push({ x, y });
    }

    // --- 3. Build Smooth Cubic Bezier Path ---
    const path = new Path2D();
    path.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : p2;

      // Catmull-Rom to Cubic Bezier control points calculation
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }

    // --- 4. Gradient Stroke: Primary to Secondary ---
    const strokeGrad = ctx.createLinearGradient(0, 0, w, 0);
    strokeGrad.addColorStop(0, this._cachedPrimary);
    strokeGrad.addColorStop(0.5, this._getSecondaryWithAlpha(0.95));
    strokeGrad.addColorStop(1, this._cachedSecondary);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeGrad;

    // --- 5. Triple-Draw Glow Effect ---
    // Pass 1: Broad ambient glow (width: 6px, alpha: 0.20)
    ctx.lineWidth = 6;
    ctx.globalAlpha = 0.20;
    ctx.stroke(path);

    // Pass 2: Medium focused halo (width: 3px, alpha: 0.50)
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.50;
    ctx.stroke(path);

    // Pass 3: Crisp core line (width: 1.5px, alpha: 1.0)
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 1.0;
    ctx.stroke(path);

    ctx.restore();
  },

  // =========================================================================
  // 5. Mode 3: Circular Frequency Ring (circular)
  // =========================================================================

  /**
   * Mode 3: Circular frequency visualization located at canvas center.
   * Inner radius ~80px (scales with canvas), 128 radial bars extending outward (20-150px),
   * rotating HSL hue based on angle + time offset, bass-pulsing inner circle (±10px),
   * slow rotation (0.2deg per frame), semi-transparent accent filled inner core.
   * @param {Uint8Array|null} freqData
   */
  renderCircular(freqData) {
    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;
    const isPlaying = SS.audioEngine?.isPlaying || false;

    const cx = w * 0.5;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);

    // Dynamic inner radius scaled to canvas, minimum 60px
    const baseInnerRadius = Math.max(50, Math.min(minDim * 0.18, 110));

    // Real-time bass pulse from SS.audioEngine (0-100 mapped to ±10px)
    const bass = (isPlaying && SS.audioEngine?.getBassLevel) ? SS.audioEngine.getBassLevel() : 0;
    const bassPulse = (bass / 100) * 10;
    const innerRadius = Math.max(30, baseInnerRadius + bassPulse);

    // Rotate visualization at 0.2 degrees per frame
    this._circularAngle += 0.2 * (Math.PI / 180);

    // --- 1. Inner Circle Core Glow & Fill ---
    ctx.save();
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerRadius);
    coreGrad.addColorStop(0, this._getPrimaryWithAlpha(0.28));
    coreGrad.addColorStop(0.8, this._getPrimaryWithAlpha(0.12));
    coreGrad.addColorStop(1, this._getPrimaryWithAlpha(0.35));

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Inner circle border ring
    ctx.strokeStyle = this._getPrimaryWithAlpha(0.65);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center pulsating acoustic orb
    const orbRadius = Math.max(8, (bass / 100) * 22);
    const orbGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbRadius);
    orbGrad.addColorStop(0, this._getSecondaryWithAlpha(0.8));
    orbGrad.addColorStop(1, this._getSecondaryWithAlpha(0.0));
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, orbRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- 2. 128 Radial Bars ---
    const totalBars = 128;
    const angleStep = (Math.PI * 2) / totalBars;
    const maxBarLength = Math.min(minDim * 0.28, 150);
    const minBarLength = 12;

    ctx.save();
    ctx.lineCap = 'round';

    for (let i = 0; i < totalBars; i++) {
      const angle = this._circularAngle + (i * angleStep);
      let val = 0;

      if (freqData && isPlaying) {
        // Mirrored spectrum symmetry for circular visual balance
        const symIndex = i < 64 ? i : 127 - i;
        const binIndex = Math.floor(Math.pow(symIndex / 64, 1.25) * 180);
        val = freqData[Math.min(255, binIndex)] || 0;
      } else {
        // Idle gentle breathing circular harmonics
        const idle = Math.sin(i * 0.18 + this._time * 0.05) * 12 +
                     Math.cos(i * 0.08 - this._time * 0.03) * 8 + 15;
        val = Math.max(2, idle);
      }

      // Bar length mapped to 20-150px
      const barLength = minBarLength + ((val / 255) * (maxBarLength - minBarLength));

      // Rotating HSL Hue based on angle + time offset
      const hue = Math.floor(((angle * (180 / Math.PI)) + (this._time * 0.75)) % 360);
      const alpha = 0.4 + ((val / 255) * 0.6);

      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const startX = cx + (cos * innerRadius);
      const startY = cy + (sin * innerRadius);
      const endX = cx + (cos * (innerRadius + barLength));
      const endY = cy + (sin * (innerRadius + barLength));

      ctx.strokeStyle = `hsla(${hue}, 88%, 62%, ${alpha.toFixed(2)})`;
      ctx.lineWidth = Math.max(1.5, ((Math.PI * 2 * innerRadius) / totalBars) * 0.75);

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Outer illuminated peak tip for energetic frequencies
      if (val > 140) {
        ctx.fillStyle = `hsla(${hue}, 100%, 80%, 0.8)`;
        ctx.beginPath();
        ctx.arc(endX, endY, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  },

  // =========================================================================
  // 6. Mode 4: Audio-Reactive Particle Swarm (particles)
  // =========================================================================

  /**
   * Initializes the 150-particle swarm.
   * @private
   */
  _initParticles() {
    this._particles = [];
    const count = 150;
    const w = this._width || window.innerWidth || 800;
    const h = this._height || window.innerHeight || 600;

    for (let i = 0; i < count; i++) {
      const baseRadius = 1.8 + Math.random() * 2.8;
      this._particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: baseRadius,
        baseRadius: baseRadius,
        alpha: 0.25 + Math.random() * 0.65,
        life: Math.random(),
        jitterX: 0,
        jitterY: 0
      });
    }
  },

  /**
   * Mode 4: 150 particles reactive to audio:
   * - Bass causes outward explosive acceleration from center
   * - Treble causes micro-vibration/jitter
   * - Inter-particle node connections within 80px (0.15 opacity)
   * - Wrap around screen boundaries
   * - Silent drift slowly toward center
   * @param {Uint8Array|null} freqData
   */
  renderParticles(freqData) {
    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;
    const isPlaying = SS.audioEngine?.isPlaying || false;

    if (this._particles.length === 0) {
      this._initParticles();
    }

    const cx = w * 0.5;
    const cy = h * 0.5;

    // Bass level (0-100) & average frequency (0-255)
    let bass = 0;
    let avgFreq = 0;
    let highFreq = 0;

    if (freqData && isPlaying) {
      bass = SS.audioEngine?.getBassLevel ? SS.audioEngine.getBassLevel() : 0;

      let sum = 0;
      let highSum = 0;
      const len = freqData.length;
      for (let i = 0; i < len; i++) {
        sum += freqData[i];
        if (i >= 128) highSum += freqData[i];
      }
      avgFreq = sum / len;
      highFreq = highSum / 128;
    }

    const isSilent = !isPlaying || (avgFreq < 4 && bass < 2);
    const bassForce = (bass / 100) * 2.8;
    const jitterMagnitude = (highFreq / 255) * 3.5;

    // --- 1. Update Particle Physics ---
    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];

      const dx = p.x - cx;
      const dy = p.y - cy;
      const distToCenter = Math.sqrt((dx * dx) + (dy * dy)) || 1;

      if (!isSilent && bass > 15) {
        // Bass explosive acceleration outward
        const normX = dx / distToCenter;
        const normY = dy / distToCenter;
        p.vx += normX * bassForce * 0.8;
        p.vy += normY * bassForce * 0.8;
      }

      if (isSilent) {
        // Slow gentle inward drift toward center
        const pull = 0.012;
        p.vx -= (dx / distToCenter) * pull;
        p.vy -= (dy / distToCenter) * pull;
        p.vx += (Math.random() - 0.5) * 0.15;
        p.vy += (Math.random() - 0.5) * 0.15;
      }

      // Treble jitter displacement
      p.jitterX = (Math.random() - 0.5) * jitterMagnitude;
      p.jitterY = (Math.random() - 0.5) * jitterMagnitude;

      // Friction & speed clamp
      p.vx *= 0.94;
      p.vy *= 0.94;

      const maxSpeed = 8;
      const speed = Math.sqrt((p.vx * p.vx) + (p.vy * p.vy));
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Wrap around canvas boundaries
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;

      // Bass scale pulse
      p.radius = p.baseRadius * (1 + ((bass / 100) * 0.85));
    }

    // --- 2. Draw Connections Within 80px ---
    const maxLinkDist = 80;
    ctx.save();
    ctx.lineWidth = 1;

    for (let i = 0; i < this._particles.length; i++) {
      const p1 = this._particles[i];
      for (let j = i + 1; j < this._particles.length; j++) {
        const p2 = this._particles[j];
        const ldx = p1.x - p2.x;
        const ldy = p1.y - p2.y;
        const lDist = Math.sqrt((ldx * ldx) + (ldy * ldy));

        if (lDist < maxLinkDist) {
          const linkAlpha = 0.15 * (1 - (lDist / maxLinkDist));
          ctx.strokeStyle = this._getPrimaryWithAlpha(linkAlpha);
          ctx.beginPath();
          ctx.moveTo(p1.x + p1.jitterX, p1.y + p1.jitterY);
          ctx.lineTo(p2.x + p2.jitterX, p2.y + p2.jitterY);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // --- 3. Draw Particles ---
    ctx.save();
    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      const finalX = p.x + p.jitterX;
      const finalY = p.y + p.jitterY;

      // Core particle fill
      ctx.fillStyle = this._getPrimaryWithAlpha(p.alpha);
      ctx.beginPath();
      ctx.arc(finalX, finalY, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Bass glow halo on energetic particles
      if (bass > 30) {
        ctx.fillStyle = this._getSecondaryWithAlpha(0.25);
        ctx.beginPath();
        ctx.arc(finalX, finalY, p.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  // =========================================================================
  // 7. Mode 5: Spiral Galaxy Field (galaxy)
  // =========================================================================

  /**
   * Initializes galaxy stars (3 arms x 200 points) and 100 background stars.
   * @private
   */
  _initGalaxy() {
    this._galaxyStars = [];
    this._galaxyBackdrop = [];
    this._galaxyNebulae = [];

    const numArms = 3;
    const starsPerArm = 200;

    // 1. Generate 3 logarithmic spiral arms
    for (let arm = 0; arm < numArms; arm++) {
      const armOffset = (arm * (Math.PI * 2)) / numArms;
      for (let i = 0; i < starsPerArm; i++) {
        const t = i / starsPerArm; // 0 to 1 along arm
        const baseRadius = 25 + (t * 360);
        const theta = armOffset + (t * Math.PI * 4.2); // Multiple rotations
        const scatter = (Math.random() - 0.5) * (14 + (t * 40));

        this._galaxyStars.push({
          arm,
          index: i,
          baseRadius,
          theta,
          scatter,
          baseSize: 1.0 + (Math.random() * 2.2),
          twinkleSpeed: 0.02 + (Math.random() * 0.04),
          lightness: 50 + Math.floor(Math.random() * 40)
        });
      }
    }

    // 2. Generate 100 static dim background stars
    const w = this._width || 800;
    const h = this._height || 600;
    for (let i = 0; i < 100; i++) {
      this._galaxyBackdrop.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 0.8 + (Math.random() * 1.5),
        alpha: 0.12 + (Math.random() * 0.3)
      });
    }

    // 3. Generate 4 nebula cloud clusters
    for (let i = 0; i < 4; i++) {
      this._galaxyNebulae.push({
        angleOffset: (i * (Math.PI / 2)),
        radius: 80 + (i * 50),
        baseSize: 120 + (i * 30),
        colorIndex: i % 2
      });
    }
  },

  /**
   * Mode 5: Spiral galaxy with 3 spiral arms (200 star points each),
   * spiral equation r = a + b*theta with audio modulating 'a',
   * point size mapped to frequency data, star twinkling, 100 static dim dots backdrop,
   * slow rotation (0.1deg/frame), bass expansion/contraction, and soft shifting nebula clouds.
   * @param {Uint8Array|null} freqData
   */
  renderGalaxy(freqData) {
    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;
    const isPlaying = SS.audioEngine?.isPlaying || false;

    if (this._galaxyStars.length === 0) {
      this._initGalaxy();
    }

    const cx = w * 0.5;
    const cy = h * 0.5;

    // Slow continuous galaxy rotation (0.1 degrees per frame)
    this._galaxyAngle += 0.1 * (Math.PI / 180);

    const bass = (isPlaying && SS.audioEngine?.getBassLevel) ? SS.audioEngine.getBassLevel() : 0;
    const bassExpansion = (bass / 100) * 45;

    // --- 1. Draw 100 Static Background Stars ---
    ctx.save();
    for (let i = 0; i < this._galaxyBackdrop.length; i++) {
      const s = this._galaxyBackdrop[i];
      const twinkle = 0.5 + Math.sin(this._time * 0.03 + i) * 0.5;
      const starAlpha = s.alpha * (0.6 + (twinkle * 0.4));

      ctx.fillStyle = `rgba(255, 255, 255, ${starAlpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // --- 2. Draw Soft Nebula Clouds ---
    ctx.save();
    for (let i = 0; i < this._galaxyNebulae.length; i++) {
      const neb = this._galaxyNebulae[i];
      const nebAngle = this._galaxyAngle * 0.6 + neb.angleOffset;
      const nebX = cx + (Math.cos(nebAngle) * (neb.radius + bassExpansion * 0.5));
      const nebY = cy + (Math.sin(nebAngle) * (neb.radius + bassExpansion * 0.5));
      const nebSize = neb.baseSize * (1 + ((bass / 100) * 0.3));

      const nebGrad = ctx.createRadialGradient(nebX, nebY, 0, nebX, nebY, nebSize);
      const nebColor = neb.colorIndex === 0 ? this._cachedPrimary : this._cachedSecondary;
      nebGrad.addColorStop(0, this._hexWithAlpha(nebColor, 0.10));
      nebGrad.addColorStop(0.5, this._hexWithAlpha(nebColor, 0.04));
      nebGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = nebGrad;
      ctx.beginPath();
      ctx.arc(nebX, nebY, nebSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // --- 3. Draw Galaxy Core Supermassive Glow ---
    ctx.save();
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70 + bassExpansion);
    coreGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    coreGrad.addColorStop(0.2, this._getPrimaryWithAlpha(0.6));
    coreGrad.addColorStop(0.6, this._getSecondaryWithAlpha(0.25));
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 70 + bassExpansion, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- 4. Draw Spiral Arms Star Points ---
    ctx.save();
    for (let i = 0; i < this._galaxyStars.length; i++) {
      const star = this._galaxyStars[i];

      // Spiral equation: r = a + b * theta, audio modulates 'a'
      const a = bassExpansion;
      const r = star.baseRadius + a + star.scatter;
      const theta = star.theta + this._galaxyAngle;

      const x = cx + (Math.cos(theta) * r);
      const y = cy + (Math.sin(theta) * r);

      // Map frequency value to point size
      let freqVal = 0;
      if (freqData && isPlaying) {
        const binIndex = (star.index * 2) % 256;
        freqVal = freqData[binIndex] || 0;
      } else {
        freqVal = 20 + Math.sin(star.index * 0.2 + this._time * 0.04) * 15;
      }

      const sizeScale = 0.8 + ((freqVal / 255) * 2.2);
      const pointSize = star.baseSize * sizeScale;

      // Twinkle opacity variation
      const twinkle = 0.4 + (Math.sin(this._time * star.twinkleSpeed + star.index) * 0.4) + (Math.random() * 0.2);
      const alpha = Math.min(1.0, Math.max(0.15, twinkle * (0.6 + (freqVal / 255) * 0.4)));

      // Color from primary accent with varying lightness
      ctx.fillStyle = `hsla(${this._getHueFromHex(this._cachedPrimary)}, 85%, ${star.lightness}%, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, pointSize, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  // =========================================================================
  // 8. Mode 6: 3D Wireframe Retro Terrain (terrain)
  // =========================================================================

  /**
   * Mode 6: 3D perspective wireframe terrain (40 columns x 30 rows),
   * vanishing point at center-top, row frequency displacement,
   * gradient from primary (low) to secondary (elevation), forward z-scrolling,
   * and subtle synthwave horizontal scan lines.
   * @param {Uint8Array|null} freqData
   */
  renderTerrain(freqData) {
    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;
    const isPlaying = SS.audioEngine?.isPlaying || false;

    const cols = this._terrainCols;
    const rows = this._terrainRows;

    // Forward scrolling: increments z offset each frame and wraps around
    const scrollSpeed = isPlaying ? 0.012 : 0.005;
    this._terrainZ = (this._terrainZ + scrollSpeed) % 1.0;

    // Vanishing point at center-top
    const vpX = w * 0.5;
    const vpY = h * 0.16;

    // Horizon and near plane definition
    const horizonY = h * 0.32;
    const nearY = h * 0.98;
    const gridSpanX = w * 1.35;

    // Precalculate grid 2D projection points
    const grid = [];

    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      // Normalized depth Z from horizon (0.0) to near viewer (1.0)
      const rawZ = (r / rows) + (this._terrainZ / rows);
      const z = Math.max(0.01, Math.min(1.0, rawZ));

      // Perspective expansion curve
      const perspective = Math.pow(z, 2.3);
      const projY = horizonY + ((nearY - horizonY) * perspective);
      const currentWidth = gridSpanX * perspective;
      const leftX = vpX - (currentWidth * 0.5);

      // Frequency mapping for this row
      let rowFreq = 0;
      if (freqData && isPlaying) {
        const binIndex = Math.floor(((rows - 1 - r) / rows) * 200);
        rowFreq = freqData[Math.min(255, binIndex)] || 0;
      } else {
        rowFreq = 16 + Math.sin(r * 0.3 - this._time * 0.04) * 12;
      }

      for (let c = 0; c < cols; c++) {
        const colNorm = c / (cols - 1); // 0.0 to 1.0 across
        const projX = leftX + (colNorm * currentWidth);

        // Synthwave mountain ridges on left and right borders, valley in the center
        const centerDistance = Math.abs(colNorm - 0.5) * 2; // 0 at center, 1 at edges
        const valleyFactor = Math.pow(centerDistance, 1.8);

        // Height displacement combines audio amplitude and edge mountain profile
        const audioHeight = (rowFreq / 255) * (h * 0.24);
        const ridgeHeight = valleyFactor * (h * 0.18);
        const yDisplacement = (audioHeight + ridgeHeight) * perspective;

        const finalY = projY - yDisplacement;
        grid[r][c] = { x: projX, y: finalY, elevNorm: yDisplacement / (h * 0.3) };
      }
    }

    // --- 1. Draw Wireframe Rows (Horizontal) ---
    ctx.save();
    for (let r = 0; r < rows; r++) {
      const zNorm = r / rows;
      const rowAlpha = Math.min(1.0, Math.max(0.08, zNorm * 0.85));

      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        const pt = grid[r][c];
        if (c === 0) {
          ctx.moveTo(pt.x, pt.y);
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }

      // Elevation gradient stroke
      ctx.strokeStyle = this._getElevationColor(zNorm, rowAlpha);
      ctx.lineWidth = Math.max(1, zNorm * 2.0);
      ctx.stroke();
    }

    // --- 2. Draw Wireframe Columns (Longitudinal Perspective Lines) ---
    for (let c = 0; c < cols; c++) {
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        const pt = grid[r][c];
        if (r === 0) {
          ctx.moveTo(pt.x, pt.y);
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }
      ctx.strokeStyle = this._getPrimaryWithAlpha(0.28);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // --- 3. Synthwave Glowing Horizon Sun ---
    ctx.save();
    const sunGrad = ctx.createRadialGradient(vpX, horizonY, 0, vpX, horizonY, 90);
    sunGrad.addColorStop(0, this._getSecondaryWithAlpha(0.8));
    sunGrad.addColorStop(0.5, this._getPrimaryWithAlpha(0.3));
    sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(vpX, horizonY, 90, Math.PI, 0, false);
    ctx.fill();

    // Horizon laser dividing line
    ctx.strokeStyle = this._getSecondaryWithAlpha(0.85);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();
    ctx.restore();

    // --- 4. Synthwave Scanlines Overlay ---
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1.5);
    }
    ctx.restore();
  },

  // =========================================================================
  // 9. Mini Visualizer Renderers (#eq-viz-mini & #np-mini-viz)
  // =========================================================================

  /**
   * Renders compact 16-band spectrum visualizer onto all registered mini canvases.
   * Runs continuously alongside main render loop.
   */
  renderMini() {
    if (this.miniInstances.length === 0) return;

    const freqData = SS.audioEngine?.getFrequencyData ? SS.audioEngine.getFrequencyData() : null;
    const isPlaying = SS.audioEngine?.isPlaying || false;

    const numBars = 16;
    const gap = 2;

    for (let instIdx = 0; instIdx < this.miniInstances.length; instIdx++) {
      const inst = this.miniInstances[instIdx];
      const ctx = inst.ctx;
      const w = inst.w || inst.canvas.width;
      const h = inst.h || inst.canvas.height;

      ctx.clearRect(0, 0, w, h);

      const availableW = w - ((numBars - 1) * gap);
      const barW = Math.max(1.5, availableW / numBars);

      // Gradient for mini visualizer
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, this._cachedPrimary);
      grad.addColorStop(1, this._cachedSecondary);

      ctx.fillStyle = grad;

      for (let i = 0; i < numBars; i++) {
        let target = 0;
        if (freqData && isPlaying) {
          // Downsample from first 80 frequency bins
          const binIndex = Math.floor((i / numBars) * 80);
          target = freqData[binIndex] || 0;
        } else {
          // Idle resting bars
          target = 10 + Math.sin(this._time * 0.08 + i * 0.4) * 8;
        }

        // Smooth 70/30 blending
        inst.prevBars[i] = (inst.prevBars[i] * 0.3) + (target * 0.7);
        const val = inst.prevBars[i];

        const barH = Math.max(2, (val / 255) * (h - 4));
        const x = i * (barW + gap);
        const y = h - barH;

        // Draw pill-shaped bar
        const r = Math.min(barW / 2, 2.5);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, h);
        ctx.lineTo(x, h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
      }
    }
  },

  // =========================================================================
  // 10. DOM Events & Color Utilities
  // =========================================================================

  /**
   * Binds click events to visualizer mode selection buttons and window resize.
   * @private
   */
  _bindEvents() {
    // Mode buttons container (.viz-mode-btn)
    const container = document.getElementById('viz-mode-select');
    if (container) {
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.viz-mode-btn');
        if (btn && btn.dataset.mode) {
          this.setMode(btn.dataset.mode);
        }
      });
    }

    // Audio engine event bindings
    document.addEventListener('ss:play', () => {
      this.start();
    });

    document.addEventListener('ss:track-loaded', () => {
      this.start();
    });

    document.addEventListener('ss:viz-mode-changed', (e) => {
      if (e.detail?.mode && e.detail.mode !== this.mode) {
        this.setMode(e.detail.mode);
      }
    });
  },

  /**
   * Set up ResizeObserver and fallback window resize listener.
   * @private
   */
  _setupResizeHandlers() {
    window.addEventListener('resize', () => {
      this.resize();
    }, { passive: true });

    if (window.ResizeObserver && this.canvas?.parentElement) {
      this._resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this._resizeObserver.observe(this.canvas.parentElement);
    }
  },

  /**
   * Updates active state classes on mode selection buttons in DOM.
   * @private
   */
  _updateModeUI(activeMode) {
    const buttons = document.querySelectorAll('.viz-mode-btn');
    buttons.forEach(btn => {
      if (btn.dataset.mode === activeMode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  },

  /**
   * Periodically fetches CSS custom property colors from #app container.
   * @private
   */
  _refreshThemeColors() {
    if (this._time - this._lastColorFetchTime < 30) return; // Fetch every 30 frames
    this._lastColorFetchTime = this._time;

    const root = document.getElementById('app') || document.documentElement;
    const computed = window.getComputedStyle(root);

    const primary = computed.getPropertyValue('--viz-primary').trim() ||
                    computed.getPropertyValue('--accent').trim();
    const secondary = computed.getPropertyValue('--viz-secondary').trim();

    if (primary) this._cachedPrimary = primary;
    if (secondary) this._cachedSecondary = secondary;
  },

  /**
   * Return primary color string with requested alpha transparency.
   * @private
   */
  _getPrimaryWithAlpha(alpha) {
    return this._hexWithAlpha(this._cachedPrimary, alpha);
  },

  /**
   * Return secondary color string with requested alpha transparency.
   * @private
   */
  _getSecondaryWithAlpha(alpha) {
    return this._hexWithAlpha(this._cachedSecondary, alpha);
  },

  /**
   * Helper: Converts hex color or CSS color to rgba string.
   * @private
   */
  _hexWithAlpha(hexStr, alpha) {
    if (!hexStr) return `rgba(0, 113, 227, ${alpha})`;
    if (hexStr.startsWith('rgba')) {
      return hexStr.replace(/[\d\.]+\)$/g, `${alpha})`);
    }
    if (hexStr.startsWith('rgb')) {
      return hexStr.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }

    // Process Hex string (#fff or #ffffff)
    let hex = hexStr.replace('#', '').trim();
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }

    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 113;
    const b = parseInt(hex.substring(4, 6), 16) || 227;

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  /**
   * Returns approximate hue degrees (0-360) from a hex color string.
   * @private
   */
  _getHueFromHex(hexStr) {
    let hex = (hexStr || '').replace('#', '').trim();
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = (parseInt(hex.substring(0, 2), 16) || 0) / 255;
    const g = (parseInt(hex.substring(2, 4), 16) || 113) / 255;
    const b = (parseInt(hex.substring(4, 6), 16) || 227) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;

    if (max === min) {
      h = 0;
    } else if (max === r) {
      h = (60 * ((g - b) / (max - min)) + 360) % 360;
    } else if (max === g) {
      h = (60 * ((b - r) / (max - min)) + 120) % 360;
    } else if (max === b) {
      h = (60 * ((r - g) / (max - min)) + 240) % 360;
    }

    return Math.floor(h);
  },

  /**
   * Interpolate color for 3D terrain elevation.
   * @private
   */
  _getElevationColor(zNorm, alpha) {
    // Low depth / far horizon is primary, near/high elevation shifts to secondary
    if (zNorm < 0.5) {
      return this._getPrimaryWithAlpha(alpha);
    }
    return this._getSecondaryWithAlpha(alpha);
  }
};
