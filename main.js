import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $emp    = document.getElementById('employee');
const $search = document.getElementById('search');
const $start  = document.getElementById('start');
const $end    = document.getElementById('end');
const $submit = document.getElementById('submit');
const $msg    = document.getElementById('msg');
const $my     = document.getElementById('my-requests');

let EMPLOYEES = [];   // cache completo

function showMsg(text, ok=false){
  $msg.textContent = text;
  $msg.className = 'msg ' + (ok ? 'ok' : 'err');
}

function fmt(d){
  const dt = new Date(d);
  return dt.toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'});
}

// Normaliza texto: sin acentos y minúsculas
function norm(s){
  return (s || "")
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Renderiza opciones del select según lista filtrada
function renderEmployees(list){
  if(!list || list.length === 0){
    $emp.innerHTML = '<option value="">(Sin coincidencias)</option>';
    return;
  }
  $emp.innerHTML = '<option value="">Selecciona tu nombre…</option>' +
    list.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
}

// Filtra por el texto del buscador
function applyFilter(){
  const q = norm($search.value);
  if(!q){
    renderEmployees(EMPLOYEES);
    return;
  }
  const filtered = EMPLOYEES.filter(e => norm(e.nombre).includes(q));
  renderEmployees(filtered);
}

// Carga colaboradores vía RPC segura
async function loadEmployees(){
  const { data, error } = await supabase.rpc('employees_public');
  if(error){
    showMsg('Error cargando colaboradores: ' + (error.message || JSON.stringify(error)));
    return;
  }
  EMPLOYEES = data || [];
  renderEmployees(EMPLOYEES);
}

// Carga mis solicitudes 2026
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
      <div><strong>${fmt(r.start_date)} → ${fmt(r.end_date)}</strong></div>
      <small>Estado: ${r.status}</small>
    </div>
  `).join('');
}

// Eventos
$search.addEventListener('input', applyFilter);

// Enter en buscador: si hay una coincidencia, la selecciona
$search.addEventListener('keydown', (ev) => {
  if(ev.key === 'Enter'){
    const opts = $emp.querySelectorAll('option');
    if(opts.length > 1 && opts[1].value){ // la primera es “Selecciona…”
      $emp.value = opts[1].value;
      $emp.dispatchEvent(new Event('change'));
    }
  }
});

$emp.addEventListener('change', e => {
  const id = e.target.value;
  if(id) loadMine(id);
  else $my.innerHTML = '';
});

$submit.addEventListener('click', async () => {
  const empId = $emp.value;
  const s = $start.value;
  const t = $end.value;
  if(!empId) return showMsg('Selecciona tu nombre.');
  if(!s || !t) return showMsg('Completa las fechas.');
  if(s > t) return showMsg('La fecha de inicio no puede ser posterior al fin.');

  const payload = { employee_id: empId, start_date: s, end_date: t, status: 'Pendiente' };
  const { error } = await supabase.from('vacation_requests').insert(payload);
  if(error){
    showMsg('No se pudo registrar: ' + (error.message || JSON.stringify(error)));
    return;
  }
  showMsg('Solicitud registrada correctamente.', true);
  loadMine(empId);
});

// Inicio
loadEmployees();
