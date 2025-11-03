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
const $empUsed = document.getElementById('emp-used');
const $empLeft = document.getElementById('emp-left');

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

/* ========= RPCs ========= */

// Colaboradores
async function loadEmployees(){
  const { data, error } = await supabase.rpc('employees_public');
  if(error){
    showMsg('Error cargando colaboradores: ' + (error.message || JSON.stringify(error)));
    return;
  }
  EMPLOYEES = data || [];
  renderEmployees(EMPLOYEES);
}

// Info básica (bodega/ingreso/cupo) y resumen (usado/restante)
async function loadEmpHeader(empId){
  // employees_info: bodega, fecha_ingreso, cupo_2026
  const [infoRes, sumRes] = await Promise.all([
    supabase.rpc('employees_info', { emp_id: empId }),
    supabase.rpc('employees_vac_summary_2026', { emp_id: empId })
  ]);

  if(infoRes.error){
    showMsg('No se pudo leer la info del colaborador: ' + (infoRes.error.message || JSON.stringify(infoRes.error)));
    return;
  }
  const info = (infoRes.data && infoRes.data[0]) ? infoRes.data[0] : null;

  if(sumRes.error){
    showMsg('No se pudo leer el resumen de vacaciones: ' + (sumRes.error.message || JSON.stringify(sumRes.error)));
    return;
  }
  const sum = (sumRes.data && sumRes.data[0]) ? sumRes.data[0] : { cupo_2026: null, usado_2026: null, restante_2026: null };

  if(!info){ $empInfo.hidden = true; return; }

  $empBod.textContent  = info.bodega ?? '—';
  $empIng.textContent  = info.fecha_ingreso ? fmtYMD(info.fecha_ingreso) : '—';
  $empCupo.textContent = (info.cupo_2026 ?? '—');
  $empUsed.textContent = (sum.usado_2026 ?? '—');
  $empLeft.textContent = (sum.restante_2026 ?? '—');
  $empInfo.hidden = false;
}

// Mis solicitudes (con días hábiles por renglón)
async function loadMine(empId){
  $my.innerHTML = 'Cargando…';
  const { data, error } = await supabase.rpc('vacation_requests_get', { emp_id: empId });
  if(error){
    $my.textContent = 'Error: ' + (error.message || JSON.stringify(error));
    return;
  }
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
      <div><strong>${fmtYMD(r.start_date)} → ${fmtYMD(r.end_date)} (${r.biz_days} días)</strong></div>
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
    await loadEmpHeader(id);   // bodega/ingreso/cupo/usado/restante
    loadMine(id);              // solicitudes con días hábiles
  } else {
    $my.innerHTML = '';
    $empInfo.hidden = true;
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

  // Inserción por RPC (ya creada): vacation_requests_create(emp_id, s, e)
  const { error } = await supabase.rpc('vacation_requests_create', { emp_id: empId, s, e: t });

  submitting = false; $submit.disabled = false;

  if(error){
    showMsg('No se pudo registrar: ' + (error.message || JSON.stringify(error)));
    return;
  }
  showMsg('Solicitud registrada correctamente.', true);

  // Refresca solicitudes y resumen para ver la "resta" actualizada
  await loadMine(empId);
  await loadEmpHeader(empId);
});

/* ========= Inicio ========= */
loadEmployees();
