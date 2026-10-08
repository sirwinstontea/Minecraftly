// Minecraftly highlight anchoring: describe a piece of text so it can be found again later,
// even after the page or document around it has changed (inspired by Hypothesis' fuzzy
// anchoring and the W3C Web Annotation selectors). Shared by the desktop app and the
// browser extension, so both find text the exact same way.
//
//   describe(rawText, start, end)        -> { exact, prefix, suffix, start, end }
//   locate(rawText, selector, options)   -> { status: "anchored", start, end, confidence, selector }
//                                         | { status: "ambiguous" | "not-found" }
//
// Offsets passed in and returned are offsets in the RAW text; matching happens on a
// normalized copy (whitespace collapsed, invisible characters dropped).
(function factory(root, build) {
  if (typeof module === "object" && module.exports) module.exports = build();
  else root.MinecraftlyAnchor = build();
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const CONTEXT = 64; // characters of prefix/suffix kept around a quote
  const MAX_ERRORS = 32; // fuzzy matches may differ by at most this many edits...
  const ERROR_RATE = 0.15; // ...and at most 15% of the quote's length (about one changed word)
  const SHORT_QUOTE = 24; // shorter fuzzy matches must also have matching context
  const AMBIGUITY_MARGIN = 0.05;
  const isInvisible = (c) => c === 0xAD || (c >= 0x200B && c <= 0x200D) || c === 0x2060 || c === 0xFEFF;
  const isSpace = (c) => (c >= 9 && c <= 13) || c === 32 || c === 0x85 || c === 0xA0 || c === 0x1680
    || (c >= 0x2000 && c <= 0x200A) || c === 0x2028 || c === 0x2029 || c === 0x202F || c === 0x205F || c === 0x3000;

  // Normalized text plus a map from each normalized index back to the raw index.
  function normalize(raw) {
    const source = String(raw ?? "");
    const n = source.length;
    const out = new Uint16Array(n);
    const map = new Int32Array(n + 1);
    let k = 0;
    let lastWasSpace = true; // trims leading whitespace
    for (let i = 0; i < n; i += 1) {
      const c = source.charCodeAt(i);
      if (isInvisible(c)) continue;
      if (isSpace(c)) {
        if (lastWasSpace) continue;
        out[k] = 32;
        map[k] = i;
        k += 1;
        lastWasSpace = true;
        continue;
      }
      out[k] = c;
      map[k] = i;
      k += 1;
      lastWasSpace = false;
    }
    map[k] = n;
    let text = "";
    for (let i = 0; i < k; i += 8192) text += String.fromCharCode.apply(null, out.subarray(i, Math.min(k, i + 8192)));
    return { text, map: map.subarray(0, k + 1) };
  }

  function normalizeString(value) {
    return normalize(String(value ?? "")).text.trim();
  }

  // First normalized index whose raw index is >= rawIndex.
  function toNormalized(map, rawIndex) {
    let lo = 0;
    let hi = map.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (map[mid] < rawIndex) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function describe(raw, start, end) {
    const norm = normalize(raw);
    return describeNormalized(norm, toNormalized(norm.map, start), toNormalized(norm.map, end));
  }

  // Same, with positions already in the normalized text.
  function describeNormalized({ text }, s, e) {
    while (s < e && text[s] === " ") s += 1;
    while (e > s && text[e - 1] === " ") e -= 1;
    return {
      exact: text.slice(s, e),
      prefix: text.slice(Math.max(0, s - CONTEXT), s),
      suffix: text.slice(e, e + CONTEXT),
      start: s,
      end: e,
    };
  }

  // How much of `a`'s end matches `b`'s end (prefix context), 0..1.
  function tailSimilarity(expected, actual) {
    if (!expected) return 1;
    let n = 0;
    while (n < expected.length && n < actual.length
      && expected[expected.length - 1 - n] === actual[actual.length - 1 - n]) n += 1;
    return n / expected.length;
  }

  function headSimilarity(expected, actual) {
    if (!expected) return 1;
    let n = 0;
    while (n < expected.length && n < actual.length && expected[n] === actual[n]) n += 1;
    return n / expected.length;
  }

  function scoreCandidate(text, start, end, selector) {
    const prefix = tailSimilarity(selector.prefix || "", text.slice(Math.max(0, start - CONTEXT), start));
    const suffix = headSimilarity(selector.suffix || "", text.slice(end, end + CONTEXT));
    let position = 0;
    if (Number.isFinite(selector.start) && text.length) {
      position = 1 - Math.min(1, Math.abs(start - selector.start) / Math.max(text.length, 1));
      if (start === selector.start) position += 0.4; // unchanged text: exactly where it was
    }
    return { context: (prefix + suffix) / 2, total: prefix + suffix + 0.5 * position };
  }

  function exactCandidates(text, exact, limit = 2000) {
    const found = [];
    let at = text.indexOf(exact);
    while (at !== -1 && found.length < limit) {
      found.push(at);
      at = text.indexOf(exact, at + 1);
    }
    return found;
  }

  // Best approximate occurrence of `pattern` in text[from, to) (Sellers' algorithm),
  // tracking where each alignment starts. Returns { start, end, errors } or null.
  function approxSearch(text, pattern, from, to, maxErrors) {
    const m = pattern.length;
    let cost = new Int32Array(m + 1);
    let begin = new Int32Array(m + 1);
    let nextCost = new Int32Array(m + 1);
    let nextBegin = new Int32Array(m + 1);
    for (let i = 0; i <= m; i += 1) {
      cost[i] = i;
      begin[i] = from;
    }
    let best = null;
    for (let j = from; j < to; j += 1) {
      const ch = text[j];
      nextCost[0] = 0;
      nextBegin[0] = j + 1;
      for (let i = 1; i <= m; i += 1) {
        let c = cost[i - 1] + (pattern[i - 1] === ch ? 0 : 1);
        let b = begin[i - 1];
        if (cost[i] + 1 < c) { c = cost[i] + 1; b = begin[i]; }
        if (nextCost[i - 1] + 1 < c) { c = nextCost[i - 1] + 1; b = nextBegin[i - 1]; }
        nextCost[i] = c;
        nextBegin[i] = b;
      }
      if (nextCost[m] <= maxErrors && (!best || nextCost[m] < best.errors)) {
        best = { start: nextBegin[m], end: j + 1, errors: nextCost[m] };
      }
      [cost, nextCost] = [nextCost, cost];
      [begin, nextBegin] = [nextBegin, begin];
    }
    return best;
  }

  function editDistance(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      previous = current;
    }
    return previous[b.length];
  }

  const isWord = (ch) => Boolean(ch) && /[\p{L}\p{N}_]/u.test(ch);
  const wordStart = (text, at) => isWord(text[at]) && !isWord(text[at - 1]);
  const wordEnd = (text, at) => isWord(text[at - 1]) && !isWord(text[at]);

  // A fuzzy match can be equally good shifted by a letter ("e best" vs "best"). If the original
  // selection began/ended on a word boundary, prefer a match that does too.
  function snapToWords(text, match, exact, selector) {
    // Only when the original selection started at the start of a word (and likewise for the end).
    const wantStart = isWord(exact[0]) && !isWord((selector.prefix || "").slice(-1));
    const wantEnd = isWord(exact[exact.length - 1]) && !isWord((selector.suffix || "")[0]);
    const near = (at, step, isBoundary) => {
      const options = [at];
      for (let k = 1; k <= match.errors + 1; k += 1) {
        const p = at + step * k;
        if (p >= 0 && p <= text.length && isBoundary(text, p)) {
          options.push(p);
          break;
        }
      }
      return options;
    };
    let best = null;
    for (const start of [...near(match.start, 1, wordStart), ...near(match.start, -1, wordStart)]) {
      for (const end of [...near(match.end, -1, wordEnd), ...near(match.end, 1, wordEnd)]) {
        if (end <= start) continue;
        const errors = editDistance(text.slice(start, end), exact);
        const misses = (wantStart && !wordStart(text, start) ? 1 : 0) + (wantEnd && !wordEnd(text, end) ? 1 : 0);
        const score = errors * 10 + misses * 5;
        if (!best || score < best.score) best = { start, end, errors, score };
      }
    }
    return best;
  }

  // Regions worth a fuzzy search: places where several 8-character pieces of the quote
  // appear close together. Keeps fuzzy search fast on long pages.
  function seedRegions(text, exact) {
    const gram = 8;
    if (exact.length < gram * 2) return [[0, text.length]];
    const hits = [];
    for (let i = 0; i + gram <= exact.length; i += gram) {
      const piece = exact.slice(i, i + gram);
      for (const at of exactCandidates(text, piece, 200)) hits.push(at - i);
    }
    hits.sort((a, b) => a - b);
    const regions = [];
    const span = exact.length;
    for (let k = 0; k < hits.length; k += 1) {
      let n = 1;
      while (k + n < hits.length && hits[k + n] - hits[k] < span / 4) n += 1;
      if (n >= 2) {
        const from = Math.max(0, hits[k] - span);
        const to = Math.min(text.length, hits[k] + span * 2);
        const last = regions[regions.length - 1];
        if (last && from <= last[1]) last[1] = Math.max(last[1], to);
        else regions.push([from, to]);
      }
      k += n - 1;
    }
    return regions;
  }

  // strict: for weak source identities (e.g. a chat window) -> exact quote with matching context only.
  // normalized: pass normalize(raw) when locating many highlights in the same text.
  function locate(raw, selector, { fuzzy = true, strict = false, normalized = null } = {}) {
    const exact = normalizeString(selector?.exact);
    if (!exact) return { status: "not-found" };
    const { text, map } = normalized || normalize(raw);
    const rawRange = (s, e) => ({ start: map[s], end: e > 0 ? map[e - 1] + 1 : map[0] });

    const candidates = exactCandidates(text, exact)
      .map((at) => ({ at, end: at + exact.length, ...scoreCandidate(text, at, at + exact.length, selector) }))
      .sort((a, b) => b.total - a.total);
    if (candidates.length) {
      const [best, second] = candidates;
      if (strict && best.context < 0.5) return { status: "not-found" };
      if (second && best.total - second.total < AMBIGUITY_MARGIN) return { status: "ambiguous" };
      return { status: "anchored", ...rawRange(best.at, best.end), confidence: 1, selector: describeNormalized({ text }, best.at, best.end) };
    }
    if (!fuzzy || strict) return { status: "not-found" };

    const maxErrors = Math.min(MAX_ERRORS, Math.max(1, Math.floor(exact.length * ERROR_RATE)));
    const pattern = exact.length > 256 ? exact.slice(0, 256) : exact;
    const scaledErrors = Math.max(1, Math.floor(maxErrors * (pattern.length / exact.length)));
    let match = null;
    // Search near where it used to be first, then wherever pieces of the quote show up.
    const regions = [];
    if (Number.isFinite(selector.start)) {
      const window = Math.max(2000, exact.length * 4);
      regions.push([Math.max(0, selector.start - window), Math.min(text.length, selector.start + exact.length + window)]);
    }
    regions.push(...seedRegions(text, pattern));
    for (const [from, to] of regions) {
      const found = approxSearch(text, pattern, from, to, scaledErrors);
      if (found && (!match || found.errors < match.errors)) match = found;
      if (match?.errors === 0) break;
    }
    if (!match) return { status: "not-found" };
    let { start, end } = match;
    if (pattern.length < exact.length) end = Math.min(text.length, start + exact.length + (end - start - pattern.length));
    if (exact.length <= 256) {
      const snapped = snapToWords(text, { start, end, errors: match.errors }, exact, selector);
      if (snapped && snapped.errors <= maxErrors) ({ start, end } = snapped);
    }
    if (exact.length < SHORT_QUOTE && scoreCandidate(text, start, end, selector).context < 0.5) {
      return { status: "not-found" }; // a short, changed quote with different surroundings: too risky
    }
    const range = rawRange(start, end);
    return {
      status: "anchored",
      ...range,
      confidence: 1 - match.errors / pattern.length,
      selector: describeNormalized({ text }, start, end),
    };
  }

  // Same page, different URL spelling: drop #fragments and tracking parameters, sort the query.
  const TRACKING = /^(utm_|fbclid$|gclid$|dclid$|msclkid$|mc_cid$|mc_eid$|igshid$|ref_src$|_hs)/i;
  function canonicalUrl(href) {
    try {
      const url = new URL(href);
      url.hash = "";
      url.hostname = url.hostname.toLowerCase();
      const params = [...url.searchParams.entries()].filter(([key]) => !TRACKING.test(key));
      params.sort(([a], [b]) => a.localeCompare(b));
      url.search = new URLSearchParams(params).toString();
      if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
      return url.toString();
    } catch {
      return String(href || "");
    }
  }

  return { CONTEXT, normalize, normalizeString, describe, locate, canonicalUrl };
}));
