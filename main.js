import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ==== Elementos del DOM ====
const $emp     = document.getElementById('employee');
const $search  = document.getElementById('search');
const $start   = document.getElementById('start');
const $end     = document.getElementById('end');
const $submit  = document.getElementById('submit');
const $msg     = document.getElementById('msg');
const $my      = document.getElementById('my-requests');
const $empInfo = document.getElementById('emp-info');

const $loc      = document.getElementById('v-localizacion');
const $dep      = document.getElementById('v-departamento');
const $bod      = document.getElementById('v-bodega');
const $ingreso  = document.getElementById('v-ingreso');
const $cupo     = document.getElementById('v-cupo');
const $usado    = document.getElementById('v-usado');
const $restante = document.getElementById('v-restante');

let EMPLOYEES = []; // cache de empleados

// ==== Utilidades ====
function showMsg(text, ok=false){
  $msg.textContent = text;
  $msg.className = 'msg ' + (ok ? 'ok' : 'err');
}

/**
 * Formatea fechas 'YYYY-MM-DD' SIN desfase de zona horaria.
 * Acepta 'YYYY-MM-DD' o ISO completo; imprime siempre en UTC.
 */
function fmt(d){
  if(!d) return '-';

  // Si ya es Date
  if (d instanceof Date && !isNaN(d)) {
    return d.toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
  }

  const s = String(d);
  // 'YYYY-MM-DD'
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), day = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, day));
    return dt.toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
  }
  // ISO general
  const dt = new Date(s);
  if (!isNaN(dt)) {
    return dt.toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
    });
  }
  return s;
}

