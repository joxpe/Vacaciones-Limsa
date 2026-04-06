// report-summary.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────────────────────────────────────
const $range   = document.getElementById('range');
const $from    = document.getElementById('from');
const $to      = document.getElementById('to');
const $status  = document.getElementById('status');
const $q       = document.getElementById('q');
const $bodega  = document.getElementById('bodega');
const $depto   = document.getElementById('depto');
const $loc     = document.getElementById('loc');
const $refresh = document.getElementById('refresh');
const $msg     = document.getElementById('msg');

const $kToday = document.getElementById('kpi-today');
const $kTodaySub = document.getElementById('kpi-today-sub');
const $kNext7 = document.getElementById('kpi-next7');
const $kPend = document.getElementById('kpi-pend');
const $kAppr = document.getElementById('kpi-appr');
const $kCupoTotal = document.getElementById('kpi-cupo-total');
const $kCupoTotalSub = document.getElementById('kpi-cupo-total-sub');
const $kTomados = document.getElementById('kpi-tomados');
const $kTomadosSub = document.getElementById('kpi-tomados-sub');
const $kPendTomar = document.getElementById('kpi-pend-tomar');
const $kPendTomarSub = document.getElementById('kpi-pend-tomar-sub');
const $kComprometidos = document.getElementById('kpi-comprometidos');
const $kComprometidosSub = document.getElementById('kpi-comprometidos-sub');
const $kRestantes = document.getElementById('kpi-restantes');
const $kRestantesSub = document.getElementById('kpi-restantes-sub');
const $kSinProgramar = document.getElementById('kpi-sin-programar');
const $kSinProgramarSub = document.getElementById('kpi-sin-programar-sub');
const $kCuposPend = document.getElementById('kpi-cupos-pend');
const $kCuposPendSub = document.getElementById('kpi-cupos-pend-sub');

const $todayList    = document.getElementById('today-list');
const $upcomingList = document.getElementById('upcoming-list');
const $unscheduledList = document.getElementById('unscheduled-list');
const $balancePendingList = document.getElementById('balance-pending-list');
const $unscheduledBodega = document.getElementById('unscheduled-bodega');
const $pendingBodega = document.getElementById('pending-bodega');
const $weekBody     = document.querySelector('#week-table tbody');
const $monthBody    = document.querySelector('#month-table tbody');

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────
function showMsg(text, ok=false){
  $msg.textContent = text;
  $msg.className = 'msg ' + (ok ? 'ok' : 'err');
}

