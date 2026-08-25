/**
 * Interfaccia del simulatore: raccoglie i due ticket, chiama /api/simulate e
 * disegna mappa, distribuzione degli esiti e analisi.
 */

const $ = (id) => document.getElementById(id);

const form = $('form');
const errorBox = $('error');
const loading = $('loading');
const results = $('results');
const tooltip = $('map-tooltip');

let meta = null;
let lastResponse = null;
let sortState = { key: 'expectedMargin', dir: 'desc' };

const PRESETS = [
  {
    label: 'Swift/Hanks contro Musk/Johnson',
    a: ['Taylor Swift', 'Tom Hanks', ''],
    b: ['Elon Musk', 'Dwayne Johnson', ''],
  },
  {
    label: 'Obama/Clooney contro Schwarzenegger/Rogan',
    a: ['Michelle Obama', 'George Clooney', 'Democratici'],
    b: ['Arnold Schwarzenegger', 'Joe Rogan', 'Repubblicani'],
  },
  {
    label: 'Beyoncé/Stewart contro Bezos/Ramsay',
    a: ['Beyoncé', 'Jon Stewart', ''],
    b: ['Jeff Bezos', 'Gordon Ramsay', ''],
  },
  {
    label: 'LeBron/Winfrey contro Gates/Kardashian',
    a: ['LeBron James', 'Oprah Winfrey', ''],
    b: ['Bill Gates', 'Kim Kardashian', ''],
  },
];

const RANDOM_POOL = [
  'Taylor Swift', 'Elon Musk', 'Dwayne Johnson', 'Oprah Winfrey', 'LeBron James',
  'Tom Hanks', 'Beyoncé', 'Jon Stewart', 'Michelle Obama', 'Arnold Schwarzenegger',
  'Joe Rogan', 'Bill Gates', 'Jeff Bezos', 'Serena Williams', 'Keanu Reeves',
  'Rihanna', 'Mark Cuban', 'Denzel Washington', 'Kim Kardashian', 'George Clooney',
  'Bad Bunny', 'Stephen Colbert', 'Meryl Streep', 'Tim Cook', 'Simone Biles',
];

const LOADING_STEPS = [
  'Si aprono i comitati elettorali nei 50 stati…',
  'I sondaggisti profilano i due ticket…',
  'Analisi collegio per collegio delle reazioni locali…',
  'Si stimano affluenza e coalizioni demografiche…',
  'Si simulano decine di migliaia di notti elettorali…',
  'Si conta il Collegio Elettorale…',
];

init();

async function init() {
  renderPresets();
  try {
    meta = await (await fetch('/api/meta')).json();
    renderModeBadge(meta);
  } catch {
    showError('Non riesco a contattare il server del simulatore.');
  }

  form.addEventListener('submit', onSubmit);
  $('random').addEventListener('click', fillRandom);
  document
    .querySelectorAll('.states-table th[data-sort]')
    .forEach((th) => th.addEventListener('click', () => sortTable(th.dataset.sort)));
}

function renderModeBadge(m) {
  const badge = $('mode-badge');
  badge.hidden = false;
  if (m.aiEnabled) {
    badge.className = 'mode-badge ai';
    badge.textContent = `Analisi con ${m.model}`;
  } else {
    badge.className = 'mode-badge demo';
    badge.textContent = 'Modalità dimostrativa — nessuna chiave API configurata';
  }
}

function renderPresets() {
  const box = $('presets');
  for (const preset of PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = preset.label;
    chip.addEventListener('click', () => {
      setField('a-president', preset.a[0]);
      setField('a-vice', preset.a[1]);
      setField('a-party', preset.a[2]);
      setField('b-president', preset.b[0]);
      setField('b-vice', preset.b[1]);
      setField('b-party', preset.b[2]);
    });
    box.append(chip);
  }
}

function fillRandom() {
  const pool = [...RANDOM_POOL];
  const pick = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  setField('a-president', pick());
  setField('a-vice', pick());
  setField('b-president', pick());
  setField('b-vice', pick());
  setField('a-party', '');
  setField('b-party', '');
}

function setField(name, value) {
  form.elements[name].value = value ?? '';
}

