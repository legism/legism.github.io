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
    tiltLogo();
    reveal();
  });
})();
