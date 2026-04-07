// admin-panel.js (vacaciones + empleados con orden, alta, importar, editar y borrar)
// RPCs vacaciones (SECURITY DEFINER):
//   vacation_requests_delete_admin(req_id uuid) -> boolean
//   vacation_requests_approve(req_id uuid) -> boolean
//   vacation_requests_approve_with_cover(req_id uuid, cover_emp_id uuid) -> boolean
//   vacation_requests_reject(req_id uuid) -> boolean
//   vacation_requests_update_dates(req_id uuid, new_start date, new_end date) -> boolean
//   vacation_requests_unapprove(req_id uuid) -> boolean
//   vacation_requests_create(emp_id uuid, s date, e date) -> uuid
//   vacation_requests_create_admin_force(emp_id uuid, s date, e date, auto_approve boolean DEFAULT false) -> uuid
//   (opcional para bypass al aprobar) vacation_requests_approve_admin_force(req_id uuid) -> boolean
//   (opcional para bypass al aprobar) vacation_requests_approve_admin_force_with_cover(req_id uuid, cover_emp_id uuid) -> boolean
//
// RPCs empleados (SECURITY DEFINER):
//   employees_insert_admin(p_nombre text, p_bodega text, p_departamento text, p_localizacion text, p_rol text, p_fecha_ingreso date) -> uuid
//   employees_import_admin(p_rows jsonb) -> integer
//   employees_update_admin(p_id uuid, p_nombre text, p_bodega text, p_departamento text, p_localizacion text, p_rol text, p_fecha_ingreso date) -> boolean
//   employees_delete_admin(p_id uuid) -> boolean

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "vacaciones-admin-auth"
  }
});
window.supabase = supabase;
window.__ADMIN_PANEL_LOADED__ = true;

// ───────────────────────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────────────────────
const NAME_CANDIDATES = ["nombre", "name", "full_name", "display_name", "empleado"];
const WH_CANDIDATES   = ["bodega", "warehouse", "almacen", "site", "location", "ubicacion"];
const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const monthYearKey = (isoDate) => {
  const d = new Date(isoDate);
  const y = d.getFullYear();
  const m = d.getMonth(); // 0..11
  return { key: `${y}-${String(m+1).padStart(2,"0")}`, label: `${MESES_ES[m]} ${y}`, y, m: m+1 };
};

// Semana ISO (1..53)
function isoWeekNumber(dateStr) {
  const d = new Date(dateStr);
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7; // 0..6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // jueves
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(),0,4));
  const dayDiff = (target - firstThursday) / 86400000;
  return 1 + Math.floor(dayDiff / 7);
}