async function onSubmit(event) {
  event.preventDefault();
  hideError();

  const data = new FormData(form);
  const payload = {
    ticketA: {
      president: data.get('a-president'),
      vice: data.get('a-vice'),
      party: data.get('a-party'),
    },
    ticketB: {
      president: data.get('b-president'),
      vice: data.get('b-vice'),
      party: data.get('b-party'),
    },
    scenario: data.get('scenario'),
    year: Number(data.get('year')),
    iterations: Number(data.get('iterations')),
    seed: data.get('seed') === '' ? null : Number(data.get('seed')),
  };

  if (!payload.ticketA.president || !payload.ticketA.vice) {
    return showError('Completa entrambi i nomi del ticket A.');
  }
  if (!payload.ticketB.president || !payload.ticketB.vice) {
    return showError('Completa entrambi i nomi del ticket B.');
  }

  setBusy(true);
  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Errore imprevisto del server.');
    lastResponse = body;
    render(body);
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

let loadingTimer = null;

function setBusy(busy) {
  $('submit').disabled = busy;
  loading.hidden = !busy;
  if (!busy) {
    clearInterval(loadingTimer);
    return;
  }
  const started = Date.now();
  let step = 0;
  $('loading-step').textContent = LOADING_STEPS[0];
  $('loading-elapsed').textContent = '0 s';
  loadingTimer = setInterval(() => {
    const seconds = Math.round((Date.now() - started) / 1000);
    $('loading-elapsed').textContent = `${seconds} s`;
    if (seconds > 0 && seconds % 12 === 0) {
      step = Math.min(step + 1, LOADING_STEPS.length - 1);
      $('loading-step').textContent = LOADING_STEPS[step];
    }
  }, 1000);
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function render(res) {
  renderHero(res);
  renderMap(res);
  renderHistogram(res);
  renderLists(res);
  renderTickets(res);
  renderStory(res);
  renderTable(res);
  renderDisclaimer(res);
}

function nameOf(ticket) {
  return `${ticket.president} / ${ticket.vice}`;
}

function renderHero(res) {
  const { simulation: sim, input, analysis } = res;
  const a = nameOf(input.ticketA);
  const b = nameOf(input.ticketB);

  $('odds-name-a').textContent = a;
  $('odds-name-b').textContent = b;
  $('odds-a').textContent = pct(sim.probA);
  $('odds-b').textContent = pct(sim.probB);
  $('odds-ev-a').textContent = `${Math.round(sim.meanEvA)} grandi elettori in media`;
  $('odds-ev-b').textContent = `${Math.round(sim.meanEvB)} grandi elettori in media`;

  const leader = sim.probA >= sim.probB ? a : b;
  const leaderProb = Math.max(sim.probA, sim.probB);
  const tone =
    leaderProb > 0.9 ? 'con un vantaggio molto solido'
    : leaderProb > 0.7 ? 'da favorito'
    : leaderProb > 0.55 ? 'per un soffio'
    : 'in una corsa sostanzialmente pari';

  $('hero-sub').textContent =
    `Su ${sim.iterations.toLocaleString('it-IT')} elezioni simulate, ${leader} vince ${tone}. ` +
    `Servono ${res.meta.majority} grandi elettori su ${res.meta.totalEv}.`;

  $('prob-seg-a').style.width = `${sim.probA * 100}%`;
  $('prob-seg-tie').style.width = `${sim.probTie * 100}%`;
  $('prob-seg-b').style.width = `${sim.probB * 100}%`;
  $('prob-bar').setAttribute(
    'aria-label',
    `Probabilità di vittoria: ${a} ${pct(sim.probA)}, ${b} ${pct(sim.probB)}, pareggio ${pct(sim.probTie)}`,
  );

  const total = res.meta.totalEv;
  $('ev-seg-a').style.width = `${(sim.meanEvA / total) * 100}%`;
  $('ev-seg-b').style.width = `${(sim.meanEvB / total) * 100}%`;
  $('ev-bar').setAttribute(
    'aria-label',
    `Grandi elettori medi: ${a} ${sim.meanEvA}, ${b} ${sim.meanEvB}`,
  );

  const popLeader = sim.popularMarginA >= 0 ? a : b;
  const facts = [
    [
      `${num(analysis.nazionale.voto_a)}% – ${num(analysis.nazionale.voto_b)}%`,
      'Voto popolare stimato (A – B)',
    ],
    [signed(sim.popularMarginA), `Margine popolare medio, a favore di ${popLeader}`],
    [pct(sim.splitDecisionProb), 'Vittoria nel Collegio perdendo il voto popolare'],
    [pct(sim.probTie), 'Pareggio 269-269 (deciderebbe la Camera)'],
    [`${num(analysis.nazionale.affluenza)}%`, 'Affluenza stimata'],
    [`${num(analysis.nazionale.voto_altri)}%`, 'Voti a terzi candidati'],
  ];

  $('facts').innerHTML = facts
    .map(
      ([value, label]) =>
        `<li><span class="fact-value">${escapeHtml(String(value))}</span><span class="fact-label">${escapeHtml(label)}</span></li>`,
    )
    .join('');
}

/** Bande divergenti: la classe CSS porta sia il riempimento sia il colore del testo. */
function leanClass(margin) {
  const abs = Math.abs(margin);
  if (abs < 1.5) return 'lean-tossup';
  const side = margin > 0 ? 'a' : 'b';
  const band = abs < 5 ? 1 : abs < 10 ? 2 : abs < 20 ? 3 : 4;
  return `lean-${side}-${band}`;
}

function renderMap(res) {
  const grid = $('tilemap');
  const districts = $('districts');
  grid.innerHTML = '';
  districts.innerHTML = '';

  const byCode = new Map(res.simulation.states.map((s) => [s.code, s]));

  for (const unit of meta.units) {
    const state = byCode.get(unit.code);
    if (!state) continue;
    const tile = buildTile(unit, state, res);
    if (unit.grid) {
      tile.style.gridRow = String(unit.grid[0] + 1);
      tile.style.gridColumn = String(unit.grid[1] + 1);
      grid.append(tile);
    } else {
      districts.append(tile);
    }
  }

  renderLegend(res);
}

function buildTile(unit, state, res) {
  const tile = document.createElement('div');
  tile.className = `tile ${leanClass(state.expectedMargin)}`;
  tile.tabIndex = 0;
  tile.innerHTML =
    `<span class="tile-code">${escapeHtml(unit.code)}</span>` +
    `<span class="tile-ev">${unit.ev} GE</span>` +
    `<span class="tile-margin">${signed(state.expectedMargin)}</span>`;

  const winner = state.expectedMargin > 0 ? nameOf(res.input.ticketA) : nameOf(res.input.ticketB);
  const reaction = res.reactions[unit.code] ?? '';
  tile.setAttribute(
    'aria-label',
    `${unit.name}, ${unit.ev} grandi elettori, margine ${signed(state.expectedMargin)} verso ${winner}. ${reaction}`,
  );

  const show = (event) => showTooltip(event, unit, state, res);
  tile.addEventListener('mouseenter', show);
  tile.addEventListener('mousemove', show);
  tile.addEventListener('focus', show);
  tile.addEventListener('mouseleave', hideTooltip);
  tile.addEventListener('blur', hideTooltip);
  return tile;
}

function showTooltip(event, unit, state, res) {
  const a = nameOf(res.input.ticketA);
  const b = nameOf(res.input.ticketB);
  const favourite = state.expectedMargin > 0 ? a : b;
  tooltip.innerHTML =
    `<strong>${escapeHtml(unit.name)} · ${unit.ev} GE</strong>` +
    `<div class="tt-row">Margine atteso: <b>${signed(state.expectedMargin)}</b> verso ${escapeHtml(favourite)}</div>` +
    `<div class="tt-row">Vittoria di ${escapeHtml(a)}: <b>${pct(state.probA)}</b></div>` +
    `<div class="tt-row">Base 2024: ${signed(state.lean)} · incertezza ±${state.uncertainty}</div>` +
    (res.reactions[unit.code]
      ? `<div class="tt-note">${escapeHtml(res.reactions[unit.code])}</div>`
      : '');
  tooltip.hidden = false;

  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX ?? rect.left + rect.width / 2;
  const y = event.clientY ?? rect.top;
  const box = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.min(Math.max(8, x + 14), window.innerWidth - box.width - 8)}px`;
  tooltip.style.top = `${Math.min(Math.max(8, y + 14), window.innerHeight - box.height - 8)}px`;
}

function hideTooltip() {
  tooltip.hidden = true;
}

function renderLegend(res) {
  const a = nameOf(res.input.ticketA);
  const b = nameOf(res.input.ticketB);
  const items = [
    ['lean-b-4', '20+'],
    ['lean-b-3', '10'],
    ['lean-b-2', '5'],
    ['lean-b-1', '1,5'],
    ['lean-tossup', 'pari'],
    ['lean-a-1', '1,5'],
    ['lean-a-2', '5'],
    ['lean-a-3', '10'],
    ['lean-a-4', '20+'],
  ];
  $('map-legend').innerHTML =
    `<span><b>${escapeHtml(b)}</b> vince di…</span>` +
    items
      .map(
        ([cls, label]) =>
          `<span class="legend-item"><span class="legend-swatch ${cls}"></span>` +
          `<span class="legend-tick">${label}</span></span>`,
      )
      .join('') +
    `<span>…punti, vince <b>${escapeHtml(a)}</b></span>`;
}

function renderHistogram(res) {
  const svg = $('histogram');
  const sim = res.simulation;
  const width = 900;
  const height = 240;
  const pad = { top: 12, right: 12, bottom: 30, left: 40 };

  // Raggruppo i 539 esiti possibili in classi da 10 grandi elettori.
  const binSize = 10;
  const bins = new Map();
  for (const point of sim.evDistribution) {
    const key = Math.floor(point.ev / binSize) * binSize;
    bins.set(key, (bins.get(key) ?? 0) + point.p);
  }
  const data = [...bins.entries()].map(([ev, p]) => ({ ev, p })).sort((x, y) => x.ev - y.ev);
  const maxP = Math.max(...data.map((d) => d.p), 0.0001);

  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xOf = (ev) => pad.left + (ev / 538) * plotW;
  const barW = Math.max(2, (binSize / 538) * plotW - 2);

  const bars = data
    .map((d) => {
      const h = Math.max(1, (d.p / maxP) * plotH);
      const cls = d.ev + binSize / 2 >= 270 ? 'lean-a-3' : 'lean-b-3';
      const fill = d.ev + binSize / 2 >= 270 ? 'var(--fill-a-3)' : 'var(--fill-b-3)';
      return (
        `<rect class="bar ${cls}" x="${xOf(d.ev).toFixed(1)}" y="${(pad.top + plotH - h).toFixed(1)}" ` +
        `width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${fill}">` +
        `<title>${d.ev}-${d.ev + binSize - 1} grandi elettori al ticket A · ${pct(d.p)} degli scenari</title>` +
        `</rect>`
      );
    })
    .join('');

  const ticks = [0, 100, 200, 270, 300, 400, 538]
    .map(
      (t) =>
        `<text class="axis-text" x="${xOf(t).toFixed(1)}" y="${height - 10}" text-anchor="middle">${t}</text>`,
    )
    .join('');

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML =
    bars +
    `<line class="threshold" x1="${xOf(270).toFixed(1)}" y1="${pad.top}" x2="${xOf(270).toFixed(1)}" y2="${pad.top + plotH}" />` +
    `<line class="axis-line" x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}" />` +
    ticks +
    `<text class="axis-text" x="${pad.left}" y="${pad.top + 4}">frequenza</text>`;

  $('dist-sub').textContent =
    `Quanti grandi elettori otterrebbe ${nameOf(res.input.ticketA)} in ciascuna delle ` +
    `${sim.iterations.toLocaleString('it-IT')} elezioni simulate. A destra della linea tratteggiata vince il ticket A.`;
  $('hist-title').textContent =
    `Istogramma dei grandi elettori ottenuti dal ticket A: media ${sim.meanEvA}, ` +
    `vittoria nel ${pct(sim.probA)} degli scenari.`;
}