function pad2(n){ return String(n).padStart(2,'0'); }
function ymd(d){
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
}
function parseISO(iso){
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return new Date(iso);
  return new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
}
function addDaysUTC(d, days){
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}
function startOfWeekUTC(d){
  // Semana ISO: lunes = 1
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay(); // 0=Dom..6=Sáb
  const diff = (day === 0 ? -6 : 1 - day);
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}
function endOfWeekUTC(d){
  return addDaysUTC(startOfWeekUTC(d), 6);
}
function startOfMonthUTC(d){
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function endOfMonthUTC(d){
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0));
}
function fmtShort(iso){
  const dt = parseISO(iso);
  return dt.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' });
}
function fmtMonthKey(d){
  const m = d.toLocaleDateString('es-MX', { month:'long', year:'numeric', timeZone:'UTC' });
  return m.charAt(0).toUpperCase() + m.slice(1);
}
function normTxt(s){
  return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function uniqSorted(arr){
  const coll = new Intl.Collator('es-MX');
  return Array.from(new Set(arr.filter(Boolean))).sort(coll.compare);
}
function initialStatusBadge(status){
  const cls = status === 'Aprobado' ? 'badge auth' : status === 'Pre-aprobado' ? 'badge pre' : status === 'Pendiente' ? 'badge pend' : 'badge';
  return `<span class="${cls}">${status}</span>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────
let EMP = [];            // employees_public_v2
let EMP_BY_ID = {};      // id -> employee
let CACHE_MONTH = new Map(); // key yyyy-mm -> rows
let SUMMARY_CACHE = new Map(); // emp_id -> resumen 2026

async function loadEmployees(){
  const rpc = await supabase.rpc('employees_public_v2');
  if (rpc.error || !Array.isArray(rpc.data)) {
    showMsg('No se pudieron cargar empleados: ' + (rpc.error?.message || 'sin datos'));
    return;
  }
  EMP = rpc.data || [];
  EMP_BY_ID = {};
  for(const e of EMP) EMP_BY_ID[e.id] = e;

  // filtros
  const bodegas = uniqSorted(EMP.map(e => (e.bodega ?? '(Sin bodega)')));
  $bodega.innerHTML = `<option value="">Todas</option>` + bodegas.map(b => `<option value="${b}">${b}</option>`).join('');

  const deptos = uniqSorted(EMP.map(e => e.departamento));
  $depto.innerHTML = `<option value="">Todos</option>` + deptos.map(d => `<option value="${d}">${d}</option>`).join('');

  const locs = uniqSorted(EMP.map(e => e.localizacion));
  $loc.innerHTML = `<option value="">Todas</option>` + locs.map(l => `<option value="${l}">${l}</option>`).join('');

  const bodegaOptions = `<option value="">Todas</option>` + bodegas.map(b => `<option value="${b}">${b}</option>`).join('');
  if ($unscheduledBodega) $unscheduledBodega.innerHTML = bodegaOptions;
  if ($pendingBodega) $pendingBodega.innerHTML = bodegaOptions;
}

function monthKey(d){
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}`;
}

async function loadMonthRows(monthDate){
  const key = monthKey(monthDate);
  if (CACHE_MONTH.has(key)) return CACHE_MONTH.get(key);

  const first = startOfMonthUTC(monthDate);
  const last  = endOfMonthUTC(monthDate);

  const { data, error } = await supabase.rpc('mgr_calendar_month', {
    p_bodega: null,
    p_depto: null,
    p_first: ymd(first),
    p_last: ymd(last)
  });
  if (error) {
    throw new Error(error.message || 'Error leyendo calendario');
  }
  const rows = Array.isArray(data) ? data : [];
  CACHE_MONTH.set(key, rows);
  return rows;
}

function monthsBetweenUTC(fromDate, toDate){
  const out = [];
  let cur = startOfMonthUTC(fromDate);
  const end = startOfMonthUTC(toDate);
  while(cur.getTime() <= end.getTime()){
    out.push(new Date(cur.getTime()));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth()+1, 1));
  }
  return out;
}