// Itera días de un rango [s,e] (YYYY-MM-DD)
function* eachDay(s, e) {
  const d = new Date(s);
  const end = new Date(e);
  while (d <= end) {
    yield d.toISOString().slice(0,10);
    d.setDate(d.getDate()+1);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Utilidades
// ───────────────────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return undefined;
};
const escapeHtml = (s) =>
  String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");

function getStatusClass(status) {
  const s = String(status || '').trim();
  if (s === 'Aprobado') return 'aprobado';
  if (s === 'Rechazado') return 'rechazado';
  if (s === 'Pre-aprobado') return 'preaprobado';
  if (s === 'Pendiente' || s === 'Propuesta') return 'pendiente';
  return 'otro';
}

function getStatusActions(v) {
  const status = String(v?.status || '');
  const actions = [];

  if (status === 'Pendiente') {
    actions.push(`<button onclick="preApprove('${v.id}')">🟡 Pre-aprobar</button>`);
    actions.push(`<button onclick="openAuthorizeModalForRequest('${v.id}')">✅ Autorizar</button>`);
    actions.push(`<button onclick="reject('${v.id}')">❌ Rechazar</button>`);
  } else if (status === 'Pre-aprobado') {
    actions.push(`<button onclick="openAuthorizeModalForRequest('${v.id}')">✅ Autorizar</button>`);
    actions.push(`<button onclick="backToPending('${v.id}')">↩ Pendiente</button>`);
    actions.push(`<button onclick="reject('${v.id}')">❌ Rechazar</button>`);
  } else if (status === 'Aprobado') {
    actions.push(`<button onclick="openCoverageEditorForRequest('${v.id}')">➕ Cobertura</button>`);
    actions.push(`<button onclick="reject('${v.id}')">❌ Rechazar</button>`);
  } else if (status === 'Rechazado') {
    actions.push(`<button onclick="backToPending('${v.id}')">↩ Pendiente</button>`);
  } else {
    actions.push(`<button onclick="openAuthorizeModalForRequest('${v.id}')">✅ Autorizar</button>`);
  }

  actions.push(`<button onclick="editDate('${v.id}', '${v.start_date}', '${v.end_date}')">🗓 Editar</button>`);
  actions.push(`<button onclick="deleteVac('${v.id}')">🗑</button>`);
  return actions.join(' ');
}

// ───────────────────────────────────────────────────────────────────────────────
// UI refs
// ───────────────────────────────────────────────────────────────────────────────
const loginScreen = $("#login-screen");
const adminPanel  = $("#admin-panel");
const loginBtn    = $("#login-btn");
const logoutBtn   = $("#logout-btn");
const refreshBtn  = $("#refresh-btn");
const vacList     = $("#vac-list");
const errorMsg    = $("#login-error");
const adminEmail  = $("#admin-email");

const fBodegaSel  = $("#f-bodega");          // multiselect
const fDeptoSel   = $("#f-depto");
const fRolSel     = $("#f-rol");
const fStatusSel  = $("#f-status");
const fOverlapsCb = $("#f-overlaps");
const fCrossOnly  = $("#f-cross-only");

// NUEVOS: Localización / Mes / Semana
const fLocSel     = $("#f-localizacion");
const fMonthSel   = $("#f-month");           // <select>
const fWeekSel    = $("#f-week");            // <select>

// Empleado (texto)
const fEmpInput  = $("#f-emp");            // <input type="search">

// Empleados
const empPanel       = $("#emp-panel");
const empRefreshBtn  = $("#emp-refresh-btn");
const empExportBtn   = $("#emp-export-btn");
const empImportInput = $("#emp-import-input");
const empForm        = $("#emp-form");
const empSaveBtn     = $("#emp-save-btn") || empForm?.querySelector('button[type="submit"]');
const empMsg         = $("#emp-msg");
const holidayDesc      = $("#holiday-desc");
const holidayStart     = $("#holiday-start");
const holidayEnd       = $("#holiday-end");
const holidaySource    = $("#holiday-source");
const holidaySaveBtn   = $("#holiday-save-btn");
const holidayCancelBtn = $("#holiday-cancel-btn");
const holidayRefreshBtn= $("#holiday-refresh-btn");
const holidayMsg       = $("#holiday-msg");
const holidayList      = $("#holiday-list");
const blackoutDesc      = $("#blackout-desc");
const blackoutDate      = $("#blackout-date");
const blackoutActive    = $("#blackout-active");
const blackoutSaveBtn   = $("#blackout-save-btn");
const blackoutCancelBtn = $("#blackout-cancel-btn");
const blackoutRefreshBtn= $("#blackout-refresh-btn");
const blackoutMsg       = $("#blackout-msg");
const blackoutList      = $("#blackout-list");

let HOLIDAY_EDIT_DATE = null;
let BLACKOUT_EDIT_ID = null;
const empList        = $("#emp-list");
const empNombre      = $("#emp-nombre");
const empBod         = $("#emp-bodega");
const empDepto       = $("#emp-depto");
const empLoc         = $("#emp-localizacion");
const empRol         = $("#emp-rol");
const empIng         = $("#emp-ingreso");
const empSearch      = $("#emp-search");   // 🔎 buscador de nombres

// Alta directa de vacaciones
const vacEmpSearch   = $("#vac-emp-search");
const vacEmpSuggest  = $("#vac-emp-suggest");
const vacEmpId       = $("#vac-emp-id");
const vacEmpClear    = $("#vac-emp-clear");
const vacStart       = $("#vac-start");
const vacEnd         = $("#vac-end");


// Default: al seleccionar fecha de inicio, sugerir fin = inicio + 3 días.
if (vacStart && vacEnd) {
  vacStart.addEventListener("change", () => {
    const s = (vacStart.value || '').trim();
    if (!s) return;
    const startDate = new Date(`${s}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) return;
    const suggestedEnd = new Date(startDate);
    suggestedEnd.setDate(suggestedEnd.getDate() + 3);
    vacEnd.value = suggestedEnd.toISOString().slice(0,10);
  });
}
const vacCreateBtn   = $("#vac-create");
const vacCreateApproveBtn = $("#vac-create-approve");
const vacFormMsg     = $("#vac-form-msg");

// Modal coberturas
const coverModal        = $("#cover-modal");
const coverModalTitle   = $("#cover-modal-title");
const coverModalMeta    = $("#cover-modal-meta");
const coverSearch       = $("#cover-search");
const coverSelect       = $("#cover-select");
const coverStart        = $("#cover-start");
const coverEnd          = $("#cover-end");
const coverSaveBtn      = $("#cover-save");
const coverAuthorizeBtn = $("#cover-authorize");
const coverCancelBtn    = $("#cover-cancel");
const coverModalMsg     = $("#cover-modal-msg");
const coverList         = $("#cover-list");
const coverEmpty        = $("#cover-empty");

// ───────────────────────────────────────────────────────────────────────────────
// Estado
// ───────────────────────────────────────────────────────────────────────────────
let VAC_DATA = [];
let EMP_DATA = [];
let EMP_BY_ID = {};
let COVERAGES_BY_REQ = {};

let CURRENT_BODEGAS = [];   // multiselección de bodegas
let CURRENT_DEPTO   = "";   // "", o departamento exacto
let CURRENT_LOC     = "";   // "", o localización exacta
let CURRENT_ROLES   = [];   // [], o lista de roles seleccionados
let CURRENT_STATUS  = "";   // "", "Pendiente", "Pre-aprobado", "Aprobado", "Rechazado"
let CURRENT_MONTH   = "";   // "", o "YYYY-MM"
let CURRENT_WEEK    = "";   // "", o número 1..53 (string)
let CURRENT_EMP_Q = "";   // filtro texto de empleado
let OVERLAPS_ONLY   = false;
let CROSS_ONLY      = false;
let OVERLAP_ID_SET  = new Set();

// Orden empleados + filtro de texto
let EMP_SORT_FIELD   = "nombre";
let EMP_SORT_DIR     = "asc";
let EMP_FILTER_TEXT  = "";

// ───────────────────────────────────────────────────────────────────────────────
// Login admin con Supabase Auth
// ───────────────────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let ADMIN_SYNC_IN_PROGRESS = false;
let ADMIN_SYNC_PENDING = false;

async function fetchAdminRow(userId) {
  // Pequeño retry para evitar falsos negativos justo después del login
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return { data: null, error };
    if (data) return { data, error: null };

    if (attempt === 0) await delay(250);
  }

  return { data: null, error: null };
}

async function requireAdminSession() {
  errorMsg.textContent = "";

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    adminPanel.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    return false;
  }

  const { data: adminRow, error: adminErr } = await fetchAdminRow(session.user.id);

  if (adminErr) {
    errorMsg.textContent = "Error validando permisos: " + adminErr.message;
    adminPanel.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    return false;
  }

if (!adminRow) {
    errorMsg.textContent = "Tu usuario no tiene permisos de administrador";
    // FIX: Cerramos la sesión del usuario normal para no dejarla atorada
    await supabase.auth.signOut(); 
    adminPanel.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    return false;
  }

  loginScreen.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  return true;
}

async function syncAdminState() {
  if (ADMIN_SYNC_IN_PROGRESS) {
    ADMIN_SYNC_PENDING = true;
    return;
  }

  ADMIN_SYNC_IN_PROGRESS = true;

  try {
    const ok = await requireAdminSession();
    if (!ok) return;

    await loadVacations();
    await loadEmployeesAdmin();
  } finally {
    ADMIN_SYNC_IN_PROGRESS = false;

    if (ADMIN_SYNC_PENDING) {
      ADMIN_SYNC_PENDING = false;
      await syncAdminState();
    }
  }
}

loginBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";

  const email = adminEmail?.value?.trim() || "";
  const pass = $("#admin-pass").value.trim();

  if (!email || !pass) {
    errorMsg.textContent = "Captura correo y contraseña";
    return;
  }

loginBtn.disabled = true;

  try {
    // FIX DEFINITIVO: Hacemos el "Borrar Historial" de Supabase automáticamente 
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    });
    
    // Aseguramos que la instancia también suelte la memoria
    await supabase.auth.signOut();

    // Ahora sí, iniciamos sesión en limpio
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass
    });

    if (error) {
      errorMsg.textContent = error.message || "No se pudo iniciar sesión";
      return;
    }

    const ok = await requireAdminSession();
    if (!ok) {
      errorMsg.textContent = errorMsg.textContent || "No autorizado como administrador";
      return;
    }

    await loadVacations();
    await loadEmployeesAdmin();
    loginScreen.classList.add("hidden");
    adminPanel.classList.remove("hidden");
  } catch (e) {
    console.error("Error iniciando sesión admin", e);
    errorMsg.textContent = e?.message || "Error iniciando sesión";
  } finally {
    loginBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  adminPanel.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

refreshBtn.addEventListener("click", async () => {
  const ok = await requireAdminSession();
  if (!ok) return;
  await loadVacations();
  await loadEmployeesAdmin();
});

// Filtro Bodega (multiselección)
if (fBodegaSel) {
  fBodegaSel.addEventListener("change", () => {
    const selected = Array.from(fBodegaSel.selectedOptions || [])
      .map(opt => opt.value)
      .filter(Boolean);
    CURRENT_BODEGAS = selected;
    computeOverlaps();
    renderList();
  });
}

// Filtro departamento
if (fDeptoSel) {
  fDeptoSel.addEventListener("change", () => {
    CURRENT_DEPTO = fDeptoSel.value || "";
    // Cascada de Bodega por Depto/Loc
    rebuildBodegaOptionsCascading();
    computeOverlaps();
    renderList();
  });
}

// Filtro localización
if (fLocSel) {
  fLocSel.addEventListener("change", () => {
    CURRENT_LOC = fLocSel.value || "";
    // Cascada de Bodega por Depto/Loc
    rebuildBodegaOptionsCascading();
    computeOverlaps();
    renderList();
  });
}

// Filtro de roles (multiselección)
if (fRolSel) {
  fRolSel.addEventListener("change", () => {
    const selected = Array.from(fRolSel.selectedOptions || [])
      .map(opt => opt.value)
      .filter(Boolean);
    CURRENT_ROLES = selected;
    computeOverlaps();
    renderList();
  });
}

// Filtro estado
if (fStatusSel) {
  fStatusSel.addEventListener("change", () => {
    CURRENT_STATUS = fStatusSel.value || "";
    computeOverlaps();
    renderList();
  });
}

// Filtro Mes (⚠️ ahora reconstruye Semanas al vuelo)
if (fMonthSel) {
  fMonthSel.addEventListener("change", () => {
    CURRENT_MONTH = fMonthSel.value || "";
    // Recalcular combo de semanas para el mes elegido
    populateFilters();  // reconstruye semanas contextuales
    // Si la semana previa ya no aplica, limpiar
    if (fWeekSel && fWeekSel.value && !Array.from(fWeekSel.options).some(o => o.value === CURRENT_WEEK)) {
      CURRENT_WEEK = "";
      fWeekSel.value = "";
    }
    computeOverlaps();
    renderList();
  });
}

// Filtro Semana ISO
if (fWeekSel) {
  fWeekSel.addEventListener("change", () => {
    CURRENT_WEEK = fWeekSel.value || "";
    computeOverlaps();
    renderList();
  });
}

// Filtro Empleado (texto)
if (fEmpInput) {
  let t = null;
  fEmpInput.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      CURRENT_EMP_Q = normTxt(fEmpInput.value);
      computeOverlaps();
      renderList();
    }, 150);
  });
}

// Solo empalmes
if (fOverlapsCb) {
  fOverlapsCb.addEventListener("change", () => {
    OVERLAPS_ONLY = !!fOverlapsCb.checked;
    renderList();
  });
}

// Empalmes solo entre distintas bodegas
if (fCrossOnly) {
  fCrossOnly.addEventListener("change", () => {
    CROSS_ONLY = !!fCrossOnly.checked;
    computeOverlaps();
    renderList();
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Vacaciones: carga principal
// ───────────────────────────────────────────────────────────────────────────────
async function loadVacations() {
  vacList.innerHTML = "<p>Cargando...</p>";

  const { data: vacs, error: err1 } = await supabase
    .from("vacation_requests")
    .select("id, employee_id, start_date, end_date, status, created_at")
    .order("start_date", { ascending: true });

  if (err1) {
    vacList.innerHTML = `<p style="color:red;">Error al leer solicitudes: ${err1.message}</p>`;
    console.error(err1);
    return;
  }

  VAC_DATA = vacs || [];
  COVERAGES_BY_REQ = {};

  if (VAC_DATA.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    populateFilters();
    return;
  }

  const empIds = [...new Set(VAC_DATA.map(v => v.employee_id).filter(Boolean))];
  EMP_BY_ID = {};
  if (empIds.length > 0) {
    const { data: emps, error: err2 } = await supabase
      .from("employees")
      .select("id, nombre, bodega, departamento, localizacion, rol, fecha_ingreso")
      .in("id", empIds);
    if (err2) {
      console.warn("No se pudieron cargar empleados:", err2.message);
    } else if (emps) {
      for (const e of emps) EMP_BY_ID[e.id] = e;
    }
  }

  try {
    const reqIds = VAC_DATA.map(v => v.id);
    const { data: covs, error: covErr } = await supabase.rpc("vacation_request_coverages_many", { req_ids: reqIds });
    if (covErr) {
      console.warn("No se pudieron cargar coberturas:", covErr.message);
    } else {
      for (const c of (covs || [])) {
        if (!COVERAGES_BY_REQ[c.request_id]) COVERAGES_BY_REQ[c.request_id] = [];
        COVERAGES_BY_REQ[c.request_id].push(c);
      }
      for (const reqId of Object.keys(COVERAGES_BY_REQ)) {
        COVERAGES_BY_REQ[reqId].sort((a, b) => String(a.cover_start_date).localeCompare(String(b.cover_start_date)));
      }
    }
  } catch (e) {
    console.warn("Error inesperado cargando coberturas:", e);
  }

  populateFilters();
  computeOverlaps();
  renderList();
}

// Llena combos

// Llena combos de Bodega/Departamento/Rol/Localización/Mes/Semana
function populateFilters() {
  const bodegasSet = new Set();
  const deptosSet  = new Set();
  const rolesSet   = new Set();
  const locsSet    = new Set();
  const monthsSet  = new Map(); // key->label
  const weeksSet   = new Set(); // números ISO (contextuales si hay CURRENT_MONTH)

  for (const v of VAC_DATA) {
    // Meses/Semanas tocadas (iteramos días para abarcar spans)
    for (const day of eachDay(v.start_date, v.end_date)) {
      const { key, label } = monthYearKey(day);
      // Meses disponibles (globales)
      if (!monthsSet.has(key)) monthsSet.set(key, label);
      // Semanas: si hay mes seleccionado, solo del mes; si no, todas
      if (!CURRENT_MONTH || key === CURRENT_MONTH) {
        weeksSet.add(isoWeekNumber(day));
      }
    }
    const e = EMP_BY_ID[v.employee_id];
    if (e) {
      const bod = pick(e, WH_CANDIDATES);
      if (bod) bodegasSet.add(String(bod));
      if (e.departamento)  deptosSet.add(String(e.departamento).trim());
      if (e.rol)           rolesSet.add(String(e.rol).trim());
      if (e.localizacion)  locsSet.add(String(e.localizacion).trim());
    }
  }

  // Departamento
  if (fDeptoSel) {
    const currentD = CURRENT_DEPTO;
    const opts = [`<option value="">Todos</option>`];
    [...deptosSet].sort((a,b) => a.localeCompare(b, "es")).forEach(d => {
      const sel = (d === currentD) ? " selected" : "";
      opts.push(`<option value="${escapeHtml(d)}"${sel}>${escapeHtml(d)}</option>`);
    });
    fDeptoSel.innerHTML = opts.join("");
    if (currentD && !deptosSet.has(currentD)) CURRENT_DEPTO = "";
  }

  // Localización
  if (fLocSel) {
    const currentL = CURRENT_LOC;
    const opts = [`<option value="">Todas</option>`];
    [...locsSet].sort((a,b) => a.localeCompare(b, "es")).forEach(l => {
      const sel = (l === currentL) ? " selected" : "";
      opts.push(`<option value="${escapeHtml(l)}"${sel}>${escapeHtml(l)}</option>`);
    });
    fLocSel.innerHTML = opts.join("");
    if (currentL && !locsSet.has(currentL)) CURRENT_LOC = "";
  }

  // Rol (multiselección)
  if (fRolSel) {
    const selectedSet = new Set(CURRENT_ROLES);
    const options = [];
    [...rolesSet].sort((a,b) => a.localeCompare(b, "es")).forEach(r => {
      const sel = selectedSet.has(r) ? " selected" : "";
      options.push(`<option value="${escapeHtml(r)}"${sel}>${escapeHtml(r)}</option>`);
    });
    fRolSel.innerHTML = options.join("");
    CURRENT_ROLES = CURRENT_ROLES.filter(r => rolesSet.has(r));
  }

  // Mes (global)
  if (fMonthSel) {
    const currentM = CURRENT_MONTH;
    const opts = [`<option value="">Todos</option>`];
    [...monthsSet.entries()]
      .sort((a,b)=> a[0].localeCompare(b[0]))
      .forEach(([key,label])=>{
        const sel = (key === currentM) ? " selected" : "";
        opts.push(`<option value="${escapeHtml(key)}"${sel}>${escapeHtml(label)}</option>`);
      });
    fMonthSel.innerHTML = opts.join("");
    if (currentM && !monthsSet.has(currentM)) CURRENT_MONTH = "";
  }

  // Semana ISO (contextual al mes si se eligió)
  if (fWeekSel) {
    const currentW = CURRENT_WEEK;
    const opts = [`<option value="">Todas</option>`];
    [...weeksSet].sort((a,b)=> a-b).forEach(w=>{
      const wStr = String(w);
      const sel = (wStr === currentW) ? " selected" : "";
      opts.push(`<option value="${wStr}"${sel}>Semana ${wStr}</option>`);
    });
    fWeekSel.innerHTML = opts.join("");
    if (currentW && !weeksSet.has(Number(currentW))) {
      CURRENT_WEEK = "";
      fWeekSel.value = "";
    }
  }

  // Bodega (multiselección) con CASCADA por Localización/Departamento
  if (fBodegaSel) {
    const visibles = computeVisibleBodegasByLocDept(bodegasSet);
    const selecSet = new Set(CURRENT_BODEGAS);
    const opts = [];
    visibles.forEach(b=>{
      const sel = selecSet.has(b) ? " selected" : "";
      opts.push(`<option value="${escapeHtml(b)}"${sel}>${escapeHtml(b)}</option>`);
    });
    fBodegaSel.innerHTML = opts.join("");
    CURRENT_BODEGAS = CURRENT_BODEGAS.filter(b => visibles.includes(b));
  }
}

// Calcula bodegas visibles respetando Localización/Departamento actuales
function computeVisibleBodegasByLocDept(allBodegasSet) {
  const bodegasOK = new Set();
  for (const v of VAC_DATA) {
    const e = EMP_BY_ID[v.employee_id];
    if (!e) continue;
    if (CURRENT_DEPTO && String(e.departamento||"").trim() !== CURRENT_DEPTO) continue;
    if (CURRENT_LOC   && String(e.localizacion||"").trim()  !== CURRENT_LOC)  continue;
    const bod = pick(e, WH_CANDIDATES);
    if (bod) bodegasOK.add(String(bod));
  }
  const base = (bodegasOK.size > 0 ? bodegasOK : allBodegasSet);
  return [...base].sort((a,b) => a.localeCompare(b,"es"));
}

// Reconstruye Bodega cuando cambian Depto/Loc
function rebuildBodegaOptionsCascading() {
  const all = new Set();
  for (const v of VAC_DATA) {
    const e = EMP_BY_ID[v.employee_id];
    if (!e) continue;
    const bod = pick(e, WH_CANDIDATES);
    if (bod) all.add(String(bod));
  }
  const visibles = computeVisibleBodegasByLocDept(all);
  const currentSel = new Set(CURRENT_BODEGAS);
  const html = visibles.map(b => {
    const sel = currentSel.has(b) ? " selected" : "";
    return `<option value="${escapeHtml(b)}"${sel}>${escapeHtml(b)}</option>`;
  }).join("");
  fBodegaSel.innerHTML = html;
  CURRENT_BODEGAS = visibles.filter(b => currentSel.has(b));
}

// ───────────────────────────────────────────────────────────────────────────────
/** Empalmes */
// ───────────────────────────────────────────────────────────────────────────────
function computeOverlaps() {
  OVERLAP_ID_SET = new Set();
  if (!VAC_DATA || VAC_DATA.length < 2) return;

  const subset = VAC_DATA.filter(v => passesAllFiltersBasic(v));
  if (subset.length < 2) return;

  const items = subset.map(v => {
    const e = EMP_BY_ID[v.employee_id] || {};
    const bodega = pick(e, WH_CANDIDATES) ?? "";
    return {
      id: v.id,
      bodega: String(bodega),
      s: new Date(v.start_date),
      e: new Date(v.end_date)
    };
  });

  const crossOnlyActive = !!CROSS_ONLY;

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (!a.bodega || !b.bodega) continue;
      if (crossOnlyActive && a.bodega === b.bodega) continue;

      const startMax = (a.s > b.s) ? a.s : b.s;
      const endMin   = (a.e < b.e) ? a.e : b.e;
      if (startMax <= endMin) {
        OVERLAP_ID_SET.add(a.id);
        OVERLAP_ID_SET.add(b.id);
      }
    }
  }
}

// Pasa filtros “básicos” (bodega/depto/loc/rol/status/mes/semana)
function passesAllFiltersBasic(v) {
  const e = EMP_BY_ID[v.employee_id] || {};

  if (CURRENT_BODEGAS.length > 0) {
    const bod = String(pick(e, WH_CANDIDATES) ?? "");
    if (!CURRENT_BODEGAS.includes(bod)) return false;
  }
  if (CURRENT_DEPTO) {
    const dep = (e.departamento ?? "").trim();
    if (dep !== CURRENT_DEPTO) return false;
  }
  if (CURRENT_LOC) {
    const loc = (e.localizacion ?? "").trim();
    if (loc !== CURRENT_LOC) return false;
  }
  if (CURRENT_ROLES && CURRENT_ROLES.length > 0) {
    const rol = (e.rol ?? "").trim();
    if (!CURRENT_ROLES.includes(rol)) return false;
  }
  if (CURRENT_STATUS) {
    if ((v.status || "") !== CURRENT_STATUS) return false;
  }
  // Mes seleccionado: el rango debe tocar ese mes
  if (CURRENT_MONTH) {
    let touchesMonth = false;
    for (const day of eachDay(v.start_date, v.end_date)) {
      const { key } = monthYearKey(day);
      if (key === CURRENT_MONTH) { touchesMonth = true; break; }
    }
    if (!touchesMonth) return false;
  }
  // Semana ISO seleccionada: el rango debe tocar esa semana
  if (CURRENT_WEEK) {
    let touchesWeek = false;
    for (const day of eachDay(v.start_date, v.end_date)) {
      if (String(isoWeekNumber(day)) === CURRENT_WEEK) { touchesWeek = true; break; }
    }
    if (!touchesWeek) return false;
  }
  // Empleado (texto)
  if (CURRENT_EMP_Q) {
    const nombre = normTxt(pick(e, NAME_CANDIDATES) ?? "");
    if (!nombre.includes(CURRENT_EMP_Q)) return false;
  }
  return true;
}

// ───────────────────────────────────────────────────────────────────────────────
/** Render por bloques de MES */
// ───────────────────────────────────────────────────────────────────────────────
function renderList() {
  if (!VAC_DATA || VAC_DATA.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    return;
  }

  // 1) Filtros
  let rows = VAC_DATA.filter(v => {
    if (!passesAllFiltersBasic(v)) return false;
    if (OVERLAPS_ONLY && !OVERLAP_ID_SET.has(v.id)) return false;
    return true;
  });

  if (rows.length === 0) {
    vacList.innerHTML = "<p>Sin resultados para el filtro seleccionado.</p>";
    return;
  }

  // 2) Ordenar por start_date
  rows.sort((a,b) => new Date(a.start_date) - new Date(b.start_date));

  // 3) Agrupar por mes-año del start_date (visual)
  const groups = new Map();
  for (const v of rows) {
    const { key, label } = monthYearKey(v.start_date);
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(v);
  }

  // 4) Render
  let html = "";
  for (const { label, items } of groups.values()) {
    html += `<h3 style="margin:16px 0 8px 0;">${escapeHtml(label)}:</h3>\n`;
    for (const v of items) {
      const e = EMP_BY_ID[v.employee_id] || {};
      const nombre = pick(e, NAME_CANDIDATES) ?? `Empleado ${String(v.employee_id).slice(0, 8)}`;
      const bodega = pick(e, WH_CANDIDATES)   ?? "-";
      const rol    = e.rol ?? "";
      const depto  = e.departamento ?? "";
      const loc    = e.localizacion ?? "";
      const cls = getStatusClass(v.status);
      const overlapMark = OVERLAP_ID_SET.has(v.id) ? ` <span class="badge overlap">Empalme</span>` : "";
      const actionsHtml = getStatusActions(v);
      const coverages = (COVERAGES_BY_REQ[v.id] || []).slice().sort((a,b) => String(a.cover_start_date).localeCompare(String(b.cover_start_date)));

      html += `
        <div class="vac-item">
          <div>
            <strong>${escapeHtml(nombre)}</strong>
            ${rol ? `<span style="color:#555;">(${escapeHtml(rol)})</span>` : ""}
            (${escapeHtml(String(bodega))})${overlapMark}<br>
            ${depto ? `Depto: ${escapeHtml(depto)}<br>` : ""}
            ${loc ? `Loc: ${escapeHtml(loc)}<br>` : ""}
            ${escapeHtml(v.start_date)} → ${escapeHtml(v.end_date)}<br>
            Estado: <span class="badge ${cls}">${escapeHtml(v.status)}</span>
            ${v.status === 'Aprobado'
              ? (coverages.length
                  ? `<div class="cover-line">Coberturas:<br>${coverages.map(c => `• ${escapeHtml(c.cover_start_date)} → ${escapeHtml(c.cover_end_date)} — <strong>${escapeHtml(c.cover_name || '')}</strong>`).join('<br>')}</div>`
                  : `<div class="cover-line">Coberturas: <strong>Sin cobertura</strong></div>`)
              : ''}
          </div>
          <div>${actionsHtml}</div>
        </div>
      `;
    }
  }

  vacList.innerHTML = html;
}

// ───────────────────────────────────────────────────────────────────────────────
/** Acciones por RPC (vacaciones) */
// ───────────────────────────────────────────────────────────────────────────────
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return String(aStart) <= String(bEnd) && String(aEnd) >= String(bStart);
}

function initials(nombre){
  const p = String(nombre || '').split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase();
}


function getCoverageCandidates(requestLike) {
  const employeeId = requestLike?.employee_id;
  return (EMP_DATA || [])
    .filter(e => e.id && e.id !== employeeId)
    .map(e => ({ id: e.id, nombre: e.nombre || `Empleado ${String(e.id).slice(0,8)}` }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es-MX'));
}

let COVERAGE_CTX = {
  request: null,
  approveMode: false,
  editingId: null,
  changed: false,
  list: [],
  listCandidates: []
};

function renderCoverageOptions(query = '') {
  if (!coverSelect) return;
  const q = normTxt(query);
  const list = (COVERAGE_CTX.listCandidates || []).filter(e => !q || normTxt(e.nombre).includes(q));
  coverSelect.innerHTML = list.map(e => `<option value="${e.id}">${escapeHtml(e.nombre)}</option>`).join('');
  if (!coverSelect.value && list[0]) coverSelect.value = list[0].id;
}

function renderCoverageList() {
  if (!coverList) return;
  const rows = (COVERAGE_CTX.list || []).slice().sort((a,b) => String(a.cover_start_date).localeCompare(String(b.cover_start_date)));
  coverList.innerHTML = rows.map(c => `
    <div class="cov-row">
      <div class="cov-main">
        <strong>${escapeHtml(c.cover_name || '')}</strong>
        <span>${escapeHtml(c.cover_start_date)} → ${escapeHtml(c.cover_end_date)}</span>
      </div>
      <div class="cov-actions">
        <button type="button" onclick="editCoverage('${c.id}')">Editar</button>
        <button type="button" onclick="deleteCoverage('${c.id}')">Borrar</button>
      </div>
    </div>
  `).join('');
  if (coverEmpty) coverEmpty.classList.toggle('hidden', rows.length > 0);
  if (!rows.length && coverEmpty) coverEmpty.textContent = 'Sin coberturas registradas.';
}

function setCoverageFormDefaults() {
  const req = COVERAGE_CTX.request;
  if (!req) return;
  if (coverStart) coverStart.value = req.start_date || '';
  if (coverEnd) coverEnd.value = req.end_date || '';
  if (coverSelect && coverSelect.options.length) coverSelect.selectedIndex = 0;
  COVERAGE_CTX.editingId = null;
  if (coverSaveBtn) coverSaveBtn.textContent = 'Agregar cobertura';
}

async function loadCoverageRows(requestId) {
  const { data, error } = await supabase.rpc('vacation_request_coverages_list', { p_request_id: requestId });
  if (error) throw error;
  COVERAGE_CTX.list = data || [];
  COVERAGES_BY_REQ[requestId] = COVERAGE_CTX.list.slice();
  renderCoverageList();
}

function openCoverageModalBase(requestLike, approveMode = false) {
  COVERAGE_CTX.request = requestLike;
  COVERAGE_CTX.approveMode = !!approveMode;
  COVERAGE_CTX.changed = false;
  COVERAGE_CTX.listCandidates = getCoverageCandidates(requestLike);
  if (coverModalTitle) coverModalTitle.textContent = approveMode ? 'Autorizar y definir coberturas' : 'Coberturas';
  if (coverModalMeta) {
    const owner = EMP_BY_ID[requestLike.employee_id]?.nombre || 'Empleado';
    coverModalMeta.textContent = `${owner} · ${requestLike.start_date} → ${requestLike.end_date}`;
  }
  renderCoverageOptions('');
  setCoverageFormDefaults();
  if (coverAuthorizeBtn) {
    coverAuthorizeBtn.classList.toggle('hidden', !approveMode);
    coverAuthorizeBtn.textContent = 'Confirmar autorización';
  }
  if (coverModalMsg) {
    coverModalMsg.textContent = approveMode
      ? 'Puedes autorizar sin cobertura o agregar una o varias coberturas por fechas antes de confirmar.'
      : '';
    coverModalMsg.className = 'msg';
  }
  coverModal.classList.remove('hidden');
  coverModal.style.display = '';
  coverModal.setAttribute('aria-hidden', 'false');
}

async function openCoverageModal(requestLike, approveMode = false) {
  openCoverageModalBase(requestLike, approveMode);
  try {
    await loadCoverageRows(requestLike.id);
    if (coverModalMsg && approveMode) {
      coverModalMsg.textContent = 'Puedes autorizar sin cobertura o agregar una o varias coberturas por fechas antes de confirmar.';
      coverModalMsg.className = 'msg';
    }
  } catch (err) {
    if (coverModalMsg) {
      coverModalMsg.textContent = 'Se abrió el modal, pero no se pudieron cargar coberturas previas: ' + (err?.message || err);
      coverModalMsg.className = 'msg err';
    }
  }
  if (coverSearch) coverSearch.focus();
}

async function closeCoverageModal() {
  if (coverModal) {
    coverModal.classList.add('hidden');
    coverModal.style.display = '';
    coverModal.setAttribute('aria-hidden', 'true');
  }
  if (coverSearch) coverSearch.value = '';
  if (coverModalMsg) { coverModalMsg.textContent = ''; coverModalMsg.className = 'msg'; }
  const shouldReload = COVERAGE_CTX.changed;
  COVERAGE_CTX = { request: null, approveMode: false, editingId: null, changed: false, list: [], listCandidates: [] };
  if (shouldReload) await loadVacations();
}

window.manageCoverages = async (id) => {
  const req = (VAC_DATA || []).find(v => v.id === id);
  if (!req) { alert('No se encontró la solicitud.'); return; }
  await openCoverageModal(req, false);
};

window.editCoverage = (coverageId) => {
  const cov = (COVERAGE_CTX.list || []).find(c => c.id === coverageId);
  if (!cov) return;
  COVERAGE_CTX.editingId = cov.id;
  if (coverSelect) coverSelect.value = cov.cover_employee_id;
  if (coverStart) coverStart.value = cov.cover_start_date;
  if (coverEnd) coverEnd.value = cov.cover_end_date;
  if (coverSaveBtn) coverSaveBtn.textContent = 'Actualizar cobertura';
};

window.deleteCoverage = async (coverageId) => {
  if (!confirm('¿Borrar esta cobertura?')) return;
  const { data, error } = await supabase.rpc('vacation_request_coverage_delete', { p_coverage_id: coverageId });
  if (error || data !== true) {
    if (coverModalMsg) {
      coverModalMsg.textContent = 'No se pudo borrar la cobertura: ' + (error?.message || 'RPC devolvió falso');
      coverModalMsg.className = 'msg err';
    }
    return;
  }
  COVERAGE_CTX.changed = true;
  await loadCoverageRows(COVERAGE_CTX.request.id);
  setCoverageFormDefaults();
};

async function saveCoverageFromModal() {
  const req = COVERAGE_CTX.request;
  if (!req) return;
  const coverEmpId = (coverSelect?.value || '').trim();
  const start = (coverStart?.value || '').trim();
  const end = (coverEnd?.value || '').trim();

  if (!coverEmpId || !start || !end) {
    if (coverModalMsg) {
      coverModalMsg.textContent = 'Selecciona colaborador y rango de fechas.';
      coverModalMsg.className = 'msg err';
    }
    return;
  }

  const { data, error } = await supabase.rpc('vacation_request_coverage_save', {
    p_coverage_id: COVERAGE_CTX.editingId || null,
    p_request_id: req.id,
    p_cover_employee_id: coverEmpId,
    p_cover_start_date: start,
    p_cover_end_date: end
  });

  if (error || !data) {
    if (coverModalMsg) {
      coverModalMsg.textContent = 'No se pudo guardar la cobertura: ' + (error?.message || 'RPC devolvió nulo');
      coverModalMsg.className = 'msg err';
    }
    return;
  }

  COVERAGE_CTX.changed = true;
  await loadCoverageRows(req.id);
  setCoverageFormDefaults();
  if (coverModalMsg) {
    coverModalMsg.textContent = 'Cobertura guardada.';
    coverModalMsg.className = 'msg ok';
  }
}

async function authorizeFromModal() {
  const req = COVERAGE_CTX.request;
  if (!req) return;
  if (!confirm('¿Autorizar esta solicitud?')) return;

  let okForce = false;
  try {
    const { data, error } = await supabase.rpc("vacation_requests_approve_admin_force", { req_id: req.id });
    if (!error && data === true) okForce = true;
  } catch(_e) { /* opcional */ }

  if (!okForce) {
    const { data, error } = await supabase.rpc("vacation_requests_approve", { req_id: req.id });
    if (error || data !== true) {
      if (coverModalMsg) {
        coverModalMsg.textContent = 'No se pudo autorizar: ' + (error?.message || 'RPC devolvió falso');
        coverModalMsg.className = 'msg err';
      }
      return;
    }
  }

  COVERAGE_CTX.changed = true;
  await closeCoverageModal();
}

if (coverSearch) {
  coverSearch.addEventListener('input', () => renderCoverageOptions(coverSearch.value || ''));
}
if (coverSaveBtn) coverSaveBtn.addEventListener('click', saveCoverageFromModal);
if (coverAuthorizeBtn) coverAuthorizeBtn.addEventListener('click', authorizeFromModal);
if (coverCancelBtn) coverCancelBtn.addEventListener('click', () => { closeCoverageModal(); });
if (coverModal) {
  coverModal.addEventListener('click', (ev) => {
    if (ev.target === coverModal) closeCoverageModal();
  });
}

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && coverModal && !coverModal.classList.contains('hidden')) {
    closeCoverageModal();
  }
});

window.openAuthorizeModalForRequest = async (id) => {
  const req = (VAC_DATA || []).find(v => v.id === id);
  if (!req) { alert('No se encontró la solicitud.'); return; }
  await openCoverageModal(req, true);
};



window.openCoverageEditorForRequest = async (id) => {
  const req = (VAC_DATA || []).find(v => v.id === id);
  if (!req) { alert('No se encontró la solicitud.'); return; }
  await openCoverageModal(req, false);
};

window.authorize = window.openAuthorizeModalForRequest;
window.preApprove = async (id) => {
  if (!confirm('¿Marcar esta solicitud como pre-aprobada?')) return;
  const { data, error } = await supabase.rpc('vacation_requests_preapprove', { req_id: id });
  if (error || data !== true) {
    alert('No se pudo pre-aprobar: ' + (error?.message || 'RPC devolvió falso'));
    return;
  }
  await loadVacations();
};

window.backToPending = async (id) => {
  if (!confirm('¿Regresar esta solicitud a Pendiente?')) return;
  const { data, error } = await supabase.rpc('vacation_requests_mark_pending_admin', { req_id: id });
  if (error || data !== true) {
    alert('No se pudo regresar a Pendiente: ' + (error?.message || 'RPC devolvió falso'));
    return;
  }
  await loadVacations();
};

window.reject = async (id) => {
  if (!confirm("¿Rechazar esta solicitud?")) return;
  const { data, error } = await supabase.rpc("vacation_requests_reject", { req_id: id });
  if (error || data !== true) { alert("No se pudo rechazar: " + (error?.message || "RPC devolvió falso")); return; }
  await loadVacations();
};

window.editDate = async (id, start, end) => {
  const newStart = prompt("Nueva fecha de inicio (YYYY-MM-DD):", start);
  const newEnd   = prompt("Nueva fecha de fin (YYYY-MM-DD):", end);
  if (!newStart || !newEnd) return;

  // 1) Intentar edición forzada (admin) si existe
  let okForce = false;
  try {
    const { data, error } = await supabase.rpc("vacation_requests_update_dates_admin_force", {
      req_id: id, new_start: newStart, new_end: newEnd
    });
    if (!error && data === true) okForce = true;
  } catch (_e) { /* puede no existir la función */ }

  // 2) Fallback a la edición normal
  if (!okForce) {
    const { data, error } = await supabase.rpc("vacation_requests_update_dates", {
      req_id: id, new_start: newStart, new_end: newEnd
    });
    if (error || data !== true) {
      alert("No se pudo editar: " + (error?.message || "RPC devolvió falso"));
      return;
    }
  }

  await loadVacations();
};


window.deleteVac = async (id) => {
  if (!confirm("¿Eliminar esta solicitud?")) return;
  const { data, error } = await supabase.rpc("vacation_requests_delete_admin", { req_id: id });
  if (error || data !== true) {
    console.error("Error al eliminar solicitud:", error);
    alert("No se pudo eliminar: " + (error?.message || "RPC devolvió falso"));
    return;
  }
  await loadVacations();
};

// ───────────────────────────────────────────────────────────────────────────────
/** Empleados: carga, alta, import/export CSV, ordenamiento, editar/borrar, búsqueda */
// ───────────────────────────────────────────────────────────────────────────────
function showEmpMsg(text, ok = false) {
  if (!empMsg) return;
  empMsg.textContent = text || "";
  empMsg.className = "msg " + (ok ? "ok" : "err");
}

function normalizeText(v) { return (v == null ? "" : String(v)).trim().toLowerCase(); }
function normTxt(s){
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}


function addDaysISO(isoDateStr, days){
  if (!isoDateStr) return "";
  const d = new Date(isoDateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

function compareText(a, b) { const aa = normalizeText(a), bb = normalizeText(b); return aa<bb?-1:aa>bb?1:0; }

function normalizeDateToISO(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmY) {
    const dd = dmY[1].padStart(2, '0');
    const mm = dmY[2].padStart(2, '0');
    const yyyy = dmY[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const ymd = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) {
    const yyyy = ymd[1];
    const mm = ymd[2].padStart(2, '0');
    const dd = ymd[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}
function compareDate(a, b) {
  if (!a && !b) return 0; if (!a) return -1; if (!b) return 1;
  const da = new Date(a), db = new Date(b);
  return da<db?-1:da>db?1:0;
}
function getEmpSortLabel(field, label) {
  if (EMP_SORT_FIELD !== field) return escapeHtml(label);
  const arrow = EMP_SORT_DIR === "asc" ? "▲" : "▼";
  return `${escapeHtml(label)} ${arrow}`;
}

// Búsqueda por nombre (debounce)
if (empSearch) {
  let t = null;
  empSearch.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      EMP_FILTER_TEXT = (empSearch.value || "").trim().toLowerCase();
      renderEmployeesAdmin();
    }, 150);
  });
}

// Lee empleados desde la tabla employees
async function loadEmployeesAdmin() {
  if (!empList) return;
  empList.innerHTML = "<p>Cargando empleados…</p>";
  showEmpMsg("");

  const { data, error } = await supabase
    .from("employees")
    .select("id, nombre, bodega, departamento, localizacion, rol, fecha_ingreso")
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error al leer empleados:", error);
    empList.innerHTML = "<p style='color:red;'>Error al leer empleados.</p>";
    showEmpMsg("Error al leer empleados: " + (error.message || ""), false);
    return;
  }

  EMP_DATA = data || [];
  for (const e of EMP_DATA) EMP_BY_ID[e.id] = EMP_BY_ID[e.id] || e;
  renderEmployeesAdmin();
}

function renderEmployeesAdmin() {
  if (!empList) return;
  if (!EMP_DATA || EMP_DATA.length === 0) {
    empList.innerHTML = "<p>No hay empleados registrados.</p>";
    return;
  }

  // filtro por nombre
  let data = EMP_DATA;
  if (EMP_FILTER_TEXT) {
    data = EMP_DATA.filter(e => (e.nombre || "").toLowerCase().includes(EMP_FILTER_TEXT));
  }

  // ordenar
  data = [...data];
  data.sort((a, b) => {
    let cmp = 0;
    switch (EMP_SORT_FIELD) {
      case "bodega":        cmp = compareText(a.bodega, b.bodega); break;
      case "departamento":  cmp = compareText(a.departamento, b.departamento); break;
      case "localizacion":  cmp = compareText(a.localizacion, b.localizacion); break;
      case "rol":           cmp = compareText(a.rol, b.rol); break;
      case "fecha_ingreso": cmp = compareDate(a.fecha_ingreso, b.fecha_ingreso); break;
      case "nombre":
      default:              cmp = compareText(a.nombre, b.nombre); break;
    }
    return EMP_SORT_DIR === "asc" ? cmp : -cmp;
  });

  const rows = data.map(e => {
    const fi = e.fecha_ingreso ? String(e.fecha_ingreso).slice(0, 10) : "";
    return `
      <tr>
        <td>${escapeHtml(e.nombre || "")}</td>
        <td>${escapeHtml(e.bodega || "")}</td>
        <td>${escapeHtml(e.departamento || "")}</td>
        <td>${escapeHtml(e.localizacion || "")}</td>
        <td>${escapeHtml(e.rol || "")}</td>
        <td>${escapeHtml(fi)}</td>
        <td class="emp-actions">
          <button type="button" onclick="empQuickVacation('${e.id}','${(e.nombre||"").replace(/"/g,'&quot;')}')">➕</button>
          <button type="button" onclick="empEdit('${e.id}')">✏️</button>
          <button type="button" onclick="empDelete('${e.id}')">🗑</button>
        </td>
      </tr>
    `;
  }).join("");

  empList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th data-sort="nombre">${getEmpSortLabel("nombre","Nombre")}</th>
          <th data-sort="bodega">${getEmpSortLabel("bodega","Bodega")}</th>
          <th data-sort="departamento">${getEmpSortLabel("departamento","Departamento")}</th>
          <th data-sort="localizacion">${getEmpSortLabel("localizacion","Localización")}</th>
          <th data-sort="rol">${getEmpSortLabel("rol","Rol")}</th>
          <th data-sort="fecha_ingreso">${getEmpSortLabel("fecha_ingreso","Ingreso")}</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  const ths = empList.querySelectorAll("th[data-sort]");
  ths.forEach(th => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const field = th.getAttribute("data-sort");
      if (!field) return;
      if (EMP_SORT_FIELD === field) {
        EMP_SORT_DIR = (EMP_SORT_DIR === "asc" ? "desc" : "asc");
      } else {
        EMP_SORT_FIELD = field;
        EMP_SORT_DIR = "asc";
      }
      renderEmployeesAdmin();
    });
  });
}

// Alta de empleado desde el formulario (RPC admin)
if (empForm) {
  empForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showEmpMsg("");

    const nombre = (empNombre?.value || "").trim();
    const bodega = (empBod?.value || "").trim();
    const depto  = (empDepto?.value || "").trim();
    const loc    = (empLoc?.value || "").trim();
    const rol    = (empRol?.value || "").trim().toLowerCase();
    const ingRaw = (empIng?.value || "").trim();
    const ing    = normalizeDateToISO(ingRaw);

    if (!nombre || !ing || !bodega || !rol) {
      showEmpMsg("Nombre, bodega, rol y fecha de ingreso son obligatorios. Usa fecha valida como 2026-03-23 o 23/03/2026.", false);
      return;
    }

    const originalBtn = empSaveBtn?.textContent || "➕ Dar de alta empleado";
    if (empSaveBtn) {
      empSaveBtn.disabled = true;
      empSaveBtn.textContent = "Guardando...";
    }

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData?.user;
      if (!user?.id) {
        throw new Error("No hay sesión activa de administrador.");
      }

      const { data: adminRow, error: adminErr } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (adminErr) throw adminErr;
      if (!adminRow) {
        throw new Error("Tu sesión no está reconocida como admin en la tabla admins.");
      }

      const rowToInsert = [{
        nombre,
        bodega,
        departamento: depto || null,
        localizacion: loc || null,
        rol,
        fecha_ingreso: ing
      }];

      const rpcPromise = supabase.rpc("employees_import_admin", {
        p_rows: rowToInsert
      });
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Tiempo de espera agotado al guardar. Revisa si el proyecto de Supabase tiene un bloqueo activo o si el RPC employees_import_admin está respondiendo.")), 12000));
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);
      if (error) throw error;

      const inserted = Number(data ?? 0);
      if (!Number.isFinite(inserted) || inserted < 1) {
        throw new Error("El alta no devolvió confirmación de inserción.");
      }

      showEmpMsg("Empleado dado de alta correctamente.", true);
      if (empNombre) empNombre.value = "";
      if (empBod)    empBod.value    = "";
      if (empDepto)  empDepto.value  = "";
      if (empLoc)    empLoc.value    = "";
      if (empRol)    empRol.value    = "";
      if (empIng)    empIng.value    = "";

      loadEmployeesAdmin().catch(err => {
        console.error("Recarga de empleados posterior al alta falló:", err);
      });
    } catch (err) {
      console.error("Error al dar de alta empleado:", err);
      showEmpMsg("No se pudo dar de alta: " + (err?.message || err?.error_description || "Error desconocido"), false);
    } finally {
      if (empSaveBtn) {
        empSaveBtn.disabled = false;
        empSaveBtn.textContent = originalBtn;
      }
    }
  });
}

// Editar empleado
window.empEdit = async (id) => {
  const emp = (EMP_DATA || []).find(e => e.id === id);
  if (!emp) {
    alert("No se encontró el empleado.");
    return;
  }

  const nombre = prompt("Nombre:", emp.nombre || "");
  if (nombre === null) return;

  const bodega = prompt("Bodega:", emp.bodega || "");
  if (bodega === null) return;

  const depto = prompt("Departamento:", emp.departamento || "");
  if (depto === null) return;

  const loc = prompt("Localización:", emp.localizacion || "");
  if (loc === null) return;

  const rol = prompt("Rol:", emp.rol || "");
  if (rol === null) return;

  const fiDefault = emp.fecha_ingreso ? String(emp.fecha_ingreso).slice(0,10) : "";
  const fi = prompt("Fecha de ingreso (YYYY-MM-DD):", fiDefault);
  if (fi === null || !fi.trim()) {
    alert("La fecha de ingreso es obligatoria.");
    return;
  }

  const { data, error } = await supabase.rpc("employees_update_admin", {
    p_id:            id,
    p_nombre:        nombre.trim(),
    p_bodega:        bodega.trim() || null,
    p_departamento:  depto.trim()  || null,
    p_localizacion:  loc.trim()    || null,
    p_rol:           rol.trim().toLowerCase() || null,
    p_fecha_ingreso: fi.trim()
  });

  if (error || data !== true) {
    console.error("Error al actualizar empleado:", error);
    alert("No se pudo actualizar el empleado: " + (error?.message || "RPC devolvió falso"));
    return;
  }

  await loadEmployeesAdmin();
  showEmpMsg("Empleado actualizado correctamente.", true);
};

// Borrar empleado
window.empDelete = async (id) => {
  const emp = (EMP_DATA || []).find(e => e.id === id);
  const nombre = emp?.nombre || "(sin nombre)";

  if (!confirm(`¿Eliminar al empleado "${nombre}"?`)) return;

  const { data, error } = await supabase.rpc("employees_delete_admin", {
    p_id: id
  });

  if (error || data !== true) {
    console.error("Error al borrar empleado:", error);
    alert("No se pudo borrar el empleado: " + (error?.message || "RPC devolvió falso"));
    return;
  }

  await loadEmployeesAdmin();
  showEmpMsg("Empleado eliminado correctamente.", true);
};

// Exportar CSV de empleados
if (empExportBtn) {
  empExportBtn.addEventListener("click", () => {
    if (!EMP_DATA || EMP_DATA.length === 0) {
      showEmpMsg("No hay empleados para exportar.", false);
      return;
    }

    const header = ["id","nombre","bodega","departamento","localizacion","rol","fecha_ingreso"];
    const lines = [header.join(",")];

    for (const e of EMP_DATA) {
      const row = [
        e.id || "",
        e.nombre || "",
        e.bodega || "",
        e.departamento || "",
        e.localizacion || "",
        e.rol || "",
        e.fecha_ingreso ? String(e.fecha_ingreso).slice(0,10) : ""
      ].map(v =>
        `"${String(v).replace(/"/g, '""')}"`
      );
      lines.push(row.join(","));
    }

    const csv = lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = "empleados.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showEmpMsg("Archivo CSV generado.", true);
  });
}

