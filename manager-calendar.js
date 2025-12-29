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
function getSelectedValues(selectEl){
  return Array.from(selectEl.selectedOptions || []).map(o => o.value).filter(Boolean);
}

// Estado actual del filtro/mes (bodegas = arreglo)
let CUR = { month: new Date(), bodegas: [], depto: '', loc: '' };

// Feriados 2026
let HOLIDAYS_2026 = new Set();

// Cache de empleados y mapas auxiliares
let EMP_ROWS_CACHE = [];           // employees_public_v2()
let LOC_BY_ID = {};                // employee_id -> localizacion
let BODS_ALL = [];                 // lista total de bodegas (normalizadas)
let BODS_BY_LOC = new Map();       // localizacion -> Set(bodegas)
let LOC_ALL = [];                  // lista de localizaciones

async function loadHolidays(){
  try {
    const { data, error } = await supabase.rpc('vac_feriados_2026');
    if (error) { console.warn('No pude cargar feriados 2026:', error.message); return; }
    HOLIDAYS_2026 = new Set((data || []).map(r => r.d));
  } catch (e) {
    console.warn('Error inesperado cargando feriados 2026:', e);
  }
}

function normalizeBodegaForUI(b){
  const val = (b ?? '').trim();
  return val || '(Sin bodega)';
}

function buildIndexesFromEmployees(rows){
  const cmp = new Intl.Collator('es-MX').compare;

  const bodegasSet = new Set();
  const deptosSet  = new Set();
  const locsSet    = new Set();

  BODS_BY_LOC = new Map();
  LOC_BY_ID = {};

  for (const r of rows) {
    const b  = normalizeBodegaForUI(r.bodega);
    const d  = (r.departamento ?? '').trim();
    const lc = (r.localizacion ?? '').trim();

    bodegasSet.add(b);
    if (d) deptosSet.add(d);
    if (lc) {
      locsSet.add(lc);
      if (!BODS_BY_LOC.has(lc)) BODS_BY_LOC.set(lc, new Set());
      BODS_BY_LOC.get(lc).add(b);
    }

    LOC_BY_ID[r.id] = lc;
  }

  BODS_ALL = Array.from(bodegasSet).sort(cmp);
  LOC_ALL  = Array.from(locsSet).sort(cmp);

  // Rellenar selects
  // Bodega multiselect (todas por defecto; se filtrará dinámicamente al cambiar localización)
  $bod.innerHTML = BODS_ALL.map(b=>`<option value="${b}">${b}</option>`).join('');
  // Departamento simple
  const deptosArr = Array.from(deptosSet).sort(cmp);
  $dep.innerHTML = `<option value="">Todos</option>` + deptosArr.map(d=>`<option value="${d}">${d}</option>`).join('');
  // Localización simple
  $loc.innerHTML = `<option value="">Todas</option>` + LOC_ALL.map(l=>`<option value="${l}">${l}</option>`).join('');
}

/**
 * Refresca las opciones visibles del multiselect de bodegas según la localización seleccionada.
 * - Si CUR.loc está vacío: muestra TODAS las bodegas (BODS_ALL).
 * - Si CUR.loc tiene valor: muestra SOLO bodegas del Set BODS_BY_LOC[loc].
 * Mantiene la selección actual dentro del subconjunto visible (intersección).
 */
function refreshBodegaOptionsByLoc(){
  const currentSel = new Set(CUR.bodegas);        // selección actual
  const cmp = new Intl.Collator('es-MX').compare;

  let visibleBods = BODS_ALL;
  if (CUR.loc) {
    const set = BODS_BY_LOC.get(CUR.loc) || new Set();
    visibleBods = Array.from(set).sort(cmp);
  }

  // Reconstruir opciones
  const html = visibleBods.map(b => {
    const sel = currentSel.has(b) ? ' selected' : '';
    return `<option value="${b}"${sel}>${b}</option>`;
  }).join('');
  $bod.innerHTML = html;

  // Ajustar la selección efectiva a la intersección
  CUR.bodegas = visibleBods.filter(b => currentSel.has(b));
}

/**
 * Carga empleados (para filtros) y construye índices.
 */
async function loadFilters(){
  const rpc = await supabase.rpc('employees_public_v2');
  if (rpc.error) { showMsg('No pude cargar filtros: ' + rpc.error.message, false); return; }
  EMP_ROWS_CACHE = rpc.data || [];

  buildIndexesFromEmployees(EMP_ROWS_CACHE);
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

  // Consulta sin filtro de bodega en servidor (manejamos multi-bodega/loc en cliente)
  const { data, error } = await supabase.rpc('mgr_calendar_month', {
    p_bodega: null,
    p_depto:  CUR.depto || null,
    p_first:  ymd(first),
    p_last:   ymd(last)
  });
  if (error) { showMsg('Error leyendo calendario: ' + error.message, false); return; }

  const selBods = new Set(CUR.bodegas);

  const filtered = (data || []).filter(r => {
    // LOCALIZACIÓN
    if (CUR.loc) {
      const lc = (LOC_BY_ID[r.employee_id] ?? '').trim();
      if (lc !== CUR.loc) return false;
    }
    // BODEGA (multi — dependiente de la loc visible ya en el combo)
    if (selBods.size > 0) {
      const b = normalizeBodegaForUI(r.bodega);
      if (!selBods.has(b)) return false;
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

// Eventos
$bod.addEventListener('change', () => { CUR.bodegas = getSelectedValues($bod); loadMonth(); });
$dep.addEventListener('change', () => { CUR.depto   = $dep.value || '';         loadMonth(); });
$loc.addEventListener('change', () => {
  CUR.loc = $loc.value || '';
  // Al cambiar localización, se filtran las bodegas visibles
  refreshBodegaOptionsByLoc();
  // Si no queda ninguna bodega seleccionada (tras el filtro), no pasa nada:
  // significa "todas las visibles".
  CUR.bodegas = getSelectedValues($bod);
  loadMonth();
});
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
  await loadFilters();    // llena combos y construye BODS_BY_LOC
  await loadHolidays();
  // Asegurar que bodegas visibles correspondan a la loc inicial (vacía = todas)
  refreshBodegaOptionsByLoc();
  buildCalendarGrid(CUR.month);
  await loadMonth();
})();
