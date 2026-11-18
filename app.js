/* Pitchmark UI — local, offline, unlimited soccer card drafts. */
(function () {
  "use strict";

  const E = window.PitchEngine;
  const DATA = window.SOCCER_DATA || { players: [], clubs: {} };
  const PLAYERS = DATA.players;
  const CLUBS = DATA.clubs || {};
  const STORE_KEY = "pitchmark-v1";

  const $ = (id) => document.getElementById(id);
  const slotsEl = $("slots");
  const svgEl = $("chemSvg");
  const trayEl = $("tray");
  const helpModal = $("helpModal");

  const state = {
    screen: "home",
    lineup: E.emptyLineup(),
    deal: [],
    selectedDeal: null,
    selectedSlot: null,
    usedIds: new Set(),
    round: 1,
    rng: Math.random,
    history: [],
    stats: { plays: 0, bestTotal: 0, bestTalent: 0, bestChem: 0, bestOvr: 0 },
    currentId: null,
    suppressFinish: false,
    skipsLeft: 1,
    lastResult: null,
  };

  /* ---------- storage ---------- */
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.history = Array.isArray(data.drafts) ? data.drafts : [];
      state.stats = Object.assign(state.stats, data.stats || {});
    } catch (err) {
      console.warn("Pitchmark: could not read history", err);
    }
  }
  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, stats: state.stats, drafts: state.history.slice(0, 40) }));
    } catch (err) {
      console.warn("Pitchmark: could not save history", err);
    }
  }
  function snapshotLineup(lineup) {
    const out = {};
    for (const s of E.SLOTS) {
      const p = lineup[s.id];
      out[s.id] = p ? { id: p.id, name: p.name, ovr: p.ovr, tier: p.tier, club: p.club, nationCode: p.nationCode } : null;
    }
    return out;
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function boardName(p) {
    const m = /^[A-Z]\. (.+)$/.exec(p.name);
    return m ? m[1] : p.name;
  }
  function clubColors(p) {
    return CLUBS[p.club] || { primary: "#333", secondary: "#999" };
  }
  const TIER_NAME = { bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum", hero: "Hero" };
  function fmtWhen(iso) {
    try {
      return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch (e) {
      return iso;
    }
  }
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  const LG_CLASS = { EPL: "lg-epl", LaLiga: "lg-laliga", BUN: "lg-bun", "SERIE A": "lg-seriea", "LIGUE 1": "lg-ligue1", MLS: "lg-mls" };
  const LG_SHORT = { EPL: "PL", LaLiga: "LL", BUN: "BL", "SERIE A": "SA", "LIGUE 1": "L1", MLS: "MLS" };
  function initials(p) {
    const parts = String(p.name).replace(/\./g, "").split(/\s+/).filter(Boolean);
    return ((parts[0] || "")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function silhouette(p, withIni) {
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><path class="shirt" d="M3 40 Q4 27 20 26 Q36 27 37 40 Z"/><path class="trim" d="M15 26.6 L20 31 L25 26.6 L23 26.2 L20 28.6 L17 26.2 Z"/><rect class="neck" x="16.5" y="18" width="7" height="9" rx="3"/><ellipse class="head" cx="20" cy="13" rx="7" ry="8"/>${withIni ? `<text class="ini" x="20" y="38.5">${esc(initials(p))}</text>` : ""}</svg>`;
  }

  function cardHtml(p, opts) {
    opts = opts || {};
    if (!p) return "";
    const c = clubColors(p);
    const compact = !!opts.compact;
    const flag = `<img class="flag" src="flags/${esc(p.flag)}.svg" alt="${esc(p.nation)}" width="18" height="13">`;
    const alt = (p.slots || []).filter((f) => f !== p.pos);
    const aria = `${p.name}, ${p.ovr} overall, ${p.eaPos}, ${p.club}, ${p.league}, ${p.nation}, ${TIER_NAME[p.tier]}`;
    const lg = `<span class="b-lg ${LG_CLASS[p.leagueKey] || ""}">${esc(compact ? LG_SHORT[p.leagueKey] : p.leagueChip)}</span>`;
    return `<article class="card tier-${p.tier}${compact ? " compact" : ""}${opts.selected ? " selected" : ""}" data-id="${p.id}" style="--club-primary:${c.primary};--club-secondary:${c.secondary}" role="button" tabindex="0" aria-label="${esc(aria)}">
      <div class="card-face">
        <div class="c-top"><span class="c-ovr">${p.ovr}</span><span class="c-pos">${esc(p.eaPos)}</span></div>
        <div class="c-art">${silhouette(p, !compact)}</div>
        <div class="c-name">${esc(compact ? boardName(p) : p.name)}</div>
        ${compact ? "" : `<div class="c-sub">${esc(p.club)}${alt.length ? " · also " + esc(alt.join("/")) : ""}</div>`}
        <div class="c-rule"></div>
        <div class="c-badges">${flag}${lg}<span class="b-club">${esc(p.clubCode)}</span></div>
        ${compact ? "" : `<div class="c-pts">+${p.talent} talent</div>`}
      </div>
    </article>`;
  }

  function fitNames() {
    document.querySelectorAll(".slot .c-name, .deal-grid .c-name").forEach((el) => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize);
      let guard = 0;
      while (el.scrollWidth > el.clientWidth + 0.5 && size > 7.5 && guard++ < 12) {
        size -= 0.5;
        el.style.fontSize = size + "px";
      }
    });
  }

  /* ---------- score display ---------- */
  function score() {
    return E.scoreLineup(state.lineup);
  }
  const anim = { chem: 0, total: 0, final: 0 };
  const timers = {};
  function animateNumber(el, key, to, ms) {
    if (!el) return;
    const from = Number(anim[key]) || 0;
    anim[key] = to;
    if (prefersReducedMotion() || from === to) {
      el.textContent = to;
      return;
    }
    const dur = ms == null ? 380 : ms;
    const start = performance.now();
    if (timers[key]) cancelAnimationFrame(timers[key]);
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) timers[key] = requestAnimationFrame(step);
    };
    timers[key] = requestAnimationFrame(step);
  }
  function updateGrade(s, pc) {
    const rating = E.squadRating(state.lineup);
    $("statRating").textContent = rating || "—";
    animateNumber($("statChem33"), "chem", pc.total);
    animateNumber($("statTotal"), "total", s.total);
  }

  /* ---------- board ---------- */
  function ensureSlots() {
    if (slotsEl.dataset.ready) return;
    slotsEl.innerHTML = E.SLOTS.map((s) => `<div class="slot empty" data-slot="${s.id}" style="left:${s.x}%;top:${s.y}%">
        <div class="slot-target" data-slot="${s.id}"></div>
        <div class="pos-chip c0" data-chip="${s.id}"><span>${s.label}</span><span class="dia"><i></i><i></i><i></i></span></div>
      </div>`).join("");
    svgEl.innerHTML = E.EDGES.map(([a, b], i) => {
      const sa = E.SLOT_BY_ID[a], sb = E.SLOT_BY_ID[b];
      return `<line data-edge="${i}" class="empty" x1="${sa.x}" y1="${sa.y}" x2="${sb.x}" y2="${sb.y}" vector-effect="non-scaling-stroke"/>`;
    }).join("");
    slotsEl.dataset.ready = "1";
  }

  function legalTargets() {
    const legal = new Set();
    if (state.screen === "draft" && state.selectedDeal != null && state.deal[state.selectedDeal]) {
      E.legalSlotsFor(state.deal[state.selectedDeal], state.lineup).forEach((id) => legal.add(id));
    } else if (state.selectedSlot) {
      E.SLOTS.forEach((s) => { if (E.canMove(state.selectedSlot, s.id, state.lineup)) legal.add(s.id); });
    }
    return legal;
  }

  function renderField() {
    ensureSlots();
    const s = score();
    const pc = E.playerChem(state.lineup);
    updateGrade(s, pc);
    const legal = legalTargets();
    for (const slot of E.SLOTS) {
      const el = slotsEl.querySelector(`.slot[data-slot="${slot.id}"]`);
      const target = el.querySelector(".slot-target");
      const p = state.lineup[slot.id];
      const prev = el.dataset.playerId || "";
      const next = p ? String(p.id) : "";
      el.classList.toggle("empty", !p);
      el.classList.toggle("filled", !!p);
      el.classList.toggle("legal", legal.has(slot.id));
      el.classList.toggle("selected", state.selectedSlot === slot.id);
      if (prev !== next || target.dataset.sel !== String(state.selectedSlot === slot.id)) {
        target.innerHTML = p ? cardHtml(p, { compact: true, selected: state.selectedSlot === slot.id }) : "";
        target.dataset.sel = String(state.selectedSlot === slot.id);
        if (p && prev !== next && !prefersReducedMotion()) {
          const card = target.querySelector(".card");
          if (card) card.classList.add("just-placed");
        }
      }
      el.dataset.playerId = next;
      el.querySelector(".pos-chip").className = "pos-chip c" + pc.per[slot.id] + (p ? " has-player" : "");
    }
    s.lines.forEach((line, i) => {
      const node = svgEl.querySelector(`[data-edge="${i}"]`);
      if (!node) return;
      const prev = (node.getAttribute("class") || "empty").split(" ")[0];
      node.setAttribute("class", line.color);
      if (prev !== line.color && (line.color === "green" || line.color === "yellow") && !prefersReducedMotion()) {
        node.classList.add("draw");
      }
    });
    fitNames();
  }

  /* ---------- tray ---------- */
  function renderTrayAndFit() { renderTray(); fitNames(); }
  function renderTray() {
    if (state.screen === "home") trayEl.innerHTML = renderHome();
    else if (state.screen === "history") trayEl.innerHTML = renderHistory();
    else if (state.screen === "results") trayEl.innerHTML = renderResults();
    else trayEl.innerHTML = renderDeal();
    trayEl.dataset.screen = state.screen;
  }

  function renderHome() {
    const st = state.stats;
    return `<div class="home">
      <h1>Soccer card draft</h1>
      <p class="lede">Big 5 + MLS. Eleven rounds, five cards a round. Stack OVR and chemistry, then draft again. No tokens, no limits.</p>
      <div class="stats-row">
        <div class="stat-chip"><em>${st.bestTotal || 0}</em><span>Best</span></div>
        <div class="stat-chip"><em>${st.bestOvr ? Number(st.bestOvr).toFixed(1) : "—"}</em><span>Best OVR</span></div>
        <div class="stat-chip"><em>${st.plays || 0}</em><span>Drafts</span></div>
      </div>
      <button type="button" class="btn btn-primary btn-big" data-action="start" id="startBtn">Start draft</button>
      <button type="button" class="btn btn-ghost" data-action="history" id="historyBtn">Best drafts</button>
    </div>`;
  }

  function renderDeal() {
    const sel = state.selectedDeal != null ? state.deal[state.selectedDeal] : null;
    const alt = sel ? (sel.slots || []).filter((f) => f !== sel.pos) : [];
    const hint = sel
      ? `<strong>${esc(sel.name)}</strong> · ${esc(sel.club)}${alt.length ? " · also " + esc(alt.join("/")) : ""} · +${sel.talent} → tap a glowing spot`
      : state.selectedSlot ? "Tap a glowing spot to move or swap." : "Pick a card, then a spot.";
    const skipLabel = `⤼ Skip ${state.skipsLeft}`;
    const sig = state.round + ":" + state.deal.map((p) => p.id).join(",");
    const fresh = state._dealSig !== sig;
    state._dealSig = sig;
    return `<div class="deal">
      <div class="tray-head">
        <div class="tray-title"><h2>Round ${state.round} of ${E.ROUNDS}</h2><p class="hint">${hint}</p></div>
        <div class="tray-actions">
          <button type="button" class="btn btn-mini btn-skip" data-action="skip" id="skipBtn"${state.skipsLeft > 0 ? "" : " disabled"} aria-label="Skip these 5 cards and draw 5 new ones (${state.skipsLeft} left)" title="Discard these 5 and draw 5 new cards, same round odds">${skipLabel}</button>
          <button type="button" class="btn btn-mini" data-action="restart" id="restartBtn" aria-label="Start a new draft">↻ New</button>
        </div>
      </div>
      <div class="deal-grid${fresh ? " fresh-deal" : ""}" id="dealRow">${state.deal.map((p, i) => `<div data-deal="${i}">${cardHtml(p, { compact: true, selected: state.selectedDeal === i })}</div>`).join("")}</div>
    </div>`;
  }

  function renderResults() {
    const s = score();
    const r = state.lastResult || {};
    const ovr = E.squadOvr(state.lineup);
    const pc = E.playerChem(state.lineup);
    const note = r.isBest ? "New personal best!" : `Personal best: ${state.stats.bestTotal || 0}`;
    return `<div class="results">
      <div class="results-top">
        <div class="res-total">
          <span class="label">Score</span>
          <em id="finalTotal">${s.total}</em>
          <span class="best${r.isBest ? " is-best" : ""}">${note}</span>
        </div>
        <div class="res-stats">
          <div class="res-stat"><span>Rating</span><strong id="resRating">${E.squadRating(state.lineup)}</strong></div>
          <div class="res-stat chem"><span>Chemistry</span><strong id="resChem33">${pc.total}/33</strong></div>
          <div class="res-stat"><span>Avg OVR</span><strong id="resOvr">${ovr.toFixed(1)}</strong></div>
          <div class="res-stat"><span>Talent + Chem</span><strong id="resBreak">${s.talent} + ${s.chem}</strong></div>
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-big" data-action="again" id="draftAgainBtn">Draft again</button>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" data-action="history" id="resultsHistoryBtn">Best drafts</button>
        <button type="button" class="btn btn-ghost" data-action="home" id="resultsHomeBtn">Home</button>
      </div>
    </div>`;
  }

  function renderHistory() {
    const rows = state.history.length
      ? state.history.slice().sort((a, b) => b.total - a.total || String(b.at).localeCompare(String(a.at))).slice(0, 15).map((d, i) => {
          const stars = Object.values(d.lineup || {}).filter(Boolean).sort((a, b) => b.ovr - a.ovr).slice(0, 3).map((p) => esc(p.name)).join(", ");
          return `<li><span class="rank">${i + 1}</span><span class="h-main">Rating ${d.rating || Math.round(d.ovr || 0)} · Chem ${d.chem33 != null ? d.chem33 : "—"}/33<br><small>${fmtWhen(d.at)} · ${stars}</small></span><span class="score">${d.total}</span></li>`;
        }).join("")
      : `<li class="empty-hist">No drafts yet.</li>`;
    return `<div class="history">
      <div class="tray-head"><div class="tray-title"><h2>Best drafts</h2><p class="hint">Saved on this device</p></div></div>
      <ul class="history-list">${rows}</ul>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" data-action="start" id="histStartBtn">Start draft</button>
        <button type="button" class="btn btn-ghost" data-action="home" id="histHomeBtn">Home</button>
      </div>
    </div>`;
  }

  /* ---------- flow ---------- */
  function resetBoard() {
    state.lineup = E.emptyLineup();
    state.usedIds = new Set();
    state.round = 1;
    state.deal = [];
    state.selectedDeal = null;
    state.selectedSlot = null;
    state.lastResult = null;
    state.skipsLeft = 1;
  }

  function goHome() {
    resetBoard();
    state.screen = "home";
    state.currentId = null;
    render();
  }

  function startDraft(opts) {
    opts = opts || {};
    resetBoard();
    state.screen = "draft";
    state.currentId = "d-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
    const seed = opts.seed != null ? opts.seed >>> 0 : ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    state.rng = E.mulberry32(seed);
    state._seed = seed;
    dealCurrent();
    render();
    const row = $("dealRow");
    if (row) row.scrollLeft = 0;
  }

  function dealCurrent(excludeIds) {
    state.deal = E.dealRound(PLAYERS, { round: state.round, count: E.CARDS_PER_ROUND, usedIds: state.usedIds, lineup: state.lineup, rng: state.rng, excludeIds });
    state.selectedDeal = null;
  }

  // One skip per draft: discard the 5 offered cards and draw 5 new ones with the same round odds.
  function skipDeal() {
    if (state.screen !== "draft" || state.skipsLeft <= 0 || !state.deal.length) return false;
    const discarded = new Set(state.deal.map((p) => p.id));
    state.skipsLeft -= 1;
    state.selectedSlot = null;
    dealCurrent(discarded);
    render();
    return true;
  }

  function placeSelected(slotId) {
    if (state.screen === "draft" && state.selectedDeal != null) {
      const p = state.deal[state.selectedDeal];
      if (!p || !E.canPlace(p, slotId, state.lineup)) return false;
      state.lineup[slotId] = p;
      state.usedIds.add(p.id);
      state.selectedDeal = null;
      state.selectedSlot = null;
      if (E.filledCount(state.lineup) >= E.SLOTS.length) finishDraft();
      else {
        state.round += 1;
        dealCurrent();
        render();
        const row = $("dealRow");
        if (row) row.scrollLeft = 0;
      }
      return true;
    }
    if (state.selectedSlot && E.canMove(state.selectedSlot, slotId, state.lineup)) {
      const a = state.lineup[state.selectedSlot];
      const b = state.lineup[slotId] || null;
      state.lineup[slotId] = a;
      state.lineup[state.selectedSlot] = b;
      state.selectedSlot = null;
      if (state.screen === "results") persistCurrentDraft();
      render();
      return true;
    }
    return false;
  }

  function finishDraft() {
    state.deal = [];
    state.selectedDeal = null;
    state.selectedSlot = null;
    if (state.suppressFinish) {
      render();
      return;
    }
    state.screen = "results";
    persistCurrentDraft();
    anim.final = 0;
    render();
  }

  function persistCurrentDraft() {
    if (E.filledCount(state.lineup) < E.SLOTS.length) return;
    const s = score();
    const ovr = E.squadOvr(state.lineup);
    const prevBest = state.stats.bestTotal || 0;
    const record = { id: state.currentId || "d-" + Date.now(), at: new Date().toISOString(), talent: s.talent, chem: s.chem, total: s.total, ovr, rating: E.squadRating(state.lineup), chem33: E.playerChem(state.lineup).total, lineup: snapshotLineup(state.lineup) };
    const idx = state.history.findIndex((d) => d.id === record.id);
    if (idx >= 0) {
      record.at = state.history[idx].at;
      state.history[idx] = record;
    } else {
      state.history.unshift(record);
      state.stats.plays = (state.stats.plays || 0) + 1;
    }
    // keep newest 40 plus never drop the all-time best
    if (state.history.length > 40) {
      const best = state.history.reduce((a, b) => (b.total > a.total ? b : a));
      state.history = state.history.slice(0, 40);
      if (!state.history.includes(best)) state.history[39] = best;
    }
    if (!state.lastResult || state.lastResult.id !== record.id) state.lastResult = { id: record.id, isBest: s.total > prevBest };
    else if (s.total > prevBest) state.lastResult.isBest = true;
    state.stats.bestTotal = Math.max(prevBest, s.total);
    state.stats.bestTalent = Math.max(state.stats.bestTalent || 0, s.talent);
    state.stats.bestChem = Math.max(state.stats.bestChem || 0, s.chem);
    state.stats.bestOvr = Math.max(state.stats.bestOvr || 0, ovr);
    state.stats.lastPlayed = record.at;
    saveStore();
  }

  function onSlotClick(slotId) {
    if (state.screen === "home" || state.screen === "history") return;
    if (state.selectedDeal != null || (state.selectedSlot && state.selectedSlot !== slotId)) {
      if (placeSelected(slotId)) return;
    }
    if (state.lineup[slotId]) {
      state.selectedSlot = state.selectedSlot === slotId ? null : slotId;
      state.selectedDeal = null;
      render();
    }
  }

  function onDealClick(i) {
    if (state.screen !== "draft") return;
    if (state.selectedDeal === i) {
      // second tap on the same card: auto-place if there is exactly one spot
      const legal = E.legalSlotsFor(state.deal[i], state.lineup);
      if (legal.length === 1) { placeSelected(legal[0]); return; }
      state.selectedDeal = null;
    } else {
      state.selectedDeal = i;
    }
    state.selectedSlot = null;
    const row = $("dealRow");
    const scroll = row ? row.scrollLeft : 0;
    render();
    const row2 = $("dealRow");
    if (row2) row2.scrollLeft = scroll;
  }

  function render() {
    document.body.dataset.screen = state.screen;
    renderField();
    renderTrayAndFit();
    if (state.screen === "results") {
      const el = $("finalTotal");
      if (el) {
        el.textContent = String(anim.final || 0);
        animateNumber(el, "final", score().total, 700);
      }
    }
  }

  function updatePager() {
    const row = $("dealRow");
    const pager = $("pager");
    if (!row || !pager) return;
    const cards = row.children;
    if (!cards.length) return;
    const w = cards[0].getBoundingClientRect().width + 12;
    const idx = Math.min(cards.length - 1, Math.round(row.scrollLeft / w));
    pager.querySelectorAll("i").forEach((el, i) => el.classList.toggle("on", i === idx));
  }

  function bindStatic() {
    slotsEl.addEventListener("click", (ev) => {
      const t = ev.target.closest("[data-slot]");
      if (t) onSlotClick(t.getAttribute("data-slot"));
    });
    trayEl.addEventListener("click", (ev) => {
      const deal = ev.target.closest("[data-deal]");
      if (deal) { onDealClick(Number(deal.getAttribute("data-deal"))); return; }
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;
      const a = btn.getAttribute("data-action");
      if (a === "start" || a === "again" || a === "restart") startDraft();
      else if (a === "skip") skipDeal();
      else if (a === "history") { state.screen = "history"; render(); }
      else if (a === "home") goHome();
    });
    trayEl.addEventListener("scroll", updatePager, true);
    trayEl.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.closest("[data-deal]")) {
        ev.preventDefault();
        onDealClick(Number(ev.target.closest("[data-deal]").getAttribute("data-deal")));
      }
    });
    const openHelp = () => {
      document.querySelectorAll("#oddsTable tbody tr[data-round]").forEach((row) => {
        row.classList.toggle("is-current", state.screen === "draft" && Number(row.getAttribute("data-round")) === state.round);
      });
      helpModal.removeAttribute("hidden");
    };
    $("helpBtn").onclick = openHelp;
    $("helpClose").onclick = () => helpModal.setAttribute("hidden", "");
    helpModal.addEventListener("click", (ev) => { if (ev.target === helpModal) helpModal.setAttribute("hidden", ""); });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") helpModal.setAttribute("hidden", ""); });
    $("brandBtn").onclick = () => { if (state.screen !== "home") goHome(); };
  }

  function registerSw() {
    if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Pitchmark: service worker not registered", err));
  }

  loadStore();
  bindStatic();
  render();
  registerSw();

  window.__PITCHMARK__ = {
    startDraft,
    goHome,
    placeSelected,
    score,
    getState() {
      return {
        screen: state.screen,
        round: state.round,
        deal: state.deal.map((p) => p.id),
        lineup: snapshotLineup(state.lineup),
        selectedDeal: state.selectedDeal,
        selectedSlot: state.selectedSlot,
        filled: E.filledCount(state.lineup),
        grade: score(),
        rating: E.squadRating(state.lineup),
        chem33: E.playerChem(state.lineup).total,
        squadOvr: E.squadOvr(state.lineup),
        history: state.history,
        stats: state.stats,
        seed: state._seed,
        skipsLeft: state.skipsLeft,
      };
    },
    skip: skipDeal,
    pickAndPlace(i, slotId) {
      state.selectedDeal = i;
      return placeSelected(slotId);
    },
    setSuppressFinish(v) { state.suppressFinish = !!v; },
  };
})();