function renderLists(res) {
  const sim = res.simulation;
  $('tipping').innerHTML = sim.tippingPoints
    .map(
      (t) =>
        `<li><span>${escapeHtml(t.name)}</span><span class="value">${pct(t.p)}</span></li>`,
    )
    .join('');

  const byCode = new Map(sim.states.map((s) => [s.code, s]));
  $('closest').innerHTML = sim.closestStates
    .map((code) => {
      const s = byCode.get(code);
      return `<li><span>${escapeHtml(s.name)} · ${s.ev} GE</span><span class="value">${signed(s.expectedMargin)}</span></li>`;
    })
    .join('');
}

function renderTickets(res) {
  const box = $('ticket-cards');
  const tickets = res.analysis.ticket ?? [];
  box.innerHTML = tickets
    .map((t) => {
      const side = t.id === 'A' ? 'a' : 'b';
      const input = t.id === 'A' ? res.input.ticketA : res.input.ticketB;
      return `
        <article class="ticket-card card-${side}">
          <h3>${escapeHtml(nameOf(input))}</h3>
          <p class="slogan">«${escapeHtml(t.slogan ?? '')}» — ${escapeHtml(t.partito_ipotetico ?? '')}</p>
          <p>${escapeHtml(t.coalizione ?? '')}</p>
          <h4>Punti di forza</h4>
          <ul>${(t.punti_di_forza ?? []).map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
          <h4>Punti deboli</h4>
          <ul>${(t.punti_deboli ?? []).map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
          ${
            (t.stati_natali ?? []).length
              ? `<h4>Effetto stato natale</h4><p>${escapeHtml(t.stati_natali.join(', '))}</p>`
              : ''
          }
        </article>`;
    })
    .join('');
}

