import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $emp    = document.getElementById('employee');
const $search = document.getElementById('search');
const $start  = document.getElementById('start');
const $end    = document.getElementById('end');
const $submit = document.getElementById('submit');
const $msg    = document.getElementById('msg');
const $my     = document.getElementById('my-requests');

const $empInfo = document.getElementById('emp-info');
const $empBod  = document.getElementById('emp-bod');
const $empIng  = document.getElementById('emp-ing');
const $empCupo = document.getElementById('emp-cupo');

let EMPLOYEES = [];
let submitting = false;

/* ========= Fechas sin desfase de zona ========= */
function fmtYMD(ymd){
  if (!ymd) return '—';
  const parts = ymd.toString().split('-').map(Number);
  const y = parts[0], m = parts[1] || 1, d = parts[2] || 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
}

/* ========= Utilidades UI ========= */
function showMsg(text, ok=false){
  $msg.textContent = text;
  $msg.className = 'msg ' + (ok ? 'ok' : 'err');
}

function norm(s){
  return (s || "").toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function renderEmployees(list){
  if(!list || list.length === 0){
    $emp.innerHTML = '<option value="">(Sin coincidencias)</option>';
    return;
  }
  $emp.innerHTML = '<option value="">Selecciona tu nombre…</option>' +
    list.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
}

function applyFilter(){
  const q = norm($search.value);
  if(!q){ renderEmployees(EMPLOYEES); return; }
  const filtered = EMPLOYEES.filter(e => norm(e.nombre).includes(q));
  renderEmployees(filtered);
}

/* ========= Cargas desde Supabase (RPCs con security definer) ========= */

// Colaboradores (ya creado: employees_public)
async function loadEmployees(){
  const { data, error } = await supabase.rpc('employees_public');
  if(error){
    showMsg('Error cargando colaboradores: ' + (error.message || JSON.stringify(error)));
    return;
  }
  EMPLOYEES = data || [];
  renderEmployees(EMPLOYEES);
}

// Info del colaborador (ya creado: employees_info(emp_id))
async function loadEmpInfo(empId){
  const { data, error } = await supabase.rpc('employees_info', { emp_id: empId });
  if(error){
    showMsg('No se pudo leer la info del colaborador: ' + (error.message || JSON.stringify(error)));
    return;
  }
  const row = (data && data[0]) ? data[0] : null;
  if(!row){ $empInfo.hidden = true; return; }
  $empBod.textContent  = row.bodega ?? '—';
  $empIng.textContent  = row.fecha_ingreso ? fmtYMD(row.fecha_ingreso) : '—';
  $empCupo.textContent = (row.cupo_2026 ?? '—');
  $empInfo.hidden = false;
}

// Solicitudes del colaborador (nueva: vacation_requests_get(emp_id))
async function loadMine(empId){
  $my.innerHTML = 'Cargando…';
  const { data, error } = await supabase.rpc('vacation_requests_get', { emp_id: empId });
  if(error){
    $my.textContent = 'Error: ' + (error.message || JSON.stringify(error));
    return;
  }
  // Filtrar a 2026 por si la RPC regresa todo el historial
  const list = (data || []).filter(r => {
    const ys = Number(r.start_date?.toString().slice(0,4));
    const ye = Number(r.end_date?.toString().slice(0,4));
    return ys === 2026 && ye === 2026;
  });
  if(list.length === 0){
    $my.textContent = 'Sin solicitudes para 2026.';
    return;
  }
  $my.innerHTML = list.map(r => `
    <div class="req">
      <div><strong>${fmtYMD(r.start_date)} → ${fmtYMD(r.end_date)}</strong></div>
      <small>Estado: ${r.status}</small>
    </div>
  `).join('');
}

/* ========= Eventos ========= */

$search.addEventListener('input', applyFilter);

$search.addEventListener('keydown', (ev) => {
  if(ev.key === 'Enter'){
    const opts = $emp.querySelectorAll('option');
    if(opts.length > 1 && opts[1].value){
      $emp.value = opts[1].value;
      $emp.dispatchEvent(new Event('change'));
    }
  }
});

$emp.addEventListener('change', async (e) => {
  const id = e.target.value;
  if(id){
    await loadEmpInfo(id);
    loadMine(id);
  } else {
    $my.innerHTML = '';
    $empInfo.hidden = true;
  }
});

$submit.addEventListener('click', async () => {
  if(submitting) return;
  const empId = $emp.value;
  const s = $start.value; // YYYY-MM-DD
  const t = $end.value;   // YYYY-MM-DD
  if(!empId) return showMsg('Selecciona tu nombre.');
  if(!s || !t) return showMsg('Completa las fechas.');
  if(s > t) return showMsg('La fecha de inicio no puede ser posterior al fin.');

  submitting = true; $submit.disabled = true; showMsg('Enviando…', true);

  // Inserción por RPC (nueva: vacation_requests_create(emp_id uuid, s date, e date))
  const { data, error } = await supabase.rpc('vacation_requests_create', {
    emp_id: empId, s, e: t
  });

  submitting = false; $submit.disabled = false;

  if(error){
    showMsg('No se pudo registrar: ' + (error.message || JSON.stringify(error)));
    return;
  }
  showMsg('Solicitud registrada correctamente.', true);
  loadMine(empId);
});

/* ========= Inicio ========= */
loadEmployees();