// Importar CSV de empleados (RPC admin)
if (empImportInput) {
  empImportInput.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    showEmpMsg("Leyendo archivo CSV…");

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
      if (lines.length <= 1) {
        showEmpMsg("El archivo CSV no tiene registros.", false);
        return;
      }

      const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g,"").toLowerCase());
      const idx = (name) => header.indexOf(name);

      const idxId    = idx("id");
      const idxNom   = idx("nombre");
      const idxBod   = idx("bodega");
      const idxDep   = idx("departamento");
      const idxLoc   = idx("localizacion");
      const idxRol   = idx("rol");
      const idxIng   = idx("fecha_ingreso");

      if (idxNom === -1 || idxIng === -1) {
        showEmpMsg("El CSV debe tener al menos columnas 'nombre' y 'fecha_ingreso'.", false);
        return;
      }

      const rowsToInsert = [];

      for (let i = 1; i < lines.length; i++) {
        const raw = lines[i];
        if (!raw) continue;

        const cols = raw.split(",").map(c => c.replace(/^"|"$/g,""));

        const nombre = cols[idxNom] || "";
        const ingreso = cols[idxIng] || "";
        const ingresoIso = normalizeDateToISO(ingreso);

        if (!nombre || !ingresoIso) continue;

        const rec = {
          nombre: nombre.trim(),
          fecha_ingreso: ingresoIso
        };

        if (idxBod !== -1) rec.bodega       = (cols[idxBod] || "").trim() || null;
        if (idxDep !== -1) rec.departamento = (cols[idxDep] || "").trim() || null;
        if (idxLoc !== -1) rec.localizacion = (cols[idxLoc] || "").trim() || null;
        if (idxRol !== -1) rec.rol          = (cols[idxRol] || "").trim().toLowerCase() || null;
        if (idxId  !== -1 && cols[idxId])   rec.id           = cols[idxId].trim();

        rowsToInsert.push(rec);
      }

      if (rowsToInsert.length === 0) {
        showEmpMsg("No se encontraron filas válidas en el CSV.", false);
        return;
      }

      showEmpMsg(`Importando ${rowsToInsert.length} empleados…`);

      const { data, error } = await supabase.rpc("employees_import_admin", {
        p_rows: rowsToInsert
      });

      if (error) {
        console.error("Error al importar empleados:", error);
        showEmpMsg("Error al importar empleados: " + (error.message || ""), false);
        return;
      }

      const inserted = data ?? rowsToInsert.length;
      showEmpMsg(`Importación completada (${inserted} empleados).`, true);
      empImportInput.value = "";
      await loadEmployeesAdmin();
    } catch (e) {
      console.error("Error leyendo CSV:", e);
      showEmpMsg("No se pudo leer el archivo CSV.", false);
    }
  });
}

