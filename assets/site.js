/*
 * Shared behaviour for every page: the release data from GitHub, telling which system the
 * visitor is on, the cobblestone block in the hero, and sections fading in on scroll.
 */
(function () {
  'use strict';

  var REPO = 'Legismmc/legism';

  // What ships today. A rate-limited or offline visitor still gets working links from
  // this rather than an empty page; the live answer replaces it whenever GitHub replies.
  var FALLBACK = {
    tag: 'v1.8',
    assets: [
      { name: 'Legism_windows_installer.exe', size: 118609442 },
      { name: 'Legism_windows_portable.zip', size: 165681931 },
      { name: 'Legism_linux.tar.gz', size: 139282136 },
      { name: 'Legism_macos_apple_silicon.dmg', size: 99190623 },
      { name: 'Legism_macos_intel.dmg', size: 103035019 }
    ]
  };

  var releasesPromise = null;

  /**
   * Every published release, newest first - one request covers the current version, its
   * files and the download count of every release ever made.
   */
  function releases() {
    if (!releasesPromise) {
      releasesPromise = fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=100', {
        headers: { 'Accept': 'application/vnd.github+json' }
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (list) {
        if (!Array.isArray(list)) throw new Error('unexpected answer');
        return list.filter(function (r) { return !r.draft && !r.prerelease; });
      });
    }
    return releasesPromise;
  }

  /**
   * @return a promise of { tag, assets, live, total } - the newest release with files,
   * and how many times anything has been downloaded
   */
  function latest() {
    return releases().then(function (list) {
      var current = list.filter(function (r) { return r.assets && r.assets.length; })[0];
      if (!current) throw new Error('no release with files');
      var total = 0;
      list.forEach(function (r) {
        (r.assets || []).forEach(function (a) { total += a.download_count || 0; });
      });
      return { tag: current.tag_name, assets: current.assets, live: true, total: total, count: list.length };
    }).catch(function (error) {
      if (window.console) console.warn('Showing the built-in release list:', error);
      return { tag: FALLBACK.tag, assets: FALLBACK.assets, live: false, total: null, count: null };
    });
  }

  function assetUrl(tag, name) {
    return 'https://github.com/' + REPO + '/releases/download/' + tag + '/' + name;
  }

  function size(bytes) {
    if (!bytes) return '';
    var mb = bytes / 1048576;
    return mb >= 1000 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB';
  }

  /**
   * Which system the visitor is on. Apple Silicon is invisible here - those Macs still
   * report "MacIntel" - so the Mac guess is refined below where the browser allows it.
   */
  function detect() {
    var ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return Promise.resolve({ os: 'mobile' });
    var os = /Windows/i.test(ua) ? 'windows'
      : /Macintosh|Mac OS X/i.test(ua) ? 'macos'
        : /Linux|X11|CrOS/i.test(ua) ? 'linux' : null;
    var result = { os: os, arm: /arm64|aarch64/i.test(ua) };
    var data = navigator.userAgentData;
    if (!data || !data.getHighEntropyValues) return Promise.resolve(result);
    return data.getHighEntropyValues(['architecture']).then(function (values) {
      if (values && values.architecture) {
        result.arm = /arm/i.test(values.architecture);
        result.archKnown = true;
      }
      return result;
    }).catch(function () { return result; });
  }

  /**
   * The file a visitor on this system most likely wants.
   */
  function pick(assets, found) {
    function named(pattern) {
      return assets.filter(function (a) { return pattern.test(a.name); })[0];
    }
    if (found.os === 'windows') return named(/windows_installer/i) || named(/windows/i);
    if (found.os === 'linux') return named(/linux/i);
    if (found.os === 'macos') {
      // without a hint, Apple Silicon: every Mac sold since 2020 is one
      return found.archKnown && !found.arm
        ? named(/macos_intel/i)
        : named(/macos_apple_silicon/i) || named(/macos/i);
    }
    return null;
  }

  window.Legism = {
    repo: REPO,
    latest: latest,
    releases: releases,
    detect: detect,
    pick: pick,
    assetUrl: assetUrl,
    size: size
  };

  // ------------------------------------------------------------ the block

  /**
   * Paints a cobblestone face onto a 16x16 canvas, the way the game's own texture is
   * built: a few grey tones in irregular stones with dark mortar between them. Seeded,
   * so every face is different but the same on every visit.
   */
  function stoneTexture(seed) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    var ctx = canvas.getContext('2d');
    var state = seed * 9301 + 49297;
    function rand() {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    }
    var tones = ['#6e6e6e', '#7d7d7d', '#8c8c8c', '#9a9a9a', '#a9a9a9', '#5f5f5f'];
    var mortar = ['#3d3d3d', '#474747', '#525252'];

    // stones: random rectangles of one base tone, mottled
    for (var y = 0; y < 16; y++) {
      for (var x = 0; x < 16; x++) {
        ctx.fillStyle = mortar[Math.floor(rand() * mortar.length)];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    for (var i = 0; i < 14; i++) {
      var w = 3 + Math.floor(rand() * 5);
      var h = 2 + Math.floor(rand() * 4);
      var sx = Math.floor(rand() * 16);
      var sy = Math.floor(rand() * 16);
      var base = Math.floor(rand() * (tones.length - 2)) + 1;
      for (var yy = 0; yy < h; yy++) {
        for (var xx = 0; xx < w; xx++) {
          var px = (sx + xx) % 16;
          var py = (sy + yy) % 16;
          var edge = xx === 0 || yy === 0 || xx === w - 1 || yy === h - 1;
          var t = base + (rand() < .3 ? 1 : 0) - (rand() < .2 ? 1 : 0) + (edge && rand() < .5 ? -1 : 0);
          ctx.fillStyle = tones[Math.max(0, Math.min(tones.length - 1, t))];
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }
    return canvas.toDataURL();
  }

  function buildCube() {
    var cube = document.querySelector('.cube');
    if (!cube) return;
    for (var i = 1; i <= 6; i++) {
      var face = document.createElement('div');
      face.className = 'face f' + i;
      face.style.backgroundImage = 'url(' + stoneTexture(i * 7 + 3) + ')';
      cube.appendChild(face);
    }

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var angleX = -24, angleY = 38, targetX = -24, targetY = 38, spin = 0;
    var stage = cube.parentElement;

    // it follows the pointer a little, and turns slowly on its own the rest of the time
    window.addEventListener('pointermove', function (event) {
      var rect = stage.getBoundingClientRect();
      var dx = (event.clientX - (rect.left + rect.width / 2)) / window.innerWidth;
      var dy = (event.clientY - (rect.top + rect.height / 2)) / window.innerHeight;
      targetY = 38 + dx * 50;
      targetX = -24 - dy * 30;
    }, { passive: true });

    if (reduced) return;
    function frame() {
      spin += 0.12;
      angleX += (targetX - angleX) * 0.06;
      angleY += (targetY - angleY) * 0.06;
      cube.style.transform = 'rotateX(' + angleX.toFixed(2) + 'deg) rotateY(' + (angleY + spin).toFixed(2) + 'deg)';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ reveal on scroll

  function reveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { observer.observe(el); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildCube();
    reveal();
  });
})();
