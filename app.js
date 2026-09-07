'use strict';

const APP_PREFIX = 'kombistivel.v1';
const NEW_VEHICLE = '__new__';

const FUEL_LABELS = { etanol: 'Etanol', gasolina: 'Gasolina', diesel: 'Diesel', flex: 'Flex' };
const FUEL_COLORS = { etanol: '#ff8a3d', gasolina: '#38bdf8', diesel: '#a78bfa' };

const nfBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const nfKml = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfKm = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nfLitros = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfPct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const $ = (sel) => document.querySelector(sel);
const el = (id) => document.getElementById(id);

let state = {
  vehicles: [],
  records: [],
  filter: { vehicle: 'all', period: 'all' },
  editingId: null,
  lastLinkedField: 'total'
};

let enrichedMap = {};
let chartConsumo = null;
let chartMensal = null;

const storageKey = APP_PREFIX;

/* ================= Storage ================= */

function readProfile(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
      records: Array.isArray(data.records) ? data.records : [],
      savedAt: data.savedAt || 0
    };
  } catch (e) {
    console.warn('Perfil local corrompido:', e);
    return null;
  }
}

function persistProfile(extra = {}) {
  localStorage.setItem(storageKey, JSON.stringify({
    vehicles: state.vehicles,
    records: state.records,
    savedAt: Date.now(),
    ...extra
  }));
}

function load() {
  const profile = readProfile(storageKey);
  if (!profile) return;
  state.vehicles = profile.vehicles;
  state.records = profile.records;
}

