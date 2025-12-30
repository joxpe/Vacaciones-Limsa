// admin-panel.js (vacaciones + empleados con orden, alta, importar, editar y borrar)
// Filtros extra: Localización, Mes (YYYY-MM), Semana (ISO) y Bodega multiselección con autofiltro por Localización/Departamento.
// RPCs vacaciones (SECURITY DEFINER):
//   vacation_requests_delete_admin(req_id uuid) -> boolean
//   vacation_requests_approve(req_id uuid) -> boolean
//   vacation_requests_reject(req_id uuid) -> boolean
//   vacation_requests_update_dates(req_id uuid, new_start date, new_end date) -> boolean
//   vacation_requests_unapprove(req_id uuid) -> boolean
//   vacation_requests_create(emp_id uuid, s date, e date) -> uuid
//   vacation_requests_create_admin_force(emp_id uuid, s date, e date, auto_approve boolean DEFAULT false) -> uuid
//   vacation_requests_approve_admin_force(req_id uuid) -> boolean   // opcional
//
// RPCs empleados (SECURITY DEFINER):
//   employees_insert_admin(...)
//   employees_import_admin(p_rows jsonb) -> integer
//   employees_update_admin(...)
//   employees_delete_admin(p_id uuid) -> boolean

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ───────────────────────────────────────────────────────────────────────────────
// Config / utils
// ───────────────────────────────────────────────────────────────────────────────
const LOCAL_PASSWORD = "limsa2026";
const NAME_CANDIDATES = ["nombre", "name", "full_name", "display_name", "empleado"];
const WH_CANDIDATES   = ["bodega", "warehouse", "almacen", "site", "location", "ubicacion"];
const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const monthYearKey = (isoDate) => {
  const d = new Date(isoDate);
  const y = d.getFullYear();
  const m = d.getMonth();
  return { key: `${y}-${String(m+1).padStart(2,"0")}`, label: `${MESES_ES[m]} ${y}` };
};

