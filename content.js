/*!
 * content.js — Sanskrit Sandhi Search, in-page find-on-page.
 *
 * Reads the current page's text (grouped by block element), runs the sandhi engine,
 * and highlights matches in place with count + prev/next navigation. All local; no
 * network, no tokens. UI lives in a shadow root so page CSS can't break it.
 */
(function () {
  'use strict';
  if (window.__sktSearchLoaded) return;      // guard against double injection
  window.__sktSearchLoaded = true;

  var SS = window.SanskritSearch, HL = window.SanskritHighlight;
  if (!SS || !HL) { console.error('[skt-search] engine not loaded'); return; }

  var HL_CLASS = 'skt-hl', HL_ATTR = 'data-skt-mid';
  var matches = [];      // [{mid, firstMark}] in document order
  var active = -1;
  var fuzzyActive = false;   // true when any "possible" (dashed) matches are shown
  var exactN = 0, possibleN = 0;   // counts for the current search (solid vs dashed)
  var bar = null, input = null, modeSel = null, countEl = null;

  // ---- page-level style for our <mark>s (light DOM, so needs !important).
  // Fill colors are set INLINE per mark (chosen to contrast the actual background behind it);
  // this rule only provides padding + a background-independent ring on the active match.
  function ensurePageStyle() {
    if (document.getElementById('skt-hl-style')) return;
    var st = document.createElement('style');
    st.id = 'skt-hl-style';
    st.textContent =
      'mark.' + HL_CLASS + '{padding:0 1px !important;border-radius:2px;}' +
      'mark.' + HL_CLASS + '.skt-fuzzy{outline:1px dashed rgba(0,0,0,.5) !important;outline-offset:1px;}' +
      'mark.' + HL_CLASS + '.skt-active{outline:2px solid #111 !important;outline-offset:1px;}';
    (document.head || document.documentElement).appendChild(st);
  }

  // ---- adaptive highlight color: pick a palette entry that contrasts the background behind a match ----
  function parseRGB(s) { var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(s || ''); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; }
  function effectiveBg(el) {                                   // first non-transparent background up the ancestor chain
    for (var e = el; e && e.nodeType === 1; e = e.parentElement) {
      var c = parseRGB(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0.1) return [c[0], c[1], c[2]];
    }
    return [255, 255, 255];
  }
  function lum(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function dist2(a, b) { var r = a[0] - b[0], g = a[1] - b[1], bl = a[2] - b[2]; return r * r + g * g + bl * bl; }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  var PALETTE = [                                             // {base fill, active fill} — spread across hues
    { bg: [255, 213, 79], act: [245, 127, 23] },   // amber
    { bg: [79, 195, 247], act: [2, 119, 189] },    // blue
    { bg: [149, 117, 205], act: [81, 45, 168] },   // purple
    { bg: [129, 199, 132], act: [27, 94, 32] },    // green
    { bg: [240, 98, 146], act: [173, 20, 87] }     // pink
  ];
  function chooseColors(el) {
    var pbg = effectiveBg(el), best = PALETTE[0];             // prefer the familiar amber…
    if (dist2(PALETTE[0].bg, pbg) < 12000) {                  // …but if amber is too close to this bg, pick the farthest palette color (e.g. blue on an orange section)
      var bd = -1;
      for (var i = 0; i < PALETTE.length; i++) { var d = dist2(PALETTE[i].bg, pbg); if (d > bd) { bd = d; best = PALETTE[i]; } }
    }
    return { base: rgb(best.bg), act: rgb(best.act), baseFg: lum(best.bg) > 140 ? '#000' : '#fff', actFg: '#fff' };
  }

  // ---- text collection: group text nodes by nearest block-level ancestor ----
  var BLOCK = { P: 1, DIV: 1, LI: 1, TD: 1, TH: 1, BLOCKQUOTE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, SECTION: 1, ARTICLE: 1, DD: 1, DT: 1, FIGCAPTION: 1, PRE: 1, MAIN: 1, ASIDE: 1, CAPTION: 1, BODY: 1 };
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, HEAD: 1 };
  var container = null; // our own UI host (excluded from search)

  function nearestBlock(node) {
    var el = node.parentElement;
    while (el && !BLOCK[el.tagName] && el !== document.body) el = el.parentElement;
    return el || document.body;
  }
  function skippable(node) {
    for (var el = node.parentElement; el; el = el.parentElement) {
      if (SKIP[el.tagName]) return true;
      if (container && el === container) return true;
    }
    return false;
  }
  // is this element actually visible? checkVisibility() (Chrome) catches display:none,
  // visibility:hidden, opacity:0 and content-visibility — SPAs use all of these for duplicate
  // / off-screen copies. Falls back to a client-rect test on older engines.
  function elVisible(el) {
    if (!el) return false;
    if (typeof el.checkVisibility === 'function')
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true });
    return el.getClientRects().length > 0;
  }
  // returns Map<blockEl, [textNode,...]> in document order
  function collectBlocks() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.data || !/\S/.test(n.data)) return NodeFilter.FILTER_REJECT;
        if (skippable(n)) return NodeFilter.FILTER_REJECT;
        // skip text in hidden subtrees — SPAs render duplicate/off-screen copies; highlighting
        // them inflates the count and traps Next on invisible nodes.
        if (!elVisible(n.parentElement)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var groups = new Map(), tn;
    while ((tn = walker.nextNode())) {
      var blk = nearestBlock(tn);
      var arr = groups.get(blk);
      if (!arr) { arr = []; groups.set(blk, arr); }
      arr.push(tn);
    }
    return groups;
  }

  // ---- highlighting ----
  function clearHighlights() {
    var marks = document.querySelectorAll('mark.' + HL_CLASS), parents = new Set();
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i], p = m.parentNode;
      if (!p) continue;
      p.replaceChild(document.createTextNode(m.textContent), m);
      parents.add(p);
    }
    parents.forEach(function (p) { try { p.normalize(); } catch (e) {} });
    matches = []; active = -1;
  }

  // wrap one text node given its non-overlapping ascending segments [{start,end,mid,fuzzy}]
  function wrapNode(node, segs) {
    var text = node.data, frag = document.createDocumentFragment(), pos = 0;
    var col = chooseColors(node.parentElement);   // all marks in this node share the node's background
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, s.start)));
      var mk = document.createElement('mark');
      mk.className = HL_CLASS + (s.fuzzy ? ' skt-fuzzy' : '');   // fuzzy = high-recall/possible match (dashed outline)
      mk.setAttribute(HL_ATTR, String(s.mid));
      mk.setAttribute('data-skt-base', col.base); mk.setAttribute('data-skt-act', col.act);
      mk.setAttribute('data-skt-bfg', col.baseFg); mk.setAttribute('data-skt-afg', col.actFg);
      mk.style.setProperty('background', col.base, 'important');
      mk.style.setProperty('color', col.baseFg, 'important');
      mk.textContent = text.slice(s.start, s.end);
      frag.appendChild(mk);
      pos = s.end;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode.replaceChild(frag, node);
  }

  function spansOverlap(a, list) {   // does [start,end] a overlap any span in list?
    for (var i = 0; i < list.length; i++) { if (a[0] < list[i][1] && list[i][0] < a[1]) return true; }
    return false;
  }
  function rebuildMatchList() {   // ordered match list from the DOM (document order)
    matches = [];
    var all = document.querySelectorAll('mark.' + HL_CLASS), seen = {};
    for (var k = 0; k < all.length; k++) {
      var m = all[k].getAttribute(HL_ATTR);
      if (!seen[m]) { seen[m] = 1; matches.push(all[k]); }
    }
  }
  // sandhi is ADDITIVE: exact hits render SOLID; every EXTRA high-recall candidate renders
  // DASHED ("possible") — always, and consistent whether or not the page also happens to contain
  // an exact form (e.g. a pada-split अस्त्रियाम् next to the fused sūtra गुणेऽस्त्रियाम्).
  function runSearch() {
    clearHighlights();
    var raw = input.value.trim();
    if (!raw) { exactN = possibleN = 0; fuzzyActive = false; updateCount(); return; }
    ensurePageStyle();
    var mode = modeSel.value;
    var precise = null, wide = null;
    if (mode === 'sandhi') { precise = SS.expandQuery(raw, 'sandhi'); wide = SS.expandQuery(raw, 'sandhi', true); }
    else precise = SS.expandQuery(raw, mode);                                   // loose / exact: precise only
    var groups = collectBlocks();
    var perNode = new Map();   // textNode -> [{start,end,mid,fuzzy}]
    var mid = 0; exactN = 0; possibleN = 0;
    groups.forEach(function (nodes) {
      var surface = '', idx = [];
      for (var i = 0; i < nodes.length; i++) {
        var d = nodes[i].data;
        for (var j = 0; j < d.length; j++) { surface += d[j]; idx.push({ node: nodes[i], off: j }); }
      }
      var exactSpans = precise ? HL.findSpans(surface, precise, SS) : [];
      var allSpans = wide ? HL.findSpans(surface, wide, SS) : exactSpans;
      for (var s = 0; s < allSpans.length; s++) {
        var a = allSpans[s][0], b = allSpans[s][1];
        var isFuzzy = (mode === 'sandhi') ? !spansOverlap(allSpans[s], exactSpans) : false;
        if (isFuzzy) possibleN++; else exactN++;
        var thisMid = mid++, cur = null;
        for (var c = a; c < b; c++) {
          var e = idx[c];
          if (cur && cur.node === e.node && e.off === cur.end) { cur.end = e.off + 1; }
          else { if (cur) pushSeg(perNode, cur); cur = { node: e.node, start: e.off, end: e.off + 1, mid: thisMid, fuzzy: isFuzzy }; }
        }
        if (cur) pushSeg(perNode, cur);
      }
    });
    perNode.forEach(function (segs, node) {
      segs.sort(function (x, y) { return x.start - y.start; });
      wrapNode(node, segs);
    });
    fuzzyActive = possibleN > 0;
    rebuildMatchList();
    active = matches.length ? 0 : -1;
    updateCount();
    if (active >= 0) focusMatch(active, true);
  }
  function pushSeg(map, seg) {
    var arr = map.get(seg.node);
    if (!arr) { arr = []; map.set(seg.node, arr); }
    arr.push(seg);
  }

  function focusMatch(i, scroll) {
    var prev = document.querySelectorAll('mark.' + HL_CLASS + '.skt-active');
    for (var p = 0; p < prev.length; p++) {                         // restore base fill on the previously-active match
      prev[p].classList.remove('skt-active');
      prev[p].style.setProperty('background', prev[p].getAttribute('data-skt-base'), 'important');
      prev[p].style.setProperty('color', prev[p].getAttribute('data-skt-bfg'), 'important');
    }
    if (i < 0 || i >= matches.length) return;
    var target = matches[i], mid = target.getAttribute(HL_ATTR);
    var sameMid = document.querySelectorAll('mark.' + HL_CLASS + '[' + HL_ATTR + '="' + mid + '"]');
    for (var q = 0; q < sameMid.length; q++) {                      // active match → its darker variant + ring
      sameMid[q].classList.add('skt-active');
      sameMid[q].style.setProperty('background', sameMid[q].getAttribute('data-skt-act'), 'important');
      sameMid[q].style.setProperty('color', sameMid[q].getAttribute('data-skt-afg'), 'important');
    }
    if (scroll) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateCount();
  }
  function step(delta) {
    if (!matches.length) return;
    active = (active + delta + matches.length) % matches.length;
    focusMatch(active, true);
  }
  function updateCount() {
    if (!countEl) return;
    if (!matches.length) {
      countEl.textContent = input.value.trim() ? '0' : '';
      countEl.style.color = '#666'; countEl.title = '';
      return;
    }
    var label = (active + 1) + ' / ' + matches.length;
    if (possibleN > 0) label += (exactN > 0) ? ' · ' + possibleN + ' possible' : ' possible';
    countEl.textContent = label;
    countEl.style.color = (possibleN > 0) ? '#b45309' : '#666';   // amber signals possible (dashed) hits
    countEl.title = (possibleN > 0) ? possibleN + ' possible (sandhi-fuzzy) match(es), shown dashed — add a word to refine.' : '';
  }

  // ---- UI (shadow root) ----
  function buildBar() {
    container = document.createElement('div');
    container.id = 'skt-search-host';
    container.style.cssText = 'all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;';
    var root = container.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      '.bar{font:14px/1.4 system-ui,sans-serif;background:#fff;color:#222;border:1px solid #ccc;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.18);padding:6px;display:flex;align-items:center;gap:6px;}' +
      'input.q{font:15px system-ui,sans-serif;padding:5px 8px;border:1px solid #bbb;border-radius:6px;width:230px;outline:none;}' +
      'input.q:focus{border-color:#ff8f00;}' +
      'select.mode{font:13px system-ui;padding:4px;border:1px solid #bbb;border-radius:6px;}' +
      '.count{min-width:52px;text-align:center;color:#666;white-space:nowrap;font-variant-numeric:tabular-nums;}' +
      'button{font:14px system-ui;cursor:pointer;border:1px solid #bbb;background:#f6f6f6;border-radius:6px;padding:4px 8px;}' +
      'button:hover{background:#eee;}' +
      '.x{border:none;background:none;color:#888;font-size:16px;padding:2px 4px;}' +
      '</style>' +
      '<div class="bar">' +
      '<input class="q" placeholder="Sanskrit search — ITRANS or देवनागरी" spellcheck="false"/>' +
      '<select class="mode" title="sandhi: exact hits + possible (dashed) sandhi-fuzzy candidates · loose: space-insensitive · exact"><option value="sandhi">sandhi</option><option value="loose">loose</option><option value="exact">exact</option></select>' +
      '<span class="count"></span>' +
      '<button class="prev" title="Previous (Shift+Enter)">▲</button>' +
      '<button class="next" title="Next (Enter)">▼</button>' +
      '<button class="x" title="Close (Esc)">✕</button>' +
      '</div>';
    (document.documentElement || document.body).appendChild(container);

    input = root.querySelector('.q');
    modeSel = root.querySelector('.mode');
    countEl = root.querySelector('.count');

    var deb;
    input.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(runSearch, 350); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (matches.length && document.querySelector('mark.' + HL_CLASS)) step(e.shiftKey ? -1 : 1); else runSearch(); }
      else if (e.key === 'Escape') { e.preventDefault(); hide(); }
    });
    modeSel.addEventListener('change', runSearch);
    root.querySelector('.next').addEventListener('click', function () { step(1); });
    root.querySelector('.prev').addEventListener('click', function () { step(-1); });
    root.querySelector('.x').addEventListener('click', hide);
  }

  function show() {
    if (!bar) { buildBar(); bar = container; }
    container.style.display = '';
    input.focus(); input.select();
  }
  function hide() {
    clearHighlights();
    if (container) container.style.display = 'none';
  }
  function toggle() {
    if (!bar || container.style.display === 'none') show();
    else hide();
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'toggle') { toggle(); sendResponse && sendResponse({ ok: true }); }
    return false;
  });
})();
