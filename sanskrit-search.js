/*!
 * sanskrit-search — orthography-, space- & sandhi-tolerant matching for Devanāgarī text.
 *
 * Zero dependencies. DOM-free. Loadable as a classic <script src> (works from file://)
 * AND via Node `require` (UMD-lite). The consuming page keeps its own UI/index/filters;
 * this module owns normalization, sandhi query-expansion, matching, and highlighting.
 *
 * PHILOSOPHY: high RECALL for search, not linguistic generation. Rules deliberately
 * over-generate candidate surface forms; documented approximations are acceptable.
 *
 * RULE CATALOG (see functions for detail):
 *   normalize / normMap  — ONE shared core `_norm`:
 *       · NFC · drop ZWJ/ZWNJ/avagraha · candrabindu ँ → anusvāra
 *       · varga-nasal (ङञणनम) + halant + consonant → anusvāra  (idempotent; nested clusters; also across a word-boundary space, so अदेङ् गुणः ≡ अदेंगुणः)
 *       · word-final म् → anusvāra
 *       · daṇḍa ।॥ → space · drop non-Devanāgarī · collapse/trim spaces
 *   stripSandhi   — strip trailing visarga/anusvāra/candrabindu/halant → stem
 *   matraLead     — vowel-initial word absorbed onto a preceding consonant as a mātrā (left edge)
 *   vowelSandhi   — yaṇ · guṇa/vṛddhi/savarṇa · pūrvarūpa (e/o+a) · ayādi/āvādi (e/o/ai/au + non-a)
 *   sandhiJoin    — halant+V→mātrā · dental त्/द्+C external sandhi (ścutva/ṣṭutva/voicing) ·
 *                   word-final -ṃ(=-m)+V→m+mātrā · visarga (o/ā, sibilants, retained, hiatus)
 *   expandQuery/matches/snippet — per-mode candidate build, boolean match, highlighted snippet
 *
 * KNOWN, DELIBERATE LIMITATIONS (locked by tests, do NOT "fix" without discussion):
 *   · visarga before ś/ṣ/s is RETAINED (रामः शेते), not assimilated — matches corpus orthography.
 *   · consonant-final external sandhi covers dental त्/द्, word-final न्, and क्/ट्/प्; word-final ङ्/ण् get no न्-style sibilant insertion (narrow: before c/t/ṭ they abut; doubling before vowels IS done).
 *   · ayādi (e/o + non-a vowel) uses the elided a+V form only (corpus uses it ~50:1); āvādi (ai/au) is full (semivowel + elided).
 */