// ISO week (1..53)
function isoWeek(dIn) {
  const d = new Date(Date.UTC(dIn.getFullYear(), dIn.getMonth(), dIn.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

const $ = (sel) => document.querySelector(sel);
const pick = (obj, keys) => {
  for (const k of keys) if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  return undefined;
};
const escapeHtml = (s) =>
  String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
           .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function normalizeBodegaForUI(b){ const val=(b??"").trim(); return val || "(Sin bodega)"; }

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

// Contenedor de filtros para insertar si faltan
const filtersBox  = document.querySelector(".filters");

// Filtros base (pueden existir o no)
const fBodegaSel  = $("#f-bodega");   // multiselect (reconstruido dinámicamente)
const fDeptoSel   = $("#f-depto");
const fRolSel     = $("#f-rol");
const fStatusSel  = $("#f-status");
const fOverlapsCb = $("#f-overlaps");
const fCrossOnly  = $("#f-cross-only");

// Filtros nuevos (creados si no existen en HTML)
let fLocSel   = $("#f-localizacion");
let fMonthSel = $("#f-month");
let fWeekSel  = $("#f-week");

// Empleados
const empPanel       = $("#emp-panel");
const empRefreshBtn  = $("#emp-refresh-btn");
const empExportBtn   = $("#emp-export-btn");
const empImportInput = $("#emp-import-input");
const empForm        = $("#emp-form");
const empMsg         = $("#emp-msg");
const empList        = $("#emp-list");
const empNombre      = $("#emp-nombre");
const empBod         = $("#emp-bodega");
const empDepto       = $("#emp-depto");
const empLoc         = $("#emp-localizacion");
const empRol         = $("#emp-rol");
const empIng         = $("#emp-ingreso");
const empSearch      = $("#emp-search");

// Alta directa de vacaciones
const vacEmpSearch   = $("#vac-emp-search");
const vacEmpSuggest  = $("#vac-emp-suggest");
const vacEmpId       = $("#vac-emp-id");
const vacStart       = $("#vac-start");
const vacEnd         = $("#vac-end");
const vacCreateBtn   = $("#vac-create");
const vacCreateApproveBtn = $("#vac-create-approve");
const vacFormMsg     = $("#vac-form-msg");

// ───────────────────────────────────────────────────────────────────────────────
// Estado
// ───────────────────────────────────────────────────────────────────────────────
let VAC_DATA = [];
let EMP_DATA = [];
let EMP_BY_ID = {};

let CURRENT_BODEGAS = [];  // multiselect (normalizadas)
let CURRENT_DEPTO   = "";  // ""
let CURRENT_ROLES   = [];  // []
let CURRENT_STATUS  = "";  // "", "Pendiente", "Aprobado", "Rechazado"
let CURRENT_LOC     = "";  // ""
let CURRENT_MONTH   = "";  // "YYYY-MM"
let CURRENT_WEEK    = "";  // "1".."53"

let OVERLAPS_ONLY   = false;
let CROSS_ONLY      = false;
let OVERLAP_ID_SET  = new Set();

// Índices globales para autofiltro de Bodega
let ALL_BODEGAS = []; // normalizadas
let ALL_DEPTOS  = [];
let ALL_LOCS    = [];

// Orden empleados + filtro de texto
let EMP_SORT_FIELD   = "nombre";
let EMP_SORT_DIR     = "asc";
let EMP_FILTER_TEXT  = "";

// ───────────────────────────────────────────────────────────────────────────────
// Crear UI extra si falta (Localización / Mes / Semana)
// ───────────────────────────────────────────────────────────────────────────────
function ensureExtraFiltersUI() {
  if (!filtersBox) return;

  // Localización
  if (!fLocSel) {
    const wrap = document.createElement("div");
    wrap.className = "col";
    const label = document.createElement("label");
    label.textContent = "Localización";
    const sel = document.createElement("select");
    sel.id = "f-localizacion";
    fLocSel = sel;
    sel.innerHTML = `<option value="">Todas</option>`;
    wrap.appendChild(label); wrap.appendChild(sel);
    filtersBox.appendChild(wrap);

    fLocSel.addEventListener("change", () => {
      CURRENT_LOC = fLocSel.value || "";
      refreshBodegaOptionsByLocDept();
      CURRENT_BODEGAS = Array.from((fBodegaSel||sel).selectedOptions || []).map(o=>o.value);
      computeOverlaps();
      renderList();
    });
  }

  // Mes
  if (!fMonthSel) {
    const wrap = document.createElement("div");
    wrap.className = "col";
    const label = document.createElement("label");
    label.textContent = "Mes";
    const inp = document.createElement("input");
    inp.type = "month";
    inp.id = "f-month";
    fMonthSel = inp;
    wrap.appendChild(label); wrap.appendChild(inp);
    filtersBox.appendChild(wrap);

    fMonthSel.addEventListener("change", () => {
      CURRENT_MONTH = fMonthSel.value || "";
      computeOverlaps();
      renderList();
    });
  }

  // Semana (1..53)
  if (!fWeekSel) {
    const wrap = document.createElement("div");
    wrap.className = "col";
    const label = document.createElement("label");
    label.textContent = "Semana (ISO)";
    const sel = document.createElement("select");
    sel.id = "f-week";
    fWeekSel = sel;
    const opts = ['<option value="">Todas</option>'];
    for (let w=1; w<=53; w++) opts.push(`<option value="${w}">${w}</option>`);
    sel.innerHTML = opts.join("");
    wrap.appendChild(label); wrap.appendChild(sel);
    filtersBox.appendChild(wrap);

    fWeekSel.addEventListener("change", () => {
      CURRENT_WEEK = fWeekSel.value || "";
      computeOverlaps();
      renderList();
    });
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Login / Refresh
// ───────────────────────────────────────────────────────────────────────────────
loginBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";
  const pass = $("#admin-pass").value.trim();
  if (pass !== LOCAL_PASSWORD) { errorMsg.textContent = "Contraseña incorrecta"; return; }
  loginScreen.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  ensureExtraFiltersUI();
  await loadEmployeesAdmin();  // primero para índices de bodega/loc/depto
  await loadVacations();
});

logoutBtn.addEventListener("click", () => {
  adminPanel.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

refreshBtn.addEventListener("click", async () => {
  await loadEmployeesAdmin();
  await loadVacations();
});

// ───────────────────────────────────────────────────────────────────────────────
// Filtros base
// ───────────────────────────────────────────────────────────────────────────────
if (fBodegaSel) {
  fBodegaSel.addEventListener("change", () => {
    CURRENT_BODEGAS = Array.from(fBodegaSel.selectedOptions || []).map(o=>o.value).filter(Boolean);
    computeOverlaps();
    renderList();
  });
}

if (fDeptoSel) {
  fDeptoSel.addEventListener("change", () => {
    CURRENT_DEPTO = fDeptoSel.value || "";
    refreshBodegaOptionsByLocDept();     // actualizar opciones según depto
    CURRENT_BODEGAS = Array.from(fBodegaSel?.selectedOptions || []).map(o=>o.value);
    computeOverlaps();
    renderList();
  });
}

if (fRolSel) {
  fRolSel.addEventListener("change", () => {
    CURRENT_ROLES = Array.from(fRolSel.selectedOptions || []).map(o=>o.value).filter(Boolean);
    computeOverlaps();
    renderList();
  });
}

if (fStatusSel) {
  fStatusSel.addEventListener("change", () => {
    CURRENT_STATUS = fStatusSel.value || "";
    computeOverlaps();
    renderList();
  });
}

if (fOverlapsCb) {
  fOverlapsCb.addEventListener("change", () => {
    OVERLAPS_ONLY = !!fOverlapsCb.checked;
    renderList();
  });
}

if (fCrossOnly) {
  fCrossOnly.addEventListener("change", () => {
    CROSS_ONLY = !!fCrossOnly.checked;
    computeOverlaps();
    renderList();
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Índices de Bodega/Depto/Localización desde EMP_DATA (catálogo completo)
// ───────────────────────────────────────────────────────────────────────────────
function buildIndexesFromEmployees(rows){
  const cmp = new Intl.Collator('es-MX').compare;
  const bodegasSet = new Set();
  const deptosSet  = new Set();
  const locsSet    = new Set();
  for (const r of rows) {
    bodegasSet.add(normalizeBodegaForUI(r.bodega));
    if (r.departamento && r.departamento.trim()) deptosSet.add(r.departamento.trim());
    if (r.localizacion && r.localizacion.trim()) locsSet.add(r.localizacion.trim());
  }
  ALL_BODEGAS = Array.from(bodegasSet).sort(cmp);
  ALL_DEPTOS  = Array.from(deptosSet).sort(cmp);
  ALL_LOCS    = Array.from(locsSet).sort(cmp);

  // Rellenar selectores de Localización/Departamento si existen
  if (fDeptoSel) {
    const currentD = CURRENT_DEPTO;
    const opts = [`<option value="">Todos</option>`, ...ALL_DEPTOS.map(d=>`<option value="${escapeHtml(d)}"${d===currentD?' selected':''}>${escapeHtml(d)}</option>`)];
    fDeptoSel.innerHTML = opts.join("");
    if (currentD && !ALL_DEPTOS.includes(currentD)) CURRENT_DEPTO = "";
  }
  if (fLocSel) {
    const currentL = CURRENT_LOC;
    const opts = [`<option value="">Todas</option>`, ...ALL_LOCS.map(l=>`<option value="${escapeHtml(l)}"${l===currentL?' selected':''}>${escapeHtml(l)}</option>`)];
    fLocSel.innerHTML = opts.join("");
    if (currentL && !ALL_LOCS.includes(currentL)) CURRENT_LOC = "";
  }
}

// Visibles de Bodega según Loc/Depto
function computeVisibleBodegasByLocDept(){
  const cmp = new Intl.Collator('es-MX').compare;
  const set = new Set();
  for (const e of EMP_DATA) {
    const lc = (e.localizacion ?? "").trim();
    const d  = (e.departamento ?? "").trim();
    if (CURRENT_LOC && lc !== CURRENT_LOC) continue;
    if (CURRENT_DEPTO && d !== CURRENT_DEPTO) continue;
    set.add(normalizeBodegaForUI(e.bodega));
  }
  return set.size > 0 ? Array.from(set).sort(cmp) : [...ALL_BODEGAS];
}

// Reconstruye opciones del multiselect Bodega y mantiene intersección con selección actual
function refreshBodegaOptionsByLocDept() {
  if (!fBodegaSel) return;
  const visible = computeVisibleBodegasByLocDept();
  const selectedSet = new Set(CURRENT_BODEGAS);
  const html = visible.map(b => `<option value="${escapeHtml(b)}"${selectedSet.has(b)?' selected':''}>${escapeHtml(b)}</option>`).join("");
  fBodegaSel.innerHTML = html;
  CURRENT_BODEGAS = visible.filter(b => selectedSet.has(b)); // mantener selección válida
}

// ───────────────────────────────────────────────────────────────────────────────
// Datos: Vacaciones y Empleados
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

  // Cargar empleados de las solicitudes
  const empIds = [...new Set(VAC_DATA.map(v => v.employee_id).filter(Boolean))];
  EMP_BY_ID = {};
  if (empIds.length > 0) {
    const { data: emps, error: err2 } = await supabase
      .from("employees")
      .select("id, nombre, bodega, departamento, localizacion, rol, fecha_ingreso")
      .in("id", empIds);
    if (!err2 && emps) for (const e of emps) EMP_BY_ID[e.id] = e;
  }

  // Poblar filtros (Bodega/Depto/Rol/Loc) con el catálogo global + los de solicitudes
  populateFilters();
  computeOverlaps();
  renderList();
}

function populateFilters() {
  const bodegasSet = new Set();
  const deptosSet  = new Set();
  const rolesSet   = new Set();
  const locsSet    = new Set();

  // Desde solicitudes
  for (const emp of Object.values(EMP_BY_ID)) {
    const bod = normalizeBodegaForUI(pick(emp, WH_CANDIDATES));
    if (bod) bodegasSet.add(String(bod));
    if (emp.departamento) deptosSet.add(String(emp.departamento).trim());
    if (emp.rol)          rolesSet.add(String(emp.rol).trim());
    if (emp.localizacion) locsSet.add(String(emp.localizacion).trim());
  }

  // Completar con catálogo global
  for (const b of ALL_BODEGAS) bodegasSet.add(b);
  for (const d of ALL_DEPTOS)  deptosSet.add(d);
  for (const l of ALL_LOCS)    locsSet.add(l);

  // Bodega multiselect (se reconstruye también con refreshBodegaOptionsByLocDept)
  refreshBodegaOptionsByLocDept();

  // Depto
  if (fDeptoSel) {
    const currentD = CURRENT_DEPTO;
    const opts = [`<option value="">Todos</option>`,
      ...[...deptosSet].sort((a,b)=>a.localeCompare(b,"es")).map(d=>`<option value="${escapeHtml(d)}"${d===currentD?' selected':''}>${escapeHtml(d)}</option>`)];
    fDeptoSel.innerHTML = opts.join("");
    if (currentD && !deptosSet.has(currentD)) CURRENT_DEPTO = "";
  }

  // Rol
  if (fRolSel) {
    const selectedSet = new Set(CURRENT_ROLES);
    const options = [...rolesSet].sort((a,b)=>a.localeCompare(b,"es")).map(r=>`<option value="${escapeHtml(r)}"${selectedSet.has(r)?' selected':''}>${escapeHtml(r)}</option>`);
    fRolSel.innerHTML = options.join("");
    CURRENT_ROLES = CURRENT_ROLES.filter(r => rolesSet.has(r));
  }

  // Localización
  if (fLocSel) {
    const currentL = CURRENT_LOC;
    const opts = [`<option value="">Todas</option>`,
      ...[...locsSet].sort((a,b)=>a.localeCompare(b,"es")).map(l=>`<option value="${escapeHtml(l)}"${l===currentL?' selected':''}>${escapeHtml(l)}</option>`)];
    fLocSel.innerHTML = opts.join("");
    if (currentL && !locsSet.has(currentL)) CURRENT_LOC = "";
  }
}

// Empalmes considerando todos los filtros que afectan el subconjunto
function computeOverlaps() {
  OVERLAP_ID_SET = new Set();
  if (!VAC_DATA || VAC_DATA.length < 2) return;

  const subset = VAC_DATA.filter(v => passesAllFilters(v, /*forOverlap*/true));
  if (subset.length < 2) return;

  const items = subset.map(v => {
    const e = EMP_BY_ID[v.employee_id] || {};
    const bodega = normalizeBodegaForUI(pick(e, WH_CANDIDATES) ?? "");
    return { id: v.id, bodega: String(bodega), s: new Date(v.start_date), e: new Date(v.end_date) };
  });

  const crossOnlyActive = CROSS_ONLY && CURRENT_BODEGAS.length === 0;

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (!a.bodega || !b.bodega) continue;
      if (crossOnlyActive && a.bodega === b.bodega) continue;
      const startMax = (a.s > b.s) ? a.s : b.s;
      const endMin   = (a.e < b.e) ? a.e : b.e;
      if (startMax <= endMin) { OVERLAP_ID_SET.add(a.id); OVERLAP_ID_SET.add(b.id); }
    }
  }
}

// ¿Pasa filtros? (sirve para lista y para empalmes)
function passesAllFilters(v, forOverlap=false) {
  const e = EMP_BY_ID[v.employee_id] || {};

  // Bodega
  if (CURRENT_BODEGAS.length > 0) {
    const bod = normalizeBodegaForUI(String(pick(e, WH_CANDIDATES) ?? ""));
    if (!CURRENT_BODEGAS.includes(bod)) return false;
  }
  // Depto
  if (CURRENT_DEPTO) {
    if (String(e.departamento ?? "") !== CURRENT_DEPTO) return false;
  }
  // Localización
  if (CURRENT_LOC) {
    const lc = (e.localizacion ?? "").trim();
    if (lc !== CURRENT_LOC) return false;
  }
  // Roles
  if (CURRENT_ROLES && CURRENT_ROLES.length > 0) {
    const rol = (e.rol ?? "").trim();
    if (!CURRENT_ROLES.includes(rol)) return false;
  }
  // Status
  if (CURRENT_STATUS) {
    if ((v.status || "") !== CURRENT_STATUS) return false;
  }
  // Mes sobre start_date
  if (CURRENT_MONTH) {
    if (monthYearKey(v.start_date).key !== CURRENT_MONTH) return false;
  }
  // Semana ISO sobre start_date
  if (CURRENT_WEEK) {
    if (String(isoWeek(new Date(v.start_date))) !== CURRENT_WEEK) return false;
  }
  // Empalmes-only se filtra luego en renderList()
  return true;
}

// Render agrupado por mes del start_date
function renderList() {
  if (!VAC_DATA || VAC_DATA.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    return;
  }

  let rows = VAC_DATA.filter(v => passesAllFilters(v));
  if (OVERLAPS_ONLY) rows = rows.filter(v => OVERLAP_ID_SET.has(v.id));

  if (rows.length === 0) {
    vacList.innerHTML = "<p>Sin resultados para el filtro seleccionado.</p>";
    return;
  }

  rows.sort((a,b) => new Date(a.start_date) - new Date(b.start_date));

  const groups = new Map();
  for (const v of rows) {
    const { key, label } = monthYearKey(v.start_date);
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(v);
  }

  let html = "";
  for (const { label, items } of groups.values()) {
    html += `<h3 style="margin:16px 0 8px 0;">${escapeHtml(label)}:</h3>\n`;
    for (const v of items) {
      const e = EMP_BY_ID[v.employee_id] || {};
      const nombre = pick(e, NAME_CANDIDATES) ?? `Empleado ${String(v.employee_id).slice(0, 8)}`;
      const bodega = normalizeBodegaForUI(pick(e, WH_CANDIDATES) ?? "-");
      const rol    = e.rol ?? "";
      const depto  = e.departamento ?? "";
      const loc    = e.localizacion ?? "";
      const cls    = (v.status || "").toLowerCase();
      const overlapMark = OVERLAP_ID_SET.has(v.id) ? ` <span class="badge overlap">Empalme</span>` : "";
      const weekTag = String(isoWeek(new Date(v.start_date)));

      html += `
        <div class="vac-item">
          <div>
            <strong>${escapeHtml(nombre)}</strong>
            ${rol ? `<span style="color:#555;">(${escapeHtml(rol)})</span>` : ""}
            (${escapeHtml(String(bodega))})${overlapMark}<br>
            ${depto ? `Depto: ${escapeHtml(depto)} • ` : ""}${loc ? `Loc: ${escapeHtml(loc)} • ` : ""}Sem ${escapeHtml(weekTag)}<br>
            ${escapeHtml(v.start_date)} → ${escapeHtml(v.end_date)}<br>
            Estado: <span class="badge ${cls}">${escapeHtml(v.status)}</span>
          </div>
          <div>
            ${
              v.status !== "Aprobado"
                ? `<button onclick="authorize('${v.id}')">✅ Autorizar</button>`
                : `<button onclick="unapprove('${v.id}')">↩️ Desaprobar</button>`
            }
            <button onclick="reject('${v.id}')">❌ Rechazar</button>
            <button onclick="editDate('${v.id}', '${v.start_date}', '${v.end_date}')">🗓 Editar</button>
            <button onclick="deleteVac('${v.id}')">🗑</button>
          </div>
        </div>
      `;
    }
  }

  vacList.innerHTML = html;
}

// ───────────────────────────────────────────────────────────────────────────────
// Acciones vacaciones (RPC)
// ───────────────────────────────────────────────────────────────────────────────
window.authorize = async (id) => {
  if (!confirm("¿Autorizar esta solicitud (forzando reglas si es necesario)?")) return;

  // 1) Intentar BYPASS de aprobación, si existe
  let okForce = false;
  try {
    const { data, error } = await supabase.rpc("vacation_requests_approve_admin_force", { req_id: id });
    if (!error && data === true) okForce = true;
  } catch(_e){}

  if (!okForce) {
    // 2) Fallback: aprobación normal
    const { data, error } = await supabase.rpc("vacation_requests_approve", { req_id: id });
    if (error || data !== true) { alert("No se pudo autorizar: " + (error?.message || "RPC devolvió falso")); return; }
  }
  await loadVacations();
};

window.unapprove = async (id) => {
  const { data, error } = await supabase.rpc("vacation_requests_unapprove", { req_id: id });
  if (error || data !== true) { alert("No se pudo desaprobar: " + (error?.message || "RPC devolvió falso")); return; }
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
  const { data, error } = await supabase.rpc("vacation_requests_update_dates", { req_id: id, new_start: newStart, new_end: newEnd });
  if (error || data !== true) { alert("No se pudo editar: " + (error?.message || "RPC devolvió falso")); return; }
  await loadVacations();
};

window.deleteVac = async (id) => {
  if (!confirm("¿Eliminar esta solicitud?")) return;
  const { data, error } = await supabase.rpc("vacation_requests_delete_admin", { req_id: id });
  if (error || data !== true) { console.error("Error al eliminar solicitud:", error); alert("No se pudo eliminar: " + (error?.message || "RPC devolvió falso")); return; }
  await loadVacations();
};

// ───────────────────────────────────────────────────────────────────────────────
// Empleados (catálogo): carga, índices para filtros dependientes y resto de UI
// ───────────────────────────────────────────────────────────────────────────────
function showEmpMsg(text, ok = false) {
  if (!empMsg) return;
  empMsg.textContent = text || "";
  empMsg.className = "msg " + (ok ? "ok" : "err");
}

function normalizeText(v){ return (v == null ? "" : String(v)).trim().toLowerCase(); }
function compareText(a,b){ const aa=normalizeText(a), bb=normalizeText(b); return aa<bb?-1:aa>bb?1:0; }
function compareDate(a,b){
  if (!a && !b) return 0; if (!a) return -1; if (!b) return 1;
  const da=new Date(a), db=new Date(b); return da<db?-1:da>db?1:0;
}
function getEmpSortLabel(field, label){ if (EMP_SORT_FIELD!==field) return escapeHtml(label); const arrow = EMP_SORT_DIR==="asc"?"▲":"▼"; return `${escapeHtml(label)} ${arrow}`; }

// Buscador
if (empSearch) {
  let t = null;
  empSearch.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { EMP_FILTER_TEXT = (empSearch.value || "").trim().toLowerCase(); renderEmployeesAdmin(); }, 150);
  });
}

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
  buildIndexesFromEmployees(EMP_DATA);   // ← llena ALL_BODEGAS/ALL_DEPTOS/ALL_LOCS
  refreshBodegaOptionsByLocDept();       // ← reconstruye #f-bodega según loc/depto actuales
  renderEmployeesAdmin();
}

function renderEmployeesAdmin() {
  if (!empList) return;
  if (!EMP_DATA || EMP_DATA.length === 0) { empList.innerHTML = "<p>No hay empleados registrados.</p>"; return; }

  let data = EMP_DATA;
  if (EMP_FILTER_TEXT) data = EMP_DATA.filter(e => (e.nombre || "").toLowerCase().includes(EMP_FILTER_TEXT));

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
        <td>${escapeHtml(normalizeBodegaForUI(e.bodega) || "")}</td>
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
      <tbody>${rows}</tbody>
    </table>
  `;

  const ths = empList.querySelectorAll("th[data-sort]");
  ths.forEach(th => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const field = th.getAttribute("data-sort");
      if (!field) return;
      if (EMP_SORT_FIELD === field) { EMP_SORT_DIR = (EMP_SORT_DIR === "asc" ? "desc" : "asc"); }
      else { EMP_SORT_FIELD = field; EMP_SORT_DIR = "asc"; }
      renderEmployeesAdmin();
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Alta directa de vacaciones
// ───────────────────────────────────────────────────────────────────────────────
function showVacMsg(text, ok=false) {
  if (!vacFormMsg) return;
  vacFormMsg.textContent = text || "";
  vacFormMsg.className = "msg " + (ok ? "ok" : "err");
}

// Autocomplete simple
if (vacEmpSearch) {
  let t = null;
  vacEmpSearch.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = (vacEmpSearch.value||"").trim().toLowerCase();
      if (!q) { vacEmpSuggest.innerHTML=""; vacEmpId.value=""; return; }
      const hits = (EMP_DATA||[]).filter(e => (e.nombre||"").toLowerCase().includes(q)).slice(0, 8);
      if (hits.length===0) { vacEmpSuggest.innerHTML=""; return; }
      const list = hits.map(h => `
        <div class="suggest-item" data-id="${h.id}" data-name="${(h.nombre||"").replace(/"/g,'&quot;')}">
          ${escapeHtml(h.nombre||"")} <small>(${escapeHtml(normalizeBodegaForUI(h.bodega)||"-")}, ${escapeHtml(h.rol||"-")})</small>
        </div>`).join("");
      vacEmpSuggest.innerHTML = `<div class="suggest-menu" style="position:absolute; z-index:10; background:#fff; border:1px solid #ddd; width:100%;">${list}</div>`;
      vacEmpSuggest.querySelectorAll(".suggest-item").forEach(item=>{
        item.addEventListener("click", ()=>{
          vacEmpId.value = item.getAttribute("data-id");
          vacEmpSearch.value = item.getAttribute("data-name");
          vacEmpSuggest.innerHTML="";
        });
      });
    }, 150);
  });
}

// presets semana (lunes-sábado)
document.querySelectorAll("button.preset")?.forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const kind = btn.dataset.preset;
    const today = new Date();
    const day = today.getDay(); // 0..6
    const mondayOffset = (day===0? -6 : (1-day));
    let base = new Date(today); base.setDate(today.getDate()+mondayOffset);
    if (kind==="next-week") base.setDate(base.getDate()+7);
    const start = new Date(base);
    const end = new Date(base); end.setDate(end.getDate()+5);
    vacStart.value = start.toISOString().slice(0,10);
    vacEnd.value   = end.toISOString().slice(0,10);
  });
});

// Acción rápida desde tabla empleados
window.empQuickVacation = (id, nombre) => {
  if (!vacEmpId || !vacEmpSearch) return;
  vacEmpId.value = id;
  vacEmpSearch.value = nombre || "";
  vacEmpSearch.focus();
  showVacMsg(`Empleado seleccionado: ${nombre}`, true);
};

// Crear pendiente (con bypass si existe)
if (vacCreateBtn) {
  vacCreateBtn.addEventListener("click", async ()=>{
    showVacMsg("");
    const empId = (vacEmpId?.value||"").trim();
    const s = (vacStart?.value||"").trim();
    const e = (vacEnd?.value||"").trim();
    if (!empId || !s || !e) { showVacMsg("Falta empleado, inicio o fin.", false); return; }

    let createdId = null;
    try {
      const { data, error } = await supabase.rpc("vacation_requests_create_admin_force", { emp_id: empId, s, e, auto_approve: false });
      if (!error && data) createdId = data;
    } catch(_e){}

    if (!createdId) {
      const { data, error } = await supabase.rpc("vacation_requests_create", { emp_id: empId, s, e });
      if (error || !data) { showVacMsg("Error al crear: "+(error?.message||"RPC devolvió nulo"), false); return; }
      createdId = data;
    }

    showVacMsg("Solicitud creada (Pendiente).", true);
    await loadVacations();
  });
}

// Crear y autorizar (bypass end-to-end si está disponible)
if (vacCreateApproveBtn) {
  vacCreateApproveBtn.addEventListener("click", async ()=>{
    showVacMsg("");
    const empId = (vacEmpId?.value||"").trim();
    const s = (vacStart?.value||"").trim();
    const e = (vacEnd?.value||"").trim();
    if (!empId || !s || !e) { showVacMsg("Falta empleado, inicio o fin.", false); return; }

    let createdId = null, usedBypass = false;
    try {
      const { data, error } = await supabase.rpc("vacation_requests_create_admin_force", { emp_id: empId, s, e, auto_approve: true });
      if (!error && data) { createdId = data; usedBypass = true; }
    } catch(_e){}

    if (!createdId) {
      const { data: newId, error: err1 } = await supabase.rpc("vacation_requests_create", { emp_id: empId, s, e });
      if (err1 || !newId) { showVacMsg("Error al crear: "+(err1?.message||"RPC devolvió nulo"), false); return; }

      // Aprobar con bypass si existe; si no, normal
      let approved = false;
      try {
        const { data: okForce, error: errF } = await supabase.rpc("vacation_requests_approve_admin_force", { req_id: newId });
        if (!errF && okForce === true) approved = true;
      } catch(_e){}
      if (!approved) {
        const { data: ok, error: err2 } = await supabase.rpc("vacation_requests_approve", { req_id: newId });
        if (err2 || ok !== true) { showVacMsg("Creado, pero no se pudo autorizar: "+(err2?.message||"RPC devolvió falso"), false); await loadVacations(); return; }
      }
      showVacMsg("Solicitud creada y autorizada.", true);
      await loadVacations();
      return;
    }

    if (usedBypass) {
      showVacMsg("Solicitud creada y autorizada (forzada).", true);
      await loadVacations();
    }
  });
}