function renderStory(res) {
  const r = res.analysis.racconto ?? {};
  const sections = [
    ['La campagna', r.campagna],
    ['I dibattiti', r.dibattiti],
    ['Media e social', r.media],
    ['La sorpresa di ottobre', r.sorpresa_ottobre],
    ['Affluenza e demografia', r.affluenza_e_demografia],
    ['La notte elettorale', r.notte_elettorale],
  ];

  $('story').innerHTML = sections
    .filter(([, text]) => text)
    .map(
      ([title, text]) =>
        `<article><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></article>`,
    )
    .join('');

  $('headlines').innerHTML = (res.analysis.titoli_di_giornale ?? [])
    .map((h) => `<li>${escapeHtml(h)}</li>`)
    .join('');

  $('wildcards').innerHTML = (res.analysis.incognite ?? [])
    .map(
      (w) => `
      <div class="wildcard">
        <div>
          <strong>${escapeHtml(w.titolo ?? '')}</strong>
          <p class="section-sub">${escapeHtml(w.descrizione ?? '')}</p>
        </div>
        <span class="wildcard-impact">${signed(Number(w.impatto) || 0)} pt</span>
      </div>`,
    )
    .join('');
}

function renderTable(res) {
  sortState = { key: 'expectedMargin', dir: 'desc' };
  drawTable(res);
}

