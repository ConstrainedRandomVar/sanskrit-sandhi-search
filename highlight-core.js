/*!
 * highlight-core — DOM-free span finder for the Sanskrit search extension.
 *
 * Given a block's plain-text `surface` and an expanded query, returns the merged
 * [start, end) character spans in `surface` that should be highlighted — using the
 * SAME candidate set the engine's snippet()/matches() use, mapped back to original
 * offsets via SanskritSearch.normMap. Pure logic (no DOM), so it's unit-testable in
 * node and reusable by the content script.
 *
 * Loadable as a classic <script> (sets window.SanskritHighlight) or require()d in node.
 */
(function (global, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.SanskritHighlight = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Candidate surface forms to locate, mirroring engine snippet()/matches() per mode.
  // {s: string, drop: bool} — drop=true searches the space-dropped index.
  function candidatesFor(ex) {
    var m = ex.mode;
    if (m === 'exact') return [{ s: ex.qn, drop: false }];
    if (m === 'loose') return [{ s: ex.qn, drop: false }, { s: ex.qnc, drop: true }];
    if (m === 'cooccur') return [];                        // co-occurrence highlighting not in v1
    if (ex.stems.length <= 1) return [                     // single-word sandhi
      { s: ex.stems[0], drop: false }, { s: ex.mls, drop: false },
      { s: ex.stems[0], drop: true }, { s: ex.mls, drop: true }, { s: ex.mlsA, drop: true },
      { s: ex.nasalA, drop: false }, { s: ex.nasalA, drop: true }   // word-final nasal → anusvāra (kurvan → कुर्वं)
    ];
    var list = [                                           // multi-word sandhi (same set snippet() tries)
      { s: ex.spaced, drop: false }, { s: ex.joined, drop: true }, { s: ex.joinedStem, drop: true },
      { s: ex.joinedCore, drop: true }, { s: ex.abut, drop: true }, { s: ex.spacedM, drop: false },
      { s: ex.joinedM, drop: true }, { s: ex.joinedMStem, drop: true }, { s: ex.joinedMCore, drop: true },
      { s: ex.abutM, drop: true }
    ];
    for (var i = 0; i < ex.combos.length; i++) list.push({ s: ex.combos[i], drop: true });
    return list;
  }

  // Find all merged highlight spans in `surface` for query `ex`. SS = SanskritSearch.
  // Returns [[start,end], ...] (original-string indices), non-overlapping, ascending.
  function findSpans(surface, ex, SS) {
    if (!surface) return [];
    var r = SS.normMap(surface), n = r.n, map = r.map;
    // space-dropped view of the same normalization, with its own back-map
    var n2 = '', map2 = [];
    for (var i = 0; i < n.length; i++) { if (n[i] !== ' ') { n2 += n[i]; map2.push(map[i]); } }
    map2.push(surface.length);

    var cands = candidatesFor(ex), spans = [];
    for (var ci = 0; ci < cands.length; ci++) {
      var c = cands[ci];
      if (!c.s) continue;
      var hay = c.drop ? n2 : n, mp = c.drop ? map2 : map, from = 0;
      while (true) {
        var k = hay.indexOf(c.s, from);
        if (k < 0) break;
        from = k + 1;
        if (!c.drop && k !== 0 && hay[k - 1] !== ' ') continue;   // space-preserving: require word boundary (mirrors stemMatch)
        var start = mp[k], end = mp[Math.min(k + c.s.length, mp.length - 1)];
        if (SS.extendEnd) end = SS.extendEnd(surface, end);   // swallow trailing ्/ं/ः/mātrā so stem matches don't leave a dangling sign
        if (end > start) spans.push([start, end]);
      }
    }
    if (!spans.length) return [];
    spans.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var merged = [];
    for (var j = 0; j < spans.length; j++) {
      var s = spans[j];
      if (merged.length && s[0] <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], s[1]);
      else merged.push([s[0], s[1]]);
    }
    return merged;
  }

  return { candidatesFor: candidatesFor, findSpans: findSpans };
});
