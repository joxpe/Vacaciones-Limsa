import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $bod   = document.getElementById('f-bodega');
const $dep   = document.getElementById('f-depto');
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

let CUR = { month: new Date(), bodega: '', depto: '' };

async function loadFilters(){
  const rpc = await supabase.rpc('employees_public_v2');
  if (rpc.error) { showMsg('No pude cargar bodegas/deptos: ' + rpc.error.message, false); return; }
  const rows = rpc.data || [];

  const bodegas = Array.from(new Set(rows.map(r => r.bodega ?? '(Sin bodega)'))).sort(new Intl.Collator('es-MX').compare);
  const deptos  = Array.from(new Set(rows.map(r => r.departamento ?? '(Sin depto)'))).sort(new Intl.Collator('es-MX').compare);

  $bod.innerHTML = `<option value="">Todas</option>` + bodegas.map(b=>`<option value="${b}">${b}</option>`).join('');
  $dep.innerHTML = `<option value="">Todos</option>` + deptos.map(d=>`<option value="${d}">${d}</option>`).join('');
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
    cell.dataset.date = ymd(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
    cell.innerHTML = `<div class="cal-daynum">${d}</div><div class="cal-badges"></div>`;
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

  const { data, error } = await supabase.rpc('mgr_calendar_month', {
    p_bodega: CUR.bodega || null,
    p_depto:  CUR.depto  || null,
    p_first:  ymd(first),
    p_last:   ymd(last)
  });
  if (error) { showMsg('Error leyendo calendario: ' + error.message, false); return; }

  const mapDay = {};
  for(const r of (data||[])){
    const day = r.day;
    if(!mapDay[day]) mapDay[day] = [];
    mapDay[day].push(r);
  }

  buildCalendarGrid(CUR.month);
  const levels = computeConcurrency(mapDay);

  for(const day in mapDay){
    const cell = $cal.querySelector(`.cal-cell[data-date="${day}"]`);
    if(!cell) continue;

    cell.classList.add(levels[day] === 'high' ? 'conc-high'
                   : levels[day] === 'mid'  ? 'conc-mid'
                   : 'conc-low');

    const $badges = cell.querySelector('.cal-badges');
    $badges.innerHTML = mapDay[day].map(r => {
      const klass = r.status === 'Autorizada' ? 'badge auth' : 'badge pend';
      const tip   = `${r.nombre} • ${r.bodega ?? ''} • ${r.departamento ?? ''} • ${r.status}`;
      return `<span class="${klass}" title="${tip}">${initials(r.nombre)}</span>`;
    }).join('');
  }

  showMsg('', true);
}

// Eventos
$bod.addEventListener('change', () => { CUR.bodega = $bod.value || ''; loadMonth(); });
$dep.addEventListener('change', () => { CUR.depto  = $dep.value || ''; loadMonth(); });
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
  buildCalendarGrid(CUR.month);
  await loadMonth();
})();

.back-link {
  text-align: left;
  margin: 15px;
}

.back-button {
  display: inline-block;
  background-color: #6c757d;
  color: white;
  font-weight: bold;
  padding: 10px 16px;
  border-radius: 8px;
  text-decoration: none;
  transition: background-color 0.3s ease;
}

.back-button:hover {
  background-color: #5a6268;
}
