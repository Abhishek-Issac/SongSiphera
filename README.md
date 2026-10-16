# 🎵 SongSiphera

> **Apple Music Aesthetics meets Spotify Power** — A 100% locally hosted, client-side, audiophile-grade web audio player. Featuring dynamic kinetic artwork backgrounds, real-time sound telemetry, 10-band parametric equalisation, 6 reactive visualizers, cookie-based first-paint hydration, and 6 immersive aesthetic mood engines.
>
> **License:** Licensed under the permissive [MIT License](LICENSE). Anyone is completely free to copy, recreate, overwrite, fork, distribute, and build upon this code.

---

## 🌟 Overview & Philosophy

SongSiphera was designed to bring the **luxurious, tactile feel of Apple Music** (frosted glassmorphism, fluid kinetic artwork backgrounds, heavy typography, spring physics) together with the **power and clarity of Spotify** (flexible queues, modular media cards, instant search, responsive layouts, audiophile telemetry).

Everything runs **100% locally** in your web browser. Zero CDNs, zero third-party telemetry, zero cloud tracking, and zero build steps. Just open and listen.

---

## ✨ Features

### 🎨 Apple Music Aesthetics & Kinetic Motion
- **Dynamic Kinetic Artwork (Fluid Backgrounds)**: Evaluates album art in real time, extracts 5 dominant palette tones via an offscreen canvas, and renders soft, flowing organic gradient blobs via Canvas 2D (`js/fluid-bg.js`). Blobs gently expand and accelerate with live sub-bass energy.
- **Full-Screen Now Playing Sheet**: Expands with spring physics (`cubic-bezier(0.34, 1.56, 0.64, 1)`) into a full-bleed player with blurred backdrop lighting, live sound telemetry, sub-bass meters, and embedded visualizers.
- **Micro-Interactions & Gestures**: Smooth scrubbing, tactile slider interactions, double-click to reset, drag-and-drop file ingestion, and keyboard micro-stepping.

### 📊 Real-Time Sound Information & Telemetry (Part 17)
- **Live Bass Percentage**: Calculates real-time spectral energy below 180 Hz divided by total energy. Shows the track's native bass share alongside your boost setting (e.g. `Track: 38% · Boost: +4dB`).
- **Dynamic Range & Headroom**: Real-time peak & RMS dBFS monitoring with a safe headroom protection badge (`-1.2 dB Safe` vs. `Hot`).
- **Pitch & Musical Key Estimator**: Analyzes dominant frequency bins with parabolic interpolation to compute the musical note and cents offset (e.g. `Key: A4` or `440 Hz`).
- **Adaptive Rhythm & BPM Counter**: Adaptive spectral flux onset detection estimates tempo in real-time.
- **Signal Flow Visualizer**: Live chain indicator showing active stages: `Source → EQ [Active] → Bass Exciter → Limiter → Output`.

### 🎛️ 10-Band Parametric Equalizer & Acoustic Presets
- **10 Precision Biquad Peaking Filters**: 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, and 16kHz with vertical sliders (-12 dB to +12 dB).
- **19 Acoustic Presets**: Flat, Bass Boost, Treble Boost, Vocal Enhance, Rock, Pop, Jazz, Classical, Electronic, Acoustic, Hip-Hop, R&B, Latin, Podcast, Chaos V-Shape, Midnight Warm, Retro Vinyl, Pure Flat, and Neon Cyber Bass.
- **Sub-Bass Exciter & EQ Intensity Sliders**: Sub-harmonic low-frequency excitation and overall curve amplification.
- **Double-Tap to Reset**: Double-clicking any slider immediately resets it to neutral (0 dB, 0% bass, or 100% intensity). Arrow keys allow micro-stepping (0.5 dB) or Shift+Arrow for fast steps (2.0 dB).

### 🌙 Sleep Timer (Part 16.7)
- Quick presets: **15 min**, **30 min**, **45 min**, **60 min**, or **End of Track**.
- Features a **gentle 30-second exponential gain fade-out** so the music never abruptly cuts off when you fall asleep.
- Live countdown displayed in the Now Playing Full header and Settings.

