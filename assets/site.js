/*
 * Shared behaviour for every page: the release data from GitHub, telling which system the
 * visitor is on, the logo tilting in the hero, and sections fading in on scroll.
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

  // ------------------------------------------------------------ the logo

  /**
   * Tilts the hero logo a few degrees towards the pointer, so the block seems to turn to
   * look at you. The image itself is the real logo, untouched.
   */
  function tiltLogo() {
    var logo = document.querySelector('.logo-3d');
    if (!logo) return;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    window.addEventListener('pointermove', function (event) {
      var rect = logo.getBoundingClientRect();
      var dx = (event.clientX - (rect.left + rect.width / 2)) / window.innerWidth;
      var dy = (event.clientY - (rect.top + rect.height / 2)) / window.innerHeight;
      logo.style.transform = 'rotateY(' + (dx * 22).toFixed(2) + 'deg) rotateX(' + (-dy * 16).toFixed(2) + 'deg)';
    }, { passive: true });
  }

  // ------------------------------------------------------------ reveal on scroll

  function settle(el) {
    // once it has faded in, the reveal classes would only get in the way: their
    // "transform: none" outranks the tilt a tile gets on hover
    setTimeout(function () { el.classList.remove('reveal', 'in'); }, 700);
  }

  function reveal() {
    var items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.remove('reveal'); });
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          settle(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { observer.observe(el); });
  }

  // ------------------------------------------------------------ hover light and tilt

  var GLOW = '.tile, .os, .panel, .stat, .release, .files .col, .recommend, .faq details, .compare';
  var TILT = '.tile, .os';

  /**
   * Cards light up where the pointer is (the CSS reads --mx / --my), and the smaller ones
   * lean a few degrees towards it. Only for a real mouse: on a touch screen there is no
   * hover to follow, and a card that tilts under a finger just looks broken.
   */
  function hoverLight() {
    var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll(GLOW).forEach(function (el) {
      el.classList.add('glow');
      if (!finePointer) return;
      var tilts = !reduced && el.matches(TILT);
      el.addEventListener('pointermove', function (event) {
        var rect = el.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        el.style.setProperty('--mx', x + 'px');
        el.style.setProperty('--my', y + 'px');
        if (tilts) {
          el.style.setProperty('--ry', ((x / rect.width - .5) * 7).toFixed(2) + 'deg');
          el.style.setProperty('--rx', ((.5 - y / rect.height) * 7).toFixed(2) + 'deg');
        }
      });
      el.addEventListener('pointerleave', function () {
        el.style.removeProperty('--rx');
        el.style.removeProperty('--ry');
      });
    });
  }

  // ------------------------------------------------------------ living background

  /**
   * Behind everything: grey pixels of a few sizes drifting slowly upwards at different
   * depths - the deeper, the smaller, fainter and slower, and the less they move when the
   * page scrolls - plus a trail of grid cells that light up under the pointer and fade.
   * Monochrome and quiet on purpose: it should make the page feel alive, not compete
   * with what is on it.
   */
  function background() {
    var canvas = document.createElement('canvas');
    canvas.id = 'bg';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var CELL = 26;
    var width = 0, height = 0, ratio = 1;
    var pixels = [];
    var trail = {};
    var pointer = { x: -9999, y: -9999, active: false };
    var last = 0;

    function seed() {
      var count = Math.max(40, Math.min(130, Math.round(width * height / 13000)));
      pixels = [];
      for (var i = 0; i < count; i++) {
        var depth = .25 + Math.random() * .75;
        pixels.push({
          x: Math.random() * width,
          y: Math.random() * height,
          depth: depth,
          size: [2, 2, 3, 3, 4, 5, 6, 8][Math.floor(Math.random() * 8)] * (depth > .7 ? 1 : .75),
          speed: (5 + Math.random() * 12) * depth,
          alpha: (.05 + Math.random() * .17) * depth,
          phase: Math.random() * Math.PI * 2,
          pushX: 0,
          pushY: 0
        });
      }
    }

    function resize() {
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed();
      if (reduced) draw(0, 0);
    }

    function draw(time, dt) {
      ctx.clearRect(0, 0, width, height);
      var scroll = window.scrollY || 0;
      var shift = scroll % CELL;

      // the pointer trail: cells fade from the moment they were lit
      for (var key in trail) {
        var cell = trail[key];
        cell.life -= dt * 1.1;
        if (cell.life <= 0) {
          delete trail[key];
          continue;
        }
        ctx.fillStyle = 'rgba(255,255,255,' + (cell.life * cell.life * .085).toFixed(3) + ')';
        ctx.fillRect(cell.x * CELL + 1, cell.y * CELL - shift + 1, CELL - 2, CELL - 2);
      }

      // a faint grid near the pointer, so the trail reads as cells of something
      if (pointer.active) {
        var reach = 4;
        var cx = Math.floor(pointer.x / CELL);
        var cy = Math.floor((pointer.y + shift) / CELL);
        ctx.lineWidth = 1;
        for (var gy = cy - reach; gy <= cy + reach; gy++) {
          for (var gx = cx - reach; gx <= cx + reach; gx++) {
            var px = gx * CELL + CELL / 2;
            var py = gy * CELL - shift + CELL / 2;
            var d = Math.hypot(px - pointer.x, py - pointer.y) / (CELL * reach);
            if (d >= 1) continue;
            ctx.strokeStyle = 'rgba(255,255,255,' + ((1 - d) * (1 - d) * .07).toFixed(3) + ')';
            ctx.strokeRect(gx * CELL + .5, gy * CELL - shift + .5, CELL, CELL);
          }
        }
      }

      for (var i = 0; i < pixels.length; i++) {
        var p = pixels[i];
        p.y -= p.speed * dt;
        if (p.y < -20) {
          p.y = height + 20;
          p.x = Math.random() * width;
        }
        // deeper pixels move less as the page scrolls, which is what makes it read as depth
        var drawY = p.y - (scroll * p.depth * .25) % (height + 40);
        if (drawY < -20) drawY += height + 40;
        // nudged away from the pointer, settling back afterwards
        if (pointer.active) {
          var dx = p.x + p.pushX - pointer.x;
          var dy = drawY + p.pushY - pointer.y;
          var dist = Math.hypot(dx, dy);
          if (dist < 130 && dist > 0) {
            var force = (1 - dist / 130) * 240 * dt;
            p.pushX += dx / dist * force;
            p.pushY += dy / dist * force;
          }
        }
        p.pushX *= .94;
        p.pushY *= .94;
        var twinkle = .7 + Math.sin(time / 900 + p.phase) * .3;
        ctx.fillStyle = 'rgba(255,255,255,' + (p.alpha * twinkle).toFixed(3) + ')';
        ctx.fillRect(Math.round(p.x + p.pushX), Math.round(drawY + p.pushY), Math.round(p.size), Math.round(p.size));
      }
    }

    function frame(time) {
      var dt = last ? Math.min(.05, (time - last) / 1000) : 0;
      last = time;
      draw(time, dt);
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      if (reduced) return;
      var shift = (window.scrollY || 0) % CELL;
      var gx = Math.floor(event.clientX / CELL);
      var gy = Math.floor((event.clientY + shift) / CELL);
      trail[gx + ',' + gy] = { x: gx, y: gy, life: 1 };
    }, { passive: true });
    document.addEventListener('pointerleave', function () { pointer.active = false; });

    resize();
    if (!reduced) requestAnimationFrame(frame);
  }

  document.addEventListener('DOMContentLoaded', function () {
    background();
    tiltLogo();
    hoverLight();
    reveal();
  });
})();
