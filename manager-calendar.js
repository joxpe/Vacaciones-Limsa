import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $bod   = document.getElementById('f-bodega');
const $dep   = document.getElementById('f-depto');
const $loc   = document.getElementById('f-localizacion');  // ⬅️ nuevo
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

// Estado actual del filtro/mes
let CUR = { month: new Date(), bodega: '', depto: '', loc: '' }; // ⬅️ loc

// Feriados 2026 cargados desde Supabase
let HOLIDAYS_2026 = new Set();

// Mapas auxiliares para filtro por localización
let LOC_BY_ID = {}; // employee_id -> localizacion
let EMP_ROWS_CACHE = []; // cache employees_public_v2 para opciones

async function loadHolidays(){
  try {
    const { data, error } = await supabase.rpc('vac_feriados_2026');
    if (error) {
      console.warn('No pude cargar feriados 2026:', error.message);
      return;
    }
    // data viene como filas { d: '2026-01-01', ... }
    HOLIDAYS_2026 = new Set((data || []).map(r => r.d));
  } catch (e) {
    console.warn('Error inesperado cargando feriados 2026:', e);
  }
}

async function loadFilters(){
  const rpc = await supabase.rpc('employees_public_v2');
  if (rpc.error) { showMsg('No pude cargar bodegas/deptos/locs: ' + rpc.error.message, false); return; }
  const rows = rpc.data || [];
  EMP_ROWS_CACHE = rows;

  // Construimos conjuntos únicos
  const bodegas = new Set();
  const deptos  = new Set();
  const locs    = new Set();
  LOC_BY_ID = {};

  for (const r of rows) {
    LOC_BY_ID[r.id] = r.localizacion ?? '(Sin localización)';
    bodegas.add(r.bodega ?? '(Sin bodega)');
    deptos.add(r.departamento ?? '(Sin depto)');
    locs.add(r.localizacion ?? '(Sin localización)');
  }

  const cmp = new Intl.Collator('es-MX').compare;

  const bodegasArr = Array.from(bodegas).sort(cmp);
  const deptosArr  = Array.from(deptos).sort(cmp);
  const locsArr    = Array.from(locs).sort(cmp);

  $bod.innerHTML = `<option value="">Todas</option>` + bodegasArr.map(b=>`<option value="${b}">${b}</option>`).join('');
  $dep.innerHTML = `<option value="">Todos</option>` + deptosArr.map(d=>`<option value="${d}">${d}</option>`).join('');
  if ($loc) {
    $loc.innerHTML = `<option value="">Todas</option>` + locsArr.map(l=>`<option value="${l}">${l}</option>`).join('');
  }
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

    // Buen Fin (se trabaja, pero debe marcarse)
    if (dateStr >= "2026-11-13" && dateStr <= "2026-11-16") {
      cell.classList.add('buenfin');
    }
    // Otros feriados (no laborales)
    else if (HOLIDAYS_2026.has(dateStr)) {
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

  // El RPC no recibe localización; filtramos localización en cliente con LOC_BY_ID
  const { data, error } = await supabase.rpc('mgr_calendar_month', {
    p_bodega: CUR.bodega || null,
    p_depto:  CUR.depto  || null,
    p_first:  ymd(first),
    p_last:   ymd(last)
  });
  if (error) { showMsg('Error leyendo calendario: ' + error.message, false); return; }

  // Filtrado por localización (si se seleccionó)
  const filtered = (data || []).filter(r => {
    if (!CUR.loc) return true;
    const loc = LOC_BY_ID[r.employee_id] || '(Sin localización)';
    return String(loc) === CUR.loc;
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

      const loc = LOC_BY_ID[r.employee_id] || '';
      const tip = `${r.nombre} • ${r.bodega ?? ''} • ${r.departamento ?? ''} • ${loc} • ${r.status}`;
      return `<span class="${klass}" title="${tip}">${initials(r.nombre)}</span>`;
    }).join('');
  }

  showMsg('', true);
}

// Eventos
$bod.addEventListener('change', () => { CUR.bodega = $bod.value || ''; loadMonth(); });
$dep.addEventListener('change', () => { CUR.depto  = $dep.value || ''; loadMonth(); });
if ($loc) {
  $loc.addEventListener('change', () => { CUR.loc = $loc.value || ''; loadMonth(); });
}
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
  await loadFilters();
  await loadHolidays();         // ⬅️ primero traemos los feriados
  buildCalendarGrid(CUR.month);
  await loadMonth();
})();
