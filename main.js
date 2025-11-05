import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ==== Elementos del DOM ====
const $wh      = document.getElementById('warehouse');
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

let EMPLOYEES = [];     // cache de empleados [{id, nombre, bodega, ...}]
let CURRENT_EMP = null; // empleado vigente (para bloquear renders desfasados)

// ==== Utilidades ====
function showMsg(text, ok=false){
  $msg.textContent = text;
  $msg.className = 'msg ' + (ok ? 'ok' : 'err');
}
function fmt(d){
  if(!d) return '-';
  if (d instanceof Date && !isNaN(d)) {
    return d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' });
  }
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const dt = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
    return dt.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' });
  }
  const dt = new Date(s);
  if (!isNaN(dt)) {
    return dt.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' });
  }
  return s;
}
function norm(s){
  return (s || "").toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// ==== Render helpers ====
function renderEmployees(list){
  if(!list || list.length === 0){
    $emp.innerHTML = '<option value="">(Sin coincidencias)</option>';
    return;
  }
  $emp.innerHTML =
    '<option value="">Selecciona tu nombre…</option>' +
    list.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
}
function renderWarehouses(){
  // bodegas únicas (incluye "(Sin bodega)" para nulos)
  const coll = new Intl.Collator('es-MX');
  const uniq = Array.from(new Set(EMPLOYEES.map(e => e.bodega ?? '(Sin bodega)'))).sort(coll.compare);
  $wh.innerHTML = [
    `<option value="">Todas las bodegas</option>`,
    ...uniq.map(b => `<option value="${b}">${b}</option>`)
  ].join('');
}

// ==== Filtro combinado por bodega + nombre ====
function applyFilter(){
  const q = norm($search.value);
  const selectedBod = $wh.value; // "" = todas, otro = exact match del display

  let list = EMPLOYEES;

  if (selectedBod) {
    list = list.filter(e => (e.bodega ?? '(Sin bodega)') === selectedBod);
  }
  if (q) {
    list = list.filter(e => norm(e.nombre).includes(q));
  }

  renderEmployees(list);
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

  renderWarehouses();   // poblar select de bodegas
  applyFilter();        // render de empleados con filtros actuales
}

// ==== Panel de info del empleado ====
async function loadEmployeeInfo(empId){
  if (empId !== CURRENT_EMP) return;

  const { data: infoArr, error: e1 } = await supabase.rpc('employees_info', { emp_id: empId });
  if (empId !== CURRENT_EMP) return;
  if(e1){ showMsg('No se pudo leer información del colaborador: ' + e1.message); return; }
  const info = (infoArr && infoArr[0]) ? infoArr[0] : null;

  const { data: sumArr, error: e2 } = await supabase.rpc('employees_vac_summary_2026', { emp_id: empId });
  if (empId !== CURRENT_EMP) return;
  if(e2){ showMsg('No se pudo leer el resumen de vacaciones: ' + e2.message); return; }
  const summary = (sumArr && sumArr[0]) ? sumArr[0] : {
    cupo_2026: 0, usado_2026: 0, restante_2026: 0, elegible_desde: null, restante_visible: 0, cupo_visible: 0
  };

  $loc.textContent      = info?.localizacion ?? '-';
  $dep.textContent      = info?.departamento ?? '-';
  $bod.textContent      = info?.bodega ?? '-';
  $ingreso.textContent  = fmt(info?.fecha_ingreso);

  const cupoVis = (typeof summary?.cupo_visible === 'number')
    ? summary.cupo_visible
    : (info?.cupo_2026 ?? summary?.cupo_2026 ?? 0);
  $cupo.textContent  = cupoVis;
  $usado.textContent = (summary?.usado_2026 ?? 0);

  const restVis = (typeof summary?.restante_visible === 'number')
    ? summary.restante_visible
    : (summary?.restante_2026 ?? 0);
  $restante.textContent = restVis;

  showMsg('', true);
  $empInfo.hidden = false;
}

// ==== Mis solicitudes 2026 ====
async function loadMine(empId){
  if (empId !== CURRENT_EMP) return;

  $my.innerHTML = 'Cargando…';

  let rows = null, err = null;
  const rpc = await supabase.rpc('vacation_requests_get', { emp_id: empId });
  if (empId !== CURRENT_EMP) return;

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
    if (empId !== CURRENT_EMP) return;
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
      if ($emp.value === CURRENT_EMP) {
        await loadMine(CURRENT_EMP);
        await loadEmployeeInfo(CURRENT_EMP);
      }
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

  $submit.disabled = true;

  const ins = await supabase.rpc('vacation_requests_create', { emp_id: empId, s, e: t });
  if(ins.error){
    const { error } = await supabase
      .from('vacation_requests')
      .insert({ employee_id: empId, start_date: s, end_date: t, status: 'Pendiente' });
    if(error){
      showMsg('No se pudo registrar: ' + (error.message || JSON.stringify(error)));
      $submit.disabled = false;
      return;
    }
  }

  showMsg('Solicitud registrada correctamente.', true);
  await loadMine(empId);
  await loadEmployeeInfo(empId);
  $submit.disabled = false;
}

// ==== Eventos UI ====
// Filtro por texto
$search.addEventListener('input', applyFilter);
// Enter en buscador => autoseleccionar primera opción visible
$search.addEventListener('keydown', (ev) => {
  if(ev.key === 'Enter'){
    const opts = $emp.querySelectorAll('option');
    if(opts.length > 1 && opts[1].value){
      $emp.value = opts[1].value;
      $emp.dispatchEvent(new Event('change'));
    }
  }
});

// Cambio de bodega => resetea selección y aplica filtro
$wh.addEventListener('change', () => {
  // limpiar selección de colaborador y UI
  $emp.value = '';
  CURRENT_EMP = null;
  $empInfo.hidden = true;
  $my.innerHTML = '';
  showMsg('', true);
  $start.value = '';
  $end.value = '';
  applyFilter(); // vuelve a renderizar nombres para la bodega seleccionada
});

// Cambio de colaborador
$emp.addEventListener('change', async (e) => {
  const id = e.target.value;

  // Limpieza inmediata
  $empInfo.hidden = true;
  $my.innerHTML = '';
  showMsg('', true);
  $start.value = '';
  $end.value = '';
  $submit.disabled = !!id;

  if(id){
    CURRENT_EMP = id;
    $my.textContent = 'Cargando…';
    await loadEmployeeInfo(id);
    await loadMine(id);
    if ($emp.value === CURRENT_EMP) $submit.disabled = false;
  } else {
    CURRENT_EMP = null;
    $submit.disabled = false;
  }
});

$submit.addEventListener('click', submitRequest);

// ==== Inicio ====
loadEmployees();