### 🍪 Cookies & First-Paint Parity (Part 7.1)
SongSiphera uses lightweight, first-party functional cookies (RFC 6265, `SameSite=Lax`, `Max-Age=400 days`) to solve layout shifts and theme flashes on startup:
- `ap_profile`: Active mood profile (`default`, `chaos`, `midnight`, `retro`, `pure`, `neon`).
- `ap_theme`: Color mode (`auto`, `light`, `dark`).
- `ap_vol`: Master volume (0–100).
- `ap_motion`: Animation dynamics (`full`, `reduced`).
- `ap_density`: Interface density (`comfortable`, `compact`).
- `ap_cid`: Anonymous local client device ID for multi-device sync without accounts.

Because cookies are parsed synchronously in `<head>` by `js/cookies.js`, the root `<html>` and `#app` elements receive their `data-profile` and theme attributes **before the first paint**, eliminating any Flash of Unstyled Content (FOUC).

### 🌈 6 Aesthetic Aura Moods
Switch moods instantly via the sidebar buttons or shortcuts. Each mood transforms the entire color palette, acoustic EQ profile, visualizer mode, and ambient effects:
1. **Luminance (Default)**: Apple crisp white glass, subtle blue accent (`#0071e3`), flat acoustic profile, spectrum bars.
2. **Chaos Mode**: Aggressive dark red (`#ff2d55`), screen shake, V-shaped EQ, reactive particle swarm, pulsing red glow.
3. **Midnight Souls**: Deep navy-indigo (`#7c3aed`), gentle breathing animations, warm acoustic profile, oscilloscope wave.
4. **Retro Wind**: Warm sepia and amber vinyl (`#d4a574`), vintage film grain animation overlay, vinyl acoustic curve.
5. **Pure Audio**: Monochrome minimalist audiophile theme (`#ffffff`), zero ornamentation, reference flat profile.
6. **Neon Drift**: Cyberpunk dark purple and cyan neon (`#00f0ff`), animated perspective grid backdrop, circular spectrum.

### 🌌 6 Full Canvas Audio Visualizer Modes
- **Bars**: 64-band frequency spectrum with rounded caps, smooth 70/30 falloff blending, and mirror reflection.
- **Wave**: Oscilloscope waveform with Catmull-Rom cubic bezier curves and triple-draw glow passes.
- **Circular**: 128 radial frequency bars with dynamic hue rotation and real-time sub-bass center pulsing.
- **Particles**: 150-particle swarm with explosive bass reactions, inter-particle distance webbing, and micro-vibration.
- **Galaxy**: 3-arm logarithmic spiral galaxy with 600 audio-reactive stars, twinkling opacity, and shifting nebula clouds.
- **Terrain**: 3D synthwave wireframe perspective mesh scrolling toward the viewer with frequency-driven elevation.

### 📁 Ingestion, Metadata & Playlists
- **Supported Formats**: MP3, FLAC, WAV, OGG, AAC, M4A, and WEBM.
- **Pure Client-Side ID3v2 Tag & Artwork Parser**: Extracts title, artist, album, year, and APIC embedded artwork directly in-browser using binary ArrayBuffer/DataView parsing.
- **Persistent IndexedDB Audio Caching**: Caches local audio blobs and metadata across browser sessions so you never have to re-add folders repeatedly, instantly restoring your library and last playing state on startup.
- **Playlists & Queues**: Custom playlist creation with procedural gradient artwork, drag-and-drop queue reordering, Fisher-Yates shuffle with current-track preservation, and repeat modes (`none` | `all` | `one`).
- **Time-Synced Lyrics**: LRC format parser with auto-scrolling, active line spotlight, and background line blur.

---

## 🚀 Getting Started

SongSiphera runs anywhere: on modern desktop browsers, mobile devices, and **Android inside Termux**.

