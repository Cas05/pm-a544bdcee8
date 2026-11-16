/* Pitchmark scoring + dealing. Browser + Node.
   Mirrors Hashmark's engine; differences: 11 slots in a 4-3-3, 18 edges,
   5 cards per round, 11 rounds, league/nation/club chemistry. */
(function (root) {
  "use strict";

  // Attack at the top, keeper at the bottom (x/y are % of the board).
  const SLOTS = [
    { id: "LW", pos: "LW", x: 14, y: 10, label: "LW" },
    { id: "ST", pos: "ST", x: 50, y: 7, label: "ST" },
    { id: "RW", pos: "RW", x: 86, y: 10, label: "RW" },
    { id: "CM1", pos: "CM", x: 21, y: 37, label: "CM" },
    { id: "CM2", pos: "CM", x: 50, y: 42, label: "CM" },
    { id: "CM3", pos: "CM", x: 79, y: 37, label: "CM" },
    { id: "LB", pos: "LB", x: 10, y: 64, label: "LB" },
    { id: "CB1", pos: "CB", x: 30, y: 68, label: "CB" },
    { id: "CB2", pos: "CB", x: 70, y: 68, label: "CB" },
    { id: "RB", pos: "RB", x: 90, y: 64, label: "RB" },
    { id: "GK", pos: "GK", x: 50, y: 91, label: "GK" },
  ];
  const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

  // 18 links, FUT-style 4-3-3: every slot has 2-5 neighbours (GK 2, CM2 5).
  const EDGES = [
    ["GK", "CB1"], ["GK", "CB2"],
    ["CB1", "CB2"], ["LB", "CB1"], ["CB2", "RB"],
    ["LB", "CM1"], ["CB1", "CM2"], ["CB2", "CM2"], ["RB", "CM3"],
    ["CM1", "CM2"], ["CM2", "CM3"],
    ["CM1", "LW"], ["CM2", "ST"], ["CM3", "RW"],
    ["LW", "ST"], ["ST", "RW"],
    ["LB", "LW"], ["RB", "RW"],
  ];

  const TIER_TALENT = { bronze: 3, silver: 5, gold: 8, platinum: 11, hero: 15 };
  const TIER_ORDER = ["hero", "platinum", "gold", "silver", "bronze"];
  // Hashmark's official table; rounds 10-11 reuse round 9.
  const TIER_WEIGHTS = {
    1: { hero: 2, platinum: 80, gold: 18, silver: 0, bronze: 0 },
    2: { hero: 2, platinum: 50, gold: 45, silver: 3, bronze: 0 },
    3: { hero: 2, platinum: 10, gold: 65, silver: 23, bronze: 0 },
    4: { hero: 2, platinum: 8, gold: 45, silver: 40, bronze: 5 },
    5: { hero: 2, platinum: 8, gold: 25, silver: 60, bronze: 5 },
    6: { hero: 2, platinum: 7, gold: 10, silver: 50, bronze: 31 },
    7: { hero: 2, platinum: 7, gold: 10, silver: 41, bronze: 40 },
    8: { hero: 2, platinum: 5, gold: 7, silver: 21, bronze: 65 },
    9: { hero: 2, platinum: 4, gold: 6, silver: 18, bronze: 70 },
    10: { hero: 2, platinum: 4, gold: 6, silver: 18, bronze: 70 },
    11: { hero: 2, platinum: 4, gold: 6, silver: 18, bronze: 70 },
  };
  const ROUNDS = 11;
  const CARDS_PER_ROUND = 5;

  // FUT-style: a player fits any slot family in p.slots (primary + EA alternates).
  function playerSlots(p) {
    if (!p) return [];
    return Array.isArray(p.slots) && p.slots.length ? p.slots : [p.pos];
  }
  function slotAccepts(slotId, playerOrPos) {
    const slot = SLOT_BY_ID[slotId];
    if (!slot || !playerOrPos) return false;
    if (typeof playerOrPos === "string") return slot.pos === playerOrPos;
    return playerSlots(playerOrPos).includes(slot.pos);
  }
  function openPositions(lineup) {
    const set = new Set();
    for (const s of SLOTS) if (!lineup[s.id]) set.add(s.pos);
    return [...set];
  }
  function legalSlotsFor(player, lineup) {
    if (!player) return [];
    return SLOTS.filter((s) => slotAccepts(s.id, player) && !lineup[s.id]).map((s) => s.id);
  }
  function canPlace(player, slotId, lineup) {
    return legalSlotsFor(player, lineup).includes(slotId);
  }
  // Move a placed card to another slot; swaps if the other slot is filled and both fit.
  function canMove(fromId, toId, lineup) {
    const a = lineup[fromId];
    if (!a || fromId === toId || !slotAccepts(toId, a)) return false;
    const b = lineup[toId];
    return !b || slotAccepts(fromId, b);
  }
  function filledCount(lineup) {
    return SLOTS.reduce((n, s) => n + (lineup[s.id] ? 1 : 0), 0);
  }
  function squadOvr(lineup) {
    const ps = SLOTS.map((s) => lineup[s.id]).filter(Boolean);
    if (!ps.length) return 0;
    return Math.round((ps.reduce((n, p) => n + (Number(p.ovr) || 0), 0) / ps.length) * 10) / 10;
  }

  // Club +2 (same club already implies same league, so league is not added on top),
  // else league +1; nationality +1. Capped at 2 per link, like Hashmark.
  function lineRaw(a, b) {
    if (!a || !b) return 0;
    let pts = 0;
    if (a.clubKey && a.clubKey === b.clubKey) pts += 2;
    else if (a.leagueKey && a.leagueKey === b.leagueKey) pts += 1;
    if (a.nation && a.nation === b.nation) pts += 1;
    return pts;
  }
  function lineResult(a, b) {
    const raw = lineRaw(a, b);
    if (raw >= 2) return { score: 2, color: "green", raw };
    if (raw === 1) return { score: 1, color: "yellow", raw };
    return { score: 0, color: "red", raw };
  }
  function dotFromConn(conn) {
    if (conn >= 4) return { bonus: 11, color: "green", conn };
    if (conn >= 2) return { bonus: 6, color: "yellow", conn };
    return { bonus: 0, color: "red", conn };
  }
  function scoreLineup(lineup) {
    const lines = EDGES.map(([a, b]) => {
      const pa = lineup[a] || null, pb = lineup[b] || null;
      const filled = !!(pa && pb);
      const res = filled ? lineResult(pa, pb) : { score: 0, color: "empty", raw: 0 };
      return { a, b, filled, ...res };
    });
    const conn = {};
    SLOTS.forEach((s) => (conn[s.id] = 0));
    let lineScore = 0;
    for (const l of lines) {
      if (!l.filled) continue;
      lineScore += l.score;
      conn[l.a] += l.score;
      conn[l.b] += l.score;
    }
    const dots = {};
    let dotScore = 0, talent = 0;
    for (const s of SLOTS) {
      const p = lineup[s.id];
      if (p) talent += Number(p.talent) || 0;
      const d = p ? dotFromConn(conn[s.id]) : { bonus: 0, color: "empty", conn: 0 };
      dots[s.id] = d;
      if (p) dotScore += d.bonus;
    }
    const chem = lineScore + dotScore;
    return { talent, chem, total: talent + chem, lineScore, dotScore, lines, dots, conn };
  }

  // FUT-style display chemistry, 0-3 per player (max 33): share of this player's
  // possible link points earned (2 per link). Display only; scoring uses scoreLineup.
  const DEGREE = {};
  SLOTS.forEach((s) => (DEGREE[s.id] = 0));
  EDGES.forEach(([a, b]) => { DEGREE[a]++; DEGREE[b]++; });
  function playerChem(lineup) {
    const sc = scoreLineup(lineup);
    const out = {};
    let total = 0;
    for (const s of SLOTS) {
      const v = lineup[s.id] ? Math.min(3, Math.floor((3 * sc.conn[s.id]) / (2 * DEGREE[s.id]) + 1e-9)) : 0;
      out[s.id] = v;
      total += v;
    }
    return { per: out, total, max: SLOTS.length * 3 };
  }
  function squadRating(lineup) {
    const ps = SLOTS.map((s) => lineup[s.id]).filter(Boolean);
    return ps.length ? Math.round(ps.reduce((n, p) => n + (Number(p.ovr) || 0), 0) / ps.length) : 0;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rollTier(round, rng) {
    const w = TIER_WEIGHTS[round] || TIER_WEIGHTS[9];
    const total = TIER_ORDER.reduce((s, t) => s + (w[t] || 0), 0);
    let r = rng() * total, last = TIER_ORDER[0];
    for (const t of TIER_ORDER) {
      const x = w[t] || 0;
      if (x <= 0) continue;
      last = t;
      if (r < x) return t;
      r -= x;
    }
    return last;
  }
  function fallbackTiers(wanted, round) {
    const start = Math.max(0, TIER_ORDER.indexOf(wanted));
    const order = [TIER_ORDER[start]];
    for (let d = 1; d < TIER_ORDER.length; d++) {
      if (start - d >= 0) order.push(TIER_ORDER[start - d]);
      if (start + d < TIER_ORDER.length) order.push(TIER_ORDER[start + d]);
    }
    return round <= 3 ? order.filter((t) => t !== "bronze") : order;
  }
  function pickRandom(items, rng) {
    return items.length ? items[Math.floor(rng() * items.length)] : null;
  }
  function dealRound(players, opts) {
    const round = opts.round, count = opts.count || CARDS_PER_ROUND;
    const used = opts.usedIds || new Set(), lineup = opts.lineup || {}, rng = opts.rng || Math.random;
    const open = openPositions(lineup);
    const pool = players.filter((p) => !used.has(p.id) && playerSlots(p).some((f) => open.includes(f)));
    const dealt = [], ids = new Set();
    for (let i = 0; i < count; i++) {
      const order = fallbackTiers(rollTier(round, rng), round);
      let card = null;
      for (const t of order) {
        card = pickRandom(pool.filter((p) => p.tier === t && !ids.has(p.id)), rng);
        if (card) break;
      }
      if (!card) break;
      dealt.push(card);
      ids.add(card.id);
    }
    return dealt;
  }
  function emptyLineup() {
    const l = {};
    SLOTS.forEach((s) => (l[s.id] = null));
    return l;
  }

  const engine = { SLOTS, SLOT_BY_ID, EDGES, TIER_TALENT, TIER_ORDER, TIER_WEIGHTS, ROUNDS, CARDS_PER_ROUND,
    playerSlots, slotAccepts, openPositions, legalSlotsFor, canPlace, canMove, filledCount, squadOvr, playerChem, squadRating, DEGREE, lineRaw, lineResult, dotFromConn, scoreLineup,
    mulberry32, rollTier, fallbackTiers, dealRound, emptyLineup };
  if (typeof module !== "undefined" && module.exports) module.exports = engine;
  root.PitchEngine = engine;
})(typeof window !== "undefined" ? window : globalThis);