// Botón de refresco específico de empleados
if (empRefreshBtn) {
  empRefreshBtn.addEventListener("click", loadEmployeesAdmin);
}

// ───────────────────────────────────────────────────────────────────────────────
/** Alta directa de vacaciones: helpers */
// ───────────────────────────────────────────────────────────────────────────────
function showVacMsg(text, ok=false) {
  if (!vacFormMsg) return;
  vacFormMsg.textContent = text || "";
  vacFormMsg.className = "msg " + (ok ? "ok" : "err");
}

function clearVacationEmployeeField() {
  if (vacEmpId) vacEmpId.value = '';
  if (vacEmpSearch) {
    vacEmpSearch.value = '';
    vacEmpSearch.dataset.selectedName = '';
    vacEmpSearch.focus();
  }
  if (vacEmpSuggest) vacEmpSuggest.innerHTML = '';
}

if (vacEmpClear) {
  vacEmpClear.addEventListener('click', () => {
    clearVacationEmployeeField();
    showVacMsg('Campo de empleado limpiado.', true);
  });
}

// Autocomplete simple con EMP_DATA
if (vacEmpSearch) {
  let t = null;
  vacEmpSearch.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = (vacEmpSearch.value||"").trim().toLowerCase();
      if (!q) { vacEmpSuggest.innerHTML=""; vacEmpId.value=""; vacEmpSearch.dataset.selectedName = ''; return; }

      const hits = (EMP_DATA||[])
        .filter(e => (e.nombre||"").toLowerCase().includes(q))
        .slice(0, 8);

      if (hits.length===0) { vacEmpSuggest.innerHTML=""; return; }

      const list = hits.map(h => `
        <div class="suggest-item" data-id="${h.id}" data-name="${(h.nombre||"").replace(/"/g,'&quot;')}">
          ${escapeHtml(h.nombre||"")} <small>(${escapeHtml(h.bodega||"-")}, ${escapeHtml(h.rol||"-")})</small>
        </div>
      `).join("");

      vacEmpSuggest.innerHTML = `<div class="suggest-menu" style="position:absolute; z-index:10; background:#fff; border:1px solid #ddd; width:100%;">${list}</div>`;

      vacEmpSuggest.querySelectorAll(".suggest-item").forEach(item=>{
        item.addEventListener("click", ()=>{
          vacEmpId.value = item.getAttribute("data-id");
          vacEmpSearch.value = item.getAttribute("data-name");
          vacEmpSearch.dataset.selectedName = item.getAttribute("data-name") || '';
          vacEmpSuggest.innerHTML="";
        });
      });
    }, 150);
  });
}