### Option 2: Pure Python 3 Fallback Server (Stdlib Only — Recommended)
```bash
# Run the local python server on port 8080
python3 server.py 8080
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.

> **Note:** SongSiphera is **not a cloud streaming service**—it is a 100% private, local client-side music player. When you open it up, your library will start empty. Simply click **"Add Files"** or **"Add Folder"** (or drag and drop your local music files) to populate your library with your own music collection!

### Option 1: Zero-Dependency Node.js Server
```bash
# Start server on port 8080 (or custom port)
node server.js 8080
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.
*Supports HTTP 206 Partial Content for instant audio scrubbing and cookie header pre-injection.*

### Option 3: Python Built-in Simple HTTP Server
```bash
python3 -m http.server 8080
```

### Option 4: Direct Browser Launch
You can open `index.html` directly in any modern browser (Chrome, Firefox, Edge, Safari). Running via a local server (Option 1 or 2) is recommended for unrestricted Web Audio and local storage capabilities.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|:---|:---|
| <kbd>Space</kbd> | Play / Pause |
| <kbd>J</kbd> / <kbd>L</kbd> | Previous / Next Track |
| <kbd>←</kbd> / <kbd>→</kbd> | Seek Backward / Forward 5s |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Volume Up / Down (5%) |
| <kbd>M</kbd> | Toggle Mute |
| <kbd>F</kbd> | Expand / Collapse Now Playing View |
| <kbd>Q</kbd> | Toggle Play Queue Drawer |
| <kbd>Escape</kbd> | Close Overlays / Menus / Full Player |

---

## 🏗️ Project Architecture

```
premiumplayeer-songsiphera/
├── index.html            # Semantic Apple layout & 40+ inline SVG icons (1,180 lines)
├── manifest.webmanifest  # PWA manifest for standalone mobile/desktop installation
├── sw.js                 # Service Worker with offline shell caching
├── server.js             # Node.js HTTP 206 Range server with cookie pre-injection
├── server.py             # Python 3 stdlib Range HTTP server fallback
├── LICENSE               # Full permissive MIT License
├── README.md             # Documentation, features & recreation guide
├── ARCHITECTURE.md       # Contract specification between HTML, CSS, and JS
├── css/
│   └── styles.css        # Tokens, glassmorphism, 6 moods, responsive rules (4,450 lines)
└── js/
    ├── cookies.js        # First-party RFC 6265 cookie manager & early hydrator (140 lines)
    ├── storage.js        # LocalStorage persistence layer & cookie synchronization (250 lines)
    ├── audio-engine.js   # Web Audio graph, ID3 parser, telemetry & sleep timer (850 lines)
    ├── equalizer.js      # 10-band Biquad filter engine & 19 acoustic presets (314 lines)
    ├── visualizer.js     # 6 canvas visualizer modes & mini renderers (1,427 lines)
    ├── fluid-bg.js       # Organic dynamic color-extracting ambient canvas (479 lines)
    ├── lyrics.js         # Time-synced LRC parser, active line spotlight & blur (424 lines)
    ├── playlist.js       # Playlist manager with canvas gradient art generator (577 lines)
    ├── queue.js          # Playback queue, Fisher-Yates shuffle, repeat modes (462 lines)
    ├── themes.js         # 6 Aesthetic Aura mood engines & token overrides (375 lines)
    ├── ui.js             # Master UI coordinator, drag & drop, context menus (1,660 lines)
    └── app.js            # Bootstrapper, audio ingestion, lifecycle orchestrator (606 lines)
```

---

## 📜 MIT License — Open for All

SongSiphera is distributed under the **MIT License**.

```
MIT License

Copyright (c) 2026 SongSiphera Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Anyone is welcome to:
- Copy, fork, or clone the repository
- Modify and customize the audio DSP or UI styling
- Overwrite presets, moods, and visualizers
- Use it as an educational reference for Web Audio API and Canvas development
- Host it locally on desktop, home server, or mobile device

---

## 👥 Authors & Credits

Crafted with ❤️ by **Abhishek Issac** & **Ansal K Joseph**.

