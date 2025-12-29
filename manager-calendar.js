import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $bod   = document.getElementById('f-bodega');        // multiselect
const $dep   = document.getElementById('f-depto');
const $loc   = document.getElementById('f-localizacion');
const $month = document.getElementById('f-month');
const $cal   = document.getElementById('calendar');
const $msg   = document.getElementById('msg');
const $title = document.getElementById('month-title');
const $prev  = document.getElementById('prev');
const $next  = document.getElementById('next');

function showMsg(t, ok=true){ $msg.textContent = t || ''; $msg.className = 'msg ' + (ok?'ok':'err'); }
function firstDayOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastDayOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function fmtMonthTitle(d){ return d.toLocaleDateString('es-MX', { month:'long', year:'numeric' }); }
function dowMonday0(date){ return (date.getDay()+6)%7; } // 0=Lun .. 6=Dom
function ymd(date){ return date.toISOString().slice(0,10); }
function initials(nombre){
  const p = (nombre||'').split(/\s+/).filter(Boolean);
  return ((p[0]?.[0]||'') + (p[1]?.[0]||'')).toUpperCase();
}

// Estado actual del filtro/mes (👈 bodegas ahora es arreglo)
let CUR = { month: new Date(), bodegas: [], depto: '', loc: '' };

// Feriados 2026
let HOLIDAYS_2026 = new Set();

// Mapas/local cache
let LOC_BY_ID = {};      // employee_id -> localizacion
let EMP_ROWS_CACHE = []; // employees_public_v2

async function loadHolidays(){
  try {
    const { data, error } = await supabase.rpc('vac_feriados_2026');
    if (error) { console.warn('No pude cargar feriados 2026:', error.message); return; }
    HOLIDAYS_2026 = new Set((data || []).map(r => r.d));
  } catch (e) {
    console.warn('Error inesperado cargando feriados 2026:', e);
  }
}

async function loadFilters(){
  const rpc = await supabase.rpc('employees_public_v2');
  if (rpc.error) { showMsg('No pude cargar filtros: ' + rpc.error.message, false); return; }
  const rows = rpc.data || [];
  EMP_ROWS_CACHE = rows;

  const bodegas = new Set();
  const deptos  = new Set();
  const locs    = new Set();
  LOC_BY_ID = {};

  for (const r of rows) {
    const b  = (r.bodega ?? '').trim();
    const d  = (r.departamento ?? '').trim();
    const lc = (r.localizacion ?? '').trim();

    LOC_BY_ID[r.id] = lc;

    // Para el combo, si falta bodega mostramos "(Sin bodega)" como opción
    bodegas.add(b || '(Sin bodega)');
    deptos.add(d || '(Sin depto)');
    if (lc) locs.add(lc);
    // Si quieres incluir también "(Sin localización)", descomenta:
    // else locs.add('(Sin localización)');
  }

  const cmp = new Intl.Collator('es-MX').compare;
  const bodegasArr = Array.from(bodegas).sort(cmp);
  const deptosArr  = Array.from(deptos).sort(cmp);
  const locsArr    = Array.from(locs).sort(cmp);

  // Bodega multiselect
  $bod.innerHTML = bodegasArr.map(b=>`<option value="${b}">${b}</option>`).join('');
  // Departamento / Localización (simples)
  $dep.innerHTML = `<option value="">Todos</option>` + deptosArr.map(d=>`<option value="${d}">${d}</option>`).join('');
  $loc.innerHTML = `<option value="">Todas</option>` + locsArr.map(l=>`<option value="${l}">${l}</option>`).join('');
}

function buildCalendarGrid(monthDate){
  $cal.querySelectorAll('.cal-cell').forEach(n => n.remove());

  const first = firstDayOfMonth(monthDate);
  const last  = lastDayOfMonth(monthDate);
  const padStart = dowMonday0(first);
  const totalDays = last.getDate();
  const padEnd = (7 - ((padStart + totalDays) % 7)) % 7;

  for(let i=0; i<padStart; i++){
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty';
    $cal.appendChild(cell);
  }

  for(let d=1; d<=totalDays; d++){
    const cell = document.createElement('div');
    cell.className = 'cal-cell';

    const dateObj = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
    const dateStr = ymd(dateObj);

    cell.dataset.date = dateStr;
    cell.innerHTML = `<div class="cal-daynum">${d}</div><div class="cal-badges"></div>`;

    if (dateStr >= "2026-11-13" && dateStr <= "2026-11-16") {
      cell.classList.add('buenfin');
    } else if (HOLIDAYS_2026.has(dateStr)) {
      cell.classList.add('holiday');
    }

    $cal.appendChild(cell);
  }

  for(let i=0; i<padEnd; i++){
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty';
    $cal.appendChild(cell);
  }

  $title.textContent = fmtMonthTitle(monthDate);
  const y = monthDate.getFullYear(), m = String(monthDate.getMonth()+1).padStart(2,'0');
  $month.value = `${y}-${m}`;
}

