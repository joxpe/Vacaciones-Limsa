import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

console.log("[Vacaciones] Iniciando...");
const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const $emp = document.getElementById('employee');
const $start = document.getElementById('start');
const $end = document.getElementById('end');
const $submit = document.getElementById('submit');
const $msg = document.getElementById('msg');
const $my = document.getElementById('my-requests');

function showMsg(text, ok=false){
  $msg.textContent = text;
  $msg.className = 'msg ' + (ok ? 'ok' : 'err');
  console.log("[Vacaciones] MSG:", text);
}

function fmt(d){
  const dt = new Date(d);
  return dt.toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'});
}

async function loadEmployees(){
  console.log("[Vacaciones] Cargando colaboradores...");
  // OPCIÓN 1: usando RPC (recomendado; ver SQL abajo)
  const { data, error } = await supabase.rpc('employees_public');
  // OPCIÓN 2: si no creaste la RPC, comenta lo de arriba y usa la tabla directa:
  // const { data, error } = await supabase.from('employees').select('id, nombre').order('nombre', { ascending: true });

  if(error){
    console.error("[Vacaciones] Error empleados:", error);
    return showMsg('Error cargando colaboradores: ' + (error.message || JSON.stringify(error)));
  }
  if(!data || data.length === 0){
    console.warn("[Vacaciones] No hay colaboradores.");
    $emp.innerHTML = '<option value="">(No hay colaboradores)</option>';
    return;
  }
  console.log("[Vacaciones] Colaboradores:", data.length);
  $emp.innerHTML = '<option value="">Selecciona tu nombre…</option>' +
    data.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
}

async function loadMine(empId){
  console.log("[Vacaciones] Cargando solicitudes de:", empId);
  $my.innerHTML = 'Cargando…';
  const { data, error } = await supabase
    .from('vacation_requests')
    .select('id, start_date, end_date, status, created_at')
    .eq('employee_id', empId)
    .gte('start_date', '2026-01-01')
    .lte('end_date', '2026-12-31')
    .order('start_date', { ascending: true });
  if(error){
    console.error("[Vacaciones] Error mis solicitudes:", error);
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
  console.log("[Vacaciones] Insert:", payload);
  const { error } = await supabase.from('vacation_requests').insert(payload);
  if(error){
    console.error("[Vacaciones] Error insert:", error);
    return showMsg('No se pudo registrar: ' + (error.message || JSON.stringify(error)));
  }
  showMsg('Solicitud registrada correctamente.', true);
  loadMine(empId);
});

loadEmployees().then(()=>console.log("[Vacaciones] UI lista"));