// presets de semana (actual y siguiente)
document.querySelectorAll("button.preset")?.forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const kind = btn.dataset.preset;
    const today = new Date();
    const day = today.getDay(); // 0 dom .. 6 sab
    const mondayOffset = (day===0? -6 : (1-day));
    let base = new Date(today); base.setDate(today.getDate()+mondayOffset);
    if (kind==="next-week") base.setDate(base.getDate()+7);
    const start = new Date(base); // lunes
    const end = new Date(base); end.setDate(end.getDate()+5); // sábado
    vacStart.value = start.toISOString().slice(0,10);
    vacEnd.value   = end.toISOString().slice(0,10);
  });
});

// Acción rápida desde la tabla de empleados
window.empQuickVacation = (id, nombre) => {
  if (!vacEmpId || !vacEmpSearch) return;
  vacEmpId.value = id;
  vacEmpSearch.value = nombre || "";
  vacEmpSearch.dataset.selectedName = nombre || "";
  vacEmpSearch.focus();
  showVacMsg(`Empleado seleccionado: ${nombre}`, true);
};

function setVacActionBusy(isBusy, label) {
  if (vacCreateBtn) vacCreateBtn.disabled = !!isBusy;
  if (vacCreateApproveBtn) {
    vacCreateApproveBtn.disabled = !!isBusy;
    vacCreateApproveBtn.textContent = isBusy ? (label || 'Guardando...') : '✅ Crear y autorizar';
  }
}