async function loadRangeRows(fromDate, toDate){
  const months = monthsBetweenUTC(fromDate, toDate);
  const all = [];
  for(const m of months){
    const rows = await loadMonthRows(m);
    all.push(...rows);
  }
  // filtrar por rango exacto y excluir domingos (como manager-calendar)
  const fromISO = ymd(fromDate);
  const toISO = ymd(toDate);
  return all.filter(r => {
    if(!r?.day) return false;
    if (r.day < fromISO || r.day > toISO) return false;
    // excluir domingo robusto
    const dt = parseISO(r.day);
    const dow = dt.getUTCDay();
    if (dow === 0) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform: day rows -> vacation blocks
// ─────────────────────────────────────────────────────────────────────────────
function buildBlocks(dayRows){
  // dayRows: {day, employee_id, nombre, bodega, departamento, status}
  const byEmp = new Map();
  for(const r of dayRows){
    const id = r.employee_id;
    if(!id) continue;
    if(!byEmp.has(id)) byEmp.set(id, []);
    byEmp.get(id).push(r);
  }

  const blocks = [];

  for(const [empId, rows] of byEmp.entries()){
    rows.sort((a,b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

    let cur = null;
    for(const r of rows){
      const day = r.day;
      const st  = r.status || '—';

      if(!cur){
        cur = {
          employee_id: empId,
          nombre: r.nombre || (EMP_BY_ID[empId]?.nombre ?? '(Sin nombre)'),
          bodega: r.bodega ?? (EMP_BY_ID[empId]?.bodega ?? null),
          departamento: r.departamento ?? (EMP_BY_ID[empId]?.departamento ?? null),
          localizacion: (EMP_BY_ID[empId]?.localizacion ?? null),
          status: st,
          start: day,
          end: day,
          days: 1,
          _lastDay: day
        };
        continue;
      }

      const prev = parseISO(cur._lastDay);
      const next = parseISO(day);
      const isConsecutive = (ymd(addDaysUTC(prev, 1)) === ymd(next));
      const sameStatus = (st === cur.status);

      if (isConsecutive && sameStatus) {
        cur.end = day;
        cur.days += 1;
        cur._lastDay = day;
      } else {
        blocks.push({...cur});
        cur = {
          employee_id: empId,
          nombre: r.nombre || (EMP_BY_ID[empId]?.nombre ?? '(Sin nombre)'),
          bodega: r.bodega ?? (EMP_BY_ID[empId]?.bodega ?? null),
          departamento: r.departamento ?? (EMP_BY_ID[empId]?.departamento ?? null),
          localizacion: (EMP_BY_ID[empId]?.localizacion ?? null),
          status: st,
          start: day,
          end: day,
          days: 1,
          _lastDay: day
        };
      }
    }
    if(cur) blocks.push({...cur});
  }

  // limpiar _lastDay
  return blocks.map(b => {
    const x = {...b};
    delete x._lastDay;
    return x;
  });
}

function applyFiltersToBlocks(blocks){
  const q = normTxt($q.value);
  const st = $status.value;
  const bod = $bodega.value;
  const dep = $depto.value;
  const loc = $loc.value;

  return blocks.filter(b => {
    if (st && b.status !== st) return false;
    if (bod) {
      const bb = (b.bodega ?? '(Sin bodega)');
      if (bb !== bod) return false;
    }
    if (dep) {
      if ((b.departamento ?? '') !== dep) return false;
    }
    if (loc) {
      if ((b.localizacion ?? '') !== loc) return false;
    }
    if (q) {
      if (!normTxt(b.nombre).includes(q)) return false;
    }
    return true;
  });
}

function dayCounts(dayRows){
  const map = new Map();
  for(const r of dayRows){
    const d = r.day;
    map.set(d, (map.get(d) || 0) + 1);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranges
// ─────────────────────────────────────────────────────────────────────────────
function todayUTC(){
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function setRangeUI(fromDate, toDate, enableCustom){
  $from.value = ymd(fromDate);
  $to.value   = ymd(toDate);
  $from.disabled = !enableCustom;
  $to.disabled   = !enableCustom;
}

function getSelectedRangeUTC(){
  const t = todayUTC();
  const r = $range.value;

  if (r === 'today') {
    return { from: t, to: t };
  }
  if (r === 'week') {
    const a = startOfWeekUTC(t);
    const b = endOfWeekUTC(t);
    return { from: a, to: b };
  }
  if (r === 'next14') {
    return { from: t, to: addDaysUTC(t, 13) };
  }
  if (r === 'month') {
    const a = startOfMonthUTC(t);
    const b = endOfMonthUTC(t);
    return { from: a, to: b };
  }
  if (r === 'next90') {
    return { from: t, to: addDaysUTC(t, 89) };
  }

  // custom
  const a = $from.value ? parseISO($from.value) : t;
  const b = $to.value ? parseISO($to.value) : t;
  return { from: a, to: b };
}

function syncDateInputsWithRange(){
  const t = todayUTC();
  const r = $range.value;
  if (r === 'custom') {
    $from.disabled = false;
    $to.disabled = false;
    if (!$from.value) $from.value = ymd(t);
    if (!$to.value) $to.value = ymd(t);
    return;
  }

  const { from, to } = getSelectedRangeUTC();
  setRangeUI(from, to, false);
}


function yearStartUTC(year){ return new Date(Date.UTC(year, 0, 1)); }
function yearEndUTC(year){ return new Date(Date.UTC(year, 11, 31)); }
function num(v){ return Number.isFinite(Number(v)) ? Number(v) : 0; }
function selectedEmployeeIds(){
  const q = normTxt($q.value);
  const bod = $bodega.value;
  const dep = $depto.value;
  const loc = $loc.value;
  const ids = [];
  for (const e of EMP){
    const b = (e.bodega ?? '(Sin bodega)');
    const d = (e.departamento ?? '');
    const l = (e.localizacion ?? '');
    const name = (e.nombre ?? '');
    if (bod && b !== bod) continue;
    if (dep && d !== dep) continue;
    if (loc && l !== loc) continue;
    if (q && !normTxt(name).includes(q)) continue;
    ids.push(e.id);
  }
  return ids;
}

function buildSummaryFallback(empId){
  const e = EMP_BY_ID[empId] || {};
  return {
    employee_id: empId,
    nombre: e.nombre ?? '(Sin nombre)',
    bodega: e.bodega ?? null,
    departamento: e.departamento ?? null,
    localizacion: e.localizacion ?? null,
    cupo_2026: 0,
    usado_2026: 0,
    restante_2026: 0,
    cupo_visible: 0,
    restante_visible: 0
  };
}

async function loadSummariesForEmployees(empIds){
  const uniqueIds = Array.from(new Set((empIds || []).filter(Boolean)));
  const missing = uniqueIds.filter(id => !SUMMARY_CACHE.has(id));
  if (missing.length){
    const loaded = await Promise.all(missing.map(async (empId) => {
      try {
        const { data, error } = await supabase.rpc('employees_vac_summary_2026', { emp_id: empId });
        if (error) throw error;
        const row = (Array.isArray(data) && data[0]) ? data[0] : {};
        SUMMARY_CACHE.set(empId, { ...buildSummaryFallback(empId), ...row, employee_id: empId });
      } catch (_err) {
        SUMMARY_CACHE.set(empId, buildSummaryFallback(empId));
      }
    }));
    void loaded;
  }
  return uniqueIds.map(id => SUMMARY_CACHE.get(id) || buildSummaryFallback(id));
}

function renderEmployeeSummaryList($root, items, emptyText){
  if (!items || items.length === 0) {
    $root.innerHTML = `<div class="empty">${emptyText}</div>`;
    return;
  }

  $root.innerHTML = items.map(row => {
    const meta = [
      row.bodega ? `🏬 ${row.bodega}` : null,
      row.departamento ? `🧩 ${row.departamento}` : null,
      row.localizacion ? `📍 ${row.localizacion}` : null
    ].filter(Boolean).join(' · ');

    const extra = [
      `Cupo: ${num(row.cupo_visible)}`,
      `Usado: ${num(row.usado_2026)}`,
      `Restante: ${num(row.restante_visible)}`
    ].join(' · ');

    const hasPendingReq = row.hasPendingRequest ? '<span class="badge pend mini-badge">Solicitud pendiente</span>' : '';
    const hasPreReq = row.hasPreapprovedRequest ? '<span class="badge pre mini-badge">Solicitud pre-aprobada</span>' : '';
    return `
      <div class="item">
        <div class="top">
          <div class="name">${row.nombre}</div>
          <div>${hasPendingReq}${hasPreReq}</div>
        </div>
        <div class="meta">${extra}</div>
        <div class="meta">${meta || 'Sin información adicional'}</div>
      </div>
    `;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────────
function renderList($root, items, emptyText){
  if (!items || items.length === 0) {
    $root.innerHTML = `<div class="empty">${emptyText}</div>`;
    return;
  }

  $root.innerHTML = items.map(b => {
    const meta = [
      b.bodega ? `🏬 ${b.bodega}` : null,
      b.departamento ? `🧩 ${b.departamento}` : null,
      b.localizacion ? `📍 ${b.localizacion}` : null
    ].filter(Boolean).join(' · ');

    return `
      <div class="item">
        <div class="top">
          <div class="name">${b.nombre}</div>
          <div>${initialStatusBadge(b.status)}</div>
        </div>
        <div class="meta">${fmtShort(b.start)} → ${fmtShort(b.end)} · ${b.days} día(s)${meta ? ` · ${meta}` : ''}</div>
      </div>
    `;
  }).join('');
}

function renderWeekTable(weekRows){
  $weekBody.innerHTML = weekRows.map(r => {
    return `
      <tr>
        <td><strong>${r.label}</strong></td>
        <td>${fmtShort(r.from)} → ${fmtShort(r.to)}</td>
        <td>${r.peak}</td>
        <td>${r.appr}</td>
        <td>${r.pre}</td>
        <td>${r.pend}</td>
      </tr>
    `;
  }).join('');
}

function renderMonthTable(monthRows){
  $monthBody.innerHTML = monthRows.map(r => {
    return `
      <tr>
        <td><strong>${r.label}</strong></td>
        <td>${r.appr}</td>
        <td>${r.pre}</td>
        <td>${r.pend}</td>
        <td>${r.peak}</td>
      </tr>
    `;
  }).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main computation
// ─────────────────────────────────────────────────────────────────────────────
async function refresh(){
  try {
    showMsg('Cargando…', true);

    // Rango
    const { from, to } = getSelectedRangeUTC();
    if (from > to) {
      showMsg('El rango es inválido (Desde > Hasta).', false);
      return;
    }

    // Cargar días dentro del rango (desde RPC del calendario)
    const rangeRows = await loadRangeRows(from, to);

    // Construir bloques
    const allBlocks = buildBlocks(rangeRows);
    const blocks = applyFiltersToBlocks(allBlocks);

    const employeeIds = selectedEmployeeIds();
    const annualYear = 2026;
    const annualRows = await loadRangeRows(yearStartUTC(annualYear), yearEndUTC(annualYear));
    const annualBlocksAll = buildBlocks(annualRows);
    const annualBlocksByEmp = new Map();
    for (const block of annualBlocksAll){
      if (!annualBlocksByEmp.has(block.employee_id)) annualBlocksByEmp.set(block.employee_id, []);
      annualBlocksByEmp.get(block.employee_id).push(block);
    }

    const summaries = await loadSummariesForEmployees(employeeIds);
    const summariesEnriched = summaries.map(s => {
      const empBlocks = annualBlocksByEmp.get(s.employee_id) || [];
      const hasAnyProgrammed = empBlocks.length > 0;
      const hasPendingRequest = empBlocks.some(b => b.status === 'Pendiente');
      const hasPreapprovedRequest = empBlocks.some(b => b.status === 'Pre-aprobado');
      return {
        ...buildSummaryFallback(s.employee_id),
        ...s,
        hasAnyProgrammed,
        hasPendingRequest,
        hasPreapprovedRequest
      };
    });

    const totalCupo = summariesEnriched.reduce((acc, r) => acc + num(r.cupo_visible), 0);
    const totalUsadoResumen = summariesEnriched.reduce((acc, r) => acc + num(r.usado_2026), 0);
    const totalRestante = summariesEnriched.reduce((acc, r) => acc + num(r.restante_visible), 0);

    const annualBlocksFiltered = annualBlocksAll.filter(b => {
      if (!employeeIds.includes(b.employee_id)) return false;
      if ($status.value && b.status !== $status.value) return false;
      return true;
    });
    const totalDiasAprobados = annualBlocksFiltered
      .filter(b => b.status === 'Aprobado')
      .reduce((acc, b) => acc + num(b.days), 0);
    const totalDiasPre = annualBlocksFiltered
      .filter(b => b.status === 'Pre-aprobado')
      .reduce((acc, b) => acc + num(b.days), 0);
    const totalDiasPend = annualBlocksFiltered
      .filter(b => b.status === 'Pendiente')
      .reduce((acc, b) => acc + num(b.days), 0);
    const totalPendPorTomar = totalDiasPre + totalDiasPend;
    const totalComprometidos = totalDiasAprobados + totalPendPorTomar;
    const totalFaltaProgramar = Math.max(0, totalCupo - totalComprometidos);

    const unscheduledBodega = $unscheduledBodega?.value || '';
    const pendingBodega = $pendingBodega?.value || '';

    const unscheduledEmployees = summariesEnriched
      .filter(r => num(r.restante_visible) > 0 && !r.hasAnyProgrammed)
      .filter(r => !unscheduledBodega || ((r.bodega ?? '(Sin bodega)') === unscheduledBodega))
      .sort((a,b) => a.nombre.localeCompare(b.nombre, 'es-MX'));

    const pendingBalanceEmployees = summariesEnriched
      .filter(r => num(r.restante_visible) > 0)
      .filter(r => !pendingBodega || ((r.bodega ?? '(Sin bodega)') === pendingBodega))
      .sort((a,b) => {
        const diff = num(b.restante_visible) - num(a.restante_visible);
        if (diff !== 0) return diff;
        return a.nombre.localeCompare(b.nombre, 'es-MX');
      });

    // KPI: hoy
    const t = todayUTC();
    const todayISO = ymd(t);
    const todayBlocks = blocks.filter(b => b.start <= todayISO && b.end >= todayISO);
    const todayApproved = todayBlocks.filter(b => b.status === 'Aprobado').length;
    const todayPreapproved = todayBlocks.filter(b => b.status === 'Pre-aprobado').length;
    const todayPending = todayBlocks.filter(b => b.status === 'Pendiente').length;

    $kToday.textContent = String(todayBlocks.length);
    $kTodaySub.textContent = `${todayApproved} aprobada(s) · ${todayPreapproved} pre-aprobada(s) · ${todayPending} pendiente(s)`;

    // KPI: salen en 7 días (inician)
    const next7To = addDaysUTC(t, 6);
    const next7ISO = ymd(next7To);
    const next7 = blocks.filter(b => b.start >= todayISO && b.start <= next7ISO);
    $kNext7.textContent = String(next7.length);

    // KPI: aprobadas / pendientes que INICIAN en rango
    const fromISO = ymd(from);
    const toISO = ymd(to);
    const startsInRange = blocks.filter(b => b.start >= fromISO && b.start <= toISO);
    const pend = startsInRange.filter(b => b.status === 'Pendiente').length;
    const pre = startsInRange.filter(b => b.status === 'Pre-aprobado').length;
    const appr = startsInRange.filter(b => b.status === 'Aprobado').length;
    $kPend.textContent = String(pend);
    document.getElementById('kpi-pre').textContent = String(pre);
    $kAppr.textContent = String(appr);

    $kCupoTotal.textContent = String(totalCupo);
    $kCupoTotalSub.textContent = `${summariesEnriched.length} colaborador(es) filtrado(s)`;
    $kTomados.textContent = String(totalDiasAprobados);
    $kTomadosSub.textContent = `${totalUsadoResumen} usado(s) según resumen base`;
    $kPendTomar.textContent = String(totalPendPorTomar);
    $kPendTomarSub.textContent = `${totalDiasPre} pre-aprobado(s) · ${totalDiasPend} pendiente(s)`;
    $kComprometidos.textContent = String(totalComprometidos);
    $kComprometidosSub.textContent = `${totalDiasAprobados} ya tomados + ${totalPendPorTomar} por tomar`;
    $kRestantes.textContent = String(totalFaltaProgramar);
    $kRestantesSub.textContent = `${totalRestante} restante(s) visibles en resumen base`;
    $kSinProgramar.textContent = String(unscheduledEmployees.length);
    $kSinProgramarSub.textContent = `${unscheduledEmployees.reduce((acc, r) => acc + num(r.restante_visible), 0)} día(s) por programar`;
    $kCuposPend.textContent = String(pendingBalanceEmployees.length);
    $kCuposPendSub.textContent = `${pendingBalanceEmployees.filter(r => r.hasPendingRequest).length} pendiente(s) · ${pendingBalanceEmployees.filter(r => r.hasPreapprovedRequest).length} pre-aprobada(s)`;

    // Listas
    renderList($todayList,
      todayBlocks.sort((a,b) => a.nombre.localeCompare(b.nombre, 'es-MX')),
      'Nadie aparece de vacaciones hoy con los filtros actuales.'
    );

    const upcoming = blocks
      .filter(b => b.start >= todayISO)
      .sort((a,b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.nombre.localeCompare(b.nombre, 'es-MX')))
      .slice(0, 40);

    renderList($upcomingList, upcoming, 'No hay próximas salidas en el rango/filtros actuales.');

    renderEmployeeSummaryList($unscheduledList, unscheduledEmployees, 'Nadie tiene saldo pendiente sin programar con los filtros actuales.');
    renderEmployeeSummaryList($balancePendingList, pendingBalanceEmployees.slice(0, 60), 'No hay colaboradores con saldo pendiente en los filtros actuales.');

    // Resumen semanal: próximas 8 semanas (pico fuera) + aprobadas/pendientes que inician en esa semana
    // Para esto necesitamos un rango ampliado (hoy → +8 semanas)
    const weekFrom = t;
    const weekTo = addDaysUTC(t, 7*8 - 1);
    const weekDayRowsRaw = await loadRangeRows(weekFrom, weekTo);

    // Aplicar filtros de bodega/depto/loc/q/status en dayRows también, usando EMP_BY_ID
    const q = normTxt($q.value);
    const st = $status.value;
    const bod = $bodega.value;
    const dep = $depto.value;
    const loc = $loc.value;

    const weekDayRows = weekDayRowsRaw.filter(r => {
      const e = EMP_BY_ID[r.employee_id] || {};
      const b = (r.bodega ?? e.bodega ?? '(Sin bodega)');
      const d = (r.departamento ?? e.departamento ?? '');
      const l = (e.localizacion ?? '');
      const name = (r.nombre ?? e.nombre ?? '');
      if (st && (r.status || '') !== st) return false;
      if (bod && b !== bod) return false;
      if (dep && d !== dep) return false;
      if (loc && l !== loc) return false;
      if (q && !normTxt(name).includes(q)) return false;
      return true;
    });

    const weekBlocks = buildBlocks(weekDayRows);
    const counts = dayCounts(weekDayRows);

    const weeks = [];
    let w0 = startOfWeekUTC(t);
    for(let i=0;i<8;i++){
      const ws = addDaysUTC(w0, i*7);
      const we = addDaysUTC(ws, 6);
      const wsISO = ymd(ws);
      const weISO = ymd(we);

      // pico en esa semana
      let peak = 0;
      for(let d = 0; d < 7; d++){
        const di = ymd(addDaysUTC(ws, d));
        peak = Math.max(peak, counts.get(di) || 0);
      }

      // bloques que inician en esa semana
      const apprW = weekBlocks.filter(b => b.status === 'Aprobado' && b.start >= wsISO && b.start <= weISO).length;
      const preW = weekBlocks.filter(b => b.status === 'Pre-aprobado' && b.start >= wsISO && b.start <= weISO).length;
      const pendW = weekBlocks.filter(b => b.status === 'Pendiente' && b.start >= wsISO && b.start <= weISO).length;

      weeks.push({
        label: `Semana ${i+1}`,
        from: wsISO,
        to: weISO,
        peak,
        appr: apprW,
        pre: preW,
        pend: pendW
      });
    }
    renderWeekTable(weeks);

    // Resumen por mes (solo meses tocados por el rango)
    const monthRows = [];
    const months = monthsBetweenUTC(from, to);

    // Para pico mensual necesitamos day rows por mes dentro del rango
    const byMonthCounts = new Map(); // key -> Map(day->count)

    for(const m of months){
      const key = monthKey(m);
      const mr = await loadMonthRows(m);

      // filtrar al rango y filtros de cliente
      const filtered = mr.filter(r => {
        if(!r?.day) return false;
        if (r.day < fromISO || r.day > toISO) return false;
        const dt = parseISO(r.day);
        if (dt.getUTCDay() === 0) return false;

        const e = EMP_BY_ID[r.employee_id] || {};
        const b = (r.bodega ?? e.bodega ?? '(Sin bodega)');
        const d = (r.departamento ?? e.departamento ?? '');
        const l = (e.localizacion ?? '');
        const name = (r.nombre ?? e.nombre ?? '');
        if (st && (r.status || '') !== st) return false;
        if (bod && b !== bod) return false;
        if (dep && d !== dep) return false;
        if (loc && l !== loc) return false;
        if (q && !normTxt(name).includes(q)) return false;
        return true;
      });

      const mBlocks = buildBlocks(filtered);
      const apprM = mBlocks.filter(b => b.status === 'Aprobado').length;
      const preM = mBlocks.filter(b => b.status === 'Pre-aprobado').length;
      const pendM = mBlocks.filter(b => b.status === 'Pendiente').length;

      const c = dayCounts(filtered);
      let peak = 0;
      for (const v of c.values()) peak = Math.max(peak, v);

      monthRows.push({
        label: fmtMonthKey(m),
        appr: apprM,
        pre: preM,
        pend: pendM,
        peak
      });
    }

    renderMonthTable(monthRows);

    showMsg('', true);

  } catch (e) {
    console.error(e);
    showMsg('Error: ' + (e?.message || String(e)), false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI events
// ─────────────────────────────────────────────────────────────────────────────
$range.addEventListener('change', () => {
  syncDateInputsWithRange();
  refresh();
});

$from.addEventListener('change', () => {
  if ($range.value !== 'custom') $range.value = 'custom';
  syncDateInputsWithRange();
  refresh();
});

$to.addEventListener('change', () => {
  if ($range.value !== 'custom') $range.value = 'custom';
  syncDateInputsWithRange();
  refresh();
});

// filtros
let debounce = null;
function queueRefresh(){
  clearTimeout(debounce);
  debounce = setTimeout(() => refresh(), 180);
}
[$status, $bodega, $depto, $loc, $unscheduledBodega, $pendingBodega].forEach(el => el && el.addEventListener('change', queueRefresh));
$q.addEventListener('input', queueRefresh);
$refresh.addEventListener('click', refresh);

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
(async function init(){
  syncDateInputsWithRange();
  await loadEmployees();
  await refresh();
})();
