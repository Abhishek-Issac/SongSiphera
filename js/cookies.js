/**
 * SongSiphera — Cookie Management & First-Paint State Hydration
 * File: js/cookies.js
 *
 * Implements RFC 6265 compliant first-party cookies for lightweight preference persistence.
 * Allows the client (and local server) to instantly know user preferences
 * (profile, theme, motion, volume, density, and device ID) on boot with zero layout shift.
 *
 * References: music-player-master-prompt.md Part 7.1
 */

window.SS = window.SS || {};

SS.cookies = {
  // Default cookie longevity: 400 days (maximum browser-allowed persistent age)
  DEFAULT_MAX_AGE: 400 * 24 * 60 * 60,

  /**
   * Set a cookie with safe defaults (SameSite=Lax, Path=/, Max-Age).
   * @param {string} name - Cookie name
   * @param {string|number|boolean} value - Value to store
   * @param {number} [maxAgeSeconds] - Optional expiration in seconds
   */
  set(name, value, maxAgeSeconds = this.DEFAULT_MAX_AGE) {
    if (!name) return;
    try {
      const isSecure = window.location.protocol === 'https:';
      const encodedValue = encodeURIComponent(String(value));
      let cookieStr = `${encodeURIComponent(name)}=${encodedValue}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
      if (isSecure) {
        cookieStr += '; Secure';
      }
      document.cookie = cookieStr;
    } catch (err) {
      console.warn(`[SS.cookies] Error setting cookie "${name}":`, err);
    }
  },

  /**
   * Retrieve a cookie by name.
   * @param {string} name - Cookie name
   * @param {string|null} [defaultValue=null] - Fallback value
   * @returns {string|null}
   */
  get(name, defaultValue = null) {
    if (!name || typeof document === 'undefined') return defaultValue;
    try {
      const cookies = document.cookie ? document.cookie.split('; ') : [];
      const prefix = `${encodeURIComponent(name)}=`;
      for (const cookie of cookies) {
        if (cookie.startsWith(prefix)) {
          return decodeURIComponent(cookie.substring(prefix.length));
        }
      }
      return defaultValue;
    } catch (err) {
      console.warn(`[SS.cookies] Error reading cookie "${name}":`, err);
      return defaultValue;
    }
  },

  /**
   * Remove a cookie by setting its expiration to the past.
   * @param {string} name
   */
  remove(name) {
    if (!name) return;
    try {
      document.cookie = `${encodeURIComponent(name)}=; Path=/; Max-Age=0; SameSite=Lax`;
    } catch (err) {
      console.warn(`[SS.cookies] Error removing cookie "${name}":`, err);
    }
  },

  /**
   * Return an object containing all cookies currently stored for this origin.
   * @returns {Record<string, string>}
   */
  getAll() {
    const result = {};
    if (typeof document === 'undefined' || !document.cookie) return result;
    try {
      const pairs = document.cookie.split('; ');
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx > -1) {
          const k = decodeURIComponent(pair.substring(0, idx).trim());
          const v = decodeURIComponent(pair.substring(idx + 1));
          result[k] = v;
        }
      }
    } catch (err) {
      console.warn('[SS.cookies] Error parsing all cookies:', err);
    }
    return result;
  },

  /**
   * Clear all application cookies.
   */
  clearAll() {
    const all = this.getAll();
    for (const key of Object.keys(all)) {
      this.remove(key);
    }
  },

  /**
   * Ensure an anonymous client device ID exists for multi-device synchronization.
   * @returns {string} Anonymous client ID
   */
  getOrCreateClientId() {
    let cid = this.get('ap_cid');
    if (!cid) {
      cid = 'cid_' + (crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).substring(2) + Date.now().toString(36));
      this.set('ap_cid', cid);
    }
    return cid;
  },

  /**
   * Immediately hydrates document attributes on page load to prevent theme flashes.
   */
  hydrateImmediate() {
    try {
      const profile = this.get('ap_profile') || 'default';
      const theme = this.get('ap_theme') || 'auto';
      const motion = this.get('ap_motion') || 'full';
      const density = this.get('ap_density') || 'comfortable';

      const root = document.documentElement;
      root.setAttribute('data-profile', profile);
      root.setAttribute('data-theme', theme);
      root.setAttribute('data-motion', motion);
      root.setAttribute('data-density', density);

      // Apply to #app if already in DOM
      const app = document.getElementById('app');
      if (app) {
        app.setAttribute('data-mood', profile);
        app.setAttribute('data-theme', theme);
      }
    } catch (e) {
      // Ignore during early parse
    }
  }
};

// Immediate execution on script parse to eliminate any Flash of Unstyled Content (FOUC)
SS.cookies.hydrateImmediate();