function resolveSelectedEmployeeId() {
  const direct = (vacEmpId?.value || '').trim();
  if (direct) return direct;
  const typed = (vacEmpSearch?.value || '').trim().toLowerCase();
  if (!typed) return '';
  const exact = (EMP_DATA || []).find(e => String(e.nombre || '').trim().toLowerCase() === typed);
  return exact?.id || '';
}

async function createVacationRequestFromForm() {
  const empId = resolveSelectedEmployeeId();
  const s = (vacStart?.value || '').trim();
  const e = (vacEnd?.value || '').trim();
  if (!empId || !s || !e) throw new Error('Falta empleado, inicio o fin.');
  if (e < s) throw new Error('La fecha fin no puede ser menor a la inicial.');

  let createdId = null;
  let lastErr = null;
  try {
    const { data, error } = await supabase.rpc('vacation_requests_create_admin_force', {
      emp_id: empId, s, e, auto_approve: false
    });
    if (error) lastErr = error;
    if (!error && data) createdId = data;
  } catch (e1) {
    lastErr = e1;
  }

  if (!createdId) {
    const { data, error } = await supabase.rpc('vacation_requests_create', { emp_id: empId, s, e });
    if (error || !data) throw (error || lastErr || new Error('RPC devolvió nulo'));
    createdId = data;
  }

  const selectedName = (vacEmpSearch?.dataset.selectedName || vacEmpSearch?.value || '').trim();
  return {
    id: createdId,
    employee_id: empId,
    start_date: s,
    end_date: e,
    status: 'Pendiente',
    employee_name: selectedName
  };
}

