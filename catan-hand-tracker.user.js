// ==UserScript==
// @name         Catan hand tracker (Board Game Arena)
// @namespace    chris.catan.tracker
// @version      3.1
// @description  Shows what resource cards each opponent holds (and, on a computer, the odds of each dice total on the next card), rebuilt from the public game log. Sits in BGA's top bar. Picks a phone layout on narrow screens: bigger cards, no dice odds.
// @match        https://boardgamearena.com/tableview*
// @match        https://*.boardgamearena.com/tableview*
// @match        https://boardgamearena.com/*/catan*
// @match        https://*.boardgamearena.com/*/catan*
// @homepageURL  https://github.com/Vanarak4m4/catan-tracker
// @updateURL    https://raw.githubusercontent.com/Vanarak4m4/catan-tracker/main/catan-hand-tracker.user.js
// @downloadURL  https://raw.githubusercontent.com/Vanarak4m4/catan-tracker/main/catan-hand-tracker.user.js
// @noframes
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// Catan (Board Game Arena) live hand tracker.
// Rebuilds every player's hand from the public game log, re-checks every 1.5 s,
// and shows an overlay (wide layout on a computer, big-card layout on a phone). Handles hidden robber steals by tracking all possible hands.
(() => {
  if (window.__catTracker) { clearInterval(window.__catTracker.timer); window.__catTracker.box && window.__catTracker.box.remove(); }
  const RES = ['lumber', 'brick', 'wool', 'grain', 'ore'];
  const ICON = { lumber: '🌲', brick: '🧱', wool: '🐑', grain: '🌾', ore: '⛰️' };
  const LABEL = Object.fromEntries(Object.entries(ICON).map(([k, v]) => [k, '<span title="' + k + '" style="font-size:20px;line-height:1;vertical-align:-2px">' + v + '</span>']));
  const MAX_STATES = 5000;

  const box = document.createElement('div');
  // Two layouts, picked by screen width: 'wide' (computer: one line of cards plus dice odds) and
  // 'phone' (narrow screens: one big row per opponent, no dice odds). Switches by itself on resize.
  const isPhone = () => window.innerWidth < 600;
  const BASE = 'position:fixed;top:0;box-sizing:border-box;z-index:2147483647;color:#fff;border-radius:0 0 8px 8px;box-shadow:0 1px 6px rgba(0,0,0,.35);user-select:none;';
  const CSS = {
    // Fallback spot; place() then fits it into BGA's top bar.
    wide: 'left:50%;transform:translateX(-50%);width:75vw;background:rgba(18,22,30,.93);font:15px/1.2 system-ui,sans-serif;padding:4px 12px 0;cursor:pointer;' +
      'display:flex;flex-direction:row;flex-wrap:wrap;justify-content:space-around;align-content:stretch;column-gap:28px;row-gap:0;align-items:center',
    phone: 'left:0;transform:none;width:100vw;background:rgba(18,22,30,.95);font:14px/1.15 system-ui,sans-serif;padding:3px 8px;-webkit-tap-highlight-color:transparent;' +
      'display:flex;flex-direction:column;flex-wrap:nowrap;justify-content:center;gap:2px',
  };
  let mode = '';
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    box.removeAttribute('style'); // drop sizes left over from the other layout
    box.style.cssText = BASE + CSS[m];
    box.setAttribute('data-cat-tracker', m);
    box.title = m === 'wide' ? 'Click to show or hide the dice odds' : '';
  }
  let st = document.getElementById('catTrackerStyle');
  if (!st) { st = document.createElement('style'); st.id = 'catTrackerStyle'; document.head.appendChild(st); }
  st.textContent = '[data-cat-tracker="wide"] > div{flex:0 0 auto;margin:0!important}' +
    ' [data-cat-tracker="wide"] > div[style*="color:#ff"]{flex-basis:100%;white-space:normal}' +
    ' [data-cat-tracker="wide"] span[title]{margin-left:6px}' +
    ' [data-cat-tracker="wide"] > div[data-row]{flex-basis:100%;min-width:0;align-self:stretch;margin-top:4px!important}' +
    ' [data-cat-tracker="phone"] > div{display:flex;align-items:center;white-space:nowrap;min-width:0}' +
    ' [data-cat-tracker="phone"] .nm{flex:0 1 auto;max-width:80px;overflow:hidden;text-overflow:ellipsis;font-weight:700;font-size:13px}' +
    ' [data-cat-tracker="phone"] .ct{opacity:.7;font-size:12px;margin:0 6px 0 3px}' +
    ' [data-cat-tracker="phone"] .rs{display:flex;align-items:center;gap:8px}' +
    ' [data-cat-tracker="phone"] .warn{color:#ff7a7a;font-size:11px;white-space:normal}';
  document.body.appendChild(box);
  setMode(isPhone() ? 'phone' : 'wide');
  let collapsed = false, lastSig = '';
  let showDice = true;
  try { showDice = localStorage.getItem('catTrackerShowDice') !== '0'; } catch (e) {}
  // Computer: click to show or hide the dice odds (remembered in this browser).
  // Phone: tap to fold the tracker down to a small 🃏 button, and tap again to bring it back.
  box.addEventListener('click', () => {
    if (mode === 'phone') collapsed = !collapsed;
    else {
      showDice = !showDice;
      try { localStorage.setItem('catTrackerShowDice', showDice ? '1' : '0'); } catch (e) {}
    }
    lastSig = ''; tick();
  });

  function gameWin() {
    const f = document.querySelector('iframe[src*="catan"]');
    try { if (f && f.contentWindow && f.contentWindow.document.getElementById('logs')) return f.contentWindow; } catch (e) {}
    return document.getElementById('logs') ? window : null;
  }
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function entryText(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('[class*="icon_"]').forEach(i => {
      const m = String(i.className).match(/icon_(\w+)/);
      i.replaceWith(' [' + (m ? m[1] : '?') + '] ');
    });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  function parseList(s) {
    const m = {}; let ok = true, any = false, x;
    const re = /(?:(\d+)\s*)?\[(\w+)\]/g;
    while ((x = re.exec(s))) {
      any = true;
      if (!RES.includes(x[2])) { ok = false; continue; }
      m[x[2]] = (m[x[2]] || 0) + (x[1] ? +x[1] : 1);
    }
    return { m, ok, any };
  }

  // ---- Reading the log -----------------------------------------------------------------------
  // BGA only keeps the more recent part of the log after a page reload, so every line the tracker
  // sees is also saved in this browser (per table). On a reload, the saved older moves are put back
  // in front of what the page still shows.
  const LKEY = 'catTrackerLog_' + (new URLSearchParams(location.search).get('table') || 'x');
  function readRecords(doc) {
    const els = [...doc.querySelectorAll('#logs .log')]
      .filter(e => !/cancel/i.test(e.className) && e.style.display !== 'none')
      .sort((a, b) => (+(a.id.split('_')[1]) || 0) - (+(b.id.split('_')[1]) || 0));
    const recs = [];
    let pmv = 0;
    for (const e of els) {
      const t = entryText(e); if (!t) continue;
      const mv = +e.dataset.moveId || 0;
      if (mv) pmv = mv;
      const faces = /dice deck/.test(e.textContent)
        ? [...e.querySelectorAll('[class*="icon_die"]')].map(i => +((String(i.className).match(/icon_die(\d)/) || [])[1] || 0)) : null;
      recs.push({ mv, pmv, t, faces });
    }
    return recs;
  }
  function mergeWithSaved(dom) {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(LKEY) || '[]'); } catch (e) {}
    const m0 = dom.reduce((a, r) => (r.mv && (!a || r.mv < a) ? r.mv : a), 0); // first move the page still shows
    let merged = dom;
    if (m0 && saved.length) {
      const older = saved.filter(r => r.pmv < m0);
      const savedM0 = saved.filter(r => r.pmv === m0), domM0 = dom.filter(r => r.pmv === m0);
      merged = older.concat(savedM0.length > domM0.length ? savedM0.concat(dom.filter(r => r.pmv !== m0)) : dom);
    }
    try { localStorage.setItem(LKEY, JSON.stringify(merged)); } catch (e) {}
    return merged;
  }

  function compute(win) {
    const doc = win.document;
    const players = Object.values(win.gameui.gamedatas.players);
    const order = (win.gameui.gamedatas.playerorder || players.map(p => p.id)).map(String);
    players.sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));
    const names = players.map(p => p.name);
    const NP = names.length;
    const idx = Object.fromEntries(names.map((n, i) => [n, i]));
    const P = '(' + names.map(esc).join('|') + ')';
    const warnings = [];
    const ui = win.gameui, meId = ui && !ui.isSpectator && ui.player_id ? String(ui.player_id) : null;
    const meIdx = meId ? players.findIndex(p => String(p.id) === meId) : -1;
    const panel = players.map(p => { const e = doc.getElementById('cat_panel_resources_' + p.id); return e ? +e.textContent.trim() : null; });

    const allRecs = mergeWithSaved(readRecords(doc));
    allRecs.forEach((r, k) => { r.key = r.pmv + ':' + k; });
    // Undo: "X roll backs" with move number N reverts the game to before move N, but the undone
    // lines stay in the log. Drop every earlier line from move N onwards.
    let recs = [];
    for (const r of allRecs) {
      if (/roll ?backs?(?![a-z])|cancels their move/.test(r.t)) {
        if (/roll ?backs?(?![a-z])/.test(r.t) && r.mv) recs = recs.filter(x => !(x.mv >= r.mv));
        continue;
      }
      recs.push(r);
    }
    // Is the start of the game missing (no opening placements)? Then starting hands are unknown.
    const partial = !recs.some(r => r.mv && r.mv <= 3);

    // A steal you're part of comes with a private line only you see, e.g. "You get [wool]".
    // It has no move number and can sit just before or after the steal line.
    const youCard = {}, skip = new Set();
    recs.forEach((r, k) => {
      const m = r.t.match(/^You (?:get|got|gets|lose|lost|loses|give|gave)\b(.*)$/i);
      if (!m) return;
      skip.add(r);
      const L = parseList(m[1]);
      if (!L.any || !L.ok) return;
      for (const d of [-1, 1, -2, 2, -3, 3]) {
        const o = recs[k + d];
        if (o && /steals? from/i.test(o.t) && !youCard[o.key]) { youCard[o.key] = L.m; break; }
      }
    });

    // Turn the log into a list of events.
    const reGets = new RegExp('^' + P + ' gets (.*)$');
    const reTrade = new RegExp(P + ' gives (.*) to ' + P + ' who gives (.*) in exchange');
    const reSupply = new RegExp('^' + P + ' trades with the supply: (.*)→(.*)$');
    const reFor = new RegExp('^' + P + ' .* for (.*)$');
    const reDiscard = new RegExp('^' + P + ' (?:discards|loses) (.*)$');
    const rePlays = new RegExp('^' + P + ' plays ');
    const reSteal = new RegExp(P + '.*?\\b(?:steals?|stole|robs?|takes?)\\b(.*?)\\bfrom ' + (meIdx >= 0 ? '(' + names.map(esc).join('|') + '|you)' : P));
    const events = [];
    let lastMove = '';
    let mono = null; // a Monopoly just played: { p, mv }
    for (const r of recs) {
      if (r.mv) lastMove = r.mv;
      if (skip.has(r)) continue;
      // Scenario prefixes such as "Pirate Attack! major838 discards [lumber]" (Pirate Islands).
      const t = r.t.replace(/^(?:Pirate Attack!|Pirate attack!)\s*/i, '');
      let m;
      if ((m = t.match(new RegExp('^' + P + ' plays Monopoly')))) { mono = { p: idx[m[1]], mv: r.mv || r.pmv }; continue; }
      if (mono && (r.pmv || 0) > mono.mv + 3) mono = null;
      if (/raises a trade offer|changes their trade offer|cancels their trade offer|rejects this offer|cancels the trade|trade cancel|picks dice cards|Robber is activated|moves the robber|moves the pirate|must choose|gains \d+ VP|special card|is looking for|No robber move|pirate ship moves|built a Warship|is offering|offers to trade|wants to trade|doesn.t have any|can.t steal|has nothing to steal|nothing to steal/.test(t) || rePlays.test(t)) continue;
      if ((m = t.match(reGets))) {
        if (/^nothing/.test(m[2])) continue;
        const L = parseList(m[2]); if (!L.ok) warnings.push('Unknown resource: ' + t);
        events.push({ kind: 'add', p: idx[m[1]], m: L.m, t });
        // Monopoly: the player who played it collects every card of one kind, so everyone else
        // now has none of it.
        const kinds = Object.keys(L.m);
        if (mono && idx[m[1]] === mono.p && kinds.length === 1) {
          events.push({ kind: 'zero', except: mono.p, j: RES.indexOf(kinds[0]), t: t + ' (Monopoly)' });
          mono = null;
        }
      } else if ((m = t.match(reTrade))) {
        events.push({ kind: 'trade', a: idx[m[1]], b: idx[m[3]], A: parseList(m[2]).m, B: parseList(m[4]).m, t });
      } else if ((m = t.match(reSupply))) {
        events.push({ kind: 'sub', p: idx[m[1]], m: parseList(m[2]).m, t });
        events.push({ kind: 'add', p: idx[m[1]], m: parseList(m[3]).m, t });
      } else if ((m = t.match(reDiscard))) {
        const L = parseList(m[2]);
        if (L.any) events.push({ kind: 'sub', p: idx[m[1]], m: L.m, t });
        else events.push({ kind: 'lose', p: idx[m[1]], n: +((m[2].match(/\d+/) || [1])[0]), t });
      } else if ((m = t.match(reSteal))) {
        const thief = idx[m[1]], victim = m[3] === 'you' ? meIdx : idx[m[3]], L = parseList(m[2]);
        const known = L.any ? L.m : (youCard[r.key] || null);
        events.push(known ? { kind: 'move', from: victim, to: thief, m: known, t } : { kind: 'steal', from: victim, to: thief, t });
      } else if ((m = t.match(reFor)) && parseList(m[2]).any) {
        events.push({ kind: 'sub', p: idx[m[1]], m: parseList(m[2]).m, t });
      } else if (/\[(lumber|brick|wool|grain|ore|gold)\]/.test(t) || /steal|stole|\brob|discard|monopol/i.test(t)) {
        warnings.push('Not understood: ' + t);
      }
    }

    // Card totals each player started this log with (0 for a complete log). Steals move exactly one
    // card, so the totals are known even when the card isn't.
    const tot = m => Object.values(m).reduce((a, b) => a + b, 0);
    const net = new Array(NP).fill(0);
    for (const e of events) {
      if (e.kind === 'add') net[e.p] += tot(e.m);
      else if (e.kind === 'sub') net[e.p] -= tot(e.m);
      else if (e.kind === 'trade') { net[e.a] += tot(e.B) - tot(e.A); net[e.b] += tot(e.A) - tot(e.B); }
      else if (e.kind === 'move' || e.kind === 'steal') { net[e.from] -= e.kind === 'move' ? tot(e.m) : 1; net[e.to] += e.kind === 'move' ? tot(e.m) : 1; }
      else if (e.kind === 'lose') net[e.p] -= e.n;
    }
    const startTot = partial ? panel.map((v, i) => (v == null ? 99 : Math.max(0, v - net[i]))) : new Array(NP).fill(0);

    // Replay every possible hand. A state holds, per player: the hand relative to the start of the
    // log, its lowest point so far (how many cards of each kind they must have started with), the
    // starting cards already pinned down, and which kinds are known exactly (a complete log, or
    // after a Monopoly took them all).
    const R = RES.length;
    const zeros = () => names.map(() => new Array(R).fill(0));
    let states = [[...zeros(), ...zeros(), ...zeros(), ...names.map(() => new Array(R).fill(partial ? 0 : 1))]];
    const FX = 2 * NP, KN = 3 * NP;
    let lenient = false;
    const key = s => s.map(h => h.join(',')).join('|');
    const clone = s => s.map(h => h.slice());
    const touch = (s, p) => { for (let j = 0; j < R; j++) if (s[p][j] < s[NP + p][j]) s[NP + p][j] = s[p][j]; };
    const feasible = s => {
      for (let p = 0; p < NP; p++) {
        let need = 0;
        for (let j = 0; j < R; j++) {
          if (s[KN + p][j]) { if (s[NP + p][j] < 0) return false; } // known exactly: can't go below 0
          else need += Math.max(0, -s[NP + p][j]);
          need += s[FX + p][j];
        }
        if (need > startTot[p]) return false;
      }
      return true;
    };
    function step(fn, desc) {
      let out = [], seen = new Set();
      for (const s of states) for (const ns of fn(s)) {
        if (!feasible(ns)) continue;
        const k = key(ns); if (!seen.has(k)) { seen.add(k); out.push(ns); }
      }
      if (!out.length) {
        // Impossible from every possible hand: note it once, then carry on with negatives set to 0
        // so that one bad line doesn't make every later line look wrong too.
        if (!lenient) warnings.push('Inconsistent at: ' + desc);
        lenient = true;
        seen = new Set();
        for (const s of states) for (const ns of fn(s)) {
          for (let p = 0; p < NP; p++) for (let j = 0; j < R; j++) {
            const deficit = Math.max(0, -ns[NP + p][j]);
            if (ns[p][j] < 0) ns[p][j] = 0;
            if (deficit > 0 && ns[KN + p][j]) ns[NP + p][j] = 0;
          }
          const k = key(ns); if (!seen.has(k)) { seen.add(k); out.push(ns); }
        }
        if (!out.length) out = states;
      }
      states = out.slice(0, MAX_STATES);
    }
    const apply = (s, p, m, sign) => { for (const r in m) s[p][RES.indexOf(r)] += sign * m[r]; touch(s, p); };
    for (const e of events) {
      if (e.kind === 'add') step(s => { const n = clone(s); apply(n, e.p, e.m, 1); return [n]; }, e.t);
      else if (e.kind === 'sub') step(s => { const n = clone(s); apply(n, e.p, e.m, -1); return [n]; }, e.t);
      else if (e.kind === 'trade') step(s => { const n = clone(s); apply(n, e.a, e.A, -1); apply(n, e.b, e.A, 1); apply(n, e.b, e.B, -1); apply(n, e.a, e.B, 1); return [n]; }, e.t);
      else if (e.kind === 'move') step(s => { const n = clone(s); apply(n, e.from, e.m, -1); apply(n, e.to, e.m, 1); return [n]; }, e.t);
      else if (e.kind === 'zero') step(s => {
        const n = clone(s), j = e.j;
        for (let q = 0; q < NP; q++) {
          if (q === e.except) continue;
          const h = n[q][j];
          if (n[KN + q][j]) { if (h !== 0) return []; }
          else {
            // Count is 0 right now, so the player started with exactly -h of this kind; that only
            // works if they never had fewer before.
            if (h > 0 || h !== n[NP + q][j]) return [];
            n[FX + q][j] = -h;
          }
          n[q][j] = 0; n[NP + q][j] = 0; n[KN + q][j] = 1;
        }
        return [n];
      }, e.t);
      else if (e.kind === 'steal' || e.kind === 'lose') {
        // Unknown card(s): try every kind (with a partial log the victim may hold cards we never saw).
        const times = e.kind === 'lose' ? e.n : 1;
        for (let c = 0; c < times; c++) step(s => {
          const res = [];
          for (let j = 0; j < R; j++) {
            if (!partial && s[e.from][j] <= 0) continue;
            const n = clone(s); n[e.from][j]--; touch(n, e.from);
            if (e.kind === 'steal') { n[e.to][j]++; touch(n, e.to); }
            res.push(n);
          }
          return res;
        }, e.t);
      }
    }

    // Final hands: for each state and player, the lowest point gives the cards they must have started
    // with; any other starting cards are unknown, which widens the range.
    const mine = meIdx >= 0 ? RES.map(r => { const e = doc.getElementById('cat_playerboard_resource_' + r); return e ? +e.textContent.trim() || 0 : null; }) : null;
    const handsOf = s => names.map((_, p) => {
      const base = s[NP + p].map((v, j) => (s[KN + p][j] ? 0 : Math.max(0, -v)));
      const fixed = s[FX + p].reduce((a, b) => a + b, 0);
      const slack = startTot[p] - fixed - base.reduce((a, b) => a + b, 0);
      return { lo: s[p].map((v, j) => v + base[j]), slack, known: s[KN + p].slice() };
    });
    let finals = states.map(handsOf);
    // Keep only states that fit what the page shows: card totals per player, and your own exact hand.
    const fitsPanel = f => f.every((h, p) => h.slack >= 0 && (h.slack === 0 || h.known.some(k => !k)) &&
      (panel[p] == null || h.lo.reduce((a, b) => a + b, 0) + h.slack === panel[p]));
    const fitsMine = f => !mine || mine.some(v => v === null) ||
      (f[meIdx].lo.every((v, j) => mine[j] >= v && mine[j] <= v + (f[meIdx].known[j] ? 0 : f[meIdx].slack)) &&
       mine.reduce((a, b) => a + b, 0) === f[meIdx].lo.reduce((a, b) => a + b, 0) + f[meIdx].slack);
    let mismatch = false;
    let kept = finals.filter(f => fitsPanel(f) && fitsMine(f));
    if (!kept.length) { mismatch = true; kept = finals; }
    // Range of each player's count of each resource across everything still possible.
    const ranges = names.map((_, p) => RES.map((_, j) => {
      let lo = Infinity, hi = -Infinity;
      for (const f of kept) {
        const a = f[p].lo[j], b = a + (f[p].known[j] ? 0 : Math.max(0, f[p].slack));
        if (a < lo) lo = a; if (b > hi) hi = b;
      }
      if (p === meIdx && mine && mine.every(v => v !== null)) { lo = hi = mine[j]; }
      if (panel[p] != null) hi = Math.min(hi, panel[p]);
      return [Math.max(0, lo), Math.max(0, hi)];
    }));

    // Dice deck (BGA "Dice Deck" variant, as described by the BGA developer): two standard 36-card
    // decks (one 2, two 3s, ... six 7s ... one 12); 18 random cards are kept from each and the two
    // halves are shuffled into one 36-card stack, rebuilt when it runs out. Only the totals matter;
    // the dice faces on screen are decoration. Count the totals drawn since the stack was last
    // rebuilt, then work out the chance of each total on the next card.
    const STDC = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
    let obs = new Array(13).fill(0), left = null;
    for (const r of allRecs) {
      if (!r.faces) continue;
      const l = +((r.t.match(/(\d+) card\(s\) left/) || [])[1]);
      if (isNaN(l)) continue;
      if (left !== null && l > left) obs = new Array(13).fill(0); // stack rebuilt
      if (r.faces.length === 2 && r.faces[0] && r.faces[1]) obs[r.faces[0] + r.faces[1]]++;
      left = l;
    }
    let dice = null;
    if (left !== null) {
      const binom = (n, k) => { if (k < 0 || k > n) return 0; let x = 1; for (let i = 1; i <= k; i++) x = x * (n - k + i) / i; return x; };
      const n = obs.reduce((a, b) => a + b, 0);
      // If part of this stack's draws are missing from the log, the odds can't be worked out exactly.
      const complete = n === 36 - left;
      const fresh = left === 0 || n === 0 || n >= 36;
      let deckOk = obs.every((o, sum) => o <= 2 * STDC[sum]);
      const Pd = {};
      if (fresh || !deckOk || !complete) {
        for (let sum = 2; sum <= 12; sum++) Pd[sum] = STDC[sum] / 36;
      } else {
        // Exact odds: sum over how the totals seen so far could split between the two half-decks.
        const mul = (x, y) => { const z = new Array(x.length + y.length - 1).fill(0); x.forEach((a, i) => { if (a) y.forEach((b, j) => { z[i + j] += a * b; }); }); return z; };
        const poly = {};
        for (let sum = 2; sum <= 12; sum++) poly[sum] = Array.from({ length: obs[sum] + 1 }, (_, a) => binom(obs[sum], a) * binom(STDC[sum], a) * binom(STDC[sum], obs[sum] - a));
        const prodExcept = ex => { let z = [1]; for (let sum = 2; sum <= 12; sum++) if (sum !== ex) z = mul(z, poly[sum]); return z; };
        const all = prodExcept(0);
        const W = all.map((v, k) => (k <= 18 && n - k <= 18 ? v * binom(36 - k, 18 - k) * binom(36 - (n - k), 18 - (n - k)) : 0));
        const Z = W.reduce((a, b) => a + b, 0);
        if (!(Z > 0)) { deckOk = false; for (let sum = 2; sum <= 12; sum++) Pd[sum] = STDC[sum] / 36; }
        else for (let sum = 2; sum <= 12; sum++) {
          const others = prodExcept(sum);
          let rem = 0;
          W.forEach((w, k) => {
            if (!w) return;
            let num = 0;
            poly[sum].forEach((f, a) => { if (f && k - a >= 0 && k - a < others.length) num += a * f * others[k - a]; });
            const ea = num / all[k];
            rem += (w / Z) * ((18 - k) / (36 - k) * (STDC[sum] - ea) + (18 - (n - k)) / (36 - (n - k)) * (STDC[sum] - (obs[sum] - ea)));
          });
          Pd[sum] = rem / (36 - n);
        }
      }
      dice = { P: Pd, left, fresh, deckOk, complete };
    }

    return { names, players, panel, warnings, mismatch, lenient, lastMove, meIdx, dice, ranges, partial, states: kept };
  }

  // Wide layout (computer): name, card count and resources on one line; big numbers.
  function renderWide(r) {
    const num = v => '<span style="font-size:20px;font-weight:700;line-height:1;vertical-align:-1px">' + v + '</span>';
    let h = '<div style="font-weight:600;font-size:12px;white-space:nowrap"><span style="opacity:.75">🃏 move ' + r.lastMove + '</span>' +
      ' <span style="margin-left:6px;padding:0 5px;border-radius:4px;font-size:13px;' +
      (showDice ? 'background:rgba(255,255,255,.18)' : 'opacity:.45;border:1px solid rgba(255,255,255,.35)') + '">🎲</span></div>';
    r.names.forEach((n, i) => {
      if (i === r.meIdx) return; // your own cards are already on screen; still used for the maths
      const color = '#' + (r.players[i].color || 'fff');
      const parts = [];
      RES.forEach((res, j) => {
        const [lo, hi] = r.ranges[i][j];
        if (hi === 0) return;
        parts.push(lo === hi ? num(lo) + LABEL[res] : '<span style="color:#ffcf5a">' + num(lo + '–' + hi) + LABEL[res] + '</span>');
      });
      h += '<div style="white-space:nowrap"><b style="color:' + color + '">' + n + '</b> <span style="opacity:.7">(' + (r.panel[i] ?? '?') + ')</span>&nbsp;&nbsp; ' +
        (parts.length ? parts.join('&nbsp;&nbsp;&nbsp;') : '<span style="opacity:.6">no cards</span>') + '</div>';
    });
    if (r.dice && showDice) {
      // Next-roll odds: chance of each total, and how many points above/below normal dice.
      const STD = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
      let row = '<div data-row="dice" style="display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid rgba(255,255,255,.15);padding-top:0;font-size:11px">';
      row += '<span style="font-size:10px;opacity:.65;white-space:nowrap">next roll · ' + (r.dice.fresh ? 'new stack' : r.dice.left + ' left') + '</span>';
      // Each total sits in a small rounded square, like a die face; the 7 (robber) is red.
      const chip = n => '<span style="display:inline-block;min-width:15px;height:15px;line-height:15px;padding:0 1px;box-sizing:border-box;text-align:center;' +
        'border-radius:4px;font-size:10px;font-weight:700;vertical-align:middle;' +
        (n === 7 ? 'background:#e24b4a;color:#fff' : 'background:#f2f2f2;color:#1b1f27') + '">' + n + '</span>';
      for (let sum = 2; sum <= 12; sum++) {
        const pct = r.dice.P[sum] * 100, diff = Math.round(pct - STD[sum] / 36 * 100);
        const delta = diff === 0 ? '' : ' <span style="font-size:10px;font-weight:700;color:' + (diff > 0 ? '#7fd17f' : '#ff8080') + '">' + (diff > 0 ? '+' : '−') + Math.abs(diff) + '</span>';
        row += '<span style="white-space:nowrap">' + chip(sum) + ' <span style="font-size:11px;vertical-align:middle">' + Math.round(pct) + '%' + delta + '</span></span>';
      }
      h += row + '</div>';
      if (!r.dice.deckOk) h += '<div style="color:#ff7a7a;font-size:12px">⚠ Dice odds may be off: a total came up more often than BGA\'s dice deck allows.</div>';
    }
    if (r.mismatch && !r.warnings.length) h += '<div style="color:#ff7a7a;font-size:12px">⚠ Log and card counts disagree — numbers may be off.</div>';
    if (r.warnings.length) h += '<div style="color:#ff7a7a;font-size:12px">⚠ ' + r.warnings[0].replace(/</g, '&lt;').slice(0, 140) + '</div>';
    box.innerHTML = h;
  }

  // Fit the tracker into BGA's top bar: between the logo/table info on the left and the icons on the right.
  function placeWide(win) {
    const doc = win.document, tb = doc.getElementById('topbar');
    if (!tb) return;
    const f = win === window ? null : document.querySelector('iframe[src*="catan"]');
    const o = f ? f.getBoundingClientRect() : { left: 0, top: 0 };
    const t = tb.getBoundingClientRect();
    const L = doc.querySelector('.topbar_left_content'), R = doc.getElementById('upperrightmenu');
    const left = o.left + (L ? L.getBoundingClientRect().right : t.left) + 6;
    const right = o.left + (R ? R.getBoundingClientRect().left : t.right) - 6;
    if (right - left < 300 || t.height < 30) return; // bar not usable: keep the fallback spot
    // Flush with the top of the window, and down through the empty blue strip to just above the status line.
    const pt = doc.getElementById('page-title');
    const bottom = pt ? pt.getBoundingClientRect().top - 2 : t.bottom + 10;
    const height = Math.max(56, Math.min(90, bottom - Math.max(0, t.top)));
    Object.assign(box.style, { left: left + 'px', width: (right - left) + 'px', transform: 'none',
      top: Math.max(0, o.top + t.top) + 'px', minHeight: height + 'px' });
  }

  // Narrow windows: shrink the cards line and the dice line so they always fit inside the tracker.
  function fitWide() {
    const sum = els => els.reduce((a, c) => a + c.getBoundingClientRect().width, 0);
    const avail = box.clientWidth - 24 - 2; // minus left/right padding
    const top = [...box.children].filter(c => !c.dataset.row && !/color:#ff/.test(c.getAttribute('style') || ''));
    top.forEach(c => { c.style.zoom = ''; });
    const topGaps = 28 * (top.length - 1);
    if (sum(top) + topGaps > avail) { const z = Math.max(0.45, 0.97 * (avail - topGaps) / sum(top)); top.forEach(c => { c.style.zoom = z; }); }
    const row = box.querySelector('[data-row="dice"]');
    if (!row) return;
    const kids = [...row.children];
    kids.forEach(c => { c.style.zoom = ''; c.style.display = ''; });
    const room = avail; // the row's own width can't be trusted: it stretches to fit its content
    const fits = () => { const vis = kids.filter(c => c.style.display !== 'none'); return sum(vis) + 8 * (vis.length - 1) <= room; };
    if (!fits()) kids[0].style.display = 'none'; // drop the "next roll · N left" label first
    if (!fits()) {
      const vis = kids.filter(c => c.style.display !== 'none');
      const z = Math.max(0.45, 0.97 * (room - 8 * (vis.length - 1)) / sum(vis));
      vis.forEach(c => { c.style.zoom = z; });
    }
  }

  // Phone layout: one row per opponent, large numbers and icons, no dice odds.
  function renderPhone(r) {
    if (collapsed) { box.innerHTML = '<div style="font-size:16px;justify-content:center">🃏</div>'; return; }
    // Two opponents (the usual 3-player game) get bigger type than three.
    const px = r.names.length - (r.meIdx >= 0 ? 1 : 0) <= 2 ? 24 : 20;
    const num = v => '<b style="font-size:' + px + 'px;line-height:1">' + v + '</b>';
    const icon = res => '<span style="font-size:' + px + 'px;line-height:1;margin-left:2px">' + ICON[res] + '</span>';
    let h = '';
    r.names.forEach((n, i) => {
      if (i === r.meIdx) return; // your own cards are already on screen
      const color = '#' + (r.players[i].color || 'fff');
      const parts = [];
      RES.forEach((res, j) => {
        const [lo, hi] = r.ranges[i][j];
        if (hi === 0) return;
        parts.push(lo === hi ? '<span>' + num(lo) + icon(res) + '</span>'
          : '<span style="color:#ffcf5a">' + num(lo + '–' + hi) + icon(res) + '</span>');
      });
      h += '<div><span class="nm" style="color:' + color + '">' + n + '</span><span class="ct">(' + (r.panel[i] ?? '?') + ')</span>' +
        '<span class="rs">' + (parts.length ? parts.join('') : '<span style="opacity:.6">no cards</span>') + '</span></div>';
    });
    if (r.mismatch && !r.warnings.length) h += '<div class="warn">⚠ Log and card counts disagree</div>';
    if (r.warnings.length) h += '<div class="warn">⚠ ' + r.warnings[0].replace(/</g, '&lt;').slice(0, 90) + '</div>';
    box.innerHTML = h;
  }

  // Phone: in BGA's top bar between the logo and the menu icons, full height of the bar.
  function placePhone(win) {
    const doc = win.document, tb = doc.getElementById('topbar');
    if (!tb) return;
    const f = win === window ? null : document.querySelector('iframe[src*="catan"]');
    const o = f ? f.getBoundingClientRect() : { left: 0, top: 0 };
    const t = tb.getBoundingClientRect();
    const L = doc.querySelector('.topbar_left_content'), R = doc.getElementById('upperrightmenu');
    let left = o.left + (L ? L.getBoundingClientRect().right : t.left) + 4;
    let right = o.left + (R ? R.getBoundingClientRect().left : t.right) - 4;
    if (right - left < 170) { left = 0; right = innerWidth; } // too little room: use the full width
    if (collapsed) left = right - 40;
    Object.assign(box.style, { left: left + 'px', width: (right - left) + 'px',
      top: Math.max(0, o.top + t.top) + 'px', minHeight: (collapsed ? 32 : Math.max(48, t.height)) + 'px' });
  }

  // Phone: shrink a row if it is wider than the tracker (long names, many kinds of cards).
  function fitPhone() {
    const room = box.clientWidth - 16;
    for (const row of box.children) {
      if (row.classList.contains('warn')) continue;
      row.style.zoom = '';
      const w = [...row.children].reduce((a, c) => a + c.getBoundingClientRect().width, 0) + 10;
      if (w > room) row.style.zoom = Math.max(0.6, 0.97 * room / w);
    }
  }

  const render = r => (mode === 'phone' ? renderPhone(r) : renderWide(r));
  const place = win => (mode === 'phone' ? placePhone(win) : placeWide(win));
  const fit = () => (mode === 'phone' ? fitPhone() : fitWide());

  function tick() {
    try {
      const win = gameWin();
      if (!win || !win.gameui || !win.gameui.gamedatas) { box.style.display = 'none'; lastSig = ''; return; } // not a Catan game (yet)
      setMode(isPhone() ? 'phone' : 'wide');
      box.style.display = 'flex';
      place(win);
      fit();
      const doc = win.document;
      const sig = doc.querySelectorAll('#logs .log').length + '|' +
        [...doc.querySelectorAll('[id^="cat_panel_resources_"], [id^="cat_playerboard_resource_"]')].map(e => e.textContent.trim()).join(',') + '|' + collapsed + '|' + showDice + '|' + mode;
      if (sig === lastSig) return;
      lastSig = sig;
      const r = compute(win);
      window.__catTracker.last = r;
      render(r);
      fit();
    } catch (e) { box.textContent = '🃏 Hand tracker error: ' + e.message; }
  }

  window.__catTracker = { box, fit, timer: setInterval(tick, 1500) };
  window.addEventListener('resize', () => { try { const w = gameWin(); if (!w || !w.gameui) return; const m = mode; setMode(isPhone() ? 'phone' : 'wide'); if (m !== mode) { lastSig = ''; tick(); } else { place(w); fit(); } } catch (e) {} });
  tick();
})();