function save() {
  try {
    persistProfile();
  } catch (e) {
    toast('Não foi possível salvar os dados localmente.', 'error');
  }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ================= Helpers ================= */

function num(v) {
  if (typeof v !== 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : NaN;
  }
  let s = v.trim().replace(/r\$/gi, '').replace(/\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

const brlFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatBRL(value) {
  return Number.isFinite(value) && value >= 0 ? brlFmt.format(value) : '';
}

function applyCurrencyMask(inputEl) {
  const digits = inputEl.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) { inputEl.value = ''; return; }
  inputEl.value = brlFmt.format(parseInt(digits, 10) / 100);
}

function esc(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDateBR(dateISO) {
  const d = new Date(dateISO);
  if (isNaN(d)) return '—';
  const dt = d.toLocaleDateString('pt-BR');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dt} · ${hh}:${mm}`;
}

function nowLocalInputValue() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function vehicleLabel(v) {
  if (!v) return 'Veículo';
  const parts = [v.marca, v.modelo].filter(Boolean).join(' ');
  return v.ano ? `${parts} · ${v.ano}` : parts;
}

function getVehicle(id) {
  return state.vehicles.find((v) => v.id === id) || null;
}

function lastKmOf(vehicleId, excludeRecordId = null) {
  const kms = state.records
    .filter((r) => r.vehicleId === vehicleId && r.id !== excludeRecordId)
    .map((r) => r.km);
  return kms.length ? Math.max(...kms) : null;
}

function sortByDateAsc(a, b) {
  if (a.dateISO !== b.dateISO) return a.dateISO < b.dateISO ? -1 : 1;
  return a.km - b.km;
}

/* ================= Cálculos analíticos ================= */

function enrichRecords() {
  enrichedMap = {};
  const groups = new Map();
  for (const r of state.records) {
    if (!groups.has(r.vehicleId)) groups.set(r.vehicleId, []);
    groups.get(r.vehicleId).push(r);
  }

  for (const recs of groups.values()) {
    recs.sort(sortByDateAsc);
    const anyFullTank = recs.some((r) => r.fullTank);

    let prev = null;
    let baseRec = null;
    let accLiters = 0;

    for (const r of recs) {
      const entry = {};

      if (prev !== null && num(r.km) > num(prev.km)) {
        entry.distance = num(r.km) - num(prev.km);
      }
      prev = r;

      const isBoundary = anyFullTank ? !!r.fullTank : true;

      if (baseRec === null) {
        if (isBoundary) {
          baseRec = r;
          accLiters = 0;
        }
      } else {
        const liters = num(r.liters);
        if (Number.isFinite(liters)) accLiters += liters;
        if (isBoundary) {
          const dist = num(r.km) - num(baseRec.km);
          if (dist > 0 && accLiters > 0) {
            entry.cycleDist = dist;
            entry.cycleLiters = accLiters;
            entry.kml = dist / accLiters;
          }
          baseRec = r;
          accLiters = 0;
        }
      }

      enrichedMap[r.id] = entry;
    }
  }
}

function filterRecords() {
  const { vehicle, period } = state.filter;
  const now = new Date();
  let minTime = null;

  if (period === '30') minTime = now.getTime() - 30 * 864e5;
  else if (period === '90') minTime = now.getTime() - 90 * 864e5;
  else if (period === 'ano') minTime = new Date(now.getFullYear(), 0, 1).getTime();

  return state.records.filter((r) => {
    if (vehicle !== 'all' && r.vehicleId !== vehicle) return false;
    if (minTime !== null) {
      const t = new Date(r.dateISO).getTime();
      if (!Number.isFinite(t) || t < minTime) return false;
    }
    return true;
  });
}

function kpisFrom(records) {
  let totalSpent = 0;
  let totalLiters = 0;
  let cycleDist = 0;
  let cycleLiters = 0;
  let costDist = 0;
  let costSpent = 0;

  for (const r of records) {
    totalSpent += num(r.totalValue) || 0;
    totalLiters += num(r.liters) || 0;

    const e = enrichedMap[r.id];
    if (e) {
      if (e.cycleDist > 0) {
        cycleDist += e.cycleDist;
        cycleLiters += e.cycleLiters;
      }
      if (e.distance > 0) {
        costDist += e.distance;
        costSpent += num(r.totalValue) || 0;
      }
    }
  }

  return {
    count: records.length,
    totalSpent,
    totalLiters,
    avgKml: cycleLiters > 0 ? cycleDist / cycleLiters : null,
    costPerKm: costDist > 0 ? costSpent / costDist : null,
    totalDistance: costDist
  };
}

function monthlyTotals(records) {
  const map = new Map();
  for (const r of records) {
    const d = new Date(r.dateISO);
    if (isNaN(d)) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(key, (map.get(key) || 0) + (num(r.totalValue) || 0));
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTHS_PT[parseInt(m, 10) - 1]}/${y.slice(2)}`;
}

function analyzeViability(records) {
  const byFuel = { etanol: { dist: 0, liters: 0 }, gasolina: { dist: 0, liters: 0 }, diesel: { dist: 0, liters: 0 } };
  const latestPrice = {};

  for (const r of records) {
    const e = enrichedMap[r.id];
    if (e && e.cycleDist > 0 && byFuel[r.fuelType]) {
      byFuel[r.fuelType].dist += e.cycleDist;
      byFuel[r.fuelType].liters += e.cycleLiters;
    }
    if (Number.isFinite(num(r.pricePerLiter)) && num(r.pricePerLiter) > 0) {
      latestPrice[r.fuelType] = num(r.pricePerLiter);
    }
  }

  const avg = {};
  for (const f of Object.keys(byFuel)) {
    avg[f] = byFuel[f].liters > 0 ? byFuel[f].dist / byFuel[f].liters : null;
  }

  const gasPrice = latestPrice.gasolina || null;
  const etaPrice = latestPrice.etanol || null;

  if (gasPrice === null || etaPrice === null) return null;

  const realAdjusted = avg.gasolina > 0 && avg.etanol > 0;
  const breakEven = realAdjusted ? avg.etanol / avg.gasolina : 0.7;
  const priceRatio = etaPrice / gasPrice;
  const ethanolWins = priceRatio <= breakEven;
  const advantage = breakEven > 0 ? Math.abs(priceRatio - breakEven) / breakEven : 0;

  return {
    gasPrice,
    etaPrice,
    avgGas: avg.gasolina,
    avgEth: avg.etanol,
    realAdjusted,
    breakEven,
    priceRatio,
    ethanolWins,
    advantage
  };
}

/* ================= Dashboard ================= */

function renderDashboard() {
  const records = filterRecords();
  const hasAnyData = state.records.length > 0;

  el('dashEmpty').classList.toggle('hidden', hasAnyData);
  el('dashContent').classList.toggle('hidden', !hasAnyData);
  if (!hasAnyData) {
    destroyCharts();
    return;
  }

  const k = kpisFrom(records);

  el('kpiConsumo').textContent = k.avgKml !== null ? nfKml.format(k.avgKml) : '—';
  el('kpiConsumoSub').textContent =
    k.avgKml !== null
      ? `km/l · ${(nfKm.format(k.totalDistance))} km rodados`
      : 'marque “tanque cheio” para calcular';

  el('kpiCustoKm').textContent = k.costPerKm !== null ? nfBRL.format(k.costPerKm) : '—';

  el('kpiGasto').textContent = nfBRL.format(k.totalSpent);
  el('kpiQtdAbastecimentos').textContent = `${k.count} abastecimento${k.count === 1 ? '' : 's'}`;

  el('kpiLitros').textContent = `${nfLitros.format(k.totalLiters)} L`;

  renderViability(records);
  renderCharts(records);
}

function renderViability(records) {
  const analysis = analyzeViability(records);
  const body = el('viabBody');
  const unavailable = el('viabUnavailable');

  if (!analysis) {
    body.classList.add('hidden');
    unavailable.classList.remove('hidden');
    const badge = el('viabVerdict');
    badge.textContent = 'Sem dados';
    badge.className = 'verdict-badge';
    return;
  }

  body.classList.remove('hidden');
  unavailable.classList.add('hidden');

  const badge = el('viabVerdict');
  badge.textContent = analysis.ethanolWins ? 'Etanol compensa' : 'Gasolina compensa';
  badge.className = `verdict-badge ${analysis.ethanolWins ? 'ethanol' : 'gasoline'}`;

  el('viabPrecoGas').textContent = nfBRL.format(analysis.gasPrice);
  el('viabPrecoEta').textContent = nfBRL.format(analysis.etaPrice);

  const ratioPct = analysis.priceRatio * 100;
  el('viabBarFill').style.width = `${Math.min(ratioPct, 100)}%`;
  el('viabMarker').style.left = `${Math.min(analysis.breakEven * 100, 97)}%`;

  el('viabPriceRatio').textContent = `${nfPct.format(ratioPct)}%`;
  el('viabBreakEven').textContent = `${nfPct.format(analysis.breakEven * 100)}%${analysis.realAdjusted ? '' : ' (regra dos 70%)'}`;

  el('viabKml').textContent =
    analysis.avgEth && analysis.avgGas
      ? `${nfKml.format(analysis.avgEth)} / ${nfKml.format(analysis.avgGas)} km/l`
      : 'sem ciclos completos';

  el('viabVantagem').textContent =
    analysis.advantage > 0.001
      ? `${nfPct.format(analysis.advantage * 100)}% com ${analysis.ethanolWins ? 'etanol' : 'gasolina'}`
      : 'empate técnico';
}

function baseChartOpts() {
  const styles = getComputedStyle(document.documentElement);
  const cssVar = (name) => styles.getPropertyValue(name).trim();
  return {
    text: cssVar('--text') || '#e9eff6',
    muted: cssVar('--muted') || '#93a1b3',
    border: cssVar('--border') || '#232e3c',
    card: cssVar('--card') || '#161e28',
    green: cssVar('--green') || '#22e58c',
    orange: cssVar('--orange') || '#ff8a3d',
    blue: cssVar('--blue') || '#38bdf8',
    purple: cssVar('--purple') || '#a78bfa'
  };
}

function destroyCharts() {
  if (chartConsumo) { chartConsumo.destroy(); chartConsumo = null; }
  if (chartMensal) { chartMensal.destroy(); chartMensal = null; }
}

function loadChartJs() {
  if (typeof Chart !== 'undefined') return Promise.resolve();
  if (!window._chartJsPromise) {
    window._chartJsPromise = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.onload = resolve;
      s.onerror = resolve;
      (document.head || document.documentElement).appendChild(s);
    });
  }
  return window._chartJsPromise;
}