// Crear pendiente (BYPASS si está disponible)
if (vacCreateBtn) {
  vacCreateBtn.addEventListener("click", async ()=>{
    showVacMsg("");
    setVacActionBusy(true, 'Guardando...');
    try {
      await createVacationRequestFromForm();
      showVacMsg("Solicitud creada (Pendiente).", true);
      await loadVacations();
    } catch (err) {
      console.error('Error al crear solicitud pendiente', err);
      showVacMsg("Error al crear: " + (err?.message || err), false);
    } finally {
      setVacActionBusy(false);
    }
  });
}

// Crear y autorizar (pide cobertura obligatoria)
if (vacCreateApproveBtn) {
  vacCreateApproveBtn.addEventListener("click", async ()=>{
    showVacMsg("");
    setVacActionBusy(true, 'Guardando...');
    try {
      const createdReq = await createVacationRequestFromForm();
      showVacMsg("Solicitud creada. Agrega coberturas si aplica y autoriza desde el modal.", true);
      await openCoverageModal(createdReq, true);
      loadVacations().catch(err => console.error('Error recargando vacaciones tras crear y autorizar', err));
    } catch (err) {
      console.error('Error al crear solicitud para autorizar', err);
      showVacMsg("Error al crear: " + (err?.message || err), false);
    } finally {
      setVacActionBusy(false);
    }
  });
}



function setHolidayMsg(text, ok=true){
  if (!holidayMsg) return;
  holidayMsg.textContent = text || "";
  holidayMsg.classList.remove("ok","err");
  if (text) holidayMsg.classList.add(ok ? "ok" : "err");
}

function resetHolidayForm(){
  HOLIDAY_EDIT_DATE = null;
  if (holidayDesc) holidayDesc.value = "";
  if (holidayStart) holidayStart.value = "";
  if (holidayEnd) holidayEnd.value = "";
  if (holidaySource) holidaySource.value = "admin";
  if (holidaySaveBtn) holidaySaveBtn.textContent = "💾 Guardar feriado";
  if (holidayCancelBtn) holidayCancelBtn.classList.add("hidden");
}

function renderHolidayRows(rows){
  if (!holidayList) return;
  const items = [...(rows || [])].sort((a,b)=> String(a.date || '').localeCompare(String(b.date || '')));
  if (!items.length) {
    holidayList.innerHTML = '<tr><td colspan="5" class="muted">Sin feriados capturados.</td></tr>';
    return;
  }
  holidayList.innerHTML = items.map(r => {
    const date = String(r.date || '');
    const y = date.slice(0,4);
    return `
      <tr>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(r.name || '')}</td>
        <td>${escapeHtml(r.source || '')}</td>
        <td>${escapeHtml(y)}</td>
        <td class="holiday-row-actions">
          <button type="button" data-action="edit" data-date="${escapeHtml(date)}">✏️ Editar</button>
          <button type="button" data-action="delete" data-date="${escapeHtml(date)}">🗑 Eliminar</button>
        </td>
      </tr>`;
  }).join('');
}

async function loadHolidaysAdmin(){
  if (!holidayList) return;
  holidayList.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  const { data, error } = await supabase
    .from('holidays')
    .select('date,name,source')
    .order('date', { ascending: true });
  if (error) {
    renderHolidayRows([]);
    setHolidayMsg('Error al cargar feriados: ' + error.message, false);
    return;
  }
  renderHolidayRows(data || []);
}

function editHoliday(date, name, source){
  HOLIDAY_EDIT_DATE = date;
  if (holidayDesc) holidayDesc.value = name || '';
  if (holidayStart) holidayStart.value = date || '';
  if (holidayEnd) holidayEnd.value = date || '';
  if (holidaySource) holidaySource.value = source || 'admin';
  if (holidaySaveBtn) holidaySaveBtn.textContent = '💾 Actualizar feriado';
  if (holidayCancelBtn) holidayCancelBtn.classList.remove('hidden');
  setHolidayMsg('Editando feriado ' + date, true);
}

async function deleteHoliday(date){
  if (!date) return;
  if (!confirm(`¿Eliminar feriado ${date}?`)) return;
  const { error } = await supabase.from('holidays').delete().eq('date', date);
  if (error) { setHolidayMsg('No se pudo eliminar: ' + error.message, false); return; }
  setHolidayMsg('Feriado eliminado.', true);
  if (HOLIDAY_EDIT_DATE === date) resetHolidayForm();
  await loadHolidaysAdmin();
}

async function saveHolidayForm(){
  const desc = (holidayDesc?.value || '').trim();
  const s = holidayStart?.value || '';
  const e = holidayEnd?.value || '';
  const source = (holidaySource?.value || 'admin').trim() || 'admin';
  if (!desc || !s || !e) { setHolidayMsg('Captura descripción, fecha inicio y fecha fin.', false); return; }
  if (e < s) { setHolidayMsg('La fecha fin no puede ser menor a la fecha inicio.', false); return; }

  try {
    if (HOLIDAY_EDIT_DATE) {
      if (s !== e) { setHolidayMsg('La edición actual es por día. Para un rango, elimina y vuelve a capturarlo.', false); return; }
      if (HOLIDAY_EDIT_DATE !== s) {
        const { error: delErr } = await supabase.from('holidays').delete().eq('date', HOLIDAY_EDIT_DATE);
        if (delErr) { setHolidayMsg('No se pudo preparar la actualización: ' + delErr.message, false); return; }
      }
      const { error: upErr } = await supabase.from('holidays').upsert([{ date: s, name: desc, source }], { onConflict: 'date' });
      if (upErr) { setHolidayMsg('No se pudo actualizar: ' + upErr.message, false); return; }
      setHolidayMsg('Feriado actualizado.', true);
      resetHolidayForm();
      await loadHolidaysAdmin();
      return;
    }

    const rows = [];
    let d = new Date(s + 'T00:00:00');
    const end = new Date(e + 'T00:00:00');
    while (d <= end) {
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,'0');
      const dd = String(d.getDate()).padStart(2,'0');
      rows.push({ date: `${y}-${m}-${dd}`, name: desc, source });
      d.setDate(d.getDate()+1);
    }
    const { error } = await supabase.from('holidays').upsert(rows, { onConflict: 'date' });
    if (error) { setHolidayMsg('No se pudo guardar: ' + error.message, false); return; }
    setHolidayMsg(rows.length === 1 ? 'Feriado guardado.' : `Rango guardado: ${rows.length} días.`, true);
    resetHolidayForm();
    await loadHolidaysAdmin();
  } catch (e) {
    setHolidayMsg('Error inesperado: ' + (e?.message || e), false);
  }
}

