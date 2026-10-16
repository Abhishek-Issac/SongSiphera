/**
 * SongSiphera — Premium Web Audio Player
 * Dynamic Fluid Gradient Background (js/fluid-bg.js)
 *
 * Implements an organic, Apple Music-grade ambient background canvas.
 * Features 5 slowly moving sinusoidal color blobs that blend together using radial gradients
 * and 'lighter'/'screen' composite blending, real-time sub-bass speed modulation,
 * and automatic 4-quadrant dominant color extraction from track album artwork.
 */

window.SS = window.SS || {};

SS.fluidBg = {
  // ---------------------------------------------------------------------------
  // Canvas & Context References
  // ---------------------------------------------------------------------------
  canvas: null,
  ctx: null,

  // ---------------------------------------------------------------------------
  // Palette & Blobs State
  // ---------------------------------------------------------------------------
  // Default soft pastels (soft blue, purple, pink, teal, white)
  defaultColors: ['#4a90e2', '#7c3aed', '#ec4899', '#0d9488', '#e0e7ff'],
  colors: ['#4a90e2', '#7c3aed', '#ec4899', '#0d9488', '#e0e7ff'],
  blobs: [],

  // Animation & Transition state
  isActive: false,
  isTransitioning: false,
  transitionFrame: 0,
  transitionDuration: 120, // ~120 frames for smooth color morphing
  animationFrame: null,

  // Canvas geometry & scaling
  _width: 0,
  _height: 0,
  _dpr: 1,

  // Internal references
  _boundAnimate: null,
  _resizeObserver: null,
  _offscreenCanvas: null,
  _offscreenCtx: null,

  // =========================================================================
  // 1. Initialization
  // =========================================================================

  /**
   * Initializes fluid canvas, allocates blobs with default soft pastels,
   * configures resize handlers, binds audio engine events, and starts animation.
   * @param {HTMLCanvasElement} [canvasElement] - Optional canvas override
   */
  init(canvasElement) {
    this.canvas = canvasElement || document.getElementById('fluid-bg');
    if (!this.canvas) {
      console.warn('[SS.fluidBg] Fluid background canvas (#fluid-bg) not found.');
      return;
    }

    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this._dpr = window.devicePixelRatio || 1;

    // Create 5 persistent blobs with default soft pastels
    this._initBlobs();

    // Resize canvas to parent / window viewport
    this.resize();

    // Setup window & ResizeObserver events
    this._setupResizeHandlers();

    // Bind event listeners for track changes & artwork reactivity
    this._bindEvents();

    // Bind animation loop callback
    this._boundAnimate = this.animate.bind(this);

    // Auto-start ambient animation
    this.start();

    console.log('[SS.fluidBg] Ambient fluid background engine initialized.');
  },

  /**
   * Populates the 5 fluid blobs with initial coordinates, radii, and speeds.
   * @private
   */
  _initBlobs() {
    this.blobs = [];
    const baseRadii = [340, 400, 280, 360, 240];
    const initialPositions = [
      { x: 0.20, y: 0.25 },
      { x: 0.80, y: 0.30 },
      { x: 0.50, y: 0.75 },
      { x: 0.15, y: 0.80 },
      { x: 0.85, y: 0.70 }
    ];

    for (let i = 0; i < 5; i++) {
      const hex = this.defaultColors[i] || '#4a90e2';
      const rgb = this._hexToRgb(hex);

      this.blobs.push({
        x: initialPositions[i].x,
        y: initialPositions[i].y,
        radius: baseRadii[i],
        color: hex,
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        startR: rgb.r,
        startG: rgb.g,
        startB: rgb.b,
        targetR: rgb.r,
        targetG: rgb.g,
        targetB: rgb.b,
        vx: (Math.random() - 0.5) * 0.0008,
        vy: (Math.random() - 0.5) * 0.0008,
        phase: Math.random() * Math.PI * 2,
        speed: 0.0012 + (Math.random() * 0.0016) // 0.001 to 0.003
      });
    }
  },

  // =========================================================================
  // 2. Artwork Color Extraction & Transition
  // =========================================================================

  /**
   * Extracts 5 dominant colors from an image:
   * 4 quadrant averages + 1 overall average.
   * Gracefully falls back to default soft pastels upon CORS errors.
   * @param {HTMLImageElement} imgElement
   * @returns {string[]} Array of 5 hex color strings
   */
  extractColors(imgElement) {
    if (!imgElement) return [...this.defaultColors];

    try {
      if (!this._offscreenCanvas) {
        this._offscreenCanvas = document.createElement('canvas');
        this._offscreenCanvas.width = 50;
        this._offscreenCanvas.height = 50;
        this._offscreenCtx = this._offscreenCanvas.getContext('2d', { willReadFrequently: true });
      }

      const offCtx = this._offscreenCtx;
      offCtx.clearRect(0, 0, 50, 50);

      // Draw scaled down to 50x50
      offCtx.drawImage(imgElement, 0, 0, 50, 50);

      const imgData = offCtx.getImageData(0, 0, 50, 50);
      const data = imgData.data;

      // 4 Quadrants bounds: [xStart, yStart, xEnd, yEnd]
      const quadrants = [
        [0, 0, 25, 25],   // Q1: Top-Left
        [25, 0, 50, 25],  // Q2: Top-Right
        [0, 25, 25, 50],  // Q3: Bottom-Left
        [25, 25, 50, 50]  // Q4: Bottom-Right
      ];

      const colors = [];

      // Average RGB for each of the 4 quadrants
      for (let q = 0; q < 4; q++) {
        const [x0, y0, x1, y1] = quadrants[q];
        let rSum = 0, gSum = 0, bSum = 0, count = 0;

        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const idx = (y * 50 + x) * 4;
            rSum += data[idx];
            gSum += data[idx + 1];
            bSum += data[idx + 2];
            count++;
          }
        }

        const avgR = Math.round(rSum / count);
        const avgG = Math.round(gSum / count);
        const avgB = Math.round(bSum / count);
        colors.push(this._rgbToHex(avgR, avgG, avgB));
      }

      // Compute overall average across all 2500 pixels as 5th color
      let totalR = 0, totalG = 0, totalB = 0;
      const totalPixels = 50 * 50;
      for (let i = 0; i < data.length; i += 4) {
        totalR += data[i];
        totalG += data[i + 1];
        totalB += data[i + 2];
      }

      const overallR = Math.round(totalR / totalPixels);
      const overallG = Math.round(totalG / totalPixels);
      const overallB = Math.round(totalB / totalPixels);
      colors.push(this._rgbToHex(overallR, overallG, overallB));

      return colors;
    } catch (err) {
      console.warn('[SS.fluidBg] Artwork color extraction error (CORS/tainted):', err);
      return [...this.defaultColors];
    }
  },

  /**
   * Smoothly interpolates current blob colors toward new target palette over ~120 frames.
   * @param {string[]} newColors - Array of 5 hex color strings
   */
  updateColors(newColors) {
    if (!Array.isArray(newColors) || newColors.length === 0) return;

    this.colors = [...newColors];

    for (let i = 0; i < this.blobs.length; i++) {
      const hex = newColors[i] || newColors[i % newColors.length] || this.defaultColors[i];
      const targetRgb = this._hexToRgb(hex);
      const blob = this.blobs[i];

      blob.startR = blob.r;
      blob.startG = blob.g;
      blob.startB = blob.b;
      blob.targetR = targetRgb.r;
      blob.targetG = targetRgb.g;
      blob.targetB = targetRgb.b;
      blob.color = hex;
    }

    this.isTransitioning = true;
    this.transitionFrame = 0;
  },

  /**
   * Helper: Loads an image from URL or data URL and triggers color extraction.
   * @param {string} url
   */
  loadArtwork(url) {
    if (!url) {
      this.updateColors(this.defaultColors);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const palette = this.extractColors(img);
      this.updateColors(palette);
    };
    img.onerror = () => {
      this.updateColors(this.defaultColors);
    };
    img.src = url;
  },

  // =========================================================================
  // 3. Animation Loop & Canvas Rendering
  // =========================================================================

  /**
   * Main requestAnimationFrame rendering loop.
   * Updates positions, applies subtle bass speed modulation, handles color lerp,
   * and draws radial gradient blobs using 'lighter' composite mode.
   */
  animate() {
    if (!this.isActive) return;

    const ctx = this.ctx;
    const w = this._width;
    const h = this._height;

    // --- 1. Clear Canvas with Low-Opacity Background for Motion Trail ---
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this._getBgTrailColor();
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // --- 2. Handle Color Transition Lerping ---
    if (this.isTransitioning) {
      this.transitionFrame++;
      const progress = Math.min(1.0, this.transitionFrame / this.transitionDuration);

      // Smooth ease-out cubic curve
      const ease = 1 - Math.pow(1 - progress, 3);

      for (let i = 0; i < this.blobs.length; i++) {
        const b = this.blobs[i];
        b.r = Math.round(b.startR + (b.targetR - b.startR) * ease);
        b.g = Math.round(b.startG + (b.targetG - b.startG) * ease);
        b.b = Math.round(b.startB + (b.targetB - b.startB) * ease);
      }

      if (progress >= 1.0) {
        this.isTransitioning = false;
      }
    }

    // Audio-reactive bass speed multiplier
    const bass = (SS.audioEngine?.isPlaying && SS.audioEngine?.getBassLevel)
      ? SS.audioEngine.getBassLevel()
      : 0;
    const speedMultiplier = 1.0 + ((bass / 100) * 0.55);

    // --- 3. Update & Draw Blobs ---
    ctx.save();
    // 'screen' / 'lighter' creates luminous Apple-grade blending
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < this.blobs.length; i++) {
      const blob = this.blobs[i];

      // Sinusoidal organic motion
      blob.x += Math.sin(blob.phase) * blob.speed * speedMultiplier;
      blob.y += Math.cos(blob.phase * 0.7) * blob.speed * 0.8 * speedMultiplier;
      blob.phase += blob.speed * speedMultiplier;

      // Soft boundary bouncing (allow slight overlap beyond 0 and 1)
      if (blob.x < -0.10) { blob.x = -0.10; blob.speed = Math.abs(blob.speed); }
      if (blob.x > 1.10) { blob.x = 1.10; blob.speed = -Math.abs(blob.speed); }
      if (blob.y < -0.10) { blob.y = -0.10; blob.speed = Math.abs(blob.speed); }
      if (blob.y > 1.10) { blob.y = 1.10; blob.speed = -Math.abs(blob.speed); }

      // Map normalized coordinates to screen pixels
      const screenX = blob.x * w;
      const screenY = blob.y * h;
      const radius = blob.radius * this._dpr * (1 + ((bass / 100) * 0.15));

      // Radial gradient: center at 0% opacity=0.60, edge at 100% transparent
      const grad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, radius);
      grad.addColorStop(0.0, `rgba(${blob.r}, ${blob.g}, ${blob.b}, 0.60)`);
      grad.addColorStop(0.4, `rgba(${blob.r}, ${blob.g}, ${blob.b}, 0.32)`);
      grad.addColorStop(0.7, `rgba(${blob.r}, ${blob.g}, ${blob.b}, 0.12)`);
      grad.addColorStop(1.0, `rgba(${blob.r}, ${blob.g}, ${blob.b}, 0.0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    this.animationFrame = requestAnimationFrame(this._boundAnimate);
  },

  /**
   * Starts the animation loop.
   */
  start() {
    if (this.isActive) return;
    this.isActive = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this.animationFrame = requestAnimationFrame(this._boundAnimate || this.animate.bind(this));
  },

  /**
   * Stops the animation loop.
   */
  stop() {
    this.isActive = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  },

  /**
   * Resizes canvas to match container / viewport.
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

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this._dpr, this._dpr);
  },

  // =========================================================================
  // 4. Events & Color Helpers
  // =========================================================================

  /**
   * Binds to audio engine events for track artwork changes.
   * @private
   */
  _bindEvents() {
    document.addEventListener('ss:track-loaded', (e) => {
      const track = e.detail?.track;
      if (track?.artworkUrl) {
        this.loadArtwork(track.artworkUrl);
      } else {
        this.updateColors(this.defaultColors);
      }
    });

    document.addEventListener('ss:play', () => {
      this.start();
    });
  },

  /**
   * Set up ResizeObserver and fallback window resize.
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
   * Computes background fill color with low opacity for the trail effect.
   * @private
   */
  _getBgTrailColor() {
    const root = document.getElementById('app') || document.documentElement;
    const computed = window.getComputedStyle(root);
    const bg = computed.getPropertyValue('--bg-primary').trim();

    if (bg && bg.startsWith('#')) {
      const rgb = this._hexToRgb(bg);
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.035)`;
    }
    return 'rgba(10, 10, 15, 0.035)';
  },

  /**
   * Converts hex color string to {r, g, b} object.
   * @private
   */
  _hexToRgb(hexStr) {
    let hex = (hexStr || '#4a90e2').replace('#', '').trim();
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    return {
      r: parseInt(hex.substring(0, 2), 16) || 0,
      g: parseInt(hex.substring(2, 4), 16) || 0,
      b: parseInt(hex.substring(4, 6), 16) || 0
    };
  },

  /**
   * Converts RGB numbers to 6-character hex string.
   * @private
   */
  _rgbToHex(r, g, b) {
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
    const toHex = (v) => clamp(v).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
};