function computeConcurrency(mapDay){
  const levels = {};
  for (const d in mapDay){
    const n = mapDay[d].length;
    levels[d] = n >= 5 ? 'high' : n >= 3 ? 'mid' : 'low';
  }
  return levels;
}

async function loadMonth(){
  showMsg('Cargando…', true);

  const first = firstDayOfMonth(CUR.month);
  const last  = lastDayOfMonth(CUR.month);

  // Para soportar múltiples bodegas, consultamos SIN filtro de bodega
  // y filtramos en cliente (depto sí puede viajar al servidor).
  const { data, error } = await supabase.rpc('mgr_calendar_month', {
    p_bodega: null,                 // 👈 sin filtro en servidor
    p_depto:  CUR.depto || null,    // depto sí lo pasamos si aplica
    p_first:  ymd(first),
    p_last:   ymd(last)
  });
  if (error) { showMsg('Error leyendo calendario: ' + error.message, false); return; }

  // Armar Set de bodegas seleccionadas (si hay)
  const selBods = new Set(CUR.bodegas);

  const filtered = (data || []).filter(r => {
    // BODEGA (multi)
    if (selBods.size > 0) {
      // Normalizamos el valor nulo como "(Sin bodega)" igual que en el combo
      const b = (r.bodega && r.bodega.trim()) ? r.bodega.trim() : '(Sin bodega)';
      if (!selBods.has(b)) return false;
    }
    // LOCALIZACIÓN (simple)
    if (CUR.loc) {
      const lc = (LOC_BY_ID[r.employee_id] ?? '').trim();
      if (lc !== CUR.loc) return false;
    }
    return true;
  });

  const mapDay = {};
  for(const r of filtered){
    const day = r.day;
    if(!mapDay[day]) mapDay[day] = [];
    mapDay[day].push(r);
  }

  buildCalendarGrid(CUR.month);
  const levels = computeConcurrency(mapDay);

  for(const day in mapDay){
    const cell = $cal.querySelector(`.cal-cell[data-date="${day}"]`);
    if(!cell) continue;

    cell.classList.add(
      levels[day] === 'high' ? 'conc-high'
    : levels[day] === 'mid'  ? 'conc-mid'
    : 'conc-low'
    );

    const $badges = cell.querySelector('.cal-badges');
    $badges.innerHTML = mapDay[day].map(r => {
      const klass =
        r.status === 'Aprobado'  ? 'badge auth' :
        r.status === 'Pendiente' ? 'badge pend' :
        'badge other';

      const lc = (LOC_BY_ID[r.employee_id] ?? '').trim();
      const tip = `${r.nombre} • ${r.bodega ?? ''} • ${r.departamento ?? ''} • ${lc || 's/loc'} • ${r.status}`;
      return `<span class="${klass}" title="${tip}">${initials(r.nombre)}</span>`;
    }).join('');
  }

  showMsg('', true);
}

// Helpers
function getSelectedValues(selectEl){
  return Array.from(selectEl.selectedOptions || []).map(o => o.value).filter(Boolean);
}

// Eventos
$bod.addEventListener('change', () => { CUR.bodegas = getSelectedValues($bod); loadMonth(); });
$dep.addEventListener('change', () => { CUR.depto   = $dep.value || '';         loadMonth(); });
$loc.addEventListener('change', () => { CUR.loc     = $loc.value || '';         loadMonth(); });
$month.addEventListener('change', () => {
  const [y,m] = $month.value.split('-').map(Number);
  CUR.month = new Date(y, m-1, 1);
  loadMonth();
});
$prev.addEventListener('click', () => { CUR.month = new Date(CUR.month.getFullYear(), CUR.month.getMonth()-1, 1); loadMonth(); });
$next.addEventListener('click', () => { CUR.month = new Date(CUR.month.getFullYear(), CUR.month.getMonth()+1, 1); loadMonth(); });

// Inicio
(async function init(){
  CUR.month = new Date();
  await loadFilters();   // llena bodegas (multi), depto y localización
  await loadHolidays();
  buildCalendarGrid(CUR.month);
  await loadMonth();
})();