function setBlackoutMsg(text, ok=true){
  if (!blackoutMsg) return;
  blackoutMsg.textContent = text || "";
  blackoutMsg.classList.remove("ok","err");
  if (text) blackoutMsg.classList.add(ok ? "ok" : "err");
}

function resetBlackoutForm(){
  BLACKOUT_EDIT_ID = null;
  if (blackoutDesc) blackoutDesc.value = "";
  if (blackoutDate) blackoutDate.value = "";
  if (blackoutActive) blackoutActive.value = "true";
  if (blackoutSaveBtn) blackoutSaveBtn.textContent = "💾 Guardar fecha bloqueada";
  if (blackoutCancelBtn) blackoutCancelBtn.classList.add("hidden");
}

function renderBlackoutRows(rows){
  if (!blackoutList) return;
  const items = [...(rows || [])].sort((a,b)=> String(a.date || '').localeCompare(String(b.date || '')));
  if (!items.length) {
    blackoutList.innerHTML = '<tr><td colspan="4" class="muted">Sin fechas bloqueadas capturadas.</td></tr>';
    return;
  }
  blackoutList.innerHTML = items.map(r => `
    <tr>
      <td>${escapeHtml(String(r.date || ''))}</td>
      <td>${escapeHtml(r.description || '')}</td>
      <td>${r.active ? 'Sí' : 'No'}</td>
      <td class="blackout-row-actions">
        <button type="button" data-action="edit" data-id="${escapeHtml(r.id)}">✏️ Editar</button>
        <button type="button" data-action="delete" data-id="${escapeHtml(r.id)}">🗑 Eliminar</button>
      </td>
    </tr>`).join('');
}

async function loadBlackoutsAdmin(){
  if (!blackoutList) return;
  blackoutList.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  const { data, error } = await supabase
    .from('vacation_blackout_dates')
    .select('id,date,description,active')
    .order('date', { ascending: true });
  if (error) {
    renderBlackoutRows([]);
    setBlackoutMsg('Error al cargar fechas bloqueadas: ' + error.message, false);
    return;
  }
  renderBlackoutRows(data || []);
}

async function editBlackout(id){
  const { data, error } = await supabase
    .from('vacation_blackout_dates')
    .select('id,date,description,active')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    setBlackoutMsg('No se pudo cargar la fecha bloqueada.', false);
    return;
  }
  BLACKOUT_EDIT_ID = data.id;
  if (blackoutDesc) blackoutDesc.value = data.description || '';
  if (blackoutDate) blackoutDate.value = data.date || '';
  if (blackoutActive) blackoutActive.value = data.active ? 'true' : 'false';
  if (blackoutSaveBtn) blackoutSaveBtn.textContent = '💾 Actualizar fecha bloqueada';
  if (blackoutCancelBtn) blackoutCancelBtn.classList.remove('hidden');
  setBlackoutMsg('Editando fecha bloqueada ' + data.date, true);
}

async function deleteBlackout(id){
  if (!id) return;
  if (!confirm('¿Eliminar fecha bloqueada?')) return;
  const { error } = await supabase.from('vacation_blackout_dates').delete().eq('id', id);
  if (error) { setBlackoutMsg('No se pudo eliminar: ' + error.message, false); return; }
  setBlackoutMsg('Fecha bloqueada eliminada.', true);
  if (BLACKOUT_EDIT_ID === id) resetBlackoutForm();
  await loadBlackoutsAdmin();
}

async function saveBlackoutForm(){
  const description = (blackoutDesc?.value || '').trim();
  const date = blackoutDate?.value || '';
  const active = String(blackoutActive?.value || 'true') === 'true';
  if (!description || !date) { setBlackoutMsg('Captura descripción y fecha.', false); return; }

  const payload = { date, description, active };
  let error = null;
  if (BLACKOUT_EDIT_ID) {
    ({ error } = await supabase.from('vacation_blackout_dates').update(payload).eq('id', BLACKOUT_EDIT_ID));
  } else {
    ({ error } = await supabase.from('vacation_blackout_dates').insert([payload]));
  }
  if (error) { setBlackoutMsg('No se pudo guardar: ' + error.message, false); return; }
  setBlackoutMsg(BLACKOUT_EDIT_ID ? 'Fecha bloqueada actualizada.' : 'Fecha bloqueada guardada.', true);
  resetBlackoutForm();
  await loadBlackoutsAdmin();
}

// ─────────────────────────────────────────────────────────────
// UI: Tabs (para evitar pantalla larga)
// ─────────────────────────────────────────────────────────────
(function(){
  const tabs = Array.from(document.querySelectorAll(".ap-tab"));
  const modules = {
    "solicitudes": document.getElementById("tab-solicitudes"),
    "alta-vac": document.getElementById("tab-alta-vac"),
    "colaboradores": document.getElementById("tab-colaboradores"),
    "feriados": document.getElementById("tab-feriados"),
    "blackouts": document.getElementById("tab-blackouts"),
  };

  function showModule(key){
    Object.entries(modules).forEach(([k, el]) => {
      if (!el) return;
      const active = (k === key);
      el.classList.toggle("hidden", !active);
      if (!active) el.setAttribute("aria-hidden","true");
      else el.setAttribute("aria-hidden","false");
    });
    tabs.forEach(b => b.classList.toggle("active", b.dataset.tab === key));

    if (key === "feriados") loadHolidaysAdmin();
    if (key === "blackouts") loadBlackoutsAdmin();

    // Fix: cuando cambias de módulo, recalcula layout si hay algo sticky
    window.dispatchEvent(new Event("resize"));
  }

  tabs.forEach(b => b.addEventListener("click", () => showModule(b.dataset.tab)));

  // Subtabs de Empleados
  const subTabs = Array.from(document.querySelectorAll(".emp-subtab"));
  const subAlta = document.getElementById("emp-sub-alta");
  const subLista = document.getElementById("emp-sub-lista");
  function showEmpSub(which){
    if (subAlta) subAlta.classList.toggle("hidden", which !== "alta");
    if (subLista) subLista.classList.toggle("hidden", which !== "lista");
    if (subAlta) subAlta.setAttribute("aria-hidden", which !== "alta");
    if (subLista) subLista.setAttribute("aria-hidden", which !== "lista");
    subTabs.forEach(b => b.classList.toggle("active", b.dataset.subtab === which));
    window.dispatchEvent(new Event("resize"));
  }
  subTabs.forEach(b => b.addEventListener("click", () => showEmpSub(b.dataset.subtab)));

  // Estado inicial
  showModule("solicitudes");
})();



// ─────────────────────────────────────────────────────────────
// Responsive inteligente: marca la UI según ancho de pantalla
// ─────────────────────────────────────────────────────────────
(function(){
  const mqMobile = window.matchMedia("(max-width: 700px)");
  const mqTablet = window.matchMedia("(max-width: 980px)");
  function apply(){
    const root = document.documentElement;
    root.classList.toggle("is-mobile", mqMobile.matches);
    root.classList.toggle("is-tablet", !mqMobile.matches && mqTablet.matches);
    root.classList.toggle("is-wide", !mqTablet.matches);
  }
  apply();
  if (mqMobile.addEventListener) mqMobile.addEventListener("change", apply);
  else mqMobile.addListener(apply);
  if (mqTablet.addEventListener) mqTablet.addEventListener("change", apply);
  else mqTablet.addListener(apply);
  window.addEventListener("resize", apply);
})();


if (holidaySaveBtn) holidaySaveBtn.addEventListener("click", saveHolidayForm);
if (holidayRefreshBtn) holidayRefreshBtn.addEventListener("click", loadHolidaysAdmin);
if (holidayCancelBtn) holidayCancelBtn.addEventListener("click", () => { resetHolidayForm(); setHolidayMsg("", true); });
if (holidayList) holidayList.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const date = btn.dataset.date;
  const tr = btn.closest('tr');
  const tds = tr ? tr.querySelectorAll('td') : [];
  const name = tds[1]?.textContent || '';
  const source = tds[2]?.textContent || '';
  if (action === 'edit') editHoliday(date, name, source);
  if (action === 'delete') await deleteHoliday(date);
});

// Carga inicial normal
document.addEventListener("DOMContentLoaded", async () => {
  ADMIN_SYNC_IN_PROGRESS = false;
  await syncAdminState();
});

// Restauración si usas el botón "Regresar" de Firefox (BFCache)
window.addEventListener('pageshow', async (event) => {
  if (event.persisted) {
    ADMIN_SYNC_IN_PROGRESS = false;
    await syncAdminState();
  }
});


if (blackoutSaveBtn) blackoutSaveBtn.addEventListener("click", saveBlackoutForm);
if (blackoutRefreshBtn) blackoutRefreshBtn.addEventListener("click", loadBlackoutsAdmin);
if (blackoutCancelBtn) blackoutCancelBtn.addEventListener("click", () => { resetBlackoutForm(); setBlackoutMsg("", true); });
if (blackoutList) blackoutList.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'edit') await editBlackout(id);
  if (action === 'delete') await deleteBlackout(id);
});