function norm(s){
  return (s || "")
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

// ==== Carga de empleados (RPC preferida; SELECT fallback) ====
async function loadEmployees(){
  let data = null, error = null;

  const rpc = await supabase.rpc('employees_public');
  if(!rpc.error && rpc.data){
    data = rpc.data;
  } else {
    const res = await supabase
      .from('employees')
      .select('id, nombre, bodega, departamento, localizacion')
      .order('nombre', { ascending: true });
    data = res.data; error = res.error;
  }

  if(error){
    showMsg('Error cargando colaboradores: ' + (error.message || JSON.stringify(error)));
    return;
  }

  EMPLOYEES = (data || []).map(r => ({
    id: r.id,
    nombre: r.nombre,
    bodega: r.bodega ?? null,
    departamento: r.departamento ?? null,
    localizacion: r.localizacion ?? null
  }));
  renderEmployees(EMPLOYEES);
}

// ==== Panel de info del empleado ====
async function loadEmployeeInfo(empId){
  // Info base + cupo base (según función employees_info)
  const { data: infoArr, error: e1 } = await supabase.rpc('employees_info', { emp_id: empId });
  if(e1){ showMsg('No se pudo leer información del colaborador: ' + e1.message); return; }
  const info = (infoArr && infoArr[0]) ? infoArr[0] : null;

  // Resumen 2026 (incluye visible)
  const { data: sumArr, error: e2 } = await supabase.rpc('employees_vac_summary_2026', { emp_id: empId });
  if(e2){ showMsg('No se pudo leer el resumen de vacaciones: ' + e2.message); return; }
  const summary = (sumArr && sumArr[0]) ? sumArr[0] : {
    cupo_2026: 0, usado_2026: 0, restante_2026: 0, elegible_desde: null, restante_visible: 0, cupo_visible: 0
  };

  // Pinta datos básicos
  $loc.textContent      = info?.localizacion ?? '-';
  $dep.textContent      = info?.departamento ?? '-';
  $bod.textContent      = info?.bodega ?? '-';
  $ingreso.textContent  = fmt(info?.fecha_ingreso);

  // Cupo 2026: usar cupo_visible (regla junio/2024) o fallback a cupo_2026
  const cupoVis = (typeof summary?.cupo_visible === 'number')
    ? summary.cupo_visible
    : (info?.cupo_2026 ?? summary?.cupo_2026 ?? 0);
  $cupo.textContent  = cupoVis;

  // Usados
  $usado.textContent = (summary?.usado_2026 ?? 0);

  // Restantes: usar restante_visible (0 si aún no elegible) o fallback a restante_2026
  const restVis = (typeof summary?.restante_visible === 'number')
    ? summary.restante_visible
    : (summary?.restante_2026 ?? 0);
  $restante.textContent = restVis;

  // Limpia mensajes
  showMsg('', true);
  $empInfo.hidden = false;
}

// ==== Mis solicitudes 2026 ====
async function loadMine(empId){
  $my.innerHTML = 'Cargando…';

  // RPC con biz_days (preferida)
  let rows = null, err = null;
  const rpc = await supabase.rpc('vacation_requests_get', { emp_id: empId });
  if(!rpc.error && rpc.data){
    rows = rpc.data;
  } else {
    const s = await supabase
      .from('vacation_requests')
      .select('id, start_date, end_date, status, created_at')
      .eq('employee_id', empId)
      .gte('start_date', '2026-01-01')
      .lte('end_date', '2026-12-31')
      .order('start_date', { ascending: true });
    rows = s.data; err = s.error;
  }

  if(err){
    $my.textContent = 'Error: ' + (err.message || JSON.stringify(err));
    return;
  }
  if(!rows || rows.length === 0){
    $my.textContent = 'Sin solicitudes para 2026.';
    return;
  }

  $my.innerHTML = rows.map(r => {
    const days = (typeof r.biz_days === 'number') ? r.biz_days : null;
    const daysTxt = (days !== null) ? ` (${days} días)` : '';
    const canDelete = (r.status === 'Pendiente');
    const delBtn = canDelete ? `<button class="btn-link" data-del="${r.id}">Borrar</button>` : '';
    return `
      <div class="req">
        <div><strong>${fmt(r.start_date)} → ${fmt(r.end_date)}</strong>${daysTxt}</div>
        <small>Estado: ${r.status}</small>
        <div class="req-actions">${delBtn}</div>
      </div>
    `;
  }).join('');

  // Eventos de borrado
  $my.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const reqId = ev.currentTarget.getAttribute('data-del');
      if(!confirm('¿Borrar esta solicitud pendiente?')) return;

      const { data, error } = await supabase.rpc('vacation_requests_delete', {
        req_id: reqId,
        emp_id: $emp.value
      });
      if(error){
        showMsg('No se pudo borrar: ' + (error.message || JSON.stringify(error)));
        return;
      }
      showMsg(data ? 'Solicitud borrada.' : 'No se pudo borrar (¿ya no está Pendiente?).', !!data);
      await loadMine($emp.value);
      await loadEmployeeInfo($emp.value);
    });
  });
}

// ==== Enviar solicitud ====
async function submitRequest(){
  const empId = $emp.value;
  const s = $start.value;
  const t = $end.value;
  if(!empId) return showMsg('Selecciona tu nombre.');
  if(!s || !t) return showMsg('Completa las fechas.');
  if(s > t) return showMsg('La fecha de inicio no puede ser posterior al fin.');

  // RPC (respeta RLS con SECURITY DEFINER)
  const ins = await supabase.rpc('vacation_requests_create', { emp_id: empId, s, e: t });
  if(ins.error){
    // Fallback a insert directo (si tuvieras RLS abierto para anon)
    const { error } = await supabase
      .from('vacation_requests')
      .insert({ employee_id: empId, start_date: s, end_date: t, status: 'Pendiente' });
    if(error){
      showMsg('No se pudo registrar: ' + (error.message || JSON.stringify(error)));
      return;
    }
  }

  showMsg('Solicitud registrada correctamente.', true);
  await loadMine(empId);
  await loadEmployeeInfo(empId);
}

// ==== Eventos UI ====
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
    await loadEmployeeInfo(id);
    await loadMine(id);
  } else {
    $empInfo.hidden = true;
    $my.innerHTML = '';
    showMsg('', true);
  }
});

$submit.addEventListener('click', submitRequest);

// ==== Inicio ====
loadEmployees();
