/**
 * SongSiphera — Premium Web Audio Player
 * Theme & Mood Engine (js/themes.js)
 *
 * Implements 6 distinct aesthetic audio/visual personas:
 * 1. Luminance (Apple white crisp elegance)
 * 2. Chaos Mode (Neon red glitch/pulse)
 * 3. Midnight Souls (Deep indigo soft glow)
 * 4. Retro Wind (Warm vintage amber & vinyl grain)
 * 5. Pure Audio (Monochrome audiophile minimalism)
 * 6. Neon Drift (Cyberpunk cyan-magenta electric grid)
 *
 * Dynamically binds CSS custom properties, triggers ambient background classes,
 * synchronizes acoustic equalizer presets, and updates visualizer render modes.
 */

window.SS = window.SS || {};

SS.themes = {
  // Currently active mood profile identifier
  currentMood: 'default',

  // Complete specifications for all 6 mood aura profiles
  moods: {
    default: {
      displayName: 'Luminance',
      colors: {
        '--bg-primary': '#ffffff',
        '--bg-secondary': '#f5f5f7',
        '--bg-tertiary': '#e8e8ed',
        '--bg-elevated': '#ffffff',
        '--text-primary': '#1d1d1f',
        '--text-secondary': '#86868b',
        '--text-tertiary': '#aeaeb2',
        '--accent': '#0071e3',
        '--accent-hover': '#0077ED',
        '--accent-rgb': '0,113,227',
        '--glass-bg': 'rgba(255,255,255,0.72)',
        '--glass-border': 'rgba(255,255,255,0.18)',
        '--glass-shadow': '0 8px 32px rgba(0,0,0,0.08)',
        '--viz-primary': '#0071e3',
        '--viz-secondary': '#ff2d55',
        '--eq-bar-color': '#0071e3'
      },
      eqPreset: 'flat',
      vizMode: 'bars',
      ambient: 'none'
    },
    chaos: {
      displayName: 'Chaos Mode',
      colors: {
        '--bg-primary': '#0a0a0a',
        '--bg-secondary': '#1a1010',
        '--bg-tertiary': '#2a1515',
        '--bg-elevated': '#1a0a0a',
        '--text-primary': '#ffffff',
        '--text-secondary': '#ff8a80',
        '--text-tertiary': '#884444',
        '--accent': '#ff2d55',
        '--accent-hover': '#ff4466',
        '--accent-rgb': '255,45,85',
        '--glass-bg': 'rgba(20,5,5,0.85)',
        '--glass-border': 'rgba(255,45,85,0.15)',
        '--glass-shadow': '0 8px 32px rgba(255,0,0,0.15)',
        '--viz-primary': '#ff2d55',
        '--viz-secondary': '#ff6b35',
        '--eq-bar-color': '#ff2d55'
      },
      eqPreset: 'chaos-vshape',
      vizMode: 'particles',
      ambient: 'pulse'
    },
    midnight: {
      displayName: 'Midnight Souls',
      colors: {
        '--bg-primary': '#0d1117',
        '--bg-secondary': '#161b22',
        '--bg-tertiary': '#21262d',
        '--bg-elevated': '#161b22',
        '--text-primary': '#c9d1d9',
        '--text-secondary': '#8b949e',
        '--text-tertiary': '#484f58',
        '--accent': '#7c3aed',
        '--accent-hover': '#8b5cf6',
        '--accent-rgb': '124,58,237',
        '--glass-bg': 'rgba(13,17,23,0.88)',
        '--glass-border': 'rgba(124,58,237,0.12)',
        '--glass-shadow': '0 8px 32px rgba(124,58,237,0.1)',
        '--viz-primary': '#7c3aed',
        '--viz-secondary': '#6366f1',
        '--eq-bar-color': '#7c3aed'
      },
      eqPreset: 'midnight-warm',
      vizMode: 'wave',
      ambient: 'glow'
    },
    retro: {
      displayName: 'Retro Wind',
      colors: {
        '--bg-primary': '#1a1208',
        '--bg-secondary': '#2d1f0e',
        '--bg-tertiary': '#3d2c16',
        '--bg-elevated': '#2d1f0e',
        '--text-primary': '#e8d5b7',
        '--text-secondary': '#c8956c',
        '--text-tertiary': '#8a6840',
        '--accent': '#d4a574',
        '--accent-hover': '#e0b586',
        '--accent-rgb': '212,165,116',
        '--glass-bg': 'rgba(26,18,8,0.88)',
        '--glass-border': 'rgba(212,165,116,0.12)',
        '--glass-shadow': '0 8px 32px rgba(139,90,43,0.15)',
        '--viz-primary': '#d4a574',
        '--viz-secondary': '#c8956c',
        '--eq-bar-color': '#d4a574'
      },
      eqPreset: 'retro-vinyl',
      vizMode: 'bars',
      ambient: 'grain'
    },
    pure: {
      displayName: 'Pure Audio',
      colors: {
        '--bg-primary': '#000000',
        '--bg-secondary': '#111111',
        '--bg-tertiary': '#1a1a1a',
        '--bg-elevated': '#0a0a0a',
        '--text-primary': '#ffffff',
        '--text-secondary': '#888888',
        '--text-tertiary': '#555555',
        '--accent': '#ffffff',
        '--accent-hover': '#cccccc',
        '--accent-rgb': '255,255,255',
        '--glass-bg': 'rgba(0,0,0,0.88)',
        '--glass-border': 'rgba(255,255,255,0.08)',
        '--glass-shadow': '0 8px 32px rgba(0,0,0,0.5)',
        '--viz-primary': '#ffffff',
        '--viz-secondary': '#888888',
        '--eq-bar-color': '#ffffff'
      },
      eqPreset: 'pure-flat',
      vizMode: 'wave',
      ambient: 'minimal'
    },
    neon: {
      displayName: 'Neon Drift',
      colors: {
        '--bg-primary': '#0a0014',
        '--bg-secondary': '#1a0033',
        '--bg-tertiary': '#2a0050',
        '--bg-elevated': '#150028',
        '--text-primary': '#e0e0ff',
        '--text-secondary': '#a080d0',
        '--text-tertiary': '#6040a0',
        '--accent': '#00f0ff',
        '--accent-hover': '#33f5ff',
        '--accent-rgb': '0,240,255',
        '--glass-bg': 'rgba(10,0,20,0.88)',
        '--glass-border': 'rgba(0,240,255,0.15)',
        '--glass-shadow': '0 8px 32px rgba(0,240,255,0.1)',
        '--viz-primary': '#00f0ff',
        '--viz-secondary': '#ff00e4',
        '--eq-bar-color': '#00f0ff'
      },
      eqPreset: 'neon-bass',
      vizMode: 'circular',
      ambient: 'grid'
    }
  },

  // =========================================================================
  // Initialization
  // =========================================================================

  /**
   * Initializes the theme engine. Reads saved mood from storage and applies it.
   */
  init() {
    let savedMood = 'default';
    try {
      savedMood = window.SS?.storage?.getMood() || 'default';
    } catch (err) {
      console.warn('[SS.themes] Failed to load saved mood from storage:', err);
    }

    if (!this.moods[savedMood]) {
      savedMood = 'default';
    }

    // Apply mood initially without toast alert
    this.setMood(savedMood, false);

    // Bind all mood buttons on sidebar
    const buttons = document.querySelectorAll('.mood-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetMood = btn.dataset.mood;
        if (targetMood) {
          this.setMood(targetMood, true);
        }
      });
    });

    console.log(`[SS.themes] Theme engine initialized with active mood: "${this.currentMood}".`);
  },

  // =========================================================================
  // Mood Switcher Core
  // =========================================================================

  /**
   * Applies the selected aesthetic profile across the application.
   * @param {string} name - Identifier of mood profile ('default','chaos','midnight','retro','pure','neon')
   * @param {boolean} [showToastNotification=true] - Whether to show feedback toast
   * @returns {boolean} Success status
   */
  setMood(name, showToastNotification = true) {
    if (!name || !this.moods[name]) {
      console.warn(`[SS.themes] Mood "${name}" not recognized. Falling back to "default".`);
      name = 'default';
    }

    const mood = this.moods[name];
    this.currentMood = name;

    const app = document.getElementById('app');
    if (app) {
      // Set root data attribute
      app.setAttribute('data-mood', name);
    }

    // 1. Inject custom CSS color variables
    this.applyCSS(mood);

    // 2. Configure ambient aura classes
    this.applyAmbient(mood);

    // 3. Synchronize Equalizer Preset if module exists and is initialized
    if (window.SS?.equalizer && typeof SS.equalizer.setPreset === 'function') {
      try {
        SS.equalizer.setPreset(mood.eqPreset);
        const eqSelect = document.getElementById('eq-preset-select');
        if (eqSelect) {
          eqSelect.value = mood.eqPreset;
        }
      } catch (err) {
        console.warn('[SS.themes] Failed to sync EQ preset with mood:', err);
      }
    }

    // 4. Synchronize Visualizer Mode if module exists
    if (window.SS?.visualizer && typeof SS.visualizer.setMode === 'function') {
      try {
        SS.visualizer.setMode(mood.vizMode);
      } catch (err) {
        console.warn('[SS.themes] Failed to sync visualizer mode with mood:', err);
      }
    }

    // Update visualizer buttons active states in UI
    const vizButtons = document.querySelectorAll('.viz-mode-btn');
    vizButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mood.vizMode);
    });

    // 5. Update browser meta theme-color for mobile chrome
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme && mood.colors['--bg-primary']) {
      metaTheme.setAttribute('content', mood.colors['--bg-primary']);
    }

    // 6. Persist to localStorage and Cookies
    if (window.SS?.cookies?.set) {
      window.SS.cookies.set('ap_profile', name);
    }
    document.documentElement.setAttribute('data-profile', name);
    if (window.SS?.storage?.saveMood) {
      SS.storage.saveMood(name);
    }

    // 7. Dispatch custom event for reactive UI listeners
    document.dispatchEvent(new CustomEvent('ss:mood-changed', {
      detail: {
        mood: name,
        profile: mood
      }
    }));

    // 8. Update sidebar mood buttons active state
    const moodButtons = document.querySelectorAll('.mood-btn');
    moodButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mood === name);
    });

    // 9. Show feedback toast notification
    if (showToastNotification && window.SS?.ui && typeof SS.ui.showToast === 'function') {
      SS.ui.showToast(`Aura: ${mood.displayName}`, 'info');
    }

    return true;
  },

  // =========================================================================
  // CSS & Ambient Stylers
  // =========================================================================

  /**
   * Applies CSS variable overrides to the #app element and document root.
   * @param {object} mood - Profile object containing `colors` map
   */
  applyCSS(mood) {
    if (!mood || !mood.colors) return;

    const app = document.getElementById('app');
    const root = document.documentElement;

    for (const [property, value] of Object.entries(mood.colors)) {
      if (app) {
        app.style.setProperty(property, value);
      }
      if (root) {
        root.style.setProperty(property, value);
      }
    }
  },

  /**
   * Applies corresponding ambient effect class to #app container.
   * Removes previous ambient classes and adds the active one.
   * @param {object} mood - Profile object containing `ambient` mode string
   */
  applyAmbient(mood) {
    const app = document.getElementById('app');
    if (!app) return;

    const ambientClasses = [
      'ambient-pulse',
      'ambient-glow',
      'ambient-grain',
      'ambient-minimal',
      'ambient-grid'
    ];

    // Remove any active ambient classes
    ambientClasses.forEach((cls) => app.classList.remove(cls));

    // Add matching ambient class if specified and not 'none'
    if (mood && mood.ambient && mood.ambient !== 'none') {
      app.classList.add(`ambient-${mood.ambient}`);
    }
  },

  // =========================================================================
  // Accessors
  // =========================================================================

  /**
   * Returns identifier of current mood.
   * @returns {string}
   */
  getCurrentMood() {
    return this.currentMood;
  },

  /**
   * Returns colors map of specified mood profile.
   * @param {string} name
   * @returns {object|null}
   */
  getMoodColors(name) {
    return this.moods[name]?.colors || null;
  }
};