function sortTable(key) {
  if (!lastResponse) return;
  sortState =
    sortState.key === key
      ? { key, dir: sortState.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'name' ? 'asc' : 'desc' };
  drawTable(lastResponse);
}

function drawTable(res) {
  const rows = [...res.simulation.states].sort((x, y) => {
    const dir = sortState.dir === 'asc' ? 1 : -1;
    const a = x[sortState.key];
    const b = y[sortState.key];
    if (typeof a === 'string') return a.localeCompare(b, 'it') * dir;
    return (a - b) * dir;
  });

  document.querySelectorAll('.states-table th[data-sort]').forEach((th) => {
    if (th.dataset.sort === sortState.key) {
      th.setAttribute('aria-sort', sortState.dir === 'asc' ? 'ascending' : 'descending');
    } else {
      th.removeAttribute('aria-sort');
    }
  });

  $('states-table').querySelector('tbody').innerHTML = rows
    .map(
      (s) => `
      <tr>
        <th scope="row">${escapeHtml(s.name)} <span class="hint">${escapeHtml(s.code)}</span></th>
        <td class="num">${s.ev}</td>
        <td class="num"><span class="pill ${leanClass(s.expectedMargin)}">${signed(s.expectedMargin)}</span></td>
        <td class="num">${pct(s.probA)}</td>
        <td class="num">${signed(s.lean)}</td>
        <td class="note">${escapeHtml(res.reactions[s.code] ?? '—')}</td>
      </tr>`,
    )
    .join('');
}

function renderDisclaimer(res) {
  const seconds = (res.elapsedMs / 1000).toFixed(1);
  const source =
    res.mode === 'ai'
      ? `<strong>Analisi generata da ${escapeHtml(res.model)}</strong> in ${seconds} s` +
        (res.usage
          ? ` (${res.usage.input_tokens.toLocaleString('it-IT')} token in ingresso, ${res.usage.output_tokens.toLocaleString('it-IT')} in uscita)`
          : '')
      : '<strong>Modalità dimostrativa</strong>: nessun modello è stato interrogato, i margini derivano da una formula deterministica applicata ai nomi. Imposta <code>ANTHROPIC_API_KEY</code> per l\'analisi vera';

  const gap = res.coverage?.missing?.length
    ? `<p style="margin-top:.6rem">Il modello non ha stimato ${res.coverage.missing.length} collegi
       (${escapeHtml(res.coverage.missing.join(', '))}): per questi vale la base storica 2024.</p>`
    : '';

  $('disclaimer').innerHTML = `
    ${gap}
    <p>${source}. Le probabilità vengono da ${res.simulation.iterations.toLocaleString('it-IT')}
    simulazioni Monte Carlo con errori correlati a livello nazionale e regionale, seme
    <code>${res.input.seed}</code>: con gli stessi dati in ingresso il risultato è riproducibile.</p>
    <p style="margin-top:.6rem">Le stime del modello sono ipotesi su persone che non sono candidate a
    nulla: servono a raccontare uno scenario, non a prevedere il futuro.</p>`;
}

/* ------------------------------------------------------------------ */
/* Utilità                                                             */
/* ------------------------------------------------------------------ */

function pct(value) {
  const p = value * 100;
  if (p > 0 && p < 0.1) return '<0,1%';
  if (p < 100 && p > 99.9) return '>99,9%';
  return `${p.toFixed(1).replace('.', ',')}%`;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(1).replace('.', ',') : '—';
}

function signed(value) {
  const v = Number(value) || 0;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')}`;
}

function escapeHtml(text) {
  return String(text ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}