(function (global, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.SanskritSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- shared tables ----
  var isCons = function (c) { return c >= 'क' && c <= 'ह'; };
  // independent vowel -> its mātrā (WITH अ -> '' , for external vowel sandhi)
  var IM = { 'अ': '', 'आ': 'ा', 'इ': 'ि', 'ई': 'ी', 'उ': 'ु', 'ऊ': 'ू', 'ऋ': 'ृ', 'ए': 'े', 'ऐ': 'ै', 'ओ': 'ो', 'औ': 'ौ' };
  // independent vowel -> mātrā, WITHOUT अ (leading-अ is too noisy on its own; see matraLead)
  var IMATRA = { 'आ': 'ा', 'इ': 'ि', 'ई': 'ी', 'उ': 'ु', 'ऊ': 'ू', 'ऋ': 'ृ', 'ॠ': 'ॄ', 'ऌ': 'ॢ', 'ए': 'े', 'ऐ': 'ै', 'ओ': 'ो', 'औ': 'ौ' };
  var NAS = 'ङञणनम';
  var SKIP = function (c) { return c === '‌' || c === '‍' || c === 'ऽ'; }; // ZWNJ, ZWJ, avagraha
  var M1 = '\u0001', M2 = '\u0002'; // highlight sentinels (consumer replaces with <mark>/</mark>)

  // ---- ONE normalization core → both normalize() and normMap() (A1/A2/A5) ----
  // Returns {n, map}: n = normalized string; map[k] = index in the ORIGINAL string of n[k]
  // (map[n.length] = str.length sentinel), for index-mapped highlighting.
  function _norm(str) {
    str = str.normalize('NFC');
    var n = '', map = [];
    // next index >= k whose char is not skippable (lets nasal lookahead see past ZWJ/ZWNJ) (A2)
    var peek = function (k) { while (k < str.length && SKIP(str[k])) k++; return k; };
    // like peek but also skips whitespace — so a word-final nasal+halant collapses to anusvāra even
    // across a space (अदेङ् गुणः ≡ अदेंगुणः), keeping the space-dropped index consistent with sandhi'd queries.
    var peekC = function (k) { while (k < str.length && (SKIP(str[k]) || /\s/.test(str[k]))) k++; return k; };
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (SKIP(c)) continue;
      if (c === 'ँ') { n += 'ं'; map.push(i); continue; }                    // candrabindu → anusvāra
      if (NAS.indexOf(c) >= 0) {                                             // varga-nasal + halant + consonant
        var h = peek(i + 1);
        if (str[h] === '्') {
          var cc = peekC(h + 1);
          if (isCons(str[cc])) { n += 'ं'; map.push(i); i = h; continue; }   // → anusvāra; consume through halant (A1: left-to-right handles nested clusters; peekC also skips a word-boundary space)
        }
      }
      if (c === 'म') {                                                       // word-final म् (or म् + non-consonant) → anusvāra
        var mh = peek(i + 1);
        if (str[mh] === '्') { n += 'ं'; map.push(i); i = mh; continue; }
      }
      if (c === '।' || c === '॥' || /\s/.test(c)) {                          // daṇḍa / whitespace → single space
        if (n && n.charAt(n.length - 1) !== ' ') { n += ' '; map.push(i); }
        continue;
      }
      if (c < 'ऀ' || c > 'ॿ') continue;                                     // drop non-Devanāgarī
      n += c; map.push(i);
    }
    while (n.charAt(n.length - 1) === ' ') { n = n.slice(0, -1); map.pop(); } // A5: trim trailing space so normMap(x).n === normalize(x)
    map.push(str.length);
    return { n: n, map: map };
  }
  function normalize(s, drop) { var n = _norm(s).n; return drop ? n.replace(/ /g, '') : n; }
  function normMap(str) { return _norm(str); }

  // strip trailing sandhi-mutable chars: visarga, anusvāra, candrabindu, halant
  function stripSandhi(w) { return w.replace(/[ःंँ्]+$/, ''); }

  // a word beginning with an independent vowel can fuse onto a PRECEDING consonant as a mātrā
  // (phalam + upakṣīṇaṃ -> phalamupakṣīṇaṃ; initial उ → ु on म). Boundary-safe: a mātrā only
  // occurs right after a consonant. Excludes leading अ (see leadA in expandQuery).
  function matraLead(w) { return w && IMATRA[w[0]] !== undefined ? IMATRA[w[0]] + w.slice(1) : null; }

  // extend a highlight END over trailing Devanāgarī dependent signs (mātrās, virāma,
  // anusvāra, visarga, candrabindu, nukta, accents) so a stem match (which strips a
  // trailing ्/ं/ः) or an inflected match doesn't leave a dangling sign / half-akṣara
  // outside the highlight (पूर्वमर्षत → also covers the final ्).
  function extendEnd(surface, end) {
    while (end < surface.length) {
      var o = surface.charCodeAt(end);
      if ((o >= 0x0900 && o <= 0x0903) || o === 0x093C || (o >= 0x093E && o <= 0x094D) || (o >= 0x0951 && o <= 0x0957) || (o >= 0x0962 && o <= 0x0963)) end++;
      else break;
    }
    return end;
  }

  // a word-final varga-nasal (न्/ङ्/ण्) doubles before a vowel and then normalizes to
  // anusvāra (kurvan + eva → kurvann → कुर्वंन), so a bare query ending in such a nasal
  // must ALSO try the anusvāra form to find its own word when it is sandhi'd in text.
  // Length-gated (base ≥ 4) so short words (सन् → सं) don't flood the index.
  function nasalAnusvara(w) {
    return (/[नङण]्$/.test(w) && w.length - 2 >= 4) ? w.slice(0, -2) + 'ं' : '';
  }

  // external VOWEL sandhi: a (vowel/consonant-final) + b (vowel-initial)
  function vowelSandhi(a, b, elideAv) {
    if (!a) return b; if (!b) return a;
    if (!(b[0] in IM)) return a + b;                                         // b must start with independent vowel
    var mc = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'R', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au' };
    var ic = { 'अ': 'a', 'आ': 'a', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ऋ': 'R', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au' };
    var lc = a[a.length - 1], vc, base;
    if (mc[lc] !== undefined) { vc = mc[lc]; base = a.slice(0, -1); }
    else if (isCons(lc)) { vc = 'a'; base = a; }
    else if (ic[lc] !== undefined) { vc = ic[lc]; base = a.slice(0, -1); }
    else return a + b;                                                       // ends in halant/other → no vowel sandhi
    var bRest = b.slice(1), semi = { i: 'य', u: 'व', R: 'र' }, longm = { i: 'ी', u: 'ू', R: 'ॄ' };
    if (semi[vc]) {                                                          // i/u/ṛ (ik) final
      if (ic[b[0]] === vc) return base + longm[vc] + bRest;                  // savarṇa-dīrgha: i+i→ī, u+u→ū, ṛ+ṛ→ṝ (like vowels lengthen)
      var bc = base && isCons(base[base.length - 1]);
      return base + (bc ? '्' : '') + semi[vc] + IM[b[0]] + bRest;           // yaṇ: i/u/ṛ → y/v/r before a DISSIMILAR vowel
    }
    if (vc === 'a') { var m = { a: 'ा', i: 'े', u: 'ो', R: 'ा', e: 'ै', ai: 'ै', o: 'ौ', au: 'ौ' }[ic[b[0]]]; return base + m + bRest; } // guṇa/vṛddhi/savarṇa
    if ((vc === 'e' || vc === 'o') && b[0] === 'अ') return a + bRest;        // pūrvarūpa (eṅ only): e/o + short a → e/o' (a elided, avagraha)
    if (vc === 'e' || vc === 'o') return base + b;                          // ayādi: e/o + V(non-a) → a + V (te iti → ta iti); corpus uses this elided form, so kept as sole form
    if (vc === 'ai' || vc === 'au') return elideAv ? base + 'ा' + b : base + 'ा' + (vc === 'ai' ? 'य' : 'व') + IM[b[0]] + bRest; // āvādi: ai/au + V → āy/āv + V (semivowel: dvau imau → द्वाविमौ) or, when elideAv, ā + V (elided: tau iti → ता इति) — both occur in corpus
    return a + b;
  }

  // external sandhi dispatcher: join word a + word b
  function sandhiJoin(a, b, elideAv) {
    if (!a) return b; if (!b) return a;
    var vs = b[0] in IM;
    if (a.endsWith('्')) {
      if (vs) {                                                             // C् + V → (voiced C) + mātrā(V)
        var jc = a[a.length - 2], pv = a[a.length - 3];
        if ((jc === 'न' || jc === 'ङ' || jc === 'ण') && ((pv >= 'क' && pv <= 'ह') || 'िुृॢ'.indexOf(pv) >= 0)) // ṅ/ṇ/n after a SHORT vowel doubles before a vowel (8.3.32): tiṣṭhan iti → tiṣṭhann iti
          return a + jc + IM[b[0]] + b.slice(1);                            //  न् + V → न्न + mātrā(V)  (long-vowel-final रामान् इति does NOT double)
        var jas = { 'क': 'ग', 'ख': 'ग', 'च': 'ज', 'छ': 'ज', 'ट': 'ड', 'ठ': 'ड', 'त': 'द', 'थ': 'द', 'प': 'ब', 'फ': 'ब' }[jc]; // jaś-tva: word-final stop voices before a vowel (tat eva → tad eva)
        return jas ? a.slice(0, -2) + jas + IM[b[0]] + b.slice(1) : a.slice(0, -1) + IM[b[0]] + b.slice(1);
      }
      var P = a[a.length - 2], Q = b[0], stem = a.slice(0, -2);              // consonant + consonant: dental त्/द् external sandhi (B1)
      if (P === 'त' || P === 'द') {
        if (Q === 'च' || Q === 'छ') return stem + 'च्' + b;                  // ścutva:  तत्+च → तच्च
        if (Q === 'ज' || Q === 'झ') return stem + 'ज्' + b;                  //          तत्+ज → तज्ज
        if (Q === 'श') return stem + 'च्छ' + b.slice(1);                     // त्+श → च्छ
        if (Q === 'ट' || Q === 'ठ') return stem + 'ट्' + b;                  // ṣṭutva
        if (Q === 'ड' || Q === 'ढ') return stem + 'ड्' + b;
        if (Q === 'ल') return stem + 'ल्' + b;                              // त्+ल → ल्ल
        if (Q === 'ह') return stem + 'द्ध' + b.slice(1);                     // त्+ह → द्ध
        if (Q === 'न' || Q === 'म') return stem + Q + '्' + b;               // त्+न/म → न्न/म्म (anunāsika)
        if (P === 'त' && 'गघजझडढदधबभयरवह'.indexOf(Q) >= 0) return stem + 'द्' + b; // त्+voiced → द्
      }
      if (P === 'न') {                                                       // word-final dental न् + voiceless stop → anusvāra + class sibilant (vikārān cet → vikārāṃś cet)
        if (Q === 'च' || Q === 'छ') return stem + 'ंश्' + b;                  // न्+c/ch → ṃś (रामान्+च → रामांश्च)
        if (Q === 'त' || Q === 'थ') return stem + 'ंस्' + b;                  // न्+t/th → ṃs
        if (Q === 'ट' || Q === 'ठ') return stem + 'ंष्' + b;                  // न्+ṭ/ṭh → ṃṣ
      }
      if (P === 'क' || P === 'ट' || P === 'प') {                             // word-final क्/ट्/प् voices/assimilates before a voiced sound (jaś-tva; before vowels handled above)
        if ('गघजझडढदधबभयरवह'.indexOf(Q) >= 0) return stem + { 'क': 'ग', 'ट': 'ड', 'प': 'ब' }[P] + '्' + b; // → voiced stop (samyak jñānam → samyag jñānam; vāk devī → vāg devī)
        if ('ङञणनम'.indexOf(Q) >= 0) return stem + { 'क': 'ङ', 'ट': 'ण', 'प': 'म' }[P] + '्' + b;          // → homorganic nasal before a nasal (vāk maya → vāṅ-maya; ṣaṭ māsa → ṣaṇ-māsa)
      }
      return a + b;                                                          // other C् + C → abut (क्/ट्/प् before voiceless/sibilant stay; ङ्/ण् finals — see limitations)
    }
    if (a.endsWith('ं')) return vs ? a.slice(0, -1) + 'म' + IM[b[0]] + b.slice(1) : a + b; // word-final -ṃ(=-m) + V → m+mātrā
    if (a.endsWith('ः')) {                                                    // visarga sandhi
      var base = a.slice(0, -1);
      if (a === 'सः' || a === 'एषः') return b[0] === 'अ' ? base + 'ो' + b.slice(1) : base + b; // su-lopa (6.1.132): saḥ/eṣaḥ → sa/eṣa before all but 'a' (so'); only when saḥ/eṣaḥ leads
      if (vs) {                                                              // + vowel
        if (base.endsWith('ा')) return base + b;                            //  āḥ + V → ā + V (hiatus)
        if ('िीुूृॄॢॣेैोौ'.indexOf(base[base.length - 1]) >= 0) return base + sandhiJoin('र्', b); //  (i/u/ṛ/e/o…)ḥ + V → r, r fuses with the vowel as mātrā (ज्ञानैः इति → ज्ञानैरिति)
        if (b[0] === 'अ') return base + 'ो' + b.slice(1);                    //  aḥ + a → o' (a elided)
        return base + b;                                                    //  aḥ + V(non-a) → a + V (hiatus)
      }
      var sib = { 'च': 'श्', 'छ': 'श्', 'ट': 'ष्', 'ठ': 'ष्', 'त': 'स्', 'थ': 'स्' }[b[0]];
      if (sib) return base + sib + b;                                        //  ḥ → sibilant (ततः+च → ततश्च)
      if ('कखपफशषस'.indexOf(b[0]) >= 0) return a + b;                        //  ḥ retained (before k/kh/p/ph, ś/ṣ/s)
      if (base.endsWith('ा')) return base + b;                              //  āḥ + voiced cons → ā
      if ('िीुूृॄॢॣेैोौ'.indexOf(base[base.length - 1]) >= 0) return base + 'र्' + b; //  (i/u/ṛ/e/o…)ḥ + voiced cons → r
      return base + 'ो' + b;                                                //  aḥ + voiced cons → o
    }
    return vowelSandhi(a, b, elideAv);                                       // vowel-final
  }

  // ---- ITRANS → Devanāgarī (user convention: c=च, ch/C=छ, .a=ऽ, ~N=ङ, ~n=ञ, Sh/S=ष, RRi=ृ, M=ं, H=ः) ----
  var V = {
    a: ['अ', ''], aa: ['आ', 'ा'], A: ['आ', 'ा'], i: ['इ', 'ि'], ii: ['ई', 'ी'], I: ['ई', 'ी'], u: ['उ', 'ु'], uu: ['ऊ', 'ू'], U: ['ऊ', 'ू'],
    'RRi': ['ऋ', 'ृ'], 'R^i': ['ऋ', 'ृ'], 'RRI': ['ॠ', 'ॄ'], 'LLi': ['ऌ', 'ॢ'], e: ['ए', 'े'], ai: ['ऐ', 'ै'], o: ['ओ', 'ो'], au: ['औ', 'ौ']
  };
  var C = {
    k: 'क', kh: 'ख', g: 'ग', gh: 'घ', '~N': 'ङ', 'N^': 'ङ', ch: 'छ', Ch: 'छ', c: 'च', j: 'ज', jh: 'झ', '~n': 'ञ', 'JN': 'ञ',
    T: 'ट', Th: 'ठ', D: 'ड', Dh: 'ढ', N: 'ण', t: 'त', th: 'थ', d: 'द', dh: 'ध', n: 'न', p: 'प', ph: 'फ', b: 'ब', bh: 'भ', m: 'म',
    y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व', sh: 'श', Sh: 'ष', shh: 'ष', S: 'ष', s: 'स', h: 'ह', L: 'ळ', x: 'क्ष', kSh: 'क्ष', 'GY': 'ज्ञ', 'j~n': 'ज्ञ', dny: 'ज्ञ'
  };
  var SIGN = { M: 'ं', '.m': 'ं', H: 'ः', '.a': 'ऽ', '.n': 'ँ', '.h': '्', '|': '।' };
  var KEYS = Object.keys(V).concat(Object.keys(C)).concat(Object.keys(SIGN)).sort(function (a, b) { return b.length - a.length; });
  function toDeva(s) {
    if (/[ऀ-ॿ]/.test(s)) return s;
    var out = '', p = false, i = 0;
    var fl = function () { if (p) { out += '्'; p = false; } };
    while (i < s.length) {
      var m = null;
      for (var ki = 0; ki < KEYS.length; ki++) { if (s.startsWith(KEYS[ki], i)) { m = KEYS[ki]; break; } }
      if (m === null) { fl(); out += s[i]; i++; continue; }
      if (C.hasOwnProperty(m)) { fl(); out += C[m]; p = true; }
      else if (V.hasOwnProperty(m)) { var av = V[m][0], bv = V[m][1]; if (p) { out += bv; p = false; } else out += av; }
      else { fl(); out += SIGN[m]; }
      i += m.length;
    }
    fl(); return out;
  }

  // ---- highlighting helpers (return sentinel-marked plain text) ----
  function wrap(surface, a, b) {
    b = extendEnd(surface, b);
    var st = Math.max(0, a - 55), en = Math.min(surface.length, b + 70);
    return (st > 0 ? '…' : '') + surface.slice(st, a) + M1 + surface.slice(a, b) + M2 + surface.slice(b, en) + (en < surface.length ? '…' : '');
  }
  function wrapMulti(sent, spans) {
    var out = '', pos = 0;
    for (var i = 0; i < spans.length; i++) { var s = spans[i]; out += sent.slice(pos, s[0]) + M1 + sent.slice(s[0], s[1]) + M2; pos = s[1]; }
    return out + sent.slice(pos);
  }
  function snippetPlain(surface, q) { // exact/loose
    var r = normMap(surface), n = r.n, map = r.map, qn = normalize(q), k = n.indexOf(qn);
    if (k >= 0) return wrap(surface, map[k], map[Math.min(k + qn.length, map.length - 1)]);
    var map2 = [], i; for (i = 0; i < n.length; i++) if (n[i] !== ' ') map2.push(map[i]); map2.push(surface.length);
    var n2 = n.replace(/ /g, ''), qc = normalize(q, true), k2 = n2.indexOf(qc);
    if (k2 >= 0) return wrap(surface, map2[k2], map2[Math.min(k2 + qc.length, map2.length - 1)]);
    return surface.slice(0, 150) + (surface.length > 150 ? '…' : '');
  }
  function snippetAny(surface, cands) { // try each {s, drop}; wrap first found
    var r = normMap(surface), n = r.n, map = r.map;
    var map2 = [], x; for (x = 0; x < n.length; x++) if (n[x] !== ' ') map2.push(map[x]); map2.push(surface.length);
    var n2 = n.replace(/ /g, '');
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i]; if (!c.s) continue;
      if (!c.drop) { var k = n.indexOf(c.s); if (k >= 0) return wrap(surface, map[k], map[Math.min(k + c.s.length, map.length - 1)]); }
      else { var k2 = n2.indexOf(c.s); if (k2 >= 0) return wrap(surface, map2[k2], map2[Math.min(k2 + c.s.length, map2.length - 1)]); }
    }
    return surface.slice(0, 150) + (surface.length > 150 ? '…' : '');
  }
  function hasTermB(n, t) { var from = 0; while (true) { var i = n.indexOf(t, from); if (i < 0) return false; if (i === 0 || n[i - 1] === ' ') return true; from = i + 1; } }
  function coMatch(surface, terms) {
    if (!terms.length) return false;
    var sents = surface.split(/[।॥]/);
    for (var i = 0; i < sents.length; i++) { var sn = normalize(sents[i]); if (terms.every(function (t) { return hasTermB(sn, t); })) return true; }
    return false;
  }
  function snippetCo(surface, terms) {
    var sents = surface.split(/[।॥]/);
    for (var si = 0; si < sents.length; si++) {
      var sent = sents[si], r = normMap(sent), n = r.n, map = r.map, spans = [], ok = true;
      for (var ti = 0; ti < terms.length; ti++) {
        var t = terms[ti], found = false, from = 0;
        while (true) { var i = n.indexOf(t, from); if (i < 0) break; if (i === 0 || n[i - 1] === ' ') { spans.push([map[i], extendEnd(sent, map[Math.min(i + t.length, map.length - 1)])]); found = true; } from = i + 1; }
        if (!found) { ok = false; break; }
      }
      if (ok) {
        spans.sort(function (a, b) { return a[0] - b[0]; });
        var mg = []; for (var j = 0; j < spans.length; j++) { var s = spans[j]; if (mg.length && s[0] <= mg[mg.length - 1][1]) mg[mg.length - 1][1] = Math.max(mg[mg.length - 1][1], s[1]); else mg.push([s[0], s[1]]); }
        return wrapMulti(sent, mg);
      }
    }
    return surface.slice(0, 180) + (surface.length > 180 ? '…' : '');
  }
  // ordered stem match; first stem must start at a word boundary (cuts mid-word noise)
  function stemMatch(n, stems) {
    var from = 0;
    while (true) {
      var i = n.indexOf(stems[0], from); if (i < 0) return false;
      if (i === 0 || n[i - 1] === ' ') {
        var pos = i + stems[0].length, ok = true;
        for (var k = 1; k < stems.length; k++) { var j = n.indexOf(stems[k], pos); if (j < 0) { ok = false; break; } pos = j + stems[k].length; }
        if (ok) return true;
      }
      from = i + 1;
    }
  }

  // ---- query expansion / matching / snippet (per mode) ----
  function expandQuery(input, mode) {
    var q = toDeva(input);
    var qn = normalize(q), qnc = normalize(q, true);
    // Normalize each query word ALONE (not the joined string): a word-final nasal must keep its
    // halant here (विकारान्) so sandhiJoin can apply its न-/ṅ-rules — the cross-word collapse to
    // anusvāra is an index-side canonicalization only.
    var words = q.split(/[\s।॥]+/).map(function (w) { return normalize(w); }).filter(function (x) { return x.length; });
    var stems = words.map(stripSandhi);
    var spaced = words.join(' '), abut = stems.join('');
    var joined = words.length > 1 ? normalize(words.reduce(function (a, w) { return sandhiJoin(a, w); }), true) : '';
    var mls = matraLead(stems[0]);                                            // single-word left-edge (vowel-initial, no leading अ)
    // single-word left-edge अ→ā: an अ-initial word can fuse onto a preceding a/ā as ā (sva+avidyā
    // → svāvidyā). Guarded to stems ≥5 chars — shorter अ-forms (ा, ात्र, ार्थ…) flood the index.
    var mlsA = (stems[0] && stems[0][0] === 'अ' && stems[0].length >= 5) ? 'ा' + stems[0].slice(1) : '';
    // single-word right-edge: a word-final न्/ङ्/ण् doubles → anusvāra when sandhi'd before a
    // following vowel in the text (kurvan → कुर्वं, matching कुर्वन्नेवेह). See nasalAnusvara.
    var nasalA = nasalAnusvara(words[0] || '');
    var leadA = function (w) { return w && w[0] === 'अ' ? 'ा' + w.slice(1) : matraLead(w); }; // phrase path also does अ→ā (savarṇa)
    var plw = leadA(words[0]), pls = leadA(stems[0]);
    var spacedM = plw ? [plw].concat(words.slice(1)).join(' ') : '';
    var abutM = pls ? [pls].concat(stems.slice(1)).join('') : '';
    var joinedM = (plw && words.length > 1) ? normalize([plw].concat(words.slice(1)).reduce(function (a, w) { return sandhiJoin(a, w); }), true) : '';
    // right-edge: last query word may be a COMPOUND member (or its ending sandhi'd with a
    // following word) — so also join with the last word STEMMED (trailing ending dropped),
    // matching as a prefix. (kṛtam abhojyam → kṛtamabhojya… in kṛtam-abhojya-bhojanādikam)
    var lastStem = stems.length ? stems[stems.length - 1] : '';
    var joinedStem = words.length > 1 ? normalize(words.slice(0, -1).concat([lastStem]).reduce(function (a, w) { return sandhiJoin(a, w); }), true) : '';
    var joinedMStem = (plw && words.length > 1) ? normalize([plw].concat(words.slice(1, -1)).concat([lastStem]).reduce(function (a, w) { return sandhiJoin(a, w); }), true) : '';
    // right-edge (vowel): a VOWEL-final last word can have its final vowel absorbed by a
    // following out-of-query word (jānāmi iti → jānāmīty-anubhavāt). Strip a trailing vowel
    // mātrā too, and match as a prefix.
    var lastCore = (words.length ? words[words.length - 1] : '').replace(/[ःंँ्]+$/, '').replace(/[ािीुूृॄॢेैोौ]$/, '');
    var joinedCore = words.length > 1 ? normalize(words.slice(0, -1).concat([lastCore]).reduce(function (a, w) { return sandhiJoin(a, w); }), true) : '';
    var joinedMCore = (plw && words.length > 1) ? normalize([plw].concat(words.slice(1, -1)).concat([lastCore]).reduce(function (a, w) { return sandhiJoin(a, w); }), true) : '';
    // break combinations: a phrase may cross daṇḍas / commas / compound boundaries where NO external
    // sandhi applies, mixed with boundaries that DO sandhi — and it may cross SEVERAL such breaks.
    // Enumerate all sandhi/abut choices at the internal boundaries (each a specific whole-phrase
    // string matched in the space-dropped index). Only boundaries where sandhi actually DIVERGES from
    // plain abutment are enumerated — consonant-consonant / retained-visarga boundaries collapse
    // (sandhi == abut) and are pinned, so 2^k stays small even for long queries. Each mask is also
    // emitted with the last word stemmed / cored (right-edge: last word may be a compound member or
    // fuse rightward with an out-of-query word). Only if divergent boundaries exceed the cap do we
    // fall back to all-sandhi + each single divergent break + all-abut.
    var combos = [], nb = words.length - 1, seen = {};
    var pushC = function (s) { if (s && !seen[s]) { seen[s] = 1; combos.push(s); } };
    // right-edge yaṇ: a vowel-final last word can turn its final i/u/ṛ into a semivowel before a
    // following out-of-query vowel (agni uṣṇa → agny-uṣṇa → अग्ंयु; jānāmi iti → jānāmīty…).
    var YAN = { 'ि': '्य', 'ी': '्य', 'ु': '्व', 'ू': '्व', 'ृ': '्र', 'ॄ': '्र' };
    var lastW = words.length ? words[words.length - 1] : '';
    var lastYan = YAN[lastW[lastW.length - 1]] ? lastW.slice(0, -1) + YAN[lastW[lastW.length - 1]] : '';
    // right-edge jaś-tva: a stop-final last word voices before a following out-of-query vowel and the
    // vowel fuses onto it as a mātrā, so the matchable prefix is the bare voiced stem (viruddhatvāt iti
    // → viruddhatvād ity… → विरुद्धत्वादि; the प्रेfix विरुद्धत्वाद matches).
    var JAS = { 'क': 'ग', 'च': 'ज', 'ट': 'ड', 'त': 'द', 'प': 'ब' };
    var lastJas = (lastW.slice(-1) === '्' && JAS[lastW.slice(-2, -1)]) ? lastW.slice(0, -2) + JAS[lastW.slice(-2, -1)] : '';
    // right-edge: last word's word-final nasal → anusvāra (doubled before a following out-of-query vowel)
    var lastNasalA = nasalAnusvara(lastW);
    var lastVars = words.length ? [lastW, lastStem, lastCore, lastYan, lastJas, lastNasalA].filter(function (x) { return x; }) : [];
    var joinMask = function (ws, mask, lastW, elideAv) {                      // full-phrase join over word-array ws; last word may be swapped for its stem/core
      var acc = ws[0];
      for (var wi = 1; wi < ws.length; wi++) { var w = (wi === ws.length - 1) ? lastW : ws[wi]; acc = (mask & (1 << (wi - 1))) ? sandhiJoin(acc, w, elideAv) : acc + w; }
      return normalize(acc, true);
    };
    // āvādi (ai/au + vowel) has TWO surface forms that both occur — semivowel (द्वाविमौ) and elided
    // (ता इति). sandhiJoin emits the semivowel by default; when the query has such a boundary we ALSO
    // enumerate the elided variant (elideAv) so both are matched.
    var hasAv = false;
    for (var av = 0; av < nb; av++) if ('ैौ'.indexOf(words[av].slice(-1)) >= 0 && (words[av + 1][0] in IM)) hasAv = true;
    var avModes = hasAv ? [false, true] : [false];
    if (words.length > 1) {
      var div = [], full = (1 << nb) - 1;                                     // boundaries where sandhi ≠ abut
      for (var bi = 0; bi < nb; bi++) if (normalize(sandhiJoin(words[bi], words[bi + 1]), true) !== normalize(words[bi] + words[bi + 1], true)) div.push(bi);
      // pada-split WORD variants: some editions (e.g. upasanayoga) separate words with the LEFT word's
      // sandhi-final change applied but the RIGHT word's initial vowel kept as a separate token —
      // पुनः→पुनर् आवर्तिनो (visarga→r), च अपि→चाप्य् अक्षरम् (final vowel→yaṇ semivowel+halant). Give each
      // non-final word such an alternate form and enumerate subsets; the sandhi/abut mask then yields
      // BOTH the fused (पुनरा / चाप्यक्षरम्) and the pada-separated (पुनर् आ / चाप्य् अक्षरम्) surfaces.
      // Inert otherwise (the alternate never occurs unless the edition actually split that way).
      var YANH = { 'ि': '्य्', 'ी': '्य्', 'ु': '्व्', 'ू': '्व्', 'ृ': '्र्', 'ॄ': '्र्' };
      var vIdx = [], vAlt = [];
      for (var ri = 0; ri < nb; ri++) {
        var rw = words[ri], alt = null;
        if (rw.slice(-1) === 'ः' && isCons(rw[rw.length - 2])) alt = rw.slice(0, -1) + 'र्';           // visarga r-stem
        else if (YANH[rw.slice(-1)]) alt = rw.slice(0, -1) + YANH[rw.slice(-1)];                       // final i/u/ṛ → semivowel + halant
        if (alt) { vIdx.push(ri); vAlt.push(alt); }
      }
      var vCap = (vIdx.length && div.length + vIdx.length <= 12) ? vIdx.length : 0; // bound total enumeration
      var wordSets = [];
      for (var wsub = 0; wsub < (1 << vCap); wsub++) {
        var arr = words.slice();
        for (var wk = 0; wk < vCap; wk++) if (wsub & (1 << wk)) arr[vIdx[wk]] = vAlt[wk];
        wordSets.push(arr);
      }
      var emitMask = function (mask) {
        for (var wsI = 0; wsI < wordSets.length; wsI++)
          for (var am = 0; am < avModes.length; am++)
            for (var lv = 0; lv < lastVars.length; lv++) pushC(joinMask(wordSets[wsI], mask, lastVars[lv], avModes[am]));
      };
      if (div.length <= 12) {                                                 // enumerate 2^k over divergent boundaries only (collapsing ones pinned to sandhi==abut)
        for (var sub = 0; sub < (1 << div.length); sub++) {
          var mask = full;
          for (var d = 0; d < div.length; d++) if (!(sub & (1 << d))) mask &= ~(1 << div[d]); // clear bit = abut at that divergent boundary
          emitMask(mask);
        }
      } else {                                                               // pathological: too many divergent boundaries — all-sandhi + each single divergent break + all-abut
        emitMask(full);
        for (var di = 0; di < div.length; di++) emitMask(full ^ (1 << div[di]));
        emitMask(0);
      }
    }
    return { q: q, qn: qn, qnc: qnc, mode: mode, words: words, stems: stems, spaced: spaced, abut: abut, joined: joined, joinedStem: joinedStem, joinedCore: joinedCore, mls: mls, mlsA: mlsA, spacedM: spacedM, abutM: abutM, joinedM: joinedM, joinedMStem: joinedMStem, joinedMCore: joinedMCore, nasalA: nasalA, combos: combos };
  }
  function prepBlock(surface) { return { s: surface, _n: normalize(surface), _nc: normalize(surface, true) }; }
  function matches(b, ex) {
    var mode = ex.mode;
    if (mode === 'exact') return b._n.includes(ex.qn);
    if (mode === 'loose') return b._n.includes(ex.qn) || b._nc.includes(ex.qnc);
    if (mode === 'cooccur') return coMatch(b.s, ex.stems);
    if (ex.stems.length <= 1) return !!(ex.stems[0] && (stemMatch(b._n, ex.stems) || b._nc.includes(ex.stems[0]) || (ex.mls && b._nc.includes(ex.mls)) || (ex.mlsA && b._nc.includes(ex.mlsA)) || (ex.nasalA && (stemMatch(b._n, [ex.nasalA]) || b._nc.includes(ex.nasalA)))));
    return b._n.includes(ex.spaced) || b._nc.includes(ex.abut) || (ex.joined && b._nc.includes(ex.joined)) || (ex.joinedStem && b._nc.includes(ex.joinedStem)) || (ex.joinedCore && b._nc.includes(ex.joinedCore))
      || (ex.spacedM && b._n.includes(ex.spacedM)) || (ex.abutM && b._nc.includes(ex.abutM)) || (ex.joinedM && b._nc.includes(ex.joinedM)) || (ex.joinedMStem && b._nc.includes(ex.joinedMStem)) || (ex.joinedMCore && b._nc.includes(ex.joinedMCore))
      || ex.combos.some(function (s) { return b._nc.includes(s); });
  }
  function snippet(b, ex) {
    var mode = ex.mode;
    if (mode === 'cooccur') return snippetCo(b.s, ex.stems);
    if (mode !== 'sandhi') return snippetPlain(b.s, ex.q);
    if (ex.stems.length <= 1) return snippetAny(b.s, [{ s: ex.stems[0], drop: false }, { s: ex.mls, drop: false }, { s: ex.stems[0], drop: true }, { s: ex.mls, drop: true }, { s: ex.mlsA, drop: true }, { s: ex.nasalA, drop: false }, { s: ex.nasalA, drop: true }]);
    return snippetAny(b.s, [{ s: ex.spaced, drop: false }, { s: ex.joined, drop: true }, { s: ex.joinedStem, drop: true }, { s: ex.joinedCore, drop: true }, { s: ex.abut, drop: true }, { s: ex.spacedM, drop: false }, { s: ex.joinedM, drop: true }, { s: ex.joinedMStem, drop: true }, { s: ex.joinedMCore, drop: true }, { s: ex.abutM, drop: true }].concat(ex.combos.map(function (s) { return { s: s, drop: true }; })));
  }

  return {
    normalize: normalize, normMap: normMap, stripSandhi: stripSandhi, matraLead: matraLead, extendEnd: extendEnd,
    vowelSandhi: vowelSandhi, sandhiJoin: sandhiJoin, toDeva: toDeva, stemMatch: stemMatch, coMatch: coMatch,
    expandQuery: expandQuery, prepBlock: prepBlock, matches: matches, snippet: snippet,
    M1: M1, M2: M2
  };
});
