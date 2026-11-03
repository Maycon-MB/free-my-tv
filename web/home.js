/*
 * The home screen for web-app TVs (LG webOS, Samsung Tizen), with the Android app's design and behavior (HomeView):
 *  - top: the "For You" title and the tabs (Explore, Movies, Shows); icon-only glass buttons at the right (Live TV,
 *    HDMI Inputs, Settings) and the crypto quotes at the end of the tab row;
 *  - three picks for this hour in the selected tab; the background is the focused one's photo, blurred, almost white;
 *  - the glass shelf with the apps; ↓ opens the drawer (inputs, shortcuts, weather, prices); ↑ or Back closes it;
 *  - a night look from sunset to sunrise; a screensaver after a few idle minutes.
 * The remote's arrows, OK and Back move the focus; a pointer (LG's Magic Remote) focuses what it points at.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function sym(name, parent, size) {
    var s = el('span', 'sym', parent), url = name.indexOf('/') >= 0 ? name : 'symbols/' + name + '.png';
    s.style.webkitMaskImage = 'url(' + url + ')';
    s.style.maskImage = 'url(' + url + ')';
    if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
    return s;
  }

  function coin(i, parent) {
    var c = window.COINS && window.COINS[i];
    if (!c) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    // Old WebKit (Tizen 2) draws an SVG without them at 300×150; the CSS still sets the size everywhere it's shown.
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    for (var k = 0; k < c.length; k++) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', c[k]);
      p.setAttribute('fill-rule', 'evenodd');
      svg.appendChild(p);
    }
    parent.appendChild(svg);
  }

  function hasClass(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function setClass(e, c, on) {
    if (!e) return;
    if (on && !hasClass(e, c)) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && hasClass(e, c)) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  var stage = $('stage'), body = document.body;

  /**
   * The 1920 × 1080 stage fills the window (on the TV it already is 1920 × 1080). A TV's window only gets shorter for
   * the keyboard (Samsung's resizes it while the city or key field has focus): there the stage keeps its width and the
   * keyboard covers its bottom, as in other apps. Fitted to the short window, it shrank into the top left beside a white
   * band (#399).
   */
  function fit() {
    var s = TV.name !== 'browser' ? window.innerWidth / 1920 : Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  // MARK: - Apps on the shelf

  /** Shelf apps in this order when installed, like the Android app: key, LG app id, name on the TV, brand gradient. */
  var SHELF = [
    ['netflix', /^netflix$/, /netflix/i, ['#0A0A0A', '#000000']],
    ['youtube', /youtube/, /^youtube$/i, ['#1C1C1E', '#09090A']],
    ['prime', /^amazon$/, /prime video|amazon/i, ['#2AA8FF', '#0A68D4']],
    ['disney', /disney/, /disney/i, ['#173584', '#08143F']],
    ['max', /hbo|wbd/, /^(hbo )?max$|hbo max/i, ['#5C30E8', '#221684']],
    ['appletv', /appletv|apple\.tv/, /apple tv/i, ['#1C1C1E', '#000000']],
    ['hulu', /^hulu/, /hulu/i, ['#1CE783', '#0B8F4E']],
    ['paramount', /paramount|cbs/, /paramount/i, ['#0064FF', '#002A86']],
    ['peacock', /peacock/, /peacock/i, ['#1C1C1E', '#000000']],
    ['nfl', /nfl/, /^nfl/i, ['#013369', '#00163D']],
    ['globoplay', /globoplay/, /globoplay/i, ['#FF8A1F', '#FF2D5A']],
    ['jellyfin', /jellyfin/i, /jellyfin/i, ['#AA5CC3', '#00A4DC']],
    ['spotify', /spotify/, /spotify/i, ['#1DB954', '#0F7A36']]
  ];
  // Apps shown at once, as on Android: 8 (today's smallest tiles, 178 wide); the shelf scrolls for the rest. The
  // built-in list keeps 8 too.
  var SHELF_VISIBLE = 8, FEW_APPS = 8;

  function shelfKey(app) {
    for (var i = 0; i < SHELF.length; i++) if (SHELF[i][1].test(app.id) || SHELF[i][2].test(app.title)) return SHELF[i];
    return null;
  }

  function darken(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#161618';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
  }

  /** A name that fits the tile on one line (the font shrinks for long names). */
  function wordFit(title, width, max) {
    return Math.max(18, Math.min(max, Math.floor(width * 0.8 / (Math.max(4, title.length) * 0.56))));
  }

  // MARK: - Logos

  // The TV's icons are small squares with their own background (white behind Netflix, black behind Max). Like the
  // Android app does with the TV art, the logo is lifted off it once: the background goes transparent and the rest is
  // cropped to the logo, which then fills the tile on the brand's color.
  var lifted = {};   // icon url -> {src, bg: [r, g, b], ink: luminance histogram} or false (keep the icon as it is)
  var LIFT_SIZE = 240;

  // sRGB (0-255) to linear light, computed once: lift() needs it for every pixel, and old TVs are slow at Math.pow.
  var LINEAR = [];
  for (var li = 0; li < 256; li++) LINEAR[li] = li <= 10 ? li / 255 / 12.92 : Math.pow((li / 255 + 0.055) / 1.055, 2.4);

  /** Relative luminance (0-1) of an sRGB color (whole numbers, as read from the canvas). */
  function luminance(r, g, b) {
    return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
  }

  function rgbOf(color) {
    var m = /^#?([0-9a-f]{6})$/i.exec(color || '');
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color || '');
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }

  function lift(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return false;
    var f = Math.min(1, LIFT_SIZE / Math.max(w, h));
    w = Math.max(1, Math.round(w * f));
    h = Math.max(1, Math.round(h * f));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var g = canvas.getContext('2d');
    var data;
    try {
      g.drawImage(img, 0, 0, w, h);
      data = g.getImageData(0, 0, w, h);
    } catch (e) {
      return false;   // a TV that doesn't let the page read its icons
    }
    var px = data.data;
    // The background: the most common color a little inside the edges (rounded icons have transparent corners).
    var votes = {}, best = null, bestN = 0, inset = Math.round(Math.min(w, h) * 0.08);
    for (var s = 0; s < 64; s++) {
      var t = s % 16 / 16, side = s >> 4;
      var x = side < 2 ? Math.round(inset + t * (w - 2 * inset)) : side === 2 ? inset : w - 1 - inset;
      var y = side < 2 ? (side === 0 ? inset : h - 1 - inset) : Math.round(inset + t * (h - 2 * inset));
      var i = (y * w + x) * 4;
      var key = px[i + 3] < 128 ? 'clear' : (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);
      votes[key] = (votes[key] || 0) + 1;
      if (votes[key] > bestN) { bestN = votes[key]; best = key === 'clear' ? null : [px[i], px[i + 1], px[i + 2]]; }
    }
    var minX = w, minY = h, maxX = -1, maxY = -1, ink = [0, 0, 0, 0, 0, 0, 0, 0], inkSum = 0;
    for (var p = 0; p < w * h; p++) {
      var j = p * 4, a = px[j + 3] / 255;
      if (best) {
        // color to alpha: how far each channel is from the background, as a share of how far it could go, so the
        // anti-aliased edges come out as the logo's color, partly clear, without a fringe of the background
        var k = 0, c;
        for (c = 0; c < 3; c++) {
          var v = px[j + c], o = best[c];
          k = Math.max(k, v > o ? (v - o) / Math.max(1, 255 - o) : (o - v) / Math.max(1, o));
        }
        k = Math.max(0, Math.min(1, (k - 0.1) / 0.9));   // compression noise stays clear
        if (k > 0 && k < 1) {
          for (c = 0; c < 3; c++) px[j + c] = Math.max(0, Math.min(255, best[c] + (px[j + c] - best[c]) / k));
        }
        a *= k;
      }
      px[j + 3] = Math.round(a * 255);
      if (a > 0.3) {
        var px0 = p % w, py0 = (p / w) | 0;
        if (px0 < minX) minX = px0;
        if (px0 > maxX) maxX = px0;
        if (py0 < minY) minY = py0;
        if (py0 > maxY) maxY = py0;
        ink[Math.min(7, Math.floor(Math.sqrt(luminance(px[j], px[j + 1], px[j + 2])) * 8))] += a;
        inkSum += a;
      }
    }
    // Nothing left, or nothing taken away (a picture rather than a logo on a background): keep the icon.
    if (maxX < 0 || (maxX - minX > w * 0.96 && maxY - minY > h * 0.96)) return false;
    var crop = document.createElement('canvas');
    crop.width = maxX - minX + 1;
    crop.height = maxY - minY + 1;
    g.putImageData(data, 0, 0);
    crop.getContext('2d').drawImage(canvas, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    for (var b = 0; b < 8; b++) ink[b] /= inkSum;
    try {
      return {src: crop.toDataURL('image/png'), bg: best, ink: ink};
    } catch (e2) {
      return false;
    }
  }

  /**
   * Share of the logo that hardly shows on a tile of this luminance (YouTube's black type on a dark tile). Each bin
   * of the histogram holds the ink whose square-root luminance falls in it.
   */
  function unseen(ink, tileLum) {
    var share = 0;
    for (var b = 0; b < 8; b++) {
      var l = Math.pow((b + 0.5) / 8, 2);
      if ((Math.max(l, tileLum) + 0.05) / (Math.min(l, tileLum) + 0.05) < 1.8) share += ink[b];
    }
    return share;
  }

  function paint(box, top, bottom) {
    box.style.background = '-webkit-linear-gradient(top, ' + top + ', ' + bottom + ')';
    box.style.background = 'linear-gradient(' + top + ', ' + bottom + ')';
  }

  /** A color that is clearly a hue (Crunchyroll's orange), not black, white or a gray. */
  function colorful(rgb) {
    return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) >= 96;
  }

  /**
   * The logo's box in its own proportions, as large as object-fit: contain draws it. Chrome 38 (webOS 3) ignores
   * object-fit while a tile next to it animates, and the logo stretched to its 70% x 50% box until the move ended.
   * Not laid out yet (a closed sheet): object-fit stays, and fitLogos() runs when the sheet opens.
   */
  function fitLogo(img) {
    var box = img.parentNode, bw = img.offsetWidth, bh = img.offsetHeight, nw = img.naturalWidth, nh = img.naturalHeight;
    if (!box || !bw || !bh || !nw || !nh || img.style.width) return;
    var s = Math.min(bw / nw, bh / nh);
    img.style.width = nw * s / box.offsetWidth * 100 + '%';
    img.style.height = nh * s / box.offsetHeight * 100 + '%';
  }

  function fitLogos(root) {
    var imgs = root.querySelectorAll('img.logo');
    for (var i = 0; i < imgs.length; i++) if (imgs[i].complete) fitLogo(imgs[i]);
  }

  /** own: the tile has the TV's color for the app, not one of SHELF's. */
  function showLogo(img, box, top, bottom, logo, own) {
    img.className = 'logo';
    img.onload = function () { img.onload = null; fitLogo(img); };
    img.src = logo.src;
    if (img.complete) fitLogo(img);
    var a = rgbOf(top), z = rgbOf(bottom);
    var tileLum = (luminance(a[0], a[1], a[2]) + luminance(z[0], z[1], z[2])) / 2;
    // The tile takes the icon's background when the logo only reads on it, and when that background is the brand's
    // color: LG's bgColor isn't always the icon's (Crunchyroll's is black, on an orange icon).
    if (logo.bg && ((own && colorful(logo.bg)) || unseen(logo.ink, tileLum) > 0.35)) {
      var bg = 'rgb(' + logo.bg.join(',') + ')';
      var hex = '#' + ((1 << 24) | (logo.bg[0] << 16) | (logo.bg[1] << 8) | logo.bg[2]).toString(16).slice(1);
      paint(box, bg, darken(hex, 0.93));
    }
  }

  // Bundled vector or large logos by SHELF key: the TV's icons are 130 px squares and blur once scaled to a tile.
  var BRAND_LOGOS = {
    netflix: 'icons/netflix.svg', youtube: 'icons/youtube.png', prime: 'icons/prime.png', max: 'icons/max.svg',
    appletv: 'icons/appletv.svg', paramount: 'icons/paramountplus.svg', jellyfin: 'icons/jellyfin.svg',
    spotify: 'icons/spotify.svg'
  };

  /** Where a pick streams, at a glance: the service's logo (or its name) in the card's corner. */
  function serviceBadge(p, holder) {
    var app = Data.appFor(p.app), badge = el('div', 'badge', holder);
    if (p.app === 'netflix') { badge.className += ' netflix'; el('img', '', badge).src = BRAND_LOGOS.netflix; }
    else if (app && app.icon) el('img', '', badge).src = app.icon;   // the same icon as on the TV's own launcher
    else { badge.className += ' word'; badge.textContent = p.service; }
  }

  /** Opens a title in its app, on the title's page when Wikidata knows its id there (else on the app's home). */
  var opening = 0;

  function openTitle(p, app, params) {
    rememberTitle(p);
    if (params || !p.app) { launcher(app.id, app.title, params)(); return null; }
    if (Date.now() - opening < 10000) return true;
    opening = Date.now();
    toast('Abrindo ' + app.title + '…');
    Data.titleLink(p, p.app, function (params) {
      opening = 0;
      launcher(app.id, app.title, params)();
      if (!params) toast('Abrindo ' + app.title + ': procure “' + p.title + '” lá dentro.');
    });
    return true;
  }

  /** An app's face: its logo on its brand color (or its name, when the icon can't be read). */
  function face(app, box, wordSize) {
    var k = shelfKey(app);
    var top = k ? k[3][0] : app.color ? darken(app.color, 0.92) : '#2A2A2E';
    var bottom = k ? k[3][1] : app.color ? darken(app.color, 0.62) : '#161618';
    paint(box, top, bottom);
    var word = el('div', 'word', box, app.title);
    if (wordSize) word.style.fontSize = wordSize + 'px';
    var brand = k && BRAND_LOGOS[k[0]];
    if (brand && !lifted[brand]) lifted[brand] = {src: brand, bg: null, ink: null};
    if (brand || app.icon) {
      var img = el('img', '', box), url = brand || app.icon;
      word.style.visibility = 'hidden';
      img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); word.style.visibility = ''; };
      if (lifted[url]) { showLogo(img, box, top, bottom, lifted[url], !k); return; }
      if (lifted[url] !== false) {
        img.onload = function () {
          img.onload = null;
          if (lifted[url] === undefined) lifted[url] = lift(img);
          if (lifted[url]) showLogo(img, box, top, bottom, lifted[url], !k);
        };
      }
      img.src = url;
    }
  }

  var apps = [], shelf = [], others = [], inputs = [];

  /** shelf_apps in config.properties: the shelf in that order, by id or name (part of it). */
  var WANTED = (CONFIG.shelfApps || []).map(function (s) { return s.toLowerCase(); });

  function pickShelf() {
    if (WANTED.length && Prefs.shelfConfig() !== WANTED.join(',')) {
      Prefs.set('shelf', null);
      Prefs.set('shelfConfig', WANTED.join(','));
    }
    var chosen = Prefs.shelf(), out = [];
    if (chosen) {
      for (var i = 0; i < chosen.length; i++) {
        for (var j = 0; j < apps.length; j++) if (apps[j].id === chosen[i]) out.push(apps[j]);
      }
    } else if (WANTED.length) {
      for (var w = 0; w < WANTED.length; w++) {
        for (var k = 0; k < apps.length; k++) {
          var id = apps[k].id.toLowerCase(), title = apps[k].title.toLowerCase();
          if ((id.indexOf(WANTED[w]) >= 0 || title.indexOf(WANTED[w]) >= 0) && out.indexOf(apps[k]) < 0) { out.push(apps[k]); break; }
        }
      }
      if (!out.length) out = apps.slice(0, FEW_APPS);
    } else {
      // Every app on the shelf, the streaming ones first: the row scrolls, and Shelf in Home Settings reorders it.
      for (var s = 0; s < SHELF.length; s++) {
        for (var a = 0; a < apps.length; a++) {
          if ((SHELF[s][1].test(apps[a].id) || SHELF[s][2].test(apps[a].title)) && out.indexOf(apps[a]) < 0) { out.push(apps[a]); break; }
        }
      }
      for (var r = 0; r < apps.length; r++) if (out.indexOf(apps[r]) < 0) out.push(apps[r]);
    }
    shelf = Prefs.get('shelfOrder', 'manual') === 'usage' ? byUsage(out) : out;
    others = apps.filter(function (x) { return shelf.indexOf(x) < 0; });
  }

  // MARK: - Focus

  var Z = {TOP: 'top', CARDS: 'cards', SHELF: 'shelf', DRAWER: 'drawer', APPS: 'apps', SETTINGS: 'settings', EDIT: 'edit', LANG: 'lang', CITY: 'city', KEY: 'key', ABOUT: 'about', SEARCH: 'search', TEAMS: 'teams', CTRL: 'ctrl', HELP: 'help', DETAIL: 'detail'};
  var st = {zone: Z.SHELF, top: 0, tab: 0, card: 0, shelf: 0, drawer: 0, grid: 0, row: 0, edit: 0, lang: 0, city: 0, key: 0};
  var cards = [];

  function sheetOpen() { return st.zone === Z.APPS || st.zone === Z.SETTINGS || st.zone === Z.EDIT || st.zone === Z.LANG || st.zone === Z.CITY || st.zone === Z.KEY || st.zone === Z.ABOUT || st.zone === Z.SEARCH || st.zone === Z.TEAMS || st.zone === Z.CTRL || st.zone === Z.HELP || st.zone === Z.DETAIL; }

  function updateFocus() {
    var i, list;
    list = $('tabs').children;
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'on', i === st.tab);
      setClass(list[i], 'focus', st.zone === Z.TOP && st.top === i);
    }
    list = $('buttons').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.TOP && st.top === NTABS + i);
    setClass($('quotes'), 'hide', st.zone === Z.TOP && st.top >= NTABS);
    layoutCards();
    list = $('cards').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.CARDS && st.card === i);
    list = $('tiles').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.SHELF && st.shelf === i);
    revealShelf();
    showTileName();
    list = document.querySelectorAll('#drawer .key');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.DRAWER && st.drawer === i);
    list = document.querySelectorAll('#apps .cell');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.APPS && st.grid === i);
    var rows = Math.max(1, Math.ceil(others.length / 5)), r = Math.floor(st.grid / 5), first = Math.max(0, Math.min(rows - 3, r - 1));
    $('apps').lastChild.style.webkitTransform = $('apps').lastChild.style.transform = 'translateY(' + (-first * 239) + 'px)';
    focusRows($('settings'), st.row, st.zone === Z.SETTINGS);
    focusRows($('shelfedit'), st.edit, st.zone === Z.EDIT);
    focusRows($('langpick'), st.lang, st.zone === Z.LANG);
    if (langHint) langHint.textContent = (st.lang + 1) + ' / ' + languageChoices().length + '  ·  ' + tr('OK picks, Back cancels.');
    focusRows($('citypick'), st.city, st.zone === Z.CITY);
    focusRows($('keypick'), st.key, st.zone === Z.KEY);
    focusSearch();
    focusRows($('teampick'), tmRow, st.zone === Z.TEAMS);
    focusRows($('controls'), ctrlRow, st.zone === Z.CTRL);
    var dbs = document.querySelectorAll('#detail .dbtn');
    for (i = 0; i < dbs.length; i++) setClass(dbs[i], 'focus', st.zone === Z.DETAIL && dtButton === i);
    setClass(body, 'drawer-open', st.zone === Z.DRAWER);
    followSoon();
  }

  function focusRows(sheet, index, on) {
    var rows = sheet.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) setClass(rows[i], 'focus', on && i === index);
    var holder = sheet.querySelector('.rows');
    if (!holder) return;
    var visible = 7, first = Math.max(0, Math.min(rows.length - visible, index - 3));
    holder.style.webkitTransform = holder.style.transform = 'translateY(' + (-first * 78) + 'px)';
  }

  function nearest(nodes, x) {
    var best = 0, bestD = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect(), d = Math.abs((r.left + r.right) / 2 - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function centerX(node) {
    if (!node) return 960;
    var r = node.getBoundingClientRect();
    return (r.left + r.right) / 2;
  }

  // MARK: - Top: title, tabs, buttons, quotes

  // Explore, Movies, Shows, then My list (saved and recently opened, kept per profile).
  var TAB_KIND = [null, 'movie', 'tv', 'mine'], NTABS = TAB_KIND.length;

  function renderTop() {
    $('title').textContent = tr('For You');
    var tabs = $('tabs');
    tabs.innerHTML = '';
    var names = [tr('Explore'), tr('Movies'), tr('Shows'), 'Minha lista'];
    for (var i = 0; i < names.length; i++) {
      var t = el('button', 'tab', tabs, names[i]);
      hover(t, Z.TOP, i);
    }
    var buttons = $('buttons');
    buttons.innerHTML = '';
    // Material Symbols Rounded (Apache 2.0) as vectors: sharp at any scale, one stroke weight for the four.
    // Named buttons, as YouTube's and Netflix's: what each does is read, not guessed from an icon.
    var defs = [['icons/sym-search.svg', 'Pesquisar', 250], ['icons/sym-tune.svg', 'Controles', 240],
      ['icons/sym-settings.svg', 'Ajustes', 200]];
    for (var b = 0, x = 1840; b < defs.length; b++) x -= defs[b][2] + (b ? 16 : 0);
    for (b = 0; b < defs.length; b++) {
      var r = el('button', 'round pill', buttons);
      r.style.left = x + 'px';
      r.style.width = defs[b][2] + 'px';
      x += defs[b][2] + 16;
      sym(defs[b][0], r);
      el('span', 'plabel', r, defs[b][1]);
      hover(r, Z.TOP, NTABS + b);
    }
  }

  function renderQuotes() {
    var q = $('quotes'), coins = Data.activeCoins();
    q.innerHTML = '';
    for (var i = 0; i < coins.length; i++) {
      var item = el('span', 'q', q);
      coin(coins[i], item);
      el('span', '', item, Data.compact(Data.prices[coins[i]]));
    }
  }

  // MARK: - Picks and background

  function renderCards() {
    var list = TAB_KIND[st.tab] === 'mine' ? myList() : Data.picks(TAB_KIND[st.tab]);
    var holder = $('cards');
    setClass(body, 'no-picks', !list.length);
    setClass(body, 'no-key', !Data.hasKey());   // as on Android: no title or tabs that could never show anything
    if (!Data.hasKey() && st.zone === Z.TOP && st.top < NTABS) st.top = NTABS;
    var same = list.length === cards.length;
    for (var i = 0; same && i < list.length; i++) same = list[i].id === cards[i].id && list[i].backdrop === cards[i].backdrop && list[i].meta === cards[i].meta;
    if (same && holder.children.length === list.length) return;
    cards = list;
    holder.innerHTML = '';
    for (var c = 0; c < list.length; c++) {
      var p = list[c], card = el('div', 'card', holder);
      var img = el('div', 'img', card);
      // Narrow: the poster (the backdrop cropped without one); the wide card fades its backdrop in over it, loaded then.
      var poster = el('div', 'layer', img);
      poster.style.backgroundImage = 'url("' + (p.poster ? Data.image(p.poster, 'w342') : Data.image(p.backdrop, 'w780')) + '")';
      el('div', 'layer back', img);
      if (p.service) serviceBadge(p, img);
      el('div', 'name', card, p.title);
      if (p.meta) el('div', 'meta', card, p.meta);
      hover(card, Z.CARDS, c);
      holdable(card);
    }
    st.card = Math.min(st.card, Math.max(0, list.length - 1));
    if (!list.length && st.zone === Z.CARDS) st.zone = Z.SHELF;
    backdrop(list.length ? Data.image(list[st.card].backdrop, 'w300') : '');
    updateFocus();
  }

  /**
   * The card with focus (st.card, also while focus is elsewhere) is the wide one, the others narrow; past the third the
   * row scrolls a card at a time (the holder slides), and the cards at the edges lose their text. Only the holder's
   * transform and the backdrop's opacity animate: the widths change at once (older TVs).
   */
  function layoutCards() {
    var holder = $('cards'), nodes = holder.children, left = 80, scroll = Math.max(0, st.card - 2) * 360;
    for (var i = 0; i < nodes.length; i++) {
      var wide = i === st.card, w = wide ? 1040 : 320, n = nodes[i], at = left - scroll;
      n.style.left = left + 'px';
      n.style.width = w + 'px';
      setClass(n, 'wide', wide);
      setClass(n, 'edge', at < 0 || at > 1740);
      if (wide && !n.getAttribute('data-back') && cards[i]) {
        n.setAttribute('data-back', '1');
        n.querySelector('.back').style.backgroundImage = 'url("' + Data.image(cards[i].backdrop, 'w1280') + '")';
      }
      left += w + 40;
    }
    holder.style.webkitTransform = holder.style.transform = 'translateX(' + (-scroll) + 'px)';
  }

  var bgUrl = null, bgFront = 'bgA';

  /** The focused pick's photo as the background: drawn tiny and stretched, it's already as soft as a heavy blur. */
  function backdrop(url) {
    if (url === bgUrl) return;
    bgUrl = url;
    var next = bgFront === 'bgA' ? 'bgB' : 'bgA';
    if (!url) {
      setClass($('bgA'), 'on', false);
      setClass($('bgB'), 'on', false);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgUrl !== url) return;
      var canvas = $(next), ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setClass(canvas, 'on', true);
      setClass($(bgFront), 'on', false);
      bgFront = next;
    };
    img.src = url;
  }

  // As HomeView's bgFollow: the background follows the focused pick.
  var BG_FOLLOW_MS = 500, bgTimer = 0;

  /** The focused pick's photo as the background once the focus has rested on it: a quick run along the row fades once. */
  function followSoon() {
    clearTimeout(bgTimer);
    bgTimer = setTimeout(function () {
      if (cards.length) backdrop(Data.image(cards[Math.min(st.card, cards.length - 1)].backdrop, 'w300'));
    }, BG_FOLLOW_MS);
  }

  function renderClock() {
    var d = new Date(), c = $('clock');
    c.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    c.lastChild.textContent = formatDate('format|EEEE, MMMM d', d.getTime());
  }

  /** On the minute, so the clock never runs late (the 30-second refresh could, by up to 30 s). */
  function tickClock() {
    renderClock();
    setTimeout(tickClock, 60000 - Date.now() % 60000 + 50);
  }

  // MARK: - Shelf

  var shelfFirst = 0, tileStep = 0, tileLeft = 0;

  function renderShelf() {
    var n = Math.min(shelf.length, SHELF_VISIBLE), gap = 48, pad = 40;
    // 16:9 tiles, as on Android: never taller than 126, and the glass keeps its bottom edge.
    var tw = Math.min(126 * 16 / 9, (1760 - Math.max(0, n - 1) * gap) / Math.max(1, n)), th = tw * 9 / 16;
    var width = n * tw + Math.max(0, n - 1) * gap, left = (1920 - width) / 2;
    var platter = $('platter');
    platter.style.display = n ? '' : 'none';
    platter.style.left = (left - pad) + 'px';
    platter.style.width = (width + 2 * pad) + 'px';
    platter.style.top = (814 + 126 - th) + 'px';
    platter.style.height = (th + 2 * pad) + 'px';
    $('quotes').style.right = (1920 - left - width) + 'px';
    var tiles = $('tiles');
    tiles.innerHTML = '';
    tileStep = tw + gap;
    tileLeft = left;
    shelfFirst = Math.max(0, Math.min(shelfFirst, shelf.length - n));
    for (var i = 0; i < shelf.length; i++) {
      var t = el('div', 'tile', tiles);
      t.style.top = (854 + 126 - th) + 'px';
      t.style.width = tw + 'px';
      t.style.height = th + 'px';
      face(shelf[i], t, wordFit(shelf[i].title, tw, 30));
      hover(t, Z.SHELF, i);
      holdable(t);
    }
    // More apps than fit: a small arrow inside the glass's edge on each side that has more, where no tile reaches
    // even focused (inside the screen's safe area, as on Android).
    platter.innerHTML = '';
    for (var a = 0; a < 2; a++) {
      var arrow = sym('chevron_right', platter);
      arrow.className += a ? ' more' : ' more back';
      arrow.style.left = (a ? width + 2 * pad - 14 : 14) - 8.5 + 'px';
      arrow.style.top = (pad + th / 2 - 8.5) + 'px';
    }
    st.shelf = Math.min(st.shelf, Math.max(0, shelf.length - 1));
    placeTiles();
  }

  /** The row slides (a transform on #tiles, which old TVs animate), and the apps it takes past the glass fade out. */
  function placeTiles() {
    var row = $('tiles'), tiles = row.children, n = Math.min(shelf.length, SHELF_VISIBLE);
    for (var i = 0; i < shelf.length; i++) {
      var shown = i >= shelfFirst && i < shelfFirst + n;
      tiles[i].style.left = (tileLeft + i * tileStep) + 'px';
      tiles[i].style.opacity = shown ? '' : '0';
      tiles[i].style.pointerEvents = shown ? '' : 'none';
    }
    row.style.webkitTransform = row.style.transform = 'translateX(' + (-shelfFirst * tileStep) + 'px)';
    var arrows = $('platter').children;
    arrows[0].style.visibility = shelfFirst > 0 ? '' : 'hidden';
    arrows[1].style.visibility = shelfFirst + n < shelf.length ? '' : 'hidden';
  }

  /** Scrolls the shelf, one app at a time, so the focused app is shown. */
  function revealShelf() {
    var n = Math.min(shelf.length, SHELF_VISIBLE);
    var first = Math.max(0, Math.min(Math.max(shelfFirst, st.shelf - n + 1), Math.min(st.shelf, shelf.length - n)));
    if (first === shelfFirst || !shelf.length) return;
    shelfFirst = first;
    placeTiles();
  }

  /** The focused app's name under its tile: logos alone don't say which Globoplay or LG app it is. */
  function showTileName() {
    var label = $('tilename'), app = st.zone === Z.SHELF ? shelf[st.shelf] : null;
    if (!label) return;
    label.style.opacity = app ? '1' : '0';
    if (!app) return;
    label.textContent = app.title;
    var center = tileLeft + (st.shelf - shelfFirst) * tileStep + (tileStep - 48) / 2;
    label.style.left = Math.round(center - 300) + 'px';
  }

  // MARK: - System stats (CPU, RAM, network), only while the home screen shows

  var STATS_EVERY = 5000;

  function level(value, warn, alarm) {
    return value >= alarm ? ' alarm' : value >= warn ? ' warn' : '';
  }

  function decimal(n) {
    return n.toFixed(1).replace('.', ',');
  }

  var lastStats = null;

  function speedText(kbps) {
    return kbps === undefined ? '—' : kbps >= 1000 ? decimal(kbps / 1000) + ' Mb/s' : kbps + ' kb/s';
  }

  /** The top shows only what's off (a busy CPU, full RAM, no network); the drawer's panel shows everything. */
  function showStats(s) {
    lastStats = s;
    var box = $('stats');
    if (box) {
      var parts = [], share = s && s.mem ? Math.round(s.mem.usedMb / s.mem.totalMb * 100) : 0;
      if (s && s.cpu !== undefined && level(s.cpu, 70, 90)) {
        parts.push('<span class="stat' + level(s.cpu, 70, 90) + '"><b>CPU</b> ' + s.cpu + '%</span>');
      }
      if (s && s.mem && level(share, 92, 97)) parts.push('<span class="stat' + level(share, 92, 97) + '"><b>RAM</b> ' + share + '%</span>');
      if (s && s.net && !s.net.up) parts.push('<span class="stat alarm"><i class="dot"></i><b>SEM REDE</b></span>');
      box.innerHTML = parts.join('');
      box.style.display = parts.length ? '' : 'none';
    }
    var panel = $('perf');
    if (panel) renderPerf(panel);
  }

  function perfRow(card, top, name, value, share, warn, alarm) {
    var row = el('div', 'prow', card);
    row.style.top = top + 'px';
    el('span', 'pname', row, name);
    el('span', 'pval', row, value);
    var bar = el('div', 'pbar', row), fill = el('div', 'pfill' + level(share, warn, alarm), bar);
    fill.style.width = Math.max(2, Math.min(100, share)) + '%';
  }

  var devModeHours = -1;

  function renewDevMode() {
    TV.renewDevMode(function (res) {
      if (res && res.hours >= 0) devModeHours = res.hours;
      var panel = $('perf');
      if (panel) renderPerf(panel);
    });
  }

  function renderPerf(card) {
    card.innerHTML = '';
    el('div', 'head', card, 'Desempenho da TV');
    var s = lastStats;
    if (!s) { el('div', 'side', card, 'lendo…'); return; }
    var days = devModeHours >= 0 ? 'Dev Mode: ' + Math.floor(devModeHours / 24) + ' dias' : 'a cada 5 s';
    el('div', 'side' + (devModeHours >= 0 && devModeHours < 240 ? ' bad' : ''), card, days);
    var mem = s.mem || {usedMb: 0, totalMb: 1, swapUsedMb: 0, swapTotalMb: 0};
    perfRow(card, 84, 'CPU', s.cpu === undefined ? '—' : s.cpu + '%', s.cpu || 0, 70, 90);
    perfRow(card, 138, 'RAM', mem.usedMb + ' / ' + mem.totalMb + ' MB', mem.usedMb / mem.totalMb * 100, 92, 97);
    if (mem.swapTotalMb) {
      perfRow(card, 192, 'SWAP', mem.swapUsedMb + ' / ' + mem.swapTotalMb + ' MB', mem.swapUsedMb / mem.swapTotalMb * 100, 75, 90);
    }
    var net = s.net, row = el('div', 'prow net', card);
    row.style.top = '246px';
    el('span', 'pname', row, net && net.kind === 'ethernet' ? 'CABO' : 'WI-FI');
    el('span', 'pval' + (net && net.up ? ' ok' : ' bad'), row, net ? (net.up ? '● ' + speedText(net.kbps) : '● desconectado') : '—');

  }

  function pollStats() {
    if (document.hidden || saverOn || ambientOn) return;
    TV.stats(showStats);
  }

  // MARK: - Profiles: each keeps its own shelf order, theme, accent color and kids mode

  var PROFILE_KEYS = ['shelf', 'theme', 'accent', 'kids', 'helped', 'mylist', 'recent', 'extras', 'showPerf', 'bg', 'starsMove'];
  var PROFILE_NAMES = ['Maycon', 'Família', 'Crianças', 'Visitas', 'Convidado'];
  var ACCENTS = [['red', 'Vermelho'], ['pink', 'Rosa'], ['blue', 'Azul'], ['green', 'Verde'], ['purple', 'Roxo'],
    ['orange', 'Laranja'], ['yellow', 'Amarelo']];
  var ACCENT_RGB = {red: '229,72,77', pink: '236,72,153', blue: '59,130,246', green: '34,197,94', purple: '139,92,246', orange: '249,115,22',
    yellow: '255,225,0'};
  var deleteArmed = false;

  function profiles() { return Prefs.get('profiles', [{name: PROFILE_NAMES[0]}]); }
  function current() { return Math.min(Prefs.get('profile', 0), profiles().length - 1); }

  /** The live settings of the current profile, as stored in its slot. */
  function snapshot() {
    var p = {name: profiles()[current()].name};
    for (var i = 0; i < PROFILE_KEYS.length; i++) p[PROFILE_KEYS[i]] = Prefs.get(PROFILE_KEYS[i], undefined);
    return p;
  }

  function switchProfile(to) {
    var list = profiles().slice();
    list[current()] = snapshot();
    var next = list[to] || {};
    for (var i = 0; i < PROFILE_KEYS.length; i++) Prefs.set(PROFILE_KEYS[i], next[PROFILE_KEYS[i]]);
    Prefs.set('profiles', list);
    Prefs.set('profile', to);
    profileChanged();
  }

  function profileChanged() {
    deleteArmed = false;
    applyExtras();
    renderPanels();
    cards = [];
    renderCards();
    applyAccent();
    checkNight();
    pickShelf();
    renderShelf();
    Data.settingsChanged();
    Data.refresh();
    toast('Perfil: ' + profiles()[current()].name);
  }

  /** Headlines and sports at the top, per profile: off leaves the title, tabs and buttons only. */
  function applyExtras() {
    setClass(body, 'no-extras', !Prefs.get('extras', true));
  }

  function backgroundName() {
    for (var i = 0; i < BACKGROUNDS.length; i++) if (BACKGROUNDS[i][0] === Prefs.get('bg', 'stars')) return BACKGROUNDS[i][1];
    return BACKGROUNDS[0][1];
  }

  function applyAccent() {
    var accent = Prefs.get('accent', 'red');
    body.className = body.className.replace(/\s*accent-\w+/g, '') + ' accent-' + accent;
    drawStars();
  }

  function profileRows() {
    var list = profiles(), at = current(), accent = Prefs.get('accent', 'red'), a = 0;
    for (var k = 0; k < ACCENTS.length; k++) if (ACCENTS[k][0] === accent) a = k;
    var rows = [
      {label: 'Perfil', value: list[at].name + (list.length > 1 ? '  (' + (at + 1) + '/' + list.length + ')' : ''),
        step: function (d) { if (list.length > 1) switchProfile((at + (d || 1) + list.length) % list.length); }},
      {label: 'Nome do perfil', value: list[at].name,
        step: function (d) {
          var copy = profiles().slice(), i = PROFILE_NAMES.indexOf(copy[at].name);
          copy[at] = snapshot();
          copy[at].name = PROFILE_NAMES[(i + (d || 1) + PROFILE_NAMES.length) % PROFILE_NAMES.length];
          Prefs.set('profiles', copy);
        }},
      {label: 'Cor de destaque', value: ACCENTS[a][1],
        step: function (d) { Prefs.set('accent', ACCENTS[(a + (d || 1) + ACCENTS.length) % ACCENTS.length][0]); applyAccent(); }},
      {label: 'Modo infantil', toggle: !!Prefs.get('kids', false),
        step: function () { Prefs.set('kids', !Prefs.get('kids', false)); Data.settingsChanged(); Data.refresh(); }},
      {label: 'Novo perfil', value: '+',
        step: function (d) {
          if (d < 0) return;
          var copy = profiles().slice();
          copy[at] = snapshot();
          copy.push({name: PROFILE_NAMES[copy.length % PROFILE_NAMES.length]});
          Prefs.set('profiles', copy);
          switchProfile(copy.length - 1);
        }}
    ];
    if (list.length > 1) {
      rows.push({label: deleteArmed ? 'Confirmar: excluir ' + list[at].name + '?' : 'Excluir este perfil', value: '×',
        step: function (d) {
          if (d < 0) return;
          if (!deleteArmed) { deleteArmed = true; return; }
          deleteArmed = false;
          var copy = profiles().slice();
          copy.splice(at, 1);
          var to = Math.max(0, at - 1), next = copy[to];
          for (var i = 0; i < PROFILE_KEYS.length; i++) Prefs.set(PROFILE_KEYS[i], next[PROFILE_KEYS[i]]);
          Prefs.set('profiles', copy);
          Prefs.set('profile', to);
          profileChanged();
        }});
    }
    return rows;
  }

  // MARK: - Backup: every change goes to a file on the TV; a fresh install (nothing stored yet) restores from it

  var backupTimer = 0;

  function backupSoon() {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(function () { TV.backup('save', Prefs.dump()); }, 3000);
  }

  function restoreBackup() {
    var empty = true;
    try { empty = !localStorage.getItem('fmtv.prefs'); } catch (e) {}
    if (!empty) return;
    TV.backup('load', '', function (res) {
      var data = res && res.data;
      if (!data) return;
      try { JSON.parse(data); localStorage.setItem('fmtv.prefs', data); } catch (e) { return; }
      location.reload();
    });
  }

  // MARK: - Quick controls (the TV's remote control API; the TV asks once to allow them)

  var SLEEP_STEPS = [0, 30, 60, 90, 120], sleepStep = 0;

  function sleepLabel() { return SLEEP_STEPS[sleepStep] ? 'Timer ' + SLEEP_STEPS[sleepStep] + ' min' : 'Timer'; }

  function screenOff() {
    toast('Tela apagada, som ligado (bom para música). Aperte qualquer botão para acender.');
    TV.control('com.webos.service.tvpower/power/turnOffScreen', {}, function (res) {
      if (!res) toast('A TV não deixou apagar a tela (permita o Free My TV quando ela perguntar).');
    });
  }

  // MARK: - A title's page (OK on a pick or a search result): what it is and its actions, named, as on Netflix

  var dtTitle = null, dtFrom = null, dtButton = 0;

  function detailButtons() {
    var p = dtTitle, app = p && p.app && Data.appFor(p.app), out = [];
    if (app) out.push({label: '▶  Assistir no ' + app.title, run: function () { closeDetail(); openTitle(p, app, null); }});
    out.push({label: 'Trailer', run: function () { closeDetail(); playTrailerOf(p); }});
    out.push({label: inMyList(p) ? '✓ Na minha lista' : '+ Minha lista', run: function () {
      toggleMyList(p);
      var b = document.querySelectorAll('#detail .dbtn')[dtButton];
      if (b) b.textContent = inMyList(p) ? '✓ Na minha lista' : '+ Minha lista';
    }});
    out.push({label: 'Voltar', run: closeDetail});
    return out;
  }

  function openDetail(p) {
    var page = $('detail'), app = p.app && Data.appFor(p.app);
    dtTitle = p;
    dtFrom = st.zone;
    dtButton = 0;
    page.innerHTML = '';
    var art = el('div', 'art', page);
    if (p.backdrop) art.style.backgroundImage = 'url("' + Data.image(p.backdrop, 'w1280') + '")';
    el('div', 'shade', page);
    var info = el('div', 'info', page);
    el('div', 'dtitle', info, p.title);
    var where = app ? 'No ' + app.title : p.service ? 'Na ' + p.service + ' (app não instalado)' : p.paid ? p.paid : 'Sem streaming no Brasil';
    var about = (p.meta || (p.genres || []).slice(0, 2).join(' · ')).replace(' · ' + p.service, '');   // the service is in 'where'
    el('div', 'dmeta', info, [p.year, about, where].filter(function (x) { return x; }).join('  ·  '));
    var row = el('div', 'dbtns', info), buttons = detailButtons();
    for (var i = 0; i < buttons.length; i++) hover(el('div', 'dbtn' + (i === 0 && app ? ' primary' : ''), row, buttons[i].label), Z.DETAIL, i);
    st.zone = Z.DETAIL;
    setClass(page, 'open', true);
    updateFocus();
  }

  function closeDetail() {
    setClass($('detail'), 'open', false);
    $('detail').innerHTML = '';   // its 1280 px photo leaves memory with it
    st.zone = dtFrom || Z.CARDS;
    updateFocus();
  }

  // MARK: - Help: where everything is, shown once per profile and again from Home Settings

  var HELP_ROWS = [
    ['Apps', 'na fileira de baixo; ← → percorre, OK abre'],
    ['Mover um app', 'segure OK nele e use ← →; OK solta'],
    ['Entradas (HDMI, TV)', 'desça (▼) abaixo dos apps'],
    ['Ajustes da TV', 'desça (▼) abaixo dos apps'],
    ['Pesquisar', 'lupa no topo (ou pelo celular, pelo QR code)'],
    ['Trailer', 'OK num filme ou série: botão Trailer'],
    ['Controles', 'botão Controles no topo: só o som, timer, internet'],
    ['Voltar', 'o botão Voltar nunca sai daqui']
  ];

  function openHelp() {
    var box = $('help').firstChild;
    setClass($('settings'), 'open', false);
    box.innerHTML = '';
    el('div', 'title', box, 'Onde fica cada coisa');
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = HELP_ROWS.length * 78 + 'px';
    for (var i = 0; i < HELP_ROWS.length; i++) {
      var row = el('div', 'row', holder, HELP_ROWS[i][0]);
      el('span', 'value', row, HELP_ROWS[i][1]);
    }
    el('div', 'hint', box, 'OK ou Voltar fecha · de novo em Configurações da Home › Ajuda');
    st.zone = Z.HELP;
    setClass($('help'), 'open', true);
    updateFocus();
  }

  function closeHelp() {
    setClass($('help'), 'open', false);
    Prefs.set('helped', true);
    st.zone = Z.SHELF;
    updateFocus();
  }

  // The Controls sheet (top button): what the remote has no button for.
  var ctrlRow = 0;

  function controlRows() {
    return [
      {label: 'Só o som (apaga a tela)', value: '›', run: function () { closeControls(); screenOff(); }},
      {label: 'Timer para desligar', value: SLEEP_STEPS[sleepStep] ? SLEEP_STEPS[sleepStep] + ' min' : 'desligado',
        step: function (d) { cycleSleep(d); renderControls(); }, run: function () { cycleSleep(1); renderControls(); }},
      {label: 'Testar a internet', value: '›', run: function () { speedTest(); }}
    ];
  }

  function renderControls() {
    var box = $('controls').firstChild, rows = controlRows();
    box.innerHTML = '';
    el('div', 'title', box, 'Controles');
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = rows.length * 78 + 'px';
    for (var i = 0; i < rows.length; i++) {
      var row = el('div', 'row', holder, rows[i].label);
      el('span', 'value', row, rows[i].value);
      hover(row, Z.CTRL, i);
    }
    el('div', 'hint', box, 'OK escolhe · ← → muda o timer · Voltar fecha');
    updateFocus();
  }

  function openControls() {
    st.zone = Z.CTRL;
    ctrlRow = 0;
    renderControls();
    setClass($('controls'), 'open', true);
  }

  function closeControls() {
    setClass($('controls'), 'open', false);
    st.zone = Z.TOP;
    st.top = NTABS + 1;
    updateFocus();
  }

  function speedTest() {
    toast('Testando a internet (baixa 10 MB)…');
    TV.service('speedTest', {}, function (res) {
      toast(res && res.mbps ? 'Internet da TV: ' + String(res.mbps).replace('.', ',') + ' Mb/s' : 'Não deu para testar agora.');
    });
  }

  function cycleSleep(d) {
    sleepStep = (sleepStep + (d < 0 ? -1 : 1) + SLEEP_STEPS.length) % SLEEP_STEPS.length;
    var minutes = SLEEP_STEPS[sleepStep];
    // A control call first, so the service has the TV's key and the person has allowed it.
    TV.control('audio/getStatus', {}, function () {
      TV.sleep(minutes, function (res) {
        toast(!res || (minutes && !res.at) ? 'Não deu para ligar o timer (permita o Free My TV na TV).'
          : minutes ? 'A TV desliga em ' + minutes + ' min.' : 'Timer desligado.');
      });
    });
  }

  // MARK: - Headlines and exchange rates: one quiet line at the top, a new headline every 10 s

  var NEWS_EVERY = 10000, INFO_EVERY = 10 * 60000, news = [], newsAt = 0, rates = null;

  function money(v) { return v ? v.toFixed(2).replace('.', ',') : '—'; }

  function showNews() {
    var box = $('news');
    if (!box || document.hidden) return;
    box.innerHTML = '';
    if (news.length) {
      var h = news[newsAt++ % news.length];
      el('span', 'src', box, h.source);
      el('span', 'title', box, h.title);
    }
    if (rates && rates.USD) el('span', 'rates', box, 'USD ' + money(rates.USD) + '  ·  EUR ' + money(rates.EUR));
  }

  function pollInfo() {
    TV.service('headlines', {}, function (res) {
      if (res) { news = res.headlines || []; rates = res.rates || null; showNews(); }
    });
  }

  // MARK: - Teams to follow: ← → changes the league, OK marks a team (up to 3)

  var LEAGUES = [['bra.1', 'Brasileirão'], ['conmebol.libertadores', 'Libertadores'], ['eng.1', 'Premier League'],
    ['esp.1', 'La Liga'], ['ita.1', 'Serie A (Itália)']];
  var MAX_TEAMS = 3, tmLeague = 0, tmList = [], tmRow = 0;

  function isFollowed(league, id) {
    var list = followed();
    for (var i = 0; i < list.length; i++) if (list[i].league === league && list[i].id === id) return true;
    return false;
  }

  function renderTeams() {
    var box = $('teampick').firstChild, league = LEAGUES[tmLeague];
    box.innerHTML = '';
    el('div', 'title', box, '‹  ' + league[1] + '  ›');
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(Math.max(tmList.length, 1), 7) * 78 + 'px';
    for (var i = 0; i < tmList.length; i++) {
      var row = el('div', 'row', holder, tmList[i].name);
      if (isFollowed(league[0], tmList[i].id)) sym('check', el('span', 'value', row));
      hover(row, Z.TEAMS, i);
    }
    el('div', 'hint', box, tmList.length ? '← → muda a liga · OK marca (até ' + MAX_TEAMS + ') · Voltar sai' : 'Carregando…');
    updateFocus();
  }

  function loadTeams() {
    var want = tmLeague;
    tmList = [];
    tmRow = 0;
    renderTeams();
    TV.service('teams', {league: LEAGUES[want][0]}, function (res) {
      if (want !== tmLeague || st.zone !== Z.TEAMS) return;
      tmList = (res && res.teams) || [];
      renderTeams();
    });
  }

  function openTeams() {
    setClass($('settings'), 'open', false);
    st.zone = Z.TEAMS;
    setClass($('teampick'), 'open', true);
    loadTeams();
  }

  function toggleTeam() {
    var t = tmList[tmRow], league = LEAGUES[tmLeague][0];
    if (!t) return;
    var list = followed().filter(function (x) { return !(x.league === league && x.id === t.id); });
    if (list.length === followed().length) {
      if (list.length >= MAX_TEAMS) { toast('Até ' + MAX_TEAMS + ' times: desmarque um antes.'); return; }
      list.push({league: league, id: t.id, name: t.name});
    }
    Prefs.set('teams', list);
    renderTeams();
    pollFootball();
  }

  function closeTeams() {
    setClass($('teampick'), 'open', false);
    openSettings();
  }

  // MARK: - Football: the followed teams' live, next or last match beside the tabs

  // Followed teams (ESPN ids, league slug as in its API), picked in Home Settings; Flamengo until then.
  function followed() { return Prefs.get('teams', [{league: 'bra.1', id: '819', name: 'Flamengo'}]); }
  var FOOTBALL_EVERY = 5 * 60000, FOOTBALL_LIVE_EVERY = 60000, footballTimer = 0;
  var WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  function teamLogo(id) {
    return 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/' + id + '.png&w=56&h=56';
  }

  function two(n) { return (n < 10 ? '0' : '') + n; }

  /** The match worth showing: live first, else one starting within 3 days, else a result from the last 2 days. */
  function shownMatch(t) {
    var now = Date.now(), next = t.next, last = t.last;
    if (next && next.state === 'in') return next;
    if (next && new Date(next.date).getTime() - now < 3 * 86400000) return next;
    if (last && now - new Date(last.date).getTime() < 2 * 86400000) return last;
    return next || last;
  }

  function showFootball(res) {
    var box = $('football'), live = false;
    if (!box) return;
    box.innerHTML = '';
    var teams = (res && res.teams) || [];
    for (var i = 0; i < teams.length && i < MAX_TEAMS; i++) {
      var m = teams[i] && shownMatch(teams[i]);
      if (!m || !m.home || !m.away) continue;
      var chip = el('div', 'match' + (m.state === 'in' ? ' live' : ''), box);
      live = live || m.state === 'in';
      el('img', '', chip).src = teamLogo(m.home.id);
      var score = m.state === 'pre' ? ' × ' : ' ' + m.home.score + ' × ' + m.away.score + ' ';
      el('span', 'teams', chip, m.home.abbr + score + m.away.abbr);
      el('img', '', chip).src = teamLogo(m.away.id);
      var d = new Date(m.date), when;
      if (m.state === 'in') when = '● ' + m.clock;
      else if (m.state === 'post') when = 'FIM · ' + two(d.getDate()) + '/' + two(d.getMonth() + 1);
      else when = WEEKDAYS[d.getDay()] + ' ' + two(d.getDate()) + '/' + two(d.getMonth() + 1) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
      el('span', 'when', chip, when);
    }
    clearTimeout(footballTimer);
    footballTimer = setTimeout(pollFootball, live ? FOOTBALL_LIVE_EVERY : FOOTBALL_EVERY);
    // The service keeps watching while another app is in front: from 3 h before kickoff until the match ends.
    for (var w = 0; w < teams.length && !live; w++) {
      var nx = teams[w] && teams[w].next;
      if (nx && nx.state === 'pre' && new Date(nx.date).getTime() - Date.now() < 3 * 3600000) live = true;
    }
    if (live) TV.watchGoals(followed());
    var soon = teams[0] && teams[0].next;
    if (soon && soon.state === 'pre' && soon.home && soon.away) {
      TV.service('remind', {date: soon.date, text: soon.home.abbr + ' × ' + soon.away.abbr + ' começa em 10 minutos'});
    }
    if (f1Race) footballChip(box, 'F1 · GP ' + f1Race.name, f1When(f1Race.date));
  }

  var f1Race = null;

  function f1When(date) {
    var d = new Date(date);
    return WEEKDAYS[d.getDay()] + ' ' + two(d.getDate()) + '/' + two(d.getMonth() + 1);
  }

  function footballChip(box, text, when) {
    var chip = el('div', 'match f1', box);
    el('span', 'teams', chip, text);
    el('span', 'when', chip, when);
  }

  function pollF1() {
    TV.service('f1', {}, function (res) { f1Race = res && res.race; });
  }

  function pollFootball() {
    if (document.hidden) { footballTimer = setTimeout(pollFootball, FOOTBALL_EVERY); return; }
    TV.football(followed(), showFootball);
  }

  // MARK: - Constellation background: drawn once at half size, so it costs no frames.

  // Optional drift (Home Settings, off by default): 10 frames a second, only while the home screen shows and rests.
  var STAR_FPS = 10, stars = [], starTimer = 0;

  function drawStars() {
    var canvas = $('stars');
    if (!canvas || !canvas.getContext) return;
    var w = canvas.width, h = canvas.height;
    if (!stars.length) {
      for (var n = 0; n < 46; n++) {
        stars.push({x: Math.random() * w, y: Math.random() * h, r: Math.random() * 0.7 + 0.6,
          vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5});
      }
    }
    paintStars(canvas);
    clearInterval(starTimer);
    applyBackground();
    if (Prefs.get('bg', 'stars') === 'stars' && Prefs.get('starsMove', true)) starTimer = setInterval(stepStars, 1000 / STAR_FPS);
  }

  function stepStars() {
    if (document.hidden || saverOn || ambientOn || sheetOpen()) return;
    var canvas = $('stars'), w = canvas.width, h = canvas.height;
    for (var i = 0; i < stars.length; i++) {
      var p = stars[i];
      p.x = (p.x + p.vx + w) % w;
      p.y = (p.y + p.vy + h) % h;
    }
    paintStars(canvas);
  }

  // Backgrounds a profile picks: the constellation, glows in its accent, the highlighted title's photo, or plain.
  var BACKGROUNDS = [['stars', 'Constelação'], ['glow', 'Gradiente'], ['photo', 'Foto do destaque'], ['plain', 'Liso']];

  function applyBackground() {
    var kind = Prefs.get('bg', 'stars');
    body.className = body.className.replace(/\s*bg-\w+/g, '') + ' bg-' + kind;
    if (kind === 'glow') paintGlow($('stars'));
    else if (kind !== 'stars') $('stars').getContext('2d').clearRect(0, 0, 960, 540);
  }

  /** Two soft glows in the accent, drawn once: a gradient without CSS variables, which old TVs lack. */
  function paintGlow(canvas) {
    var g = canvas.getContext('2d'), rgb = ACCENT_RGB[Prefs.get('accent', 'red')] || ACCENT_RGB.red;
    g.clearRect(0, 0, canvas.width, canvas.height);
    var spots = [[820, 40, 520, 0.34], [80, 470, 420, 0.22]];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i], grad = g.createRadialGradient(s[0], s[1], 0, s[0], s[1], s[2]);
      grad.addColorStop(0, 'rgba(' + rgb + ',' + s[3] + ')');
      grad.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function paintStars(canvas) {
    if (Prefs.get('bg', 'stars') !== 'stars') return;
    var g = canvas.getContext('2d'), w = canvas.width, h = canvas.height, reach = 110, pts = stars, i;
    var rgb = ACCENT_RGB[Prefs.get('accent', 'red')] || ACCENT_RGB.red;
    g.clearRect(0, 0, w, h);
    g.lineWidth = 0.6;
    for (i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.sqrt(dx * dx + dy * dy);
        if (d >= reach) continue;
        g.strokeStyle = 'rgba(' + rgb + ',' + ((1 - d / reach) * 0.55).toFixed(3) + ')';
        g.beginPath();
        g.moveTo(pts[i].x, pts[i].y);
        g.lineTo(pts[j].x, pts[j].y);
        g.stroke();
      }
    }
    for (i = 0; i < pts.length; i++) {
      g.fillStyle = 'rgba(' + rgb + ',0.08)';
      g.beginPath();
      g.arc(pts[i].x, pts[i].y, pts[i].r * 3, 0, 6.283);
      g.fill();
      g.fillStyle = 'rgba(255,150,150,0.6)';
      g.beginPath();
      g.arc(pts[i].x, pts[i].y, pts[i].r, 0, 6.283);
      g.fill();
    }
  }

  // MARK: - Rotating highlight (Home Settings, on by default)

  var ROTATE_EVERY = 8000;

  function rotatePick() {
    if (!Prefs.get('rotate', true) || document.hidden || saverOn || ambientOn || sheetOpen()) return;
    if (st.zone === Z.CARDS || st.zone === Z.DRAWER || cards.length < 2 || Date.now() - idleAt < ROTATE_EVERY) return;
    st.card = (st.card + 1) % cards.length;
    updateFocus();
    backdrop(Data.image(cards[st.card].backdrop, 'w300'));
  }

  // MARK: - Search: a title by name, filtered by kind, genre and the TV's own apps; OK opens the app it streams on

  var SEARCH_COLS = 6, SEARCH_ROW = 520;
  var srPart = 0, srChip = 0, srItem = 0, srQuery = '', srStatus = '', srAll = [], srShown = [];
  var srKind = 0, srMine = false, srGenre = 0;   // kind: all, movies, shows; genre: 0 = all, else srGenres()[n - 1]

  function srGenres() {
    var out = [];
    for (var i = 0; i < srAll.length; i++) {
      for (var g = 0; g < srAll[i].genres.length; g++) {
        if (out.indexOf(srAll[i].genres[g]) < 0) out.push(srAll[i].genres[g]);
      }
    }
    return out.sort();
  }

  function srCount() {
    var n = srShown.length;
    return n ? n + (n > 1 ? ' resultados' : ' resultado') + ' · OK abre · segure OK para o trailer'
      : 'Nada encontrado com esses filtros.';
  }

  function srFilter() {
    var genre = srGenre ? srGenres()[srGenre - 1] : null;
    srShown = srAll.filter(function (p) {
      if (srKind === 1 && p.kind !== 'movie') return false;
      if (srKind === 2 && p.kind !== 'tv') return false;
      if (srMine && !(p.app && Data.appFor(p.app))) return false;
      return !genre || p.genres.indexOf(genre) >= 0;
    });
    srItem = Math.min(srItem, Math.max(0, srShown.length - 1));
  }

  function chipLabels() {
    var genres = srGenres();
    return [['Tudo', 'Filmes', 'Séries'][srKind], (srMine ? '✓ ' : '') + 'Só meus apps',
      'Gênero: ' + (srGenre ? genres[srGenre - 1] : 'todos')];
  }

  function renderSearch() {
    var page = $('searchpage'), old = fieldOf('searchpage'), typed = old ? old.value : srQuery;
    var inField = typingIn('searchpage');
    page.innerHTML = '';
    var head = el('div', 'shead', page);
    el('div', 'eyebrow', head, '// Pesquisar');
    var field = el('input', '', el('div', 'sfield', head));
    field.type = 'text';
    field.value = typed;
    field.placeholder = 'Filme ou série, ex.: La Casa de Papel';
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    hover(field.parentNode, Z.SEARCH, 0);
    var chips = el('div', 'chips', head), labels = chipLabels(), active = [srKind > 0, srMine, srGenre > 0];
    for (var c = 0; c < labels.length; c++) hover(el('div', 'chip' + (active[c] ? ' on' : ''), chips, labels[c]), Z.SEARCH, 1000 + c);
    el('div', 'sstatus', head, srStatus);
    el('div', 'phone', head, phoneHint);
    if (phoneQr) drawQr(el('canvas', 'qr', head), phoneQr);
    field.oninput = typedSoon;
    el('div', 'sgrid', page);
    renderResults();
    if (inField) openField('searchpage');
    updateFocus();
  }

  /** Only the results and the status: while typing, the field (and the TV's keyboard) stay as they are. */
  function renderResults() {
    var page = $('searchpage'), grid = page.querySelector('.sgrid'), status = page.querySelector('.sstatus');
    if (!grid) return;
    grid.innerHTML = '';
    if (status) status.textContent = srStatus;
    for (var i = 0; i < srShown.length; i++) {
      var p = srShown[i], item = el('div', 'sitem', grid), app = p.app && Data.appFor(p.app);
      item.style.left = (90 + (i % SEARCH_COLS) * 296) + 'px';
      item.style.top = (Math.floor(i / SEARCH_COLS) * SEARCH_ROW) + 'px';
      el('div', 'poster', item).style.backgroundImage = 'url("' + Data.image(p.poster, 'w342') + '")';
      el('div', 'stitle', item, p.title);
      var where = app ? app.title : p.service ? p.service + ' (não instalado)' : p.paid ? '' : 'Sem streaming';
      var meta = el('div', 'smeta' + (app ? ' mine' : ''), item, (p.year ? p.year + (where ? ' · ' : '') : '') + where);
      if (!app && p.paid) el('span', 'paid', meta, p.paid);   // only to rent or buy: said at the line's right end
      hover(item, Z.SEARCH, 2000 + i);
      holdable(item);
    }
  }

  // Results while typing: 3 letters and a short pause, so each key doesn't become a request.
  var TYPE_PAUSE = 700, typeTimer = 0;

  function typedSoon() {
    clearTimeout(typeTimer);
    typeTimer = setTimeout(function () {
      var f = fieldOf('searchpage'), q = f ? f.value.replace(/^\s+|\s+$/g, '') : '';
      if (st.zone === Z.SEARCH && q.length >= 3 && q !== srQuery) runSearch(true);
    }, TYPE_PAUSE);
  }

  /** The phone page's QR code: dark modules on white, with the 4-module quiet zone the readers need. */
  function drawQr(canvas, rows) {
    var n = rows.length, cellPx = Math.floor(220 / (n + 8)), side = cellPx * (n + 8), g = canvas.getContext('2d');
    canvas.width = canvas.height = side;
    g.fillStyle = '#FFF';
    g.fillRect(0, 0, side, side);
    g.fillStyle = '#000';
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) if (rows[y].charAt(x) === '1') g.fillRect((x + 4) * cellPx, (y + 4) * cellPx, cellPx, cellPx);
    }
  }

  function focusSearch() {
    var page = $('searchpage'), on = st.zone === Z.SEARCH, f = page && page.querySelector('.sfield');
    if (!f) return;
    setClass(f, 'focus', on && srPart === 0);
    var chips = page.querySelectorAll('.chip'), items = page.querySelectorAll('.sitem'), i;
    for (i = 0; i < chips.length; i++) setClass(chips[i], 'focus', on && srPart === 1 && srChip === i);
    for (i = 0; i < items.length; i++) setClass(items[i], 'focus', on && srPart === 2 && srItem === i);
    var shift = srPart === 2 ? Math.floor(srItem / SEARCH_COLS) * SEARCH_ROW : 0, grid = page.querySelector('.sgrid');
    grid.style.webkitTransform = grid.style.transform = 'translateY(' + (-shift) + 'px)';
  }

  function openSearch() {
    st.zone = Z.SEARCH;
    srPart = 0;
    srAll = Prefs.get('recent', []);   // before typing: the titles opened lately, to pick up where it stopped
    srQuery = '';
    srKind = 0;
    srMine = false;
    srGenre = 0;
    srFilter();
    srStatus = srAll.length ? 'Abertos recentemente · digite para pesquisar' : '';
    if (!Data.hasKey()) srStatus = 'A pesquisa usa a chave do TMDB: configure em Configurações da Home.';
    renderSearch();
    setClass($('searchpage'), 'open', true);
    openField('searchpage');
    startPhone();
  }

  // Typing from the phone: the service serves a small page on the home network while the search is open.
  var phoneTimer = 0, phoneHint = '', phoneQr = null;

  function startPhone() {
    TV.service('phone', {action: 'start'}, function (res) {
      if (!res || !res.url || st.zone !== Z.SEARCH) return;
      phoneHint = 'Aponte a câmera do celular  ·  ou abra ' + res.url.replace('http://', '') + ', código ' + res.code;
      phoneQr = res.qr || null;
      renderSearch();
      clearInterval(phoneTimer);
      phoneTimer = setInterval(function () {
        TV.service('phone', {action: 'poll'}, function (r) {
          if (!r || !r.text || st.zone !== Z.SEARCH) return;
          var f = fieldOf('searchpage');
          if (f) f.value = r.text;
          runSearch();
        });
      }, 2000);
    });
  }

  function stopPhone() {
    clearInterval(phoneTimer);
    phoneHint = '';
    phoneQr = null;
    TV.service('phone', {action: 'stop'});
  }

  function closeSearch() {
    stopPhone();
    closeField('searchpage');
    setClass($('searchpage'), 'open', false);
    $('searchpage').innerHTML = '';   // up to 15 decoded posters stay in RAM otherwise
    srShown = [];
    srAll = [];
    st.zone = Z.TOP;
    st.top = NTABS;
    updateFocus();
  }

  /** live: from typing, so the keyboard stays and only the results change. */
  function runSearch(live) {
    var f = fieldOf('searchpage'), q = f ? f.value.replace(/^\s+|\s+$/g, '') : '';
    if (!live) closeField('searchpage');
    if (q.length < 2) { srStatus = 'Digite pelo menos 2 letras.'; renderSearch(); return; }
    srQuery = q;
    srStatus = 'Procurando “' + q + '”…';
    if (live) renderResults(); else { srAll = []; srShown = []; renderSearch(); }
    Data.search(q, function (err, found) {
      if (st.zone !== Z.SEARCH) return;
      srAll = found || [];
      srGenre = 0;
      srItem = 0;
      srFilter();
      srStatus = err ? 'Não deu para pesquisar agora. Confira a internet.'
        : (srAll[0] && srAll[0].person ? 'Com ' + srAll[0].person + ' · ' : '') + srCount();
      if (live && typingIn('searchpage')) { renderResults(); return; }
      srPart = srShown.length ? 2 : 0;
      renderSearch();
    });
  }

  function activateSearch() {
    if (srPart === 0) { openField('searchpage'); return; }
    if (srPart === 1) {
      if (srChip === 0) srKind = (srKind + 1) % 3;
      else if (srChip === 1) srMine = !srMine;
      else srGenre = (srGenre + 1) % (srGenres().length + 1);
      srFilter();
      if (srAll.length) srStatus = srCount();
      renderSearch();
      return;
    }
    if (srShown[srItem]) openDetail(srShown[srItem]);
  }

  function moveSearch(dx, dy) {
    if (srPart === 0) {
      if (dy > 0) srPart = 1;
    } else if (srPart === 1) {
      if (dx) srChip = Math.max(0, Math.min(2, srChip + dx));
      else if (dy < 0) srPart = 0;
      else if (dy > 0 && srShown.length) { srPart = 2; srItem = Math.min(srChip * 2, srShown.length - 1); }
    } else {
      var n = srItem + dx + dy * SEARCH_COLS;
      if (dy < 0 && srItem < SEARCH_COLS) srPart = 1;
      else if (n >= 0 && n < srShown.length && (dx === 0 || Math.floor(n / SEARCH_COLS) === Math.floor(srItem / SEARCH_COLS))) srItem = n;
    }
  }

  // MARK: - Memory: while another app is in front, the picks' decoded photos go, so that app gets the RAM.

  var hiddenPhotos = [];

  function releaseImages() {
    var list = document.querySelectorAll('#cards .layer, #saver .photo');
    for (var i = 0; i < list.length; i++) {
      var url = list[i].style.backgroundImage;
      if (!url || url === 'none') continue;
      hiddenPhotos.push([list[i], url]);
      list[i].style.backgroundImage = 'none';
    }
  }

  function restoreImages() {
    for (var i = 0; i < hiddenPhotos.length; i++) hiddenPhotos[i][0].style.backgroundImage = hiddenPhotos[i][1];
    hiddenPhotos = [];
  }

  // MARK: - Drawer

  var drawerItems = [], drawerInputs = 0;

  function renderDrawer() {
    var d = $('drawer');
    d.innerHTML = '';
    drawerItems = [];
    for (var i = 0; i < inputs.length; i++) {
      var x = inputs[i];
      if (x.key !== 'live' && !x.connected) continue;   // a port with nothing plugged in is only in the way
      drawerItems.push({label: x.label || tr('Live TV'), symbol: x.symbol, off: !x.connected, run: launcher(x.id, x.label)});
    }
    drawerInputs = drawerItems.length;
    drawerItems.push({label: tr('All Apps'), symbol: 'apps', run: openApps});
    drawerItems.push({label: tr('Home Settings'), symbol: 'settings', run: openSettings});
    if (TV.canOpenSettings) drawerItems.push({label: tr('TV Settings'), symbol: 'tv_settings', run: tvSettings});
    var n = drawerItems.length, gap = 18, groupGap = 56, groups = drawerInputs > 0 && drawerInputs < n ? 2 : 1;
    var tw = Math.min(230, (1760 - Math.max(0, n - groups) * gap - (groups - 1) * groupGap) / Math.max(1, n));
    var xPos = 80;
    for (var k = 0; k < n; k++) {
      if (k === drawerInputs && k > 0) {
        xPos += groupGap - gap;
        el('div', 'row-title', d, tr('Shortcuts')).style.left = (xPos + 4) + 'px';
      }
      if (k === 0 && drawerInputs) el('div', 'row-title', d, tr('Inputs')).style.left = '84px';
      var item = drawerItems[k], key = el('div', 'key glass' + (item.off ? ' off' : ''), d);
      key.style.left = xPos + 'px';
      key.style.width = tw + 'px';
      sym(item.symbol, key);
      el('div', 'label', key, item.label);
      hover(key, Z.DRAWER, k);
      xPos += tw + gap;
    }
    renderPanels();
    updateFocus();
  }

  function renderPanels() {
    var d = $('drawer');
    var old = d.querySelectorAll('.panel');
    for (var o = 0; o < old.length; o++) d.removeChild(old[o]);
    var wx = Prefs.weather(), coins = Data.activeCoins(), qt = coins.length > 0;
    var split = 80 + 1760 * 0.585;
    if (wx) {
      var w = el('div', 'panel glass', d);
      w.id = 'weather';
      w.style.left = '80px';
      w.style.width = (split - 16 - 80) + 'px';   // the right side: crypto prices or the TV's performance
      renderWeather(w);
    }
    if (!qt && TV.stats && Prefs.get('showPerf', true)) {
      var pf = el('div', 'panel glass', d), at = wx ? split + 16 : 80;
      pf.id = 'perf';
      pf.style.left = at + 'px';
      pf.style.width = (1840 - at) + 'px';
      renderPerf(pf);
    }
    if (qt) {
      var q = el('div', 'panel glass', d);
      q.id = 'prices';
      var left = wx ? split + 16 : 80;
      q.style.left = left + 'px';
      q.style.width = (1840 - left) + 'px';
      renderPrices(q, coins);
    }
  }

  function renderWeather(card) {
    el('div', 'head', card, Data.city || tr('Weather'));
    var w = Data.weather;
    if (!w) {
      el('div', 'cond', card, tr('No weather data right now.')).style.top = '96px';
      return;
    }
    var now = el('div', 'now', card);
    sym(Data.symbol(w.code, w.isDay), now);
    el('span', 'temp', now, Data.degrees(w.temp));
    el('div', 'cond', card, Data.condition(w.code, w.isDay));
    el('div', 'range', card, trf('H:{max}', {max: Data.degrees(w.max)}) + '   ' + trf('L:{min}', {min: Data.degrees(w.min)}));
    el('div', 'split', card);
    // Home Settings → Forecast: the next 6 hours or the next 5 days (the hours until a forecast has days).
    var days = Prefs.forecast() === 'days' && w.days && w.days.length > 0, list = days ? w.days : w.hours, n = days ? 5 : 6;
    var hours = el('div', 'hours', card), width = parseFloat(card.style.width) - 30 - 422, hw = width / n;
    for (var i = 0; list && i < list.length && i < n; i++) {
      var h = el('div', 'hour', hours), x = list[i];
      h.style.left = (hw * i) + 'px';
      h.style.width = hw + 'px';
      el('div', 't', h, days ? Data.weekday(x.at) : Data.hour(x.at));
      sym(Data.symbol(x.code, days || x.day), h);
      var t = el('div', 'd', h, Data.degrees(days ? x.max : x.temp));
      if (days) el('span', 'low', t, Data.degrees(x.min));
    }
    var sun = el('div', 'sun', card);
    if (w.sunrise) { var a = el('span', '', sun); sym('sunrise', a); a.appendChild(document.createTextNode(trf('Sunrise {time}', {time: Data.time(w.sunrise)}))); }
    if (w.sunset) { var b = el('span', '', sun); sym('sunset', b); b.appendChild(document.createTextNode(trf('Sunset {time}', {time: Data.time(w.sunset)}))); }
  }

  function renderPrices(card, coins) {
    el('div', 'head', card, tr('Crypto'));
    var stale = Data.staleness(Data.pricesAt, 5 * 60000);
    el('div', 'side', card, stale ? trf('quotes|{ago}', {ago: stale}) : tr('24h change'));
    for (var j = 0; j < coins.length; j++) {
      var i = coins[j], row = el('div', 'coin', card);
      row.style.top = (86 + 52 * j) + 'px';
      coin(i, row);
      el('span', 'n', row, Data.coinName(i));
      el('span', 'p', row, Data.money(Data.prices[i]));
      var ch = Data.changes[i];
      if (!isNaN(ch)) el('span', 'c ' + (ch >= 0 ? 'up' : 'down'), row, Data.change(ch));
    }
  }

  function openDrawer() {
    if (!drawerItems.length) return;
    var tiles = $('tiles').children;
    st.zone = Z.DRAWER;
    st.drawer = Math.min(drawerItems.length - 1, nearest(document.querySelectorAll('#drawer .key'), centerX(tiles[st.shelf])));
    updateFocus();
  }

  function closeDrawer() {
    var keys = document.querySelectorAll('#drawer .key');
    st.zone = Z.SHELF;
    if (shelf.length) st.shelf = nearest($('tiles').children, centerX(keys[st.drawer]));
    updateFocus();
  }

  // MARK: - All Apps

  function renderApps() {
    var sheet = $('apps');
    sheet.firstChild.textContent = tr('All Apps');
    var grid = sheet.lastChild;
    grid.innerHTML = '';
    for (var i = 0; i < others.length; i++) {
      var r = Math.floor(i / 5), c = i % 5, cell = el('div', 'cell', grid);
      cell.style.left = (130 + c * 340) + 'px';
      cell.style.top = (196 + r * 239) + 'px';
      face(others[i], el('div', 'face', cell), wordFit(others[i].title, 300, 34));
      el('div', 'label', cell, others[i].title);
      hover(cell, Z.APPS, i);
    }
  }

  function openApps() {
    renderApps();
    st.zone = Z.APPS;
    st.grid = 0;
    setClass($('apps'), 'open', true);
    fitLogos($('apps'));
    updateFocus();
  }

  function closeSheets() {
    setClass($('apps'), 'open', false);
    setClass($('settings'), 'open', false);
    setClass($('shelfedit'), 'open', false);
    setClass($('langpick'), 'open', false);
    setClass($('about'), 'open', false);
    closeField('citypick');
    closeField('keypick');
    setClass($('citypick'), 'open', false);
    setClass($('keypick'), 'open', false);
    langHint = null;
    st.zone = Z.SHELF;
    updateFocus();
  }

  // MARK: - Home Settings

  function settingRows() {
    var unit = Prefs.temperature(), theme = Prefs.theme();
    var auto = tr('Automatic'), picked = pickedLanguage();
    var rows = profileRows().concat([
      {label: tr('Language'), value: picked === 'auto' ? auto : I18N.languageName(picked), opens: true, language: true,
        step: function (d) { if (d >= 0) openLanguages(); }},
      {label: tr('Temperature'), value: unit === 'C' ? '°C' : unit === 'F' ? '°F' : tr('unit|Automatic'),
        step: function (d) { cycle('temperature', ['auto', 'C', 'F'], unit, d); renderPanels(); }},
      {label: tr('Theme'), value: theme === 'light' ? tr('Light') : theme === 'dark' ? tr('Dark') : auto,
        step: function (d) { cycle('theme', ['auto', 'light', 'dark'], theme, d); checkNight(); }},
      {label: tr('Dim'), value: dimName(),
        step: function (d) { cycle('dim', ['off', 'low', 'medium', 'high', 'auto'], Prefs.dim(), d); applyDim(); }},
      {label: tr('Screensaver'), value: saverMode() === 'clock' ? tr('Clock') : tr('Photos'),
        step: function (d) { cycle('saver', ['photos', 'clock'], saverMode(), d); }},
      {label: tr('Picks per tab'), value: String(Prefs.cards()),
        step: function (d) { Prefs.set('cards', 3 + (Prefs.cards() - 3 + (d || 1) + 4) % 4); renderCards(); }},
      {label: tr('Cartoons and anime'), toggle: !Prefs.hideAnimation(),
        step: function () { Prefs.set('hideAnimation', !Prefs.hideAnimation()); Data.refresh(); }},
      {label: 'Times', value: followed().map(function (t) { return t.name; }).join(', ') || 'nenhum', opens: true,
        step: function (d) { if (d >= 0) openTeams(); }},
      {label: 'Ajuda: onde fica cada coisa', value: '›', opens: true, step: function (d) { if (d >= 0) openHelp(); }},
      {label: 'Notícias e esportes no topo', toggle: Prefs.get('extras', true),
        step: function () { Prefs.set('extras', !Prefs.get('extras', true)); applyExtras(); }},
      {label: 'Painel de desempenho', toggle: Prefs.get('showPerf', true),
        step: function () { Prefs.set('showPerf', !Prefs.get('showPerf', true)); renderPanels(); }},
      {label: 'Voltar ao Free My TV', toggle: Prefs.get('backHome', true),
        step: function () { Prefs.set('backHome', !Prefs.get('backHome', true)); TV.service('backHome', {on: Prefs.get('backHome', true)}); }},
      {label: 'Ordem dos apps', value: Prefs.get('shelfOrder', 'manual') === 'usage' ? 'Mais usados' : 'Manual',
        step: function () {
          Prefs.set('shelfOrder', Prefs.get('shelfOrder', 'manual') === 'usage' ? 'manual' : 'usage');
          pickShelf();
          renderShelf();
        }},
      {label: 'Destaque girando', toggle: Prefs.get('rotate', true),
        step: function () { Prefs.set('rotate', !Prefs.get('rotate', true)); }},
      {label: 'Fundo', value: backgroundName(),
        step: function (d) { cycle('bg', BACKGROUNDS.map(function (b) { return b[0]; }), Prefs.get('bg', 'stars'), d); drawStars(); }},
      {label: 'Constelação em movimento', toggle: Prefs.get('starsMove', true), dim: Prefs.get('bg', 'stars') !== 'stars',
        step: function () { Prefs.set('starsMove', !Prefs.get('starsMove', true)); drawStars(); }},
      {label: tr('Watch from the screensaver'), toggle: Prefs.saverWatch(),
        step: function () { Prefs.set('saverWatch', !Prefs.saverWatch()); }},
      {label: tr('Weather widget'), toggle: Prefs.weather(),
        step: function () { Prefs.set('weather', !Prefs.weather()); renderPanels(); }},
      {label: tr('City'), value: Prefs.city() || '—', opens: true, city: true,
        step: function (d) { if (d >= 0) openCities(); }},
      {label: tr('Forecast'), value: Prefs.forecast() === 'days' ? tr('Next days') : tr('Next hours'),
        step: function (d) { cycle('forecast', ['hours', 'days'], Prefs.forecast(), d); renderPanels(); }},
      {label: tr('Quotes widget'), toggle: Prefs.quotes(),
        step: function () { Prefs.set('quotes', !Prefs.quotes()); Data.settingsChanged(); }}
    ]);
    var names = ['Bitcoin', 'Ethereum', 'Solana', tr('Dollar')];
    var count = Data.currency === 'BRL' ? 4 : 3;
    for (var i = 0; i < count; i++) {
      (function (i) {
        rows.push({label: names[i], toggle: Prefs.quotes() && Prefs.coin(i), dim: !Prefs.quotes(),
          step: function () { if (Prefs.quotes()) { Prefs.setCoin(i, !Prefs.coin(i)); Data.settingsChanged(); } }});
      })(i);
    }
    rows.push({label: tr('TMDB key'), value: Prefs.tmdbKey().length >= 4 ? '•••• ' + Prefs.tmdbKey().slice(-4) : tr('Not set'), opens: true, tmdb: true,
      step: function (d) { if (d >= 0) openKey(); }});
    var sv = Data.services();
    if (sv.length) {
      var someOff = false;   // only the services this TV has count
      for (var q = 0; q < sv.length; q++) someOff = someOff || Prefs.serviceOff(sv[q].key);
      rows.push({label: tr('Picks from'), value: someOff ? tr('services|Some') : tr('services|All'),
        step: function () { Prefs.set('servicesOff', []); Data.settingsChanged(); }});
      for (var j = 0; j < sv.length; j++) {
        (function (key, name) {
          rows.push({label: name, toggle: !Prefs.serviceOff(key),
            step: function () { Prefs.setServiceOff(key, !Prefs.serviceOff(key)); Data.refresh(); Data.settingsChanged(); }});
        })(sv[j].key, sv[j].name);
      }
    }
    if (nuvio()) {
      var open = Prefs.openPicks();
      rows.push({label: tr('Open picks in'), value: open === 'nuvio' ? 'Nuvio' : tr('Streaming apps'),
        step: function (d) { cycle('openPicks', ['apps', 'nuvio'], open, d); }});
    }
    rows.push({label: tr('Shelf'), value: '›', shelf: true, step: function (d) { if (d >= 0) openShelfEdit(); }});
    rows.push({label: tr('About this TV'), value: '›', about: true, step: function (d) { if (d >= 0) openAbout(); }});
    if (TV.canOpenSettings) rows.push({label: tr('TV Settings'), value: '›', step: function (d) { if (d >= 0) tvSettings(); }});
    return rows;
  }

  function cycle(name, values, current, d) {
    var i = values.indexOf(current);
    Prefs.set(name, values[(i + (d || 1) + values.length) % values.length]);
  }

  var rowsNow = [];

  function renderSettings() {
    var box = $('settings').firstChild;
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('settings', title);
    title.appendChild(document.createTextNode(tr('Home Settings')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    rowsNow = settingRows();
    list.style.height = Math.min(rowsNow.length, 7) * 78 + 'px';
    for (var i = 0; i < rowsNow.length; i++) {
      var r = rowsNow[i], row = el('div', 'row' + (r.dim ? ' dim' : ''), holder, r.label);
      if (r.toggle !== undefined) setClass(el('div', 'toggle', row), 'on', r.toggle);
      else {
        var v = el('span', 'value', row);
        if (r.value === '›') v.textContent = '›';
        else if (r.opens) { v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
        else { el('span', 'chev', v, '‹'); v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
      }
      hover(row, Z.SETTINGS, i);
    }
    el('div', 'hint', box, tr('OK or the arrows change the value.'));
    updateFocus();
  }

  function openSettings() {
    st.zone = Z.SETTINGS;
    st.row = 0;
    renderSettings();
    setClass($('settings'), 'open', true);
    updateFocus();
  }

  // MARK: - Language: a list of every catalogue in its own name, as on Android (moving through it doesn't switch the app)

  var langHint = null;

  function languageChoices() {
    return ['auto'].concat(I18N.languages());
  }

  /** The language in use: "auto", or the catalogue the setting resolved to ("pt-BR" in config.properties is "pt"). */
  function pickedLanguage() {
    return Prefs.language() === 'auto' ? 'auto' : I18N.lang;
  }

  function renderLanguages() {
    var box = $('langpick').firstChild, choices = languageChoices(), current = choices.indexOf(pickedLanguage());
    box.innerHTML = '';
    el('div', 'title', box, tr('Language'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(choices.length, 7) * 78 + 'px';
    for (var i = 0; i < choices.length; i++) {
      var row = el('div', 'row', holder, choices[i] === 'auto' ? tr('Automatic') : I18N.languageName(choices[i]));
      if (i === current) sym('check', el('span', 'value', row));
      hover(row, Z.LANG, i);
    }
    langHint = el('div', 'hint', box);
    updateFocus();
  }

  function openLanguages() {
    setClass($('settings'), 'open', false);
    st.zone = Z.LANG;
    st.lang = Math.max(0, languageChoices().indexOf(pickedLanguage()));
    renderLanguages();
    setClass($('langpick'), 'open', true);
    updateFocus();
  }

  /** OK: the language under the focus; Back: none. Either way, back to Home Settings, on the Language row. */
  function closeLanguages(pick) {
    setClass($('langpick'), 'open', false);
    langHint = null;
    var code = languageChoices()[st.lang];
    if (pick && code !== pickedLanguage()) {
      Prefs.set('language', code);
      I18N.set(Prefs.language());
      renderAll();
      Data.refresh();   // the picks' titles and genres come in the new language
    }
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].language) st.row = i;
    updateFocus();
  }

  // MARK: - Text fields: typed with the TV's keyboard (the city, the TMDB key)

  /** A row with a text field; on the TV, the focus in it brings up the keyboard. */
  function textField(holder, zone, value, placeholder, label) {
    var field = el('input', '', el('div', 'row field', holder));
    field.type = 'text';
    field.value = value;
    field.placeholder = placeholder;
    field.setAttribute('aria-label', label);
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    hover(field.parentNode, zone, 0);
    return field;
  }

  function fieldOf(sheet) { return $(sheet).querySelector('input'); }

  function typingIn(sheet) { var f = fieldOf(sheet); return !!f && document.activeElement === f; }

  /** Into the field: the TV shows its keyboard. */
  function openField(sheet) {
    var f = fieldOf(sheet);
    if (!f) return;
    f.focus();
    try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {}
  }

  function closeField(sheet) {
    if (typingIn(sheet)) fieldOf(sheet).blur();
  }

  // MARK: - City: typed with the TV's keyboard, found by Open-Meteo, as on Android (the weather is for its coordinates)

  var cityFound = [], cityStatus = '', cityTimer = 0, citySeq = 0;

  /** The field to type in, the Search row, then the places found. */
  function cityRows() { return 2 + cityFound.length; }

  function renderCities() {
    var box = $('citypick').firstChild, old = fieldOf('citypick'), typed = old ? old.value : '', inField = typingIn('citypick');
    box.innerHTML = '';
    el('div', 'title', box, tr('City'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(cityRows(), 7) * 78 + 'px';
    textField(holder, Z.CITY, typed, tr("Type the city's name"), tr('City'));
    var search = el('div', 'row', holder, tr('Search'));
    sym('chevron_right', el('span', 'value', search));
    hover(search, Z.CITY, 1);
    for (var i = 0; i < cityFound.length; i++) {
      var row = el('div', 'row', holder, cityFound[i].label);
      hover(row, Z.CITY, 2 + i);
    }
    el('div', 'hint', box, cityStatus || tr('OK picks, Back cancels.'));
    if (inField) openField('citypick');   // a message that went away while typing: the keyboard stays
    updateFocus();
  }

  function openCities() {
    setClass($('settings'), 'open', false);
    st.zone = Z.CITY;
    st.city = 0;
    cityFound = [];
    cityStatus = '';
    $('citypick').firstChild.innerHTML = '';
    renderCities();
    setClass($('citypick'), 'open', true);
    openField('citypick');
  }

  function setCityStatus(text) {
    cityStatus = text;
    clearTimeout(cityTimer);
    // Clears only the hint: a new render would rebuild the field and interrupt the TV's keyboard while someone types.
    if (text && text !== tr('Searching…')) cityTimer = setTimeout(function () {
      cityStatus = '';
      var hint = st.zone === Z.CITY && $('citypick').querySelector('.hint');
      if (hint) hint.textContent = tr('OK picks, Back cancels.');
    }, 4000);
    if (st.zone === Z.CITY) renderCities();
  }

  function searchCity() {
    var f = fieldOf('citypick'), name = f ? f.value : '';
    closeField('citypick');
    if (!name.trim()) { st.city = 0; openField('citypick'); updateFocus(); return; }
    if (cityStatus === tr('Searching…')) return;
    setCityStatus(tr('Searching…'));
    var mine = ++citySeq;   // an answer for a sheet already closed (and opened again) is dropped
    Data.findCity(name, function (err, found) {
      if (mine !== citySeq) return;
      if (st.zone !== Z.CITY) { cityStatus = ''; return; }
      cityFound = found || [];
      if (cityFound.length) st.city = 2;   // on the first place found
      setCityStatus(err ? trf("Couldn't search now: {error}", {error: err.message}) : cityFound.length ? '' : tr('No city with that name.'));
    });
  }

  /** OK on a place: the weather moves there. Back (pick false): nothing changes. Either way, back on the City row. */
  function closeCities(pick) {
    var place = pick && cityFound[st.city - 2];
    closeField('citypick');
    setClass($('citypick'), 'open', false);
    cityFound = [];
    citySeq++;
    clearTimeout(cityTimer);
    cityStatus = '';
    if (place) {
      Prefs.setCity(place.city, place.lat, place.lon);
      Data.cityChanged();
    }
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].city) st.row = i;
    updateFocus();
  }

  function activateCity() {
    if (st.city === 0) openField('citypick');
    else if (st.city === 1) searchCity();
    else closeCities(true);
  }

  // MARK: - TMDB key: typed on the TV, so builds without one (the releases) get the picks too; TMDB checks it first

  var keyStatus = '', keyWarn = false, keyTimer = 0, keySeq = 0, keyAsking = false;

  function keyRows() { return keyAsking ? 2 : Prefs.tmdbKeyOnTV() ? 3 : 2; }

  function keySteps() {
    return tr("The key brings the picks: what's trending on your streaming apps, with their photos on the screensaver.") + '\n'
      + tr('Free, and it takes two minutes:') + '\n1. ' + tr('Create an account at themoviedb.org.')
      + '\n2. ' + tr('Open Settings → API and request a developer key.');
  }

  function renderKey() {
    var box = $('keypick').firstChild, old = fieldOf('keypick'), typed = old ? old.value : '', inField = typingIn('keypick');
    box.innerHTML = '';
    el('div', 'title', box, keyAsking ? tr('Remove the TMDB key?') : tr('TMDB key'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = keyRows() * 78 + 'px';
    if (keyAsking) {
      hover(el('div', 'row', holder, tr('Cancel')), Z.KEY, 0);
      hover(el('div', 'row', holder, tr('Remove')), Z.KEY, 1);
      updateFocus();
      return;
    }
    var keyField = textField(holder, Z.KEY, typed, tr('API Read Access Token or API Key'), tr('TMDB key'));
    // A v3 key is lowercase hex: the TV's keyboard mustn't capitalize it (the city's field wants capitals).
    keyField.setAttribute('autocapitalize', 'none');
    keyField.setAttribute('autocorrect', 'off');
    var save = el('div', 'row', holder, tr('Save'));
    sym('chevron_right', el('span', 'value', save));
    hover(save, Z.KEY, 1);
    if (Prefs.tmdbKeyOnTV()) hover(el('div', 'row', holder, tr('Remove the key')), Z.KEY, 2);
    if (keyStatus) setClass(el('div', 'hint', box, keyStatus), 'warn', keyWarn);
    el('div', 'hint steps', box, keySteps());
    if (inField) openField('keypick');
    updateFocus();
  }

  function openKey() {
    setClass($('settings'), 'open', false);
    st.zone = Z.KEY;
    st.key = 0;
    keyStatus = '';
    keyAsking = false;
    $('keypick').firstChild.innerHTML = '';
    renderKey();
    setClass($('keypick'), 'open', true);
    openField('keypick');
  }

  function setKeyStatus(text, warn) {
    keyStatus = text;
    keyWarn = !!warn;
    clearTimeout(keyTimer);
    if (text && text !== tr('Checking the key with TMDB…')) keyTimer = setTimeout(function () {
      keyStatus = '';
      var line = st.zone === Z.KEY && $('keypick').querySelector('.hint:not(.steps)');
      if (line) line.parentNode.removeChild(line);
    }, 6000);
    if (st.zone === Z.KEY) renderKey();
  }

  function cleanKey(typed) {
    var key = typed.replace(/\s+/g, '');
    return /^[A-Za-z0-9._-]{16,1024}$/.test(key) ? key : '';
  }

  function saveKey() {
    var f = fieldOf('keypick'), typed = f ? f.value : '', key = cleanKey(typed);
    closeField('keypick');
    if (!typed.replace(/\s+/g, '')) { st.key = 0; openField('keypick'); updateFocus(); return; }
    if (keyStatus === tr('Checking the key with TMDB…')) return;
    if (!key) { setKeyStatus(tr("That doesn't look like a TMDB key."), true); return; }
    setKeyStatus(tr('Checking the key with TMDB…'));
    var mine = ++keySeq;   // an answer for a sheet already closed is dropped
    Data.checkKey(key, function (err) {
      if (mine !== keySeq || st.zone !== Z.KEY) return;
      if (err) { setKeyStatus(err.rejected ? tr('TMDB refused this key.') : trf("Couldn't reach TMDB: {error}", {error: err.message}), true); return; }
      Prefs.set('tmdbKey', key);
      if (fieldOf('keypick')) fieldOf('keypick').value = '';
      Data.keyChanged();
      setKeyStatus(tr('Saved. The picks arrive in a moment.'));
    });
  }

  /** Back to config.properties' key (none in the releases): the picks go. */
  function removeKey() {
    Prefs.set('tmdbKey', undefined);   // left out of the saved settings
    closeKey();
    Data.keyChanged();
  }

  /** Back on the TMDB key row of Home Settings. */
  function closeKey() {
    closeField('keypick');
    setClass($('keypick'), 'open', false);
    keySeq++;
    clearTimeout(keyTimer);
    keyStatus = '';
    keyAsking = false;
    var f = fieldOf('keypick');
    if (f) f.value = '';
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].tmdb) st.row = i;
    updateFocus();
  }

  function askRemoveKey(on) {
    keyAsking = on;
    keyStatus = '';
    clearTimeout(keyTimer);
    st.key = on ? 0 : 2;
    renderKey();
  }

  function activateKey() {
    if (keyAsking) { if (st.key === 1) removeKey(); else askRemoveKey(false); }
    else if (st.key === 0) openField('keypick');
    else if (st.key === 1) saveKey();
    else askRemoveKey(true);
  }

  // MARK: - About this TV: what to quote when reporting a problem, without LG's or Samsung's slow menus

  function renderAbout(info) {
    var box = $('about').firstChild;
    box.innerHTML = '';
    el('div', 'title', box, tr('About this TV'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    var rows = [
      [tr('Model'), info && info.model], [tr('Firmware'), info && info.firmware], [tr('System'), info && info.system],
      [tr('IP address'), info && info.ip], [tr('Time zone'), TV.zone()], ['Free My TV', info && info.version]
    ];
    for (var i = 0; i < rows.length; i++) {
      var row = el('div', 'row', holder), label = el('span', '', row, rows[i][0]);
      fitValue(row, label, el('span', 'value', row, info ? rows[i][1] || tr('Unavailable') : '…'));
    }
    el('div', 'hint', box, tr('Back closes.'));
  }

  /** A long value (Samsung's firmware) gets smaller instead of running over its label, and ends in "…" if even the smallest size is too wide. */
  function fitValue(row, label, value) {
    var room = row.clientWidth - label.offsetWidth - 2 * 24 - 24;   // the row's padding, and a gap after the label
    for (var size = 30; value.offsetWidth > room && size > 18; size -= 2) value.style.fontSize = size - 2 + 'px';
    if (value.offsetWidth > room) { value.style.maxWidth = room + 'px'; setClass(value, 'cut', true); }
  }

  function openAbout() {
    setClass($('settings'), 'open', false);
    st.zone = Z.ABOUT;
    renderAbout(null);
    setClass($('about'), 'open', true);
    updateFocus();
    TV.about(function (info) { if (st.zone === Z.ABOUT) renderAbout(info); });
  }

  function closeAbout() {
    setClass($('about'), 'open', false);
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].about) st.row = i;
    updateFocus();
  }

  // MARK: - Shelf editor: which apps, in what order

  function editList() {
    var ids = shelf.map(function (a) { return a.id; });
    return {ids: ids, rows: apps.slice().sort(function (a, b) {
      var ia = ids.indexOf(a.id), ib = ids.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
    })};
  }

  function renderShelfEdit() {
    var box = $('shelfedit').firstChild, e = editList();
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('apps', title);
    title.appendChild(document.createTextNode(tr('Shelf')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(e.rows.length, 7) * 78 + 'px';
    for (var i = 0; i < e.rows.length; i++) {
      var a = e.rows[i], at = e.ids.indexOf(a.id), row = el('div', 'row', holder, a.title);
      var place = el('span', 'value', row, at >= 0 ? '#' + (at + 1) : tr('shelf|Off'));
      if (at >= 0) sym('check', place).style.marginLeft = '16px';   // on the shelf: a check, as in the pickers
      hover(row, Z.EDIT, i);
    }
    el('div', 'hint', box, tr('OK adds or removes an app. ← → change the order.'));
    updateFocus();
  }

  function openShelfEdit() {
    setClass($('settings'), 'open', false);
    st.zone = Z.EDIT;
    st.edit = 0;
    renderShelfEdit();
    setClass($('shelfedit'), 'open', true);
    updateFocus();
  }

  function editShelf(dx) {
    var e = editList(), app = e.rows[st.edit];
    if (!app) return;
    var ids = e.ids.slice(), at = ids.indexOf(app.id);
    if (dx === 0) {
      if (at >= 0) ids.splice(at, 1);
      else ids.push(app.id);
    } else {
      if (at < 0) return;
      var to = Math.max(0, Math.min(ids.length - 1, at + dx));
      ids.splice(at, 1);
      ids.splice(to, 0, app.id);
    }
    Prefs.set('shelf', ids);
    pickShelf();
    renderShelf();
    var again = editList();
    for (var i = 0; i < again.rows.length; i++) if (again.rows[i].id === app.id) st.edit = i;
    renderShelfEdit();
  }

  // MARK: - Moving an app on the shelf: hold OK on it, ← → moves it, OK or Back puts it down (saved as the shelf order)

  // The press can come as keys (arrows mode) or as the Magic Remote's click (pointer mode), sometimes both at once:
  // pressStart/pressEnd are idempotent, and a held key's repeats never count as new presses.
  var HOLD_MS = 600, holdTimer = 0, moving = false, okReleased = true, pressAt = 0;

  function pressStart() {
    if (Date.now() - pressAt < 150) return;   // the same press, seen as both a key and a click
    pressAt = Date.now();
    if (moving) { if (okReleased) stopMoving(); return; }
    if (!holdable_zone() || holdTimer) return;
    okReleased = false;
    holdTimer = setTimeout(function () { holdTimer = 0; if (st.zone === Z.SHELF) startMoving(); else playTrailer(); }, HOLD_MS);
  }

  function pressEnd() {
    okReleased = true;
    if (!holdTimer) return;
    clearTimeout(holdTimer);
    holdTimer = 0;
    activate();   // a short press opens the app
  }

  function startMoving() {
    if (st.zone !== Z.SHELF || !shelf[st.shelf]) return;
    if (Prefs.get('shelfOrder', 'manual') === 'usage') { Prefs.set('shelfOrder', 'manual'); toast('Ordem dos apps: manual.'); }
    moving = true;
    setClass($('tiles').children[st.shelf], 'moving', true);
    $('tilename').textContent = '← mover →';
  }

  function moveApp(dx) {
    var to = Math.max(0, Math.min(shelf.length - 1, st.shelf + dx));
    if (to === st.shelf) return;
    var app = shelf.splice(st.shelf, 1)[0];
    shelf.splice(to, 0, app);
    st.shelf = to;
    Prefs.set('shelf', shelf.map(function (a) { return a.id; }));
    renderShelf();
    setClass($('tiles').children[st.shelf], 'moving', true);
    updateFocus();
    $('tilename').textContent = '← mover →';
  }

  function stopMoving() {
    moving = false;
    renderShelf();
    updateFocus();
    toast('Ordem dos apps salva.');
  }

  /** True when the key was handled here: OK on the shelf waits for its release (a hold starts moving). */
  var okDown = false;

  function shelfKeys(k, repeat) {
    if (k === TV.keys.ok) { repeat = repeat || okDown; okDown = true; }
    if (moving) {
      if (k === TV.keys.left) moveApp(-1);
      else if (k === TV.keys.right) moveApp(1);
      else if (k === TV.keys.back || k === 27 || k === 8) stopMoving();
      else if (k === TV.keys.ok && !repeat) pressStart();
      return true;
    }
    if (k !== TV.keys.ok || !holdable_zone()) return false;
    if (!repeat) pressStart();
    return true;
  }

  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== TV.keys.ok) return;
    okDown = false;
    pressEnd();
  });

  /** Where holding OK does something: the shelf (move the app), a pick or a search result (its trailer). */
  function holdable_zone() {
    return st.zone === Z.SHELF || st.zone === Z.CARDS || (st.zone === Z.SEARCH && srPart === 2);
  }

  /** The focused title's trailer on YouTube (the TV's app may ask once whether to play it). */
  function playTrailer() {
    playTrailerOf(st.zone === Z.CARDS ? cards[st.card] : srShown[srItem]);
  }

  function playTrailerOf(p) {
    var yt = youtubeApp();
    if (!p) return;
    if (!yt) { toast('O YouTube não está instalado nesta TV.'); return; }
    toast('Procurando o trailer de “' + p.title + '”…');
    Data.trailer(p, function (key) {
      if (!key) { toast('Não achei trailer de “' + p.title + '”.'); return; }
      launcher(yt.id, yt.title, {contentTarget: 'v=' + key})();
    });
  }

  function youtubeApp() {
    for (var i = 0; i < apps.length; i++) if (/youtube\.leanback/.test(apps[i].id)) return apps[i];
    return null;
  }

  /** A shelf tile under the pointer: press and hold moves it, a short click opens it. */
  function holdable(tile) {
    tile.onclick = null;
    tile.onmousedown = function () { tile.onmouseover(); pressStart(); };
  }

  document.addEventListener('mouseup', pressEnd);   // released off the tile (a shaky pointer) still ends the press

  // MARK: - Opening things

  /** Nuvio, when the TV has it: picks can open on its page there (Home Settings, Open picks in). LG only for now:
   *  Samsung's launch passes no data, so Nuvio would open on its Home. */
  function nuvio() {
    if (TV.name !== 'webos') return null;
    for (var i = 0; i < apps.length; i++) if (/nuvio/i.test(apps[i].id) || /^nuvio\b/i.test(apps[i].title)) return apps[i];
    return null;
  }

  function pickTarget(p) {
    if (!p) return null;
    var via = Prefs.openPicks() === 'nuvio' ? nuvio() : null;
    var app = via || Data.appFor(p.app);
    if (!app) return null;
    // Nuvio's own link for the title, as on Android (nuvio://tmdb/movie/603); webOS apps get links as contentTarget.
    return {app: app, params: via ? {contentTarget: 'nuvio://tmdb/' + (p.kind === 'tv' ? 'series' : 'movie') + '/' + p.id} : null};
  }

  function launcher(id, name, params) {
    return function () {
      TV.launch(id, params || null, function (ok) {
        if (!ok) toast(trf("Couldn't open {app}.", {app: name || id}));
        else countLaunch(id);
      });
    };
  }

  // MARK: - Most used apps and recently opened titles

  var RECENT_MAX = 12;

  function countLaunch(id) {
    var usage = Prefs.get('usage', {}), copy = {};
    for (var k in usage) if (usage.hasOwnProperty(k)) copy[k] = usage[k];
    copy[id] = (copy[id] || 0) + 1;
    Prefs.set('usage', copy);
  }

  /** Stable sort by launches, most first (Home Settings, Order of apps: Most used). */
  function byUsage(list) {
    var usage = Prefs.get('usage', {});
    return list.map(function (a, i) { return [a, i]; }).sort(function (x, y) {
      return ((usage[y[0].id] || 0) - (usage[x[0].id] || 0)) || x[1] - y[1];
    }).map(function (x) { return x[0]; });
  }

  /** Saved titles first, then the ones opened lately, without repeats: the My list tab. */
  function myList() {
    var out = [], seen = {}, all = Prefs.get('mylist', []).concat(Prefs.get('recent', []));
    for (var i = 0; i < all.length; i++) {
      var k = all[i].kind + ':' + all[i].id;
      if (seen[k] || !all[i].backdrop) continue;
      seen[k] = true;
      out.push(all[i]);
    }
    return out;
  }

  function inMyList(p) {
    var list = Prefs.get('mylist', []);
    for (var i = 0; i < list.length; i++) if (list[i].id === p.id && list[i].kind === p.kind) return true;
    return false;
  }

  function toggleMyList(p) {
    var keep = Prefs.get('mylist', []).filter(function (x) { return !(x.id === p.id && x.kind === p.kind); });
    var adding = !inMyList(p);
    if (adding) keep.unshift({id: p.id, kind: p.kind, title: p.title, poster: p.poster, backdrop: p.backdrop, app: p.app,
      service: p.service, meta: p.meta, year: p.year || '', genres: p.genres || []});
    Prefs.set('mylist', keep.slice(0, 30));
    toast(adding ? p.title + ' entrou na Minha lista.' : p.title + ' saiu da Minha lista.');
    if (TAB_KIND[st.tab] === 'mine') { cards = []; renderCards(); }
  }

  function rememberTitle(p) {
    var item = {id: p.id, kind: p.kind, title: p.title, poster: p.poster, backdrop: p.backdrop, app: p.app, service: p.service,
      meta: p.meta, year: p.year || '', genres: p.genres || []};
    var list = Prefs.get('recent', []).filter(function (r) { return !(r.id === p.id && r.kind === p.kind); });
    list.unshift(item);
    Prefs.set('recent', list.slice(0, RECENT_MAX));
  }

  function tvSettings() {
    TV.settings(function (ok) {
      if (!ok) toast(tr("Couldn't open TV Settings"));
    });
  }

  function liveTV() {
    for (var i = 0; i < inputs.length; i++) if (inputs[i].key === 'live') return inputs[i];
    return null;
  }

  function activate() {
    switch (st.zone) {
      case Z.TOP:
        if (st.top < NTABS) return;
        if (st.top === NTABS) openSearch();
        else if (st.top === NTABS + 1) openControls();
        else openSettings();
        return;
      case Z.CARDS:
        openDetail(cards[st.card]);
        return;
      case Z.SHELF:
        if (shelf[st.shelf]) launcher(shelf[st.shelf].id, shelf[st.shelf].title)();
        return;
      case Z.DRAWER:
        if (drawerItems[st.drawer]) drawerItems[st.drawer].run();
        return;
      case Z.APPS:
        if (others[st.grid]) launcher(others[st.grid].id, others[st.grid].title)();
        return;
      case Z.SETTINGS:
        if (rowsNow[st.row]) { rowsNow[st.row].step(1); if (st.zone === Z.SETTINGS) renderSettings(); }
        return;
      case Z.EDIT:
        editShelf(0);
        return;
      case Z.LANG:
        closeLanguages(true);
        return;
      case Z.CITY:
        activateCity();
        return;
      case Z.KEY:
        activateKey();
        return;
      case Z.ABOUT:
        closeAbout();
        return;
      case Z.SEARCH:
        activateSearch();
        return;
      case Z.TEAMS:
        toggleTeam();
        return;
      case Z.CTRL:
        controlRows()[ctrlRow].run(1);
        return;
      case Z.HELP:
        closeHelp();
        return;
      case Z.DETAIL:
        detailButtons()[dtButton].run();
        return;
    }
  }

  function selectTab(i) {
    if (i === st.tab) return;
    st.tab = i;
    // A tab opens at its first pick, its row at the start: at once, as on Android, not sliding from the last tab's place.
    st.card = 0;
    var holder = $('cards');
    holder.style.webkitTransition = holder.style.transition = 'none';
    renderCards();
    layoutCards();   // renderCards returns early when this tab's picks are the same
    void holder.offsetWidth;   // the row is laid out where it lands before the slide comes back
    holder.style.webkitTransition = holder.style.transition = '';
  }

  function move(dx, dy) {
    if (st.zone === Z.HELP) closeHelp();   // the guide never holds the arrows: they close it and move on
    var tiles = $('tiles').children, cardNodes = $('cards').children;
    switch (st.zone) {
      case Z.SHELF:
        if (dx) st.shelf = Math.max(0, Math.min(shelf.length - 1, st.shelf + dx));
        else if (dy > 0) { openDrawer(); return; }   // the next row: its header shows at the bottom of the screen
        else if (dy < 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = nearest(cardNodes, centerX(tiles[st.shelf])); }
          else { st.zone = Z.TOP; st.top = Data.hasKey() ? st.tab : NTABS; }
        }
        break;
      case Z.CARDS:
        if (dx) st.card = Math.max(0, Math.min(cards.length - 1, st.card + dx));
        else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
        else if (shelf.length) { st.zone = Z.SHELF; st.shelf = nearest(tiles, centerX(cardNodes[st.card])); }
        break;
      case Z.TOP:
        if (dx) {
          st.top = Math.max(Data.hasKey() ? 0 : NTABS, Math.min(NTABS + 2, st.top + dx));   // without the picks the tabs can't hold focus
          if (st.top < NTABS) selectTab(st.top);   // as on Apple TV: focusing a tab selects it
        } else if (dy > 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = Math.min(cards.length - 1, st.top < NTABS ? 0 : cards.length - 1); }
          else st.zone = Z.SHELF;
        }
        break;
      case Z.DRAWER:
        if (dx) st.drawer = Math.max(0, Math.min(drawerItems.length - 1, st.drawer + dx));
        else if (dy < 0) { closeDrawer(); return; }
        break;
      case Z.APPS:
        var g = st.grid + dx + dy * 5;
        if (g >= 0 && g < others.length && (dx === 0 || Math.floor(g / 5) === Math.floor(st.grid / 5))) st.grid = g;
        break;
      case Z.SETTINGS:
        if (dy) st.row = Math.max(0, Math.min(rowsNow.length - 1, st.row + dy));
        else if (dx && rowsNow[st.row]) {
          var r = rowsNow[st.row];
          if (r.value !== '›') { r.step(dx); if (st.zone === Z.SETTINGS) renderSettings(); }
        }
        break;
      case Z.EDIT:
        if (dy) st.edit = Math.max(0, Math.min(apps.length - 1, st.edit + dy));
        else if (dx) editShelf(dx);
        break;
      case Z.LANG:
        if (dy) st.lang = Math.max(0, Math.min(languageChoices().length - 1, st.lang + dy));
        break;
      case Z.CITY:
        if (dy) st.city = Math.max(0, Math.min(cityRows() - 1, st.city + dy));
        break;
      case Z.KEY:
        if (dy) st.key = Math.max(0, Math.min(keyRows() - 1, st.key + dy));
        break;
      case Z.SEARCH:
        moveSearch(dx, dy);
        break;
      case Z.DETAIL:
        if (dx) dtButton = Math.max(0, Math.min(detailButtons().length - 1, dtButton + dx));
        break;
      case Z.CTRL:
        if (dy) ctrlRow = Math.max(0, Math.min(controlRows().length - 1, ctrlRow + dy));
        else if (dx && controlRows()[ctrlRow].step) controlRows()[ctrlRow].step(dx);
        break;
      case Z.TEAMS:
        if (dy) tmRow = Math.max(0, Math.min(tmList.length - 1, tmRow + dy));
        else if (dx) { tmLeague = (tmLeague + dx + LEAGUES.length) % LEAGUES.length; loadTeams(); }
        break;
    }
    updateFocus();
  }

  function back() {
    if (st.zone === Z.EDIT) {
      setClass($('shelfedit'), 'open', false);
      openSettings();
      for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].shelf) st.row = i;   // back on the Shelf row, whatever follows it
      updateFocus();
      return;
    }
    if (st.zone === Z.LANG) { closeLanguages(false); return; }
    if (st.zone === Z.CITY) { closeCities(false); return; }
    if (st.zone === Z.KEY) { if (keyAsking) askRemoveKey(false); else closeKey(); return; }
    if (st.zone === Z.ABOUT) { closeAbout(); return; }
    if (st.zone === Z.SEARCH) { closeSearch(); return; }
    if (st.zone === Z.TEAMS) { closeTeams(); return; }
    if (st.zone === Z.CTRL) { closeControls(); return; }
    if (st.zone === Z.HELP) { closeHelp(); return; }
    if (st.zone === Z.DETAIL) { closeDetail(); return; }
    if (sheetOpen()) { closeSheets(); return; }
    if (st.zone === Z.DRAWER) { closeDrawer(); return; }
    if (st.zone !== Z.SHELF && shelf.length) { st.zone = Z.SHELF; updateFocus(); return; }
    // Back never leaves: LG's home would take over. The remote's Home button leaves.
    if (st.shelf > 0) { st.shelf = 0; updateFocus(); }
  }

  /** The pointer focuses what it's over (the Magic Remote, or a mouse when previewing). */
  function hover(node, zone, index) {
    node.onmouseover = function () {
      if (moving || saverOn || (sheetOpen() !== (zone === Z.APPS || zone === Z.SETTINGS || zone === Z.EDIT || zone === Z.LANG || zone === Z.CITY || zone === Z.KEY || zone === Z.ABOUT || zone === Z.SEARCH || zone === Z.TEAMS || zone === Z.CTRL || zone === Z.DETAIL))) return;
      if (zone === Z.DRAWER && st.zone !== Z.DRAWER) return;
      if (zone !== Z.DRAWER && st.zone === Z.DRAWER && zone !== Z.SHELF) return;
      if (zone === Z.TOP && index < NTABS && !Data.hasKey()) return;   // the tabs are hidden without the picks
      if (zone === Z.SHELF && st.zone === Z.DRAWER) closeDrawer();
      st.zone = zone;
      if (zone === Z.TOP) { st.top = index; if (index < NTABS) selectTab(index); }
      else if (zone === Z.CARDS) st.card = index;
      else if (zone === Z.SHELF) st.shelf = index;
      else if (zone === Z.DRAWER) st.drawer = index;
      else if (zone === Z.APPS) st.grid = index;
      else if (zone === Z.SETTINGS) st.row = index;
      else if (zone === Z.EDIT) st.edit = index;
      else if (zone === Z.LANG) st.lang = index;
      else if (zone === Z.CITY) st.city = index;
      else if (zone === Z.KEY) st.key = index;
      else if (zone === Z.TEAMS) tmRow = index;
      else if (zone === Z.CTRL) ctrlRow = index;
      else if (zone === Z.DETAIL) dtButton = index;
      else if (zone === Z.SEARCH) {
        srPart = Math.floor(index / 1000);
        if (srPart === 1) srChip = index % 1000;
        if (srPart === 2) srItem = index % 1000;
      }
      updateFocus();
    };
    node.onclick = function () { node.onmouseover(); activate(); };
  }

  // MARK: - Toast

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    setClass(t, 'on', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { setClass(t, 'on', false); }, 6000);
  }

  // MARK: - Night, clock, screensaver

  var lastNight = null;

  function checkNight() {
    var night = Data.isNight(Date.now());
    setClass(body, 'night', night);
    if (night === lastNight) return;
    lastNight = night;
    document.documentElement.style.background = night ? '#0B0B0D' : '';
    try { localStorage.setItem('fmtv.night', night ? 'true' : 'false'); } catch (e) {}   // for index.html, next start
  }

  var saverOn = false, idleAt = Date.now(), saverIndex = 0, saverTimer = 0, saverPick = null, SAVER_AFTER = 5 * 60000;

  /** "photos" (the picks' photos, as it always was) or "clock": what the screen shows when nobody touches it. */
  function saverMode() { return Prefs.saver(); }

  /** Dim, as the person picked it: off, low, medium, high, or automatic (medium from 22:00 to 07:00). */
  function dimName() {
    var v = Prefs.dim();
    return v === 'low' ? tr('dim|Low') : v === 'medium' ? tr('dim|Medium') : v === 'high' ? tr('dim|High')
      : v === 'auto' ? tr('Automatic') : tr('Off');
  }

  function dimLevel() {
    var v = Prefs.dim();
    if (v === 'auto') { var h = new Date().getHours(); return h >= 22 || h < 7 ? 2 : 0; }
    return v === 'low' ? 1 : v === 'medium' ? 2 : v === 'high' ? 3 : 0;
  }

  /** The panel's brightness is a private API: this is a black layer over the picture instead. */
  function applyDim() {
    var level = dimLevel();
    $('dim').className = 'layer' + (level ? ' d' + level : '');
  }

  /** The screensaver's photos: picks with an app on the TV. */
  function saverPhotos() {
    return Data.showcase().filter(function (p) { return p.backdrop && Data.usable(p.app); });
  }

  function showSaver() {
    var photos = saverPhotos();
    saverOn = true;
    saverPick = null;
    var s = $('saver');
    s.innerHTML = '';
    var a = el('div', 'photo', s), b = el('div', 'photo', s);
    el('div', 'shade', s);
    var clock = el('div', 'clock', s);
    el('div', 'time', clock);
    el('div', 'date', clock);
    var caption = el('div', 'caption', s), title = el('div', 'title', caption);
    var hint = el('div', 'hint', caption);
    var front = a;
    function next() {
      if (!saverOn) return;
      var p = photos.length ? photos[saverIndex++ % photos.length] : null;
      var back = front === a ? b : a;
      if (p) {
        // w1280: a 4K photo takes ~33 MB decoded, on a TV with ~150 MB free.
        back.style.backgroundImage = 'url("' + Data.image(p.backdrop, 'w1280') + '")';
        back.style.webkitTransform = back.style.transform = 'scale(1.0)';
        title.textContent = p.title;
        saverPick = p;
        // With Watch from the screensaver on, OK opens this title's app (any other key only closes).
        var target = Prefs.saverWatch() ? pickTarget(p) : null;
        hint.textContent = target ? trf('Press OK to watch on {app} · any other button to close', {app: target.app.title}) : '';
        setTimeout(function () {
          setClass(back, 'on', true);
          setClass(front, 'on', false);
          back.style.webkitTransform = back.style.transform = 'scale(1.08) translateX(-1.5%)';
          front = back;
        }, 60);
      }
      tickSaverClock(clock);
      saverTimer = setTimeout(next, 12000);
    }
    setClass(s, 'on', true);
    next();
  }

  function tickSaverClock(clock) {
    var d = new Date();
    clock.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    clock.children[1].textContent = formatDate('format|EEEE, MMMM d', d.getTime());
  }

  function hideSaver() {
    saverOn = false;
    clearTimeout(saverTimer);
    setClass($('saver'), 'on', false);
  }

  // MARK: - The clock screensaver: a clock, the date and the weather, drifting slowly for OLED panels

  var ambientOn = false, ambientTimer = 0;

  function showAmbient() {
    if (ambientOn) return;
    var a = $('ambient');
    a.innerHTML = '';
    var shift = el('div', 'shift', a);
    el('div', 'clock', shift);
    el('div', 'date', shift);
    var side = el('div', 'side', shift);
    el('div', 'temp', side);
    el('div', 'cond', side);
    ambientOn = true;
    setClass(a, 'on', true);
    ambientTimer = setInterval(tickAmbient, 30000);
    tickAmbient();
  }

  function tickAmbient() {
    if (!ambientOn) return;
    var a = $('ambient'), d = new Date(), w = Prefs.weather() ? Data.weather : null;
    a.querySelector('.clock').textContent = formatDate('format|h:mm', d.getTime());
    a.querySelector('.date').textContent = formatDate('format|EEEE, MMMM d', d.getTime());
    // The forecast as it is now (a new one comes every 30 minutes), and only with the weather card on, as on Android.
    a.querySelector('.temp').textContent = w ? Data.degrees(w.temp) : '';
    a.querySelector('.cond').textContent = w ? Data.condition(w.code, w.isDay) : '';
    // A clock that never moves burns into an OLED: the drift of Android's clock without photos (40 × 26 px, 10 minutes).
    var phase = 2 * Math.PI * (d.getTime() / 1000 % 600) / 600, shift = a.querySelector('.shift');
    shift.style.webkitTransform = shift.style.transform =
      'translate(' + Math.round(40 * Math.sin(phase)) + 'px,' + Math.round(26 * Math.sin(2 * phase + 0.7)) + 'px)';
  }

  function hideAmbient() {
    ambientOn = false;
    clearInterval(ambientTimer);
    setClass($('ambient'), 'on', false);
  }

  function poke(ok) {
    idleAt = Date.now();
    if (ambientOn) { hideAmbient(); return true; }
    if (!saverOn) return false;
    var target = ok && Prefs.saverWatch() ? pickTarget(saverPick) : null;
    hideSaver();
    if (target) launcher(target.app.id, target.app.title, target.params)();
    return true;
  }

  // MARK: - Keys

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (poke(k === TV.keys.ok)) { e.preventDefault(); return; }   // the first press only wakes the screen (or OK watches)
    if (typing(k)) return;
    if (shelfKeys(k, e.repeat)) { e.preventDefault(); return; }
    if (k === TV.keys.left) move(-1, 0);
    else if (k === TV.keys.right) move(1, 0);
    else if (k === TV.keys.up) move(0, -1);
    else if (k === TV.keys.down) move(0, 1);
    else if (k === TV.keys.ok) activate();
    else if (k === TV.keys.back || k === 27 || k === 8) back();
    else return;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function () { poke(); });

  /**
   * In a text field, the keys type (← → move in the text, Delete erases). OK or the keyboard's Done searches (or saves); Back,
   * its Cancel or ↑ ↓ leave the field. Samsung's keyboard sends Done as 65376 and Cancel as 65385. True: handled here.
   */
  function typing(k) {
    var sheet = st.zone === Z.CITY ? 'citypick' : st.zone === Z.KEY ? 'keypick' : st.zone === Z.SEARCH ? 'searchpage' : '';
    if (!sheet || !typingIn(sheet)) return false;
    if (k === TV.keys.ok || k === 65376) {
      if (st.zone === Z.CITY) searchCity(); else if (st.zone === Z.SEARCH) runSearch(); else saveKey();
    }
    else if (k === TV.keys.back || k === 27 || k === 65385) { closeField(sheet); updateFocus(); }
    else if (k === TV.keys.up || k === TV.keys.down) { closeField(sheet); move(0, k === TV.keys.up ? -1 : 1); }
    return true;   // anything else types into the field
  }

  // MARK: - Start

  function renderAll() {
    renderTop();
    renderQuotes();
    cards = [];
    renderCards();
    renderShelf();
    renderDrawer();
    renderClock();
    checkNight();
    if (st.zone === Z.SETTINGS) renderSettings();
    updateFocus();
  }

  /** hide_apps in config.properties: left out of the shelf, All Apps and the picks, by id or name (part of it). */
  var HIDE = (CONFIG.hideApps || []).map(function (s) { return s.toLowerCase(); });
  function hidden(app) {
    var id = (app.id || '').toLowerCase(), title = (app.title || '').toLowerCase();
    for (var i = 0; i < HIDE.length; i++) if (id.indexOf(HIDE[i]) >= 0 || title.indexOf(HIDE[i]) >= 0) return true;
    return false;
  }

  function loadApps(done) {
    TV.apps(function (list) {
      apps = list.filter(function (a) { return !hidden(a); });
      Data.setApps(apps);
      pickShelf();
      TV.inputs(function (list2) {
        inputs = list2;
        if (done) done();
      });
    });
  }

  /** Back to the home screen (the app was opened again): the shelf, everything closed, the first tab at its first pick. */
  function reset() {
    hideSaver();
    hideAmbient();
    closeSheets();
    st.zone = Z.SHELF;
    st.shelf = 0;
    st.card = 0;
    selectTab(0);
    updateFocus();
    restInDrawer();   // drawer_first: out again at once, not only after the TV lists its apps
  }

  Data.onChange(function () {
    renderQuotes();
    renderCards();
    renderPanels();
    checkNight();
  });

  /** drawer_first: the home screen rests with the drawer open (shelf in the middle, inputs and weather below). */
  function restInDrawer() {
    if (!CONFIG.drawerFirst || !drawerItems.length || st.zone !== Z.SHELF) return;
    st.zone = Z.DRAWER;
    st.drawer = 0;
    updateFocus();
  }

  function reopened() {
    // LG: with handlesRelaunch the app has to come to the front itself, or opening it again while it runs shows nothing.
    if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
    reset();
    loadApps(function () { renderShelf(); renderDrawer(); restInDrawer(); Data.refresh(); });
  }

  window.addEventListener('resize', fit);
  document.addEventListener('webOSRelaunch', reopened);   // LG: opened again while running
  window.addEventListener('appcontrol', reopened);        // Samsung: the same
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hideSaver(); hideAmbient(); releaseImages(); if (st.zone === Z.SEARCH) closeSearch(); return; }
    idleAt = Date.now();
    restoreImages();
    okDown = false;   // a key held while another app took over never sends its keyup here
    loadApps(function () { renderShelf(); renderDrawer(); updateFocus(); Data.refresh(); });
  });

  I18N.set(Prefs.language());
  checkNight();   // now, from the last forecast: not after the TV lists its apps, with the day look until then
  // LG's screensaver waits only when ours will show: not under a sheet (ours waits there), and not without photos.
  TV.holdScreenSaver(function () { return !sheetOpen() && (saverMode() === 'clock' || saverPhotos().length > 0); });
  fit();
  renderTop();
  applyDim();
  tickClock();
  applyAccent();
  applyExtras();
  restoreBackup();
  Prefs.onSave(backupSoon);
  // LG's home never stays: the service brings Free My TV back (Home Settings can turn it off).
  TV.service('backHome', {on: Prefs.get('backHome', true)});
  pollF1();
  pollFootball();
  pollStats();
  pollInfo();
  setInterval(pollInfo, INFO_EVERY);
  setInterval(showNews, NEWS_EVERY);
  setInterval(pollF1, 6 * 3600000);
  setInterval(rotatePick, ROTATE_EVERY);
  renewDevMode();
  setInterval(renewDevMode, 6 * 3600000);   // the service renews only once a day; this keeps the days shown fresh
  setInterval(pollStats, STATS_EVERY);
  loadApps(function () {
    renderAll();
    restInDrawer();
    Data.refresh();
  });
  setInterval(function () {
    checkNight();
    Data.refresh();
    applyDim();   // automatic: medium from 22:00, off again at 07:00
    if (!saverOn && !ambientOn && !sheetOpen() && Date.now() - idleAt > SAVER_AFTER) {
      if (saverMode() === 'clock') showAmbient(); else showSaver();
    }
    if (saverOn) tickSaverClock($('saver').querySelector('.clock'));
    if (ambientOn) tickAmbient();
  }, 30000);

  // For the browser preview and tests.
  window.FreeMyTV = {state: st, move: move, activate: activate, back: back, showSaver: showSaver, hideSaver: hideSaver, toast: toast,
    showAmbient: showAmbient, hideAmbient: hideAmbient, applyDim: applyDim, showFootball: showFootball,
    setInfo: function (h, r) { news = h; rates = r; showNews(); }, setF1: function (r) { f1Race = r; }};
})();
