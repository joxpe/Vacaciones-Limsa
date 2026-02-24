// admin-panel.js (vacaciones + empleados con orden, alta, importar, editar y borrar)
// RPCs vacaciones (SECURITY DEFINER):
//   vacation_requests_delete_admin(req_id uuid) -> boolean
//   vacation_requests_approve(req_id uuid) -> boolean
//   vacation_requests_reject(req_id uuid) -> boolean
//   vacation_requests_update_dates(req_id uuid, new_start date, new_end date) -> boolean
//   vacation_requests_unapprove(req_id uuid) -> boolean
//   vacation_requests_create(emp_id uuid, s date, e date) -> uuid
//   vacation_requests_create_admin_force(emp_id uuid, s date, e date, auto_approve boolean DEFAULT false) -> uuid
//   (opcional para bypass al aprobar) vacation_requests_approve_admin_force(req_id uuid) -> boolean
//
// RPCs empleados (SECURITY DEFINER):
//   employees_insert_admin(p_nombre text, p_bodega text, p_departamento text, p_localizacion text, p_rol text, p_fecha_ingreso date) -> uuid
//   employees_import_admin(p_rows jsonb) -> integer
//   employees_update_admin(p_id uuid, p_nombre text, p_bodega text, p_departamento text, p_localizacion text, p_rol text, p_fecha_ingreso date) -> boolean
//   employees_delete_admin(p_id uuid) -> boolean

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ───────────────────────────────────────────────────────────────────────────────
// Config
// ───────────────────────────────────────────────────────────────────────────────
const LOCAL_PASSWORD = "limsa2026";
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

function normTxt(s){
  return (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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
const fEmpInput  = $("#f-emp");             // filtro texto empleado

// Layout v2
const summaryChips = $("#summary-chips");
const tabSolicitudes = $("#tab-solicitudes");
const tabEmpleados   = $("#tab-empleados");
const sectionSolicitudes = $("#section-solicitudes");
const sectionEmpleados   = $("#section-empleados");
const quickFilters = $("#quick-filters");
const vacDetail = $("#vac-detail");
const filtersBtn = $("#filters-btn");
const filtersDrawer = $("#filters-drawer");
const filtersClose = $("#filters-close");
const filtersApply = $("#filters-apply");
const filtersClear = $("#filters-clear");


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
const empSearch      = $("#emp-search");   // 🔎 buscador de nombres

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

let CURRENT_BODEGAS = [];   // multiselección de bodegas
let CURRENT_DEPTO   = "";   // "", o departamento exacto
let CURRENT_LOC     = "";   // "", o localización exacta
let CURRENT_ROLES   = [];   // [], o lista de roles seleccionados
let CURRENT_STATUS  = "";   // "", "Aprobado", "Rechazado"
let CURRENT_MONTH   = "";   // "", o "YYYY-MM"
let CURRENT_WEEK    = "";   // "", o número 1..53 (string)
let CURRENT_EMP_Q  = "";   // texto en empleado
let OVERLAPS_ONLY   = false;
let CROSS_ONLY      = false;
let OVERLAP_ID_SET  = new Set();

// Orden empleados + filtro de texto
let EMP_SORT_FIELD   = "nombre";
let EMP_SORT_DIR     = "asc";
let EMP_FILTER_TEXT  = "";

// ───────────────────────────────────────────────────────────────────────────────
// Login local
// ───────────────────────────────────────────────────────────────────────────────
loginBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";
  const pass = $("#admin-pass").value.trim();
  if (pass !== LOCAL_PASSWORD) { errorMsg.textContent = "Contraseña incorrecta"; return; }
  loginScreen.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  loadVacations();
  loadEmployeesAdmin();
});