function renderCharts(records) {
  if (typeof Chart === 'undefined') {
    loadChartJs().then(() => { if (typeof Chart !== 'undefined') renderCharts(records); });
    return;
  }

  const c = baseChartOpts();
  Chart.defaults.color = c.muted;
  Chart.defaults.borderColor = c.border;
  Chart.defaults.font.family = "'Inter', Roboto, system-ui, sans-serif";

  renderConsumptionChart(records, c);
  renderMonthlyChart(records, c);
}

function renderConsumptionChart(records, c) {
  const canvas = el('chartConsumo');
  const emptyMsg = el('chartConsumoEmpty');

  const points = records
    .filter((r) => enrichedMap[r.id] && Number.isFinite(enrichedMap[r.id].kml))
    .sort(sortByDateAsc);

  emptyMsg.classList.toggle('hidden', points.length > 0);
  canvas.parentElement.classList.toggle('hidden', points.length === 0);

  if (chartConsumo) { chartConsumo.destroy(); chartConsumo = null; }
  if (!points.length) return;

  const series = { etanol: [], gasolina: [], diesel: [] };
  for (const r of points) {
    if (!series[r.fuelType]) continue;
    series[r.fuelType].push({
      x: fmtDateBR(r.dateISO),
      y: enrichedMap[r.id].kml
    });
  }

  chartConsumo = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Gasolina',
          data: series.gasolina,
          borderColor: c.blue,
          backgroundColor: c.blue,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5
        },
        {
          label: 'Etanol',
          data: series.etanol,
          borderColor: c.orange,
          backgroundColor: c.orange,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5
        },
        {
          label: 'Diesel',
          data: series.diesel,
          borderColor: c.purple,
          backgroundColor: c.purple,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'circle', padding: 14 }
        },
        tooltip: {
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1,
          padding: 11,
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${nfKml.format(ctx.parsed.y)} km/l`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 45, autoSkipPadding: 18 } },
        y: {
          grace: '8%',
          grid: { color: c.border },
          title: { display: true, text: 'km/l', color: c.muted }
        }
      }
    }
  });
}

function renderMonthlyChart(records, c) {
  const canvas = el('chartMensal');
  const emptyMsg = el('chartMensalEmpty');

  const totals = monthlyTotals(records);

  emptyMsg.classList.toggle('hidden', totals.length > 0);
  canvas.parentElement.classList.toggle('hidden', totals.length === 0);

  if (chartMensal) { chartMensal.destroy(); chartMensal = null; }
  if (!totals.length) return;

  const grad = canvas.getContext('2d').createLinearGradient(0, 0, 0, 230);
  grad.addColorStop(0, c.green);
  grad.addColorStop(1, 'rgba(34, 229, 140, 0.25)');

  chartMensal = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: totals.map(([key]) => monthLabel(key)),
      datasets: [{
        label: 'Gasto (R$)',
        data: totals.map(([, v]) => v),
        backgroundColor: grad,
        hoverBackgroundColor: c.orange,
        borderRadius: 7,
        maxBarThickness: 42
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1,
          padding: 11,
          callbacks: { label: (ctx) => ` ${nfBRL.format(ctx.parsed.y)}` }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grace: '10%',
          grid: { color: c.border },
          ticks: { callback: (v) => 'R$ ' + nfKm.format(v) }
        }
      }
    }
  });
}

/* ================= Histórico ================= */

function renderHistory() {
  const list = el('historyList');
  const empty = el('historyEmpty');
  const records = [...state.records].sort(sortByDateAsc).reverse();

  el('histCount').textContent = records.length;
  empty.classList.toggle('hidden', records.length > 0);
  list.innerHTML = '';

  for (const r of records) {
    const e = enrichedMap[r.id] || {};
    const vehicle = getVehicle(r.vehicleId);
    const multiVehicle = state.vehicles.length > 1;
    const metaParts = [];
    if (multiVehicle) metaParts.push(vehicleLabel(vehicle));
    if (r.station) metaParts.push(esc(r.station));

    const kmlClass = e.kml ? (e.kml >= 10 ? 'good' : 'warn') : '';
    const kmlText = e.kml ? `${nfKml.format(e.kml)}` : '—';

    const card = document.createElement('article');
    card.className = 'card hist-card';
    card.innerHTML = `
      <div class="hist-head">
        <div class="hist-when">
          <span class="hist-date">${esc(fmtDateBR(r.dateISO))}</span>
          <span class="hist-station">${metaParts.join(' · ') || '&nbsp;'}</span>
        </div>
        <span class="fuel-tag ${esc(r.fuelType)}">${FUEL_LABELS[r.fuelType] || esc(r.fuelType)}</span>
      </div>
      <div class="hist-stats">
        <div class="hist-stat"><span>Km intervalo</span><b>${e.distance ? nfKm.format(e.distance) : '—'}</b></div>
        <div class="hist-stat"><span>Litros</span><b>${nfLitros.format(num(r.liters) || 0)}</b></div>
        <div class="hist-stat"><span>Média</span><b class="${kmlClass}">${kmlText}<small style="font-size:9px;color:var(--muted-2)"> ${e.kml ? 'km/l' : ''}</small></b></div>
        <div class="hist-stat"><span>R\$/L</span><b>${nfBRL.format(num(r.pricePerLiter) || 0)}</b></div>
      </div>
      <div class="hist-foot">
        <div>
          <span class="hist-total">${nfBRL.format(num(r.totalValue) || 0)}</span>
          <div class="hist-km-note">Odômetro: ${nfKm.format(num(r.km) || 0)} km${r.fullTank ? ' · tanque cheio' : ''}</div>
        </div>
        <div class="hist-actions">
          <button class="icon-btn" data-action="edit" data-id="${r.id}" aria-label="Editar abastecimento">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete" data-id="${r.id}" aria-label="Excluir abastecimento">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </div>
    `;
    list.appendChild(card);
  }
}

/* ================= Formulário ================= */

function rebuildVehicleSelects() {
  const filterSel = el('filterVehicle');
  const formSel = el('inpVeiculo');

  const prevFilter = state.filter.vehicle;
  const prevForm = formSel.value;

  filterSel.innerHTML = '<option value="all">Todos os veículos</option>';
  for (const v of state.vehicles) {
    filterSel.insertAdjacentHTML('beforeend', `<option value="${v.id}">${esc(vehicleLabel(v))}</option>`);
  }
  if ([...filterSel.options].some((o) => o.value === prevFilter)) filterSel.value = prevFilter;
  else { filterSel.value = 'all'; state.filter.vehicle = 'all'; }

  formSel.innerHTML = '<option value="" disabled>Escolha ou cadastre…</option>';
  for (const v of state.vehicles) {
    formSel.insertAdjacentHTML('beforeend', `<option value="${v.id}">${esc(vehicleLabel(v))}</option>`);
  }
  formSel.insertAdjacentHTML('beforeend', '<option value="__new__">＋ Cadastrar novo veículo</option>');

  if ([...formSel.options].some((o) => o.value === prevForm)) formSel.value = prevForm;

  rebuildStationsList();
}

function rebuildStationsList() {
  const stations = [...new Set(
    state.records.map((r) => r.station).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  el('postosList').innerHTML = stations.map((s) => `<option value="${esc(s)}"></option>`).join('');
}

function onVehicleChange() {
  const sel = el('inpVeiculo');
  const isNew = sel.value === NEW_VEHICLE;
  const isEmpty = sel.value === '';

  el('newVehicleFields').classList.toggle('hidden', !isNew);
  el('vehicleInfo').classList.add('hidden');
  el('kmHint').classList.add('hidden');

  if (isNew) {
    el('inpMarca').focus();
    return;
  }
  if (isEmpty) return;

  const v = getVehicle(sel.value);
  if (!v) return;

  el('infoFicha').textContent = `${vehicleLabel(v)} · ${FUEL_LABELS[v.combustivel] || 'Gasolina'}`;
  const lastKm = lastKmOf(v.id);
  el('infoUltimaKm').textContent = lastKm !== null ? `${nfKm.format(lastKm)} km` : 'primeiro registro';
  el('vehicleInfo').classList.remove('hidden');

  const hint = el('kmHint');
  hint.textContent = lastKm !== null
    ? `A KM informada deve ser igual ou superior à última registrada (${nfKm.format(lastKm)} km).`
    : 'Este é o primeiro registro do veículo — nenhuma restrição de odômetro.';
  hint.classList.remove('hidden');

  const defaultFuel = v.combustivel === 'flex' ? 'etanol' : v.combustivel;
  const fuelRadio = document.querySelector(`input[name="fuelType"][value="${defaultFuel}"]`);
  if (fuelRadio) fuelRadio.checked = true;
}

function linkValueFields(sourceField) {
  const price = num(el('inpPreco').value);
  state.lastLinkedField = sourceField;

  if (!Number.isFinite(price) || price <= 0) return;

  if (sourceField === 'total') {
    const total = num(el('inpTotal').value);
    if (Number.isFinite(total) && total >= 0) {
      el('inpLitros').value = (total / price).toFixed(3);
    }
  } else {
    const liters = num(el('inpLitros').value);
    if (Number.isFinite(liters) && liters >= 0) {
      el('inpTotal').value = formatBRL(liters * price);
    }
  }
}

function resetForm(keepVehicle = true) {
  const keptVehicle = keepVehicle ? el('inpVeiculo').value : '';

  el('formAbastecimento').reset();
  state.lastLinkedField = 'total';

  rebuildVehicleSelects();
  el('inpVeiculo').value = keptVehicle;
  if (!keptVehicle) el('inpVeiculo').selectedIndex = 0;

  el('newVehicleFields').classList.add('hidden');
  el('vehicleInfo').classList.add('hidden');
  el('kmHint').classList.add('hidden');
  el('inpData').value = nowLocalInputValue();

  const etanolRadio = document.querySelector('input[name="fuelType"][value="etanol"]');
  if (etanolRadio) etanolRadio.checked = true;

  setEditing(false);
}

function setEditing(on) {
  state.editingId = on ? state.editingId : null;
  el('btnSubmitLabel').textContent = on ? 'Atualizar abastecimento' : 'Salvar abastecimento';
  el('btnCancelEdit').classList.toggle('hidden', !on);
}

function startEdit(recordId) {
  const r = state.records.find((x) => x.id === recordId);
  if (!r) return;

  switchView('novo');
  resetForm(false);
  state.editingId = recordId;

  el('inpVeiculo').value = r.vehicleId;
  onVehicleChange();
  el('newVehicleFields').classList.add('hidden');

  const fuelRadio = document.querySelector(`input[name="fuelType"][value="${r.fuelType}"]`);
  if (fuelRadio) fuelRadio.checked = true;

  el('inpData').value = r.dateISO;
  el('inpKm').value = r.km;
  el('inpPreco').value = formatBRL(r.pricePerLiter);
  el('inpLitros').value = r.liters;
  el('inpTotal').value = formatBRL(r.totalValue);
  el('inpPosto').value = r.station || '';
  el('inpTanqueCheio').checked = !!r.fullTank;

  setEditing(true);
  el('view-novo').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateForm() {
  const errors = [];

  const vehicleChoice = el('inpVeiculo').value;
  if (!vehicleChoice) errors.push('Selecione um veículo.');

  let vehicleId = null;

  if (vehicleChoice === NEW_VEHICLE) {
    const marca = el('inpMarca').value.trim();
    const modelo = el('inpModelo').value.trim();
    if (!marca || !modelo) errors.push('Informe marca e modelo do novo veículo.');
  } else {
    const v = getVehicle(vehicleChoice);
    if (!v) errors.push('Veículo inválido.');
    else vehicleId = v.id;
  }

  const dateVal = el('inpData').value;
  if (!dateVal || isNaN(new Date(dateVal).getTime())) errors.push('Informe uma data válida.');

  const km = num(el('inpKm').value);
  if (!Number.isFinite(km) || km < 0) errors.push('Informe a KM atual do odômetro.');
  else if (vehicleId !== null) {
    const lastKm = lastKmOf(vehicleId, state.editingId);
    if (lastKm !== null && km < lastKm) {
      errors.push(`KM não pode ser inferior à última registrada (${nfKm.format(lastKm)} km).`);
    }
  }

  const price = num(el('inpPreco').value);
  if (!Number.isFinite(price) || price <= 0) errors.push('Informe um preço por litro válido.');

  const liters = num(el('inpLitros').value);
  const total = num(el('inpTotal').value);
  if ((!Number.isFinite(liters) || liters <= 0) && (!Number.isFinite(total) || total <= 0)) {
    errors.push('Informe o valor total pago ou a quantidade de litros.');
  }

  return { errors, vehicleId, dateVal, km, price, liters, total };
}

function onSubmitForm(ev) {
  ev.preventDefault();

  const v = validateForm();
  if (v.errors.length) {
    toast(v.errors[0], 'error');
    return;
  }

  const price = v.price;
  let liters = num(el('inpLitros').value);
  let total = num(el('inpTotal').value);

  if (!Number.isFinite(liters) || liters <= 0) liters = total / price;
  if (!Number.isFinite(total) || total <= 0) total = liters * price;

  let targetVehicleId = v.vehicleId;

  if (el('inpVeiculo').value === NEW_VEHICLE) {
    const ano = parseInt(el('inpAno').value, 10);
    const newVehicle = {
      id: uid(),
      marca: el('inpMarca').value.trim(),
      modelo: el('inpModelo').value.trim(),
      ano: Number.isFinite(ano) ? ano : '',
      combustivel: el('inpCombustivelPadrao').value
    };
    state.vehicles.push(newVehicle);
    targetVehicleId = newVehicle.id;
  }

  const fuelType = document.querySelector('input[name="fuelType"]:checked').value;

  const payload = {
    vehicleId: targetVehicleId,
    dateISO: v.dateVal,
    km: v.km,
    fuelType,
    pricePerLiter: round(price, 3),
    liters: round(liters, 3),
    totalValue: round(total, 2),
    fullTank: el('inpTanqueCheio').checked,
    station: el('inpPosto').value.trim()
  };

  if (state.editingId) {
    const idx = state.records.findIndex((r) => r.id === state.editingId);
    if (idx === -1) { toast('Registro não encontrado.', 'error'); return; }
    state.records[idx] = { ...state.records[idx], ...payload };
    toast('Abastecimento atualizado com sucesso.', 'success');
  } else {
    state.records.push({ id: uid(), createdAt: new Date().toISOString(), ...payload });
    toast('Abastecimento salvo com sucesso!', 'success');
  }

  save();
  refreshAll();
  resetForm(false);
  switchView('dashboard');
}

const round = (n, dec) => Math.round(n * 10 ** dec) / 10 ** dec;

/* ================= CRUD histórico ================= */

async function onDeleteRecord(recordId) {
  const ok = await confirmDialog(
    'Excluir abastecimento?',
    'Esta ação não pode ser desfeita. Os indicadores serão recalculados automaticamente.'
  );
  if (!ok) return;

  state.records = state.records.filter((r) => r.id !== recordId);
  save();
  refreshAll();
  toast('Registro excluído. Indicadores recalculados.', 'success');
}

/* ================= Edição de veículo ================= */

let editingVehicleId = null;

function openEditVehicle(vehicleId) {
  const v = getVehicle(vehicleId);
  if (!v) return;
  editingVehicleId = vehicleId;
  el('edMarca').value = v.marca || '';
  el('edModelo').value = v.modelo || '';
  el('edAno').value = v.ano || '';
  el('edCombustivel').value = FUEL_LABELS[v.combustivel] ? v.combustivel : 'gasolina';
  el('editVehicleModal').classList.remove('hidden');
  el('edMarca').focus();
}

function closeEditVehicle() {
  editingVehicleId = null;
  el('editVehicleModal').classList.add('hidden');
}

function onSaveVehicleEdit(ev) {
  ev.preventDefault();
  const v = getVehicle(editingVehicleId);
  if (!v) { closeEditVehicle(); return; }

  const marca = el('edMarca').value.trim();
  const modelo = el('edModelo').value.trim();
  if (!marca || !modelo) { toast('Informe marca e modelo do veículo.', 'error'); return; }

  const ano = parseInt(el('edAno').value, 10);
  v.marca = marca;
  v.modelo = modelo;
  v.ano = Number.isFinite(ano) ? ano : '';
  v.combustivel = el('edCombustivel').value;

  save();
  closeEditVehicle();
  rebuildVehicleSelects();
  onVehicleChange();
  refreshAll();
  toast('Veículo atualizado com sucesso.', 'success');
}

/* ================= Exportação / Importação ================= */

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function timestampSlug() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function exportJson() {
  if (!state.records.length) { toast('Nada para exportar ainda.', 'error'); return; }
  const payload = JSON.stringify({ app: 'kombistivel', version: 1, exportedAt: new Date().toISOString(), vehicles: state.vehicles, records: state.records }, null, 2);
  downloadFile(`kombistivel-backup-${timestampSlug()}.json`, payload, 'application/json;charset=utf-8');
  toast('Backup JSON gerado.', 'success');
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function exportCsv() {
  if (!state.records.length) { toast('Nada para exportar ainda.', 'error'); return; }

  const header = ['data_iso', 'veiculo_marca', 'veiculo_modelo', 'veiculo_ano', 'combustivel', 'km', 'preco_litro', 'litros', 'valor_total', 'tanque_cheio', 'posto'];
  const lines = [header.join(';')];

  for (const r of [...state.records].sort(sortByDateAsc)) {
    const v = getVehicle(r.vehicleId) || {};
    lines.push([
      r.dateISO, v.marca || '', v.modelo || '', v.ano ?? '', r.fuelType,
      r.km, r.pricePerLiter, r.liters, r.totalValue,
      r.fullTank ? 'SIM' : 'NAO', r.station || ''
    ].map(csvEscape).join(';'));
  }

  downloadFile(`kombistivel-backup-${timestampSlug()}.csv`, '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8');
  toast('Backup CSV gerado.', 'success');
}

function parseDecimal(raw) {
  if (typeof raw === 'number') return raw;
  let s = String(raw ?? '').trim();
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s);
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLineEnd = clean.indexOf('\n');
  const headerLine = clean.slice(0, firstLineEnd === -1 ? undefined : firstLineEnd);
  const delim = (headerLine.match(/;/g) || []).length >= (headerLine.match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

async function importFile(file) {
  const text = await file.text();
  let importedRecords = [];
  let importedVehicles = [];

  try {
    if (file.name.toLowerCase().endsWith('.json')) {
      const data = JSON.parse(text);
      if (!Array.isArray(data.records) || !Array.isArray(data.vehicles)) {
        throw new Error('Estrutura inválida: esperado {vehicles:[], records:[]}.');
      }
      importedVehicles = data.vehicles;
      importedRecords = data.records;
    } else {
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error('CSV vazio ou inválido.');
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (name) => header.indexOf(name);
      const need = ['data_iso', 'combustivel', 'km'];
      for (const col of need) {
        if (idx(col) === -1) throw new Error(`Coluna obrigatória ausente no CSV: "${col}".`);
      }

      const vehiclesByName = new Map();
      for (const v of state.vehicles) {
        vehiclesByName.set(`${(v.marca || '')}|${(v.modelo || '')}|${v.ano ?? ''}`.toLowerCase(), v.id);
      }

      let vidSeq = 1;
      for (const cols of rows.slice(1)) {
        const marca = (cols[idx('veiculo_marca')] || '').trim();
        const modelo = (cols[idx('veiculo_modelo')] || '').trim();
        const anoRaw = (cols[idx('veiculo_ano')] || '').trim();
        const key = `${marca}|${modelo}|${anoRaw}`.toLowerCase();
        if (marca && modelo && !vehiclesByName.has(key)) {
          const nv = { id: uid() + '-' + vidSeq++, marca, modelo, ano: anoRaw ? parseInt(anoRaw, 10) || '' : '', combustivel: 'gasolina' };
          importedVehicles.push(nv);
          vehiclesByName.set(key, nv.id);
        }

        const fuel = (cols[idx('combustivel')] || 'gasolina').trim().toLowerCase();
        const tankRaw = (cols[idx('tanque_cheio')] || '').trim().toUpperCase();

        importedRecords.push({
          id: uid() + '-' + vidSeq++,
          vehicleId: vehiclesByName.get(key) || state.vehicles[0]?.id,
          dateISO: cols[idx('data_iso')],
          km: parseDecimal(cols[idx('km')]),
          fuelType: ['etanol', 'gasolina', 'diesel'].includes(fuel) ? fuel : 'gasolina',
          pricePerLiter: parseDecimal(cols[idx('preco_litro')]) || 0,
          liters: parseDecimal(cols[idx('litros')]) || 0,
          totalValue: parseDecimal(cols[idx('valor_total')]) || 0,
          fullTank: ['SIM', 'TRUE', '1', 'S'].includes(tankRaw),
          station: (cols[idx('posto')] || '').trim()
        });
      }
    }
  } catch (err) {
    toast(`Falha na importação: ${err.message}`, 'error');
    return;
  }

  const existingVehicles = new Set(state.vehicles.map((v) => v.id));
  let newVehicles = 0;
  for (const v of importedVehicles) {
    if (!v || !v.id || existingVehicles.has(v.id)) continue;
    state.vehicles.push({
      id: v.id,
      marca: v.marca || 'Veículo',
      modelo: v.modelo || 'Importado',
      ano: v.ano ?? '',
      combustivel: ['etanol', 'gasolina', 'flex', 'diesel'].includes(v.combustivel) ? v.combustivel : 'gasolina'
    });
    existingVehicles.add(v.id);
    newVehicles++;
  }

  const knownIds = new Set(state.vehicles.map((v) => v.id));
  const existingRecords = new Set(state.records.map((r) => r.id));
  let newRecords = 0;
  let skipped = 0;

  for (const r of importedRecords) {
    if (!r || !r.id || existingRecords.has(r.id)) { skipped++; continue; }
    if (!knownIds.has(r.vehicleId)) {
      const stub = { id: uid(), marca: 'Importado', modelo: 'Sem ficha', ano: '', combustivel: r.fuelType || 'gasolina' };
      state.vehicles.push(stub);
      knownIds.add(stub.id);
      newVehicles++;
    }
    if (!Number.isFinite(num(r.km)) || !r.dateISO) { skipped++; continue; }
    state.records.push({
      id: r.id,
      vehicleId: r.vehicleId,
      dateISO: r.dateISO,
      km: num(r.km),
      fuelType: ['etanol', 'gasolina', 'diesel'].includes(r.fuelType) ? r.fuelType : 'gasolina',
      pricePerLiter: round(num(r.pricePerLiter) || 0, 3),
      liters: round(num(r.liters) || 0, 3),
      totalValue: round(num(r.totalValue) || 0, 2),
      fullTank: !!r.fullTank,
      station: r.station || ''
    });
    existingRecords.add(r.id);
    newRecords++;
  }

  save();
  refreshAll();
  toast(`Importação concluída: ${newRecords} abastecimentos e ${newVehicles} veículo(s) adicionados.` +
    (skipped ? ` ${skipped} registro(s) ignorado(s) (duplicado/inválido).` : ''), 'success');
}

/* ================= UI geral ================= */

function switchView(name) {
  document.querySelectorAll('.view').forEach((sec) => sec.classList.toggle('is-active', sec.id === `view-${name}`));
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const active = btn.dataset.view === name;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (name === 'novo' && !el('inpData').value) el('inpData').value = nowLocalInputValue();
}

let confirmResolver = null;

function confirmDialog(title, message, opts = {}) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    el('confirmTitle').textContent = title;
    el('confirmMessage').textContent = message;
    const okBtn = el('confirmOk');
    okBtn.textContent = opts.okLabel || 'Excluir';
    okBtn.className = `btn ${opts.danger === false ? 'btn-primary' : 'btn-danger'}`;
    el('confirmModal').classList.remove('hidden');
    okBtn.focus();
  });
}

function closeConfirm(result) {
  el('confirmModal').classList.add('hidden');
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
}

function toast(message, type = 'info') {
  const container = el('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', 'status');
  const icons = {
    success: '✓',
    error: '!',
    info: 'i'
  };
  t.innerHTML = `<strong style="color:var(--green);font-size:15px">${type === 'success' ? icons.success : type === 'error' ? `<span style="color:var(--red)">${icons.error}</span>` : icons.info}</strong><span>${esc(message)}</span>`;
  container.appendChild(t);

  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 260);
  }, 3400);
}

function refreshAll() {
  enrichRecords();
  rebuildVehicleSelects();
  renderDashboard();
  renderHistory();
}

function updateOnlineBadge() {
  el('offlineBadge').classList.toggle('hidden', navigator.onLine);
}

/* ================= Service Worker / PWA ================= */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Service Worker não registrado:', err);
    });
  });
}

/* ================= Banner de instalação ================= */

const INSTALL_DISMISS_KEY = 'kombistivel.installDismissedAt';
const INSTALL_DISMISS_DAYS = 7;
let deferredInstallPrompt = null;

function installRecentlyDismissed() {
  const at = Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0);
  return Date.now() - at < INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function isStandaloneDisplay() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator?.standalone === true;
}

function showInstallBanner(hintText, acceptLabel, iosMode) {
  const banner = el('installBanner');
  if (hintText) el('installHint').textContent = hintText;
  el('installAccept').textContent = acceptLabel;
  banner.dataset.ios = iosMode ? '1' : '';
  banner.classList.remove('hidden');
}

function hideInstallBanner() {
  el('installBanner').classList.add('hidden');
}

function markInstallDismissed() {
  try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch (e) {}
  hideInstallBanner();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!isStandaloneDisplay() && !installRecentlyDismissed()) {
    showInstallBanner(null, 'Instalar', false);
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallBanner();
  toast('Kombistível instalado! Abra pelo ícone na tela inicial.', 'success');
});

el('installAccept').addEventListener('click', async () => {
  const banner = el('installBanner');
  if (banner.dataset.ios === '1') { markInstallDismissed(); return; }
  if (!deferredInstallPrompt) { hideInstallBanner(); return; }
  deferredInstallPrompt.prompt();
  try {
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome !== 'accepted') markInstallDismissed();
  } catch (e) { /* usuário ignorou o diálogo nativo */ }
  deferredInstallPrompt = null;
  hideInstallBanner();
});

el('installDismiss').addEventListener('click', markInstallDismissed);

if (!isStandaloneDisplay() && !installRecentlyDismissed()) {
  setTimeout(() => {
    if (deferredInstallPrompt || el('installBanner').classList.contains('hidden') === false) return;
    const ua = window.navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
    if (isIOS && !window.matchMedia?.('(display-mode: standalone)').matches) {
      showInstallBanner(
        'No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".',
        'Entendi',
        true
      );
    }
  }, 2500);
}

/* ================= Eventos ================= */

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.addEventListener('click', (ev) => {
  const goto = ev.target.closest('[data-goto]');
  if (goto) switchView(goto.dataset.goto);

  const action = ev.target.closest('[data-action]');
  if (!action) return;
  const { action: act, id } = action.dataset;
  if (act === 'edit') startEdit(id);
  if (act === 'delete') onDeleteRecord(id);
});

el('filterVehicle').addEventListener('change', (ev) => {
  state.filter.vehicle = ev.target.value;
  renderDashboard();
});

el('filterPeriod').addEventListener('change', (ev) => {
  state.filter.period = ev.target.value;
  renderDashboard();
});

el('inpVeiculo').addEventListener('change', onVehicleChange);

el('inpPreco').addEventListener('input', () => {
  applyCurrencyMask(el('inpPreco'));
  el('inpPreco').setSelectionRange(el('inpPreco').value.length, el('inpPreco').value.length);
  if (state.lastLinkedField === 'total' && el('inpTotal').value) linkValueFields('total');
  else if (state.lastLinkedField === 'litros' && el('inpLitros').value) linkValueFields('litros');
});
el('inpPreco').addEventListener('change', () => {
  if (!el('inpTotal').value && !el('inpLitros').value) return;
  linkValueFields(state.lastLinkedField);
});
el('inpTotal').addEventListener('input', () => {
  applyCurrencyMask(el('inpTotal'));
  el('inpTotal').setSelectionRange(el('inpTotal').value.length, el('inpTotal').value.length);
  linkValueFields('total');
});
el('inpLitros').addEventListener('input', () => linkValueFields('litros'));
el('inpLitros').addEventListener('input', () => linkValueFields('litros'));

el('formAbastecimento').addEventListener('submit', onSubmitForm);

el('btnCancelEdit').addEventListener('click', () => {
  resetForm(false);
  switchView('dashboard');
  toast('Edição cancelada.', 'info');
});

el('btnExportJson').addEventListener('click', exportJson);
el('btnExportCsv').addEventListener('click', exportCsv);

el('btnImport').addEventListener('click', () => el('importFile').click());
el('importFile').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (file) importFile(file);
  ev.target.value = '';
});

el('confirmOk').addEventListener('click', () => closeConfirm(true));
el('confirmCancel').addEventListener('click', () => closeConfirm(false));
el('confirmModal').addEventListener('click', (ev) => {
  if (ev.target === el('confirmModal')) closeConfirm(false);
});

el('btnEditVehicle').addEventListener('click', () => openEditVehicle(el('inpVeiculo').value));
el('formEditVeiculo').addEventListener('submit', onSaveVehicleEdit);
el('edCancel').addEventListener('click', closeEditVehicle);
el('editVehicleModal').addEventListener('click', (ev) => {
  if (ev.target === el('editVehicleModal')) closeEditVehicle();
});

window.addEventListener('online', updateOnlineBadge);
window.addEventListener('offline', updateOnlineBadge);

/* ================= Boot ================= */

load();
refreshAll();
updateOnlineBadge();
if (!el('inpData').value) el('inpData').value = nowLocalInputValue();
