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

// === Formateadores de fecha ===

// Formatea 'YYYY-MM-DD' como fecha local española, SIN desfase de zona (usa UTC puro)
function fmtYMD(ymd){
  if (!ymd) return '—';
  // ymd puede llegar como string 'YYYY-MM-DD' o Date; convertimos siempre vía split
  const parts = ymd.toString().split('-').map(Number);
  const y = parts[0], m = parts[1] || 1, d = parts[2] || 1;
  const dt = new Date(Date.UTC(y, m - 1, d)); // UTC “puro”
  return dt.toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
}

function showMsg(text, ok=false){
  $msg.textContent = text;
  $msg.className = 'msg ' + (ok ? 'ok' : 'err');
}

// Normalizador (quita acentos y pasa a minúsculas)
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

// === Datos desde Supabase ===

async function loadEmployees(){
  // RPC segura que ya creaste: employees_public()
  const { data, error } = await supabase.rpc('employees_public');
  if(error){
    showMsg('Error cargando colaboradores: ' + (error.message || JSON.stringify(error)));
    return;
  }
  EMPLOYEES = data || [];
  renderEmployees(EMPLOYEES);
}

function showEmpInfo(row){
  if(!row){ $empInfo.hidden = true; return; }
  $empBod.textContent  = row.bodega ?? '—';
  $empIng.textContent  = row.fecha_ingreso ? fmtYMD(row.fecha_ingreso) : '—';
  $empCupo.textContent = (row.cupo_2026 ?? '—');
  $empInfo.hidden = false;
}

async function loadEmpInfo(empId){
  // RPC segura: employees_info(emp_id uuid) — devuelve bodega, ingreso, cupo_2026
  const { data, error } = await supabase.rpc('employees_info', { emp_id: empId });
  if(error){
    showMsg('No se pudo leer la info del colaborador: ' + (error.message || JSON.stringify(error)));
    return;
  }
  const row = (data && data[0]) ? data[0] : null;
  showEmpInfo(row);
}

async function loadMine(empId){
  $my.innerHTML = 'Cargando…';
  const { data, error } = await supabase
    .from('vacation_requests')
    .select('id, start_date, end_date, status, created_at')
    .eq('employee_id', empId)
    .gte('start_date', '2026-01-01')
    .lte('end_date', '2026-12-31')
    .order('start_date', { ascending: true });
  if(error){
    $my.textContent = 'Error: ' + (error.message || JSON.stringify(error));
    return;
  }
  if(!data || data.length === 0){
    $my.textContent = 'Sin solicitudes para 2026.';
    return;
  }
  $my.innerHTML = data.map(r => `
    <div class="req">
      <div><strong>${fmtYMD(r.start_date)} → ${fmtYMD(r.end_date)}</strong></div>
      <small>Estado: ${r.status}</small>
    </div>
  `).join('');
}

// === Eventos UI ===

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
    showEmpInfo(null);
  }
});

$submit.addEventListener('click', async () => {
  if(submitting) return;
  const empId = $emp.value;
  const s = $start.value;
  const t = $end.value;
  if(!empId) return showMsg('Selecciona tu nombre.');
  if(!s || !t) return showMsg('Completa las fechas.');
  if(s > t) return showMsg('La fecha de inicio no puede ser posterior al fin.');

  submitting = true; $submit.disabled = true; showMsg('Enviando…', true);
  const payload = { employee_id: empId, start_date: s, end_date: t, status: 'Pendiente' };
  const { error } = await supabase.from('vacation_requests').insert(payload);
  submitting = false; $submit.disabled = false;

  if(error){
    showMsg('No se pudo registrar: ' + (error.message || JSON.stringify(error)));
    return;
  }
  showMsg('Solicitud registrada correctamente.', true);
  loadMine(empId);
});

// Inicio
loadEmployees();
