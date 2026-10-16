/**
 * SongSiphera — Time-Synced Lyrics Engine
 * File: js/lyrics.js
 *
 * Provides Apple Music-grade time-synchronized lyrics display,
 * LRC parsing (multi-timestamp support), smooth autoscroll with active-line
 * centering, dynamic blur transitions, and manual text fallback.
 */

window.SS = window.SS || {};

SS.lyrics = {
  // ---------------------------------------------------------------------------
  // Properties & State
  // ---------------------------------------------------------------------------
  lines: [],             // Array of { time: number, text: string }
  isVisible: false,      // Overlay visibility state
  currentLineIndex: -1,  // Currently active lyric line index
  isManual: false,       // Whether lyrics were manually entered as plain text
  containerEl: null,     // #np-lyrics-compact reference
  linesContainerEl: null,// Scrollable inner container for lyric lines

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  init() {
    this.containerEl = document.getElementById('np-lyrics-compact');
    if (!this.containerEl) {
      console.warn('[SS.lyrics] #np-lyrics-compact element not found in DOM.');
      return;
    }

    // Ensure base container class and hidden state initially
    this.containerEl.classList.add('lyrics-compact-strip');
    if (!this.isVisible) {
      this.containerEl.classList.add('hidden');
    }

    this.render();
  },

  // ---------------------------------------------------------------------------
  // LRC Format Parser
  // ---------------------------------------------------------------------------
  parseLRC(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') {
      return [];
    }

    const parsed = [];
    const lines = lrcText.split(/\r?\n/);
    const timeTagRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      const timestamps = [];
      let match;
      timeTagRegex.lastIndex = 0;

      while ((match = timeTagRegex.exec(rawLine)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const msRaw = match[3] || '0';
        const ms = msRaw.length === 2 ? parseInt(msRaw, 10) * 10 : parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10);
        const totalSeconds = minutes * 60 + seconds + ms / 1000;
        timestamps.push(totalSeconds);
      }

      const text = rawLine.replace(timeTagRegex, '').trim();

      if (timestamps.length > 0 && text.length > 0) {
        for (let t = 0; t < timestamps.length; t++) {
          parsed.push({
            time: timestamps[t],
            text: text
          });
        }
      }
    }

    parsed.sort((a, b) => a.time - b.time);
    return parsed;
  },

  // ---------------------------------------------------------------------------
  // Load for Track
  // ---------------------------------------------------------------------------
  loadForTrack(track) {
    this.lines = [];
    this.currentLineIndex = -1;
    this.isManual = false;

    if (track && track.lyrics) {
      const parsed = this.parseLRC(track.lyrics);
      if (parsed.length > 0) {
        this.lines = parsed;
        this.isManual = false;
      } else {
        this.setManualLyrics(track.lyrics);
        return;
      }
    }

    this.render();
  },

  // ---------------------------------------------------------------------------
  // Visibility Controls
  // ---------------------------------------------------------------------------
  show() {
    if (!this.containerEl) {
      this.containerEl = document.getElementById('np-lyrics-compact');
    }
    if (!this.containerEl) return;

    this.isVisible = true;
    this.containerEl.classList.remove('hidden');
    this.containerEl.setAttribute('aria-hidden', 'false');

    const toggleBtn = document.getElementById('btn-lyrics-toggle');
    if (toggleBtn) {
      toggleBtn.classList.add('active');
    }

    this.render();

    if (window.SS?.audioEngine) {
      this.sync(SS.audioEngine.getCurrentTime());
    }
  },

  hide() {
    if (!this.containerEl) {
      this.containerEl = document.getElementById('np-lyrics-compact');
    }
    if (!this.containerEl) return;

    this.isVisible = false;
    this.containerEl.classList.add('hidden');
    this.containerEl.setAttribute('aria-hidden', 'true');

    const toggleBtn = document.getElementById('btn-lyrics-toggle');
    if (toggleBtn) {
      toggleBtn.classList.remove('active');
    }
  },

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  },

  // ---------------------------------------------------------------------------
  // Time Synchronization
  // ---------------------------------------------------------------------------
  sync(currentTime) {
    if (!this.isVisible || this.lines.length === 0 || this.isManual) {
      return;
    }

    let activeIndex = -1;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (currentTime >= this.lines[i].time - 0.25) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex === this.currentLineIndex) {
      return;
    }

    this.currentLineIndex = activeIndex;

    if (!this.linesContainerEl) {
      this.linesContainerEl = this.containerEl?.querySelector('#lyrics-compact-lines');
    }
    if (!this.linesContainerEl) return;

    const lineElements = this.linesContainerEl.querySelectorAll('.lyrics-compact-line');

    lineElements.forEach((el, idx) => {
      if (idx === activeIndex) {
        el.classList.add('active');
        // Smoothly auto-scroll active lyric into center view
        const containerHeight = this.linesContainerEl.clientHeight;
        const targetScroll = el.offsetTop - containerHeight / 2 + el.clientHeight / 2;
        this.linesContainerEl.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      } else {
        el.classList.remove('active');
      }
    });
  },

  // ---------------------------------------------------------------------------
  // Manual Lyrics Input
  // ---------------------------------------------------------------------------
  setManualLyrics(text) {
    if (!text || !text.trim()) {
      this.lines = [];
      this.isManual = false;
      this.render();
      return;
    }

    const trimmed = text.trim();
    if (/\[\d{1,2}:\d{2}/.test(trimmed)) {
      this.lines = this.parseLRC(trimmed);
      this.isManual = false;
    } else {
      const rawLines = trimmed.split(/\r?\n/);
      this.lines = rawLines
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map((line, index) => ({ time: index * 4, text: line }));
      this.isManual = true;
    }

    this.currentLineIndex = -1;
    this.render();

    if (window.SS?.ui) {
      SS.ui.showToast('Lyrics updated', 'success');
    }
  },

  // ---------------------------------------------------------------------------
  // DOM Rendering
  // ---------------------------------------------------------------------------
  render() {
    if (!this.containerEl) {
      this.containerEl = document.getElementById('np-lyrics-compact');
    }
    if (!this.containerEl) return;

    this.containerEl.innerHTML = '';

    const linesContainer = document.createElement('div');
    linesContainer.id = 'lyrics-compact-lines';
    linesContainer.className = 'lyrics-compact-lines';
    this.linesContainerEl = linesContainer;

    if (this.lines.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'lyrics-compact-empty';
      emptyState.innerHTML = `
        <span class="lyrics-compact-empty-text">No lyrics available. Click to add.</span>
      `;
      emptyState.addEventListener('click', () => this.showPastePrompt());
      linesContainer.appendChild(emptyState);
    } else {
      this.lines.forEach((lineObj, index) => {
        const lineEl = document.createElement('div');
        lineEl.className = 'lyrics-compact-line';
        lineEl.dataset.index = index;
        lineEl.dataset.time = lineObj.time;
        lineEl.textContent = lineObj.text;

        if (!this.isManual) {
          lineEl.title = `Jump to ${this.formatTime(lineObj.time)}`;
          lineEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.SS?.audioEngine) {
              SS.audioEngine.seek(lineObj.time);
              this.sync(lineObj.time);
            }
          });
        }

        linesContainer.appendChild(lineEl);
      });
    }

    this.containerEl.appendChild(linesContainer);
  },

  // ---------------------------------------------------------------------------
  // Helper Dialog for Pasting Lyrics
  // ---------------------------------------------------------------------------
  showPastePrompt() {
    const existingModal = document.getElementById('lyrics-paste-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'lyrics-paste-modal';
    modal.className = 'lyrics-paste-modal-backdrop';
    modal.innerHTML = `
      <div class="lyrics-paste-modal-content glass card">
        <h3 class="lyrics-modal-title">Paste Lyrics</h3>
        <p class="lyrics-modal-desc">Paste standard LRC text (with [mm:ss] tags) or plain lines.</p>
        <textarea id="lyrics-paste-input" class="lyrics-textarea" rows="10" placeholder="[00:15.30]First line of lyrics...&#10;[00:20.50]Second line..."></textarea>
        <div class="lyrics-modal-actions">
          <button type="button" class="btn-ghost" id="lyrics-paste-cancel">Cancel</button>
          <button type="button" class="btn-primary" id="lyrics-paste-submit">Apply Lyrics</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const textarea = modal.querySelector('#lyrics-paste-input');
    textarea?.focus();

    modal.querySelector('#lyrics-paste-cancel')?.addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelector('#lyrics-paste-submit')?.addEventListener('click', () => {
      const val = textarea?.value || '';
      this.setManualLyrics(val);
      modal.remove();
    });
  },

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
};

