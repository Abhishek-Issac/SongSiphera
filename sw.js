/**
 * SongSiphera — Service Worker & Offline Shell Cache (Part 7.4)
 * File: sw.js
 *
 * Implements a stale-while-revalidate strategy for application shell assets,
 * ensuring the player boots offline instantly and runs without network access.
 */

const CACHE_NAME = 'songsiphera-shell-v1';

const STATIC_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/cookies.js',
  './js/storage.js',
  './js/audio-engine.js',
  './js/equalizer.js',
  './js/visualizer.js',
  './js/fluid-bg.js',
  './js/lyrics.js',
  './js/playlist.js',
  './js/queue.js',
  './js/themes.js',
  './js/ui.js',
  './js/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline application shell');
      return cache.addAll(STATIC_SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing deprecated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Audio files and media streams bypass cache to protect storage quotas
  if (request.destination === 'audio' || request.url.includes('/stream/')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for next launch (stale-while-revalidate)
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {/* Offline */});
        return cachedResponse;
      }
      return fetch(request);
    })
  );
});