logoutBtn.addEventListener("click", () => {
  adminPanel.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

refreshBtn.addEventListener("click", () => {
  loadVacations();
  loadEmployeesAdmin();
});

// ───────────────────────────────────────────────────────────────────────────────
// Layout v2: Tabs + Drawer + Detalle lateral
// ───────────────────────────────────────────────────────────────────────────────
function setTab(which) {
  const solicitudes = which === "solicitudes";
  if (tabSolicitudes) tabSolicitudes.classList.toggle("active", solicitudes);
  if (tabEmpleados) tabEmpleados.classList.toggle("active", !solicitudes);
  if (sectionSolicitudes) sectionSolicitudes.classList.toggle("hidden", !solicitudes);
  if (sectionEmpleados) sectionEmpleados.classList.toggle("hidden", solicitudes);
  if (quickFilters) quickFilters.classList.toggle("hidden", !solicitudes);
  if (tabSolicitudes) tabSolicitudes.setAttribute("aria-selected", String(solicitudes));
  if (tabEmpleados) tabEmpleados.setAttribute("aria-selected", String(!solicitudes));
}

if (tabSolicitudes) tabSolicitudes.addEventListener("click", () => setTab("solicitudes"));
if (tabEmpleados) tabEmpleados.addEventListener("click", () => setTab("empleados"));

function openDrawer() {
  if (!filtersDrawer) return;
  filtersDrawer.classList.add("open");
  filtersDrawer.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  if (!filtersDrawer) return;
  filtersDrawer.classList.remove("open");
  filtersDrawer.setAttribute("aria-hidden", "true");
}
if (filtersBtn) filtersBtn.addEventListener("click", openDrawer);
if (filtersClose) filtersClose.addEventListener("click", closeDrawer);
if (filtersDrawer) {
  filtersDrawer.addEventListener("click", (e) => {
    const t = e.target;
    if (t && (t.dataset.close === "1" || t.getAttribute("data-close") === "1")) closeDrawer();
  });
}
if (filtersApply) filtersApply.addEventListener("click", () => { closeDrawer(); renderList(); });
if (filtersClear) filtersClear.addEventListener("click", () => {
  // Reset estado filtros
  CURRENT_BODEGAS = []; CURRENT_DEPTO = ""; CURRENT_LOC = ""; CURRENT_ROLES = [];
  CURRENT_STATUS = ""; CURRENT_MONTH = ""; CURRENT_WEEK = ""; OVERLAPS_ONLY = false; CROSS_ONLY = false;
  CURRENT_EMP_Q = "";

  // Reset UI
  if (fEmpInput) fEmpInput.value = "";
  if (fStatusSel) fStatusSel.value = "";
  if (fMonthSel) fMonthSel.value = "";
  if (fWeekSel) fWeekSel.value = "";
  if (fDeptoSel) fDeptoSel.value = "";
  if (fLocSel) fLocSel.value = "";
  if (fOverlapsCb) fOverlapsCb.checked = false;
  if (fCrossOnly) fCrossOnly.checked = false;
  if (fBodegaSel) Array.from(fBodegaSel.options).forEach(o => o.selected = false);
  if (fRolSel) Array.from(fRolSel.options).forEach(o => o.selected = false);

  rebuildBodegaOptionsCascading();
  computeOverlaps();
  renderList();
});

function openVacDetail(id) {
  if (!vacDetail) return;
  const v = (VAC_DATA || []).find(x => String(x.id) === String(id));
  if (!v) return;
  const e = EMP_BY_ID[v.employee_id] || {};
  const nombre = pick(e, NAME_CANDIDATES) ?? `Empleado ${String(v.employee_id).slice(0, 8)}`;
  const bodega = pick(e, WH_CANDIDATES) ?? "-";
  const rol    = (e.rol ?? "").trim();
  const depto  = (e.departamento ?? "").trim();
  const loc    = (e.localizacion ?? "").trim();
  const cls = (v.status || "").toLowerCase();

  vacDetail.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
      <div>
        <div style="font-size:12px; color:#64748b; font-weight:800; letter-spacing:.04em; text-transform:uppercase;">Detalle</div>
        <div style="font-size:16px; font-weight:900; margin-top:4px;">${escapeHtml(nombre)}</div>
        <div class="hint" style="margin-top:4px;">${escapeHtml(String(bodega))}${rol ? ` · ${escapeHtml(rol)}` : ""}</div>
      </div>
      <span class="badge ${cls}" style="height:fit-content;">${escapeHtml(v.status)}</span>
    </div>

    <div style="margin-top:12px;">
      <div><b>Fechas:</b> ${escapeHtml(v.start_date)} → ${escapeHtml(v.end_date)}</div>
      ${depto ? `<div><b>Departamento:</b> ${escapeHtml(depto)}</div>` : ""}
      ${loc ? `<div><b>Localización:</b> ${escapeHtml(loc)}</div>` : ""}
      ${OVERLAP_ID_SET.has(v.id) ? `<div style="margin-top:6px;"><span class="badge overlap">Empalme</span></div>` : ""}
    </div>

    <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
      ${v.status !== "Aprobado" ? `<button type="button" onclick="authorize('${v.id}')">✅ Autorizar</button>` : `<button type="button" onclick="reject('${v.id}')">❌ Rechazar</button>`}
      <button type="button" onclick="editDate('${v.id}', '${v.start_date}', '${v.end_date}')">🗓 Editar</button>
      <button type="button" onclick="deleteVac('${v.id}')">🗑 Eliminar</button>
    </div>

    <p class="hint" style="margin-top:12px;">Selecciona otra solicitud para ver su detalle.</p>
  `;

  // marcar seleccionado
  document.querySelectorAll(".vac-row[data-selected='1']").forEach(el => el.removeAttribute("data-selected"));
  const rowEl = document.querySelector(`.vac-row[data-vacid='${CSS.escape(String(id))}']`);
  if (rowEl) rowEl.setAttribute("data-selected", "1");
}

if (vacList) {
  vacList.addEventListener("click", (e) => {
    const row = e.target.closest?.(".vac-row");
    if (!row) return;
    if (e.target.closest?.("button")) return; // no abrir detalle si fue botón
    openVacDetail(row.getAttribute("data-vacid"));
  });
}


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

// Filtro por empleado (texto)
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

  // 1) Solicitudes
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
  if (VAC_DATA.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    populateFilters(); // aún así, inicializa filtros
    return;
  }

  // 2) Empleados (solo los que tienen solicitudes)
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

  // 3) Filtros (incluye Mes / Semana / Localización y cascada de Bodega)
  populateFilters();

  // 4) Empalmes (según filtros)
  computeOverlaps();

  // 5) Render
  renderList();
}

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
  if (!vacList) return;

  if (!VAC_DATA || VAC_DATA.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    if (summaryChips) summaryChips.innerHTML = "";
    if (vacDetail) vacDetail.innerHTML = `<div class="detail-empty"><p><b>Selecciona una solicitud</b> para ver el detalle aquí.</p></div>`;
    return;
  }

  // 1) Filtros
  let rows = VAC_DATA.filter(v => {
    if (!passesAllFiltersBasic(v)) return false;
    if (OVERLAPS_ONLY && !OVERLAP_ID_SET.has(v.id)) return false;
    return true;
  });

  // 2) KPIs (sobre el filtro actual)
  if (summaryChips) {
    const counts = { Pendiente: 0, Aprobado: 0, Rechazado: 0 };
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

    // "Hoy" (si el rango toca hoy)
    const today = new Date().toISOString().slice(0,10);
    const hoy = rows.filter(r => (r.start_date <= today && today <= r.end_date) && r.status === "Aprobado").length;

    summaryChips.innerHTML = `
      <span class="chip">Pendientes: <b>${counts.Pendiente || 0}</b></span>
      <span class="chip">Aprobadas: <b>${counts.Aprobado || 0}</b></span>
      <span class="chip">Rechazadas: <b>${counts.Rechazado || 0}</b></span>
      <span class="chip">En vacaciones hoy: <b>${hoy}</b></span>
    `;
  }

  if (rows.length === 0) {
    vacList.innerHTML = "<p>Sin resultados para el filtro seleccionado.</p>";
    return;
  }

  // 3) Ordenar por start_date
  rows.sort((a,b) => new Date(a.start_date) - new Date(b.start_date));

  // 4) Agrupar por estatus y por mes (visual)
  const orderStatus = ["Pendiente", "Aprobado", "Rechazado"];
  const groupsByStatus = new Map(orderStatus.map(s => [s, []]));
  for (const v of rows) (groupsByStatus.get(v.status) || groupsByStatus.set(v.status, []).get(v.status)).push(v);

  const buildMonthBuckets = (items) => {
    const m = new Map(); // key -> {label, items}
    for (const v of items) {
      const { key, label } = monthYearKey(v.start_date);
      if (!m.has(key)) m.set(key, { label, items: [] });
      m.get(key).items.push(v);
    }
    return Array.from(m.values());
  };

  const sectionLabel = (s) => s === "Aprobado" ? "Aprobadas" : (s === "Rechazado" ? "Rechazadas" : "Pendientes");

  let html = "";
  for (const st of orderStatus) {
    const items = groupsByStatus.get(st) || [];
    const openAttr = st === "Pendiente" ? " open" : "";
    html += `<details class="vac-section"${openAttr}>
      <summary>${escapeHtml(sectionLabel(st))} <span class="muted">(${items.length})</span></summary>
      <div>`;
    if (items.length === 0) {
      html += `<p class="hint" style="margin:10px 0 0;">Sin elementos.</p>`;
    } else {
      const monthBuckets = buildMonthBuckets(items);
      for (const bucket of monthBuckets) {
        html += `<div class="vac-month">${escapeHtml(bucket.label)}</div>`;
        for (const v of bucket.items) {
          const e = EMP_BY_ID[v.employee_id] || {};
          const nombre = pick(e, NAME_CANDIDATES) ?? `Empleado ${String(v.employee_id).slice(0, 8)}`;
          const bodega = pick(e, WH_CANDIDATES) ?? "-";
          const rol    = (e.rol ?? "").trim();
          const depto  = (e.departamento ?? "").trim();
          const loc    = (e.localizacion ?? "").trim();
          const cls = (v.status || "").toLowerCase();
          const overlapMark = OVERLAP_ID_SET.has(v.id) ? ` <span class="badge overlap">Empalme</span>` : "";

          html += `
            <div class="vac-row" data-vacid="${escapeHtml(v.id)}">
              <div class="vac-mainline">
                <div class="vac-title">
                  <strong>${escapeHtml(nombre)}</strong>
                  ${rol ? `<span class="hint">(${escapeHtml(rol)})</span>` : ""}
                  <span class="hint">${escapeHtml(String(bodega))}${overlapMark}</span>
                </div>
                <div class="vac-sub">
                  ${depto ? `Depto: ${escapeHtml(depto)} · ` : ""}${loc ? `Loc: ${escapeHtml(loc)} · ` : ""}
                  ${escapeHtml(v.start_date)} → ${escapeHtml(v.end_date)} ·
                  <span class="badge ${cls}">${escapeHtml(v.status)}</span>
                </div>
              </div>
              <div class="vac-actions">
                ${
                  v.status !== "Aprobado"
                    ? `<button type="button" onclick="authorize('${v.id}')">✅ Autorizar</button>`
                    : `<button type="button" onclick="reject('${v.id}')">❌ Rechazar</button>`
                }
                <button type="button" onclick="editDate('${v.id}', '${v.start_date}', '${v.end_date}')">🗓 Editar</button>
                <button type="button" onclick="deleteVac('${v.id}')">🗑</button>
              </div>
            </div>
          `;
        }
      }
    }
    html += `</div></details>`;
  }

  vacList.innerHTML = html;
}

// ───────────────────────────────────────────────────────────────────────────────
/** Acciones por RPC (vacaciones) */
// ───────────────────────────────────────────────────────────────────────────────
window.authorize = async (id) => {
  if (!confirm("¿Autorizar esta solicitud (forzando reglas si es necesario)?")) return;

  // 1) Intentar RPC forzada si existe
  let okForce = false;
  try {
    const { data, error } = await supabase.rpc("vacation_requests_approve_admin_force", { req_id: id });
    if (!error && data === true) okForce = true;
  } catch(_e) { /* puede no existir la función */ }

  if (!okForce) {
    // 2) Fallback a la autorización normal
    const { data, error } = await supabase.rpc("vacation_requests_approve", { req_id: id });
    if (error || data !== true) { alert("No se pudo autorizar: " + (error?.message || "RPC devolvió falso")); return; }
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
function compareText(a, b) { const aa = normalizeText(a), bb = normalizeText(b); return aa<bb?-1:aa>bb?1:0; }
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
    const ing    = (empIng?.value || "").trim(); // YYYY-MM-DD

    if (!nombre || !ing) {
      showEmpMsg("Nombre y fecha de ingreso son obligatorios.", false);
      return;
    }

    const { data, error } = await supabase.rpc("employees_insert_admin", {
      p_nombre:        nombre,
      p_bodega:        bodega || null,
      p_departamento:  depto  || null,
      p_localizacion:  loc    || null,
      p_rol:           rol    || null,
      p_fecha_ingreso: ing
    });

    if (error) {
      console.error("Error al insertar empleado:", error);
      showEmpMsg("No se pudo dar de alta: " + (error.message || ""), false);
      return;
    }

    showEmpMsg("Empleado dado de alta correctamente.", true);
    if (empNombre) empNombre.value = "";
    if (empBod)    empBod.value    = "";
    if (empDepto)  empDepto.value  = "";
    if (empLoc)    empLoc.value    = "";
    if (empRol)    empRol.value    = "";
    if (empIng)    empIng.value    = "";

    await loadEmployeesAdmin();
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

        if (!nombre || !ingreso) continue;

        const rec = {
          nombre: nombre.trim(),
          fecha_ingreso: ingreso.trim()
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

// Autocomplete simple con EMP_DATA
if (vacEmpSearch) {
  let t = null;
  vacEmpSearch.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = (vacEmpSearch.value||"").trim().toLowerCase();
      if (!q) { vacEmpSuggest.innerHTML=""; vacEmpId.value=""; return; }

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
  vacEmpSearch.focus();
  showVacMsg(`Empleado seleccionado: ${nombre}`, true);
};

// Crear pendiente (BYPASS si está disponible)
if (vacCreateBtn) {
  vacCreateBtn.addEventListener("click", async ()=>{
    showVacMsg("");
    const empId = (vacEmpId?.value||"").trim();
    const s = (vacStart?.value||"").trim();
    const e = (vacEnd?.value||"").trim();
    if (!empId || !s || !e) { showVacMsg("Falta empleado, inicio o fin.", false); return; }

    // 1) Intentar bypass
    let createdId = null;
    try {
      const { data, error } = await supabase.rpc("vacation_requests_create_admin_force", {
        emp_id: empId, s, e, auto_approve: false
      });
      if (!error && data) {
        createdId = data;
      }
    } catch(_e){ /* puede no existir */ }

    if (!createdId) {
      // 2) Fallback a create normal
      const { data, error } = await supabase.rpc("vacation_requests_create", {
        emp_id: empId, s, e
      });
      if (error || !data) { showVacMsg("Error al crear: "+(error?.message||"RPC devolvió nulo"), false); return; }
      createdId = data;
    }

    showVacMsg("Solicitud creada (Pendiente).", true);
    await loadVacations();
  });
}

// Crear y autorizar (BYPASS end-to-end si está disponible)
if (vacCreateApproveBtn) {
  vacCreateApproveBtn.addEventListener("click", async ()=>{
    showVacMsg("");
    const empId = (vacEmpId?.value||"").trim();
    const s = (vacStart?.value||"").trim();
    const e = (vacEnd?.value||"").trim();
    if (!empId || !s || !e) { showVacMsg("Falta empleado, inicio o fin.", false); return; }

    // 1) Intentar create + approve en un paso con bypass
    let createdId = null, usedBypass = false;
    try {
      const { data, error } = await supabase.rpc("vacation_requests_create_admin_force", {
        emp_id: empId, s, e, auto_approve: true
      });
      if (!error && data) {
        createdId = data;
        usedBypass = true;
      }
    } catch(_e){ /* puede no existir */ }

    if (!createdId) {
      // 2) Fallback a create normal
      const { data: newId, error: err1 } = await supabase.rpc("vacation_requests_create", {
        emp_id: empId, s, e
      });
      if (err1 || !newId) { showVacMsg("Error al crear: "+(err1?.message||"RPC devolvió nulo"), false); return; }

      // 3) Intentar aprobar con bypass; si no existe, aprobar normal
      let approved = false;
      try {
        const { data: okForce, error: errF } = await supabase.rpc("vacation_requests_approve_admin_force", { req_id: newId });
        if (!errF && okForce === true) approved = true;
      } catch(_e){ /* puede no existir */ }

      if (!approved) {
        const { data: ok, error: err2 } = await supabase.rpc("vacation_requests_approve", { req_id: newId });
        if (err2 || ok !== true) { showVacMsg("Creado, pero no se pudo autorizar: "+(err2?.message||"RPC devolvió falso"), false); await loadVacations(); return; }
      }

      showVacMsg("Solicitud creada y autorizada.", true);
      await loadVacations();
      return;
    }

    // Si se usó bypass one-shot:
    if (usedBypass) {
      showVacMsg("Solicitud creada y autorizada (forzada).", true);
      await loadVacations();
    }
  });
}
