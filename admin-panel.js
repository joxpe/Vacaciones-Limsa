// admin-panel.js (vacaciones + empleados con orden, alta, importar, editar y borrar)
// RPCs vacaciones (SECURITY DEFINER):
//   vacation_requests_delete_admin(req_id uuid) -> boolean
//   vacation_requests_approve(req_id uuid) -> boolean
//   vacation_requests_reject(req_id uuid) -> boolean
//   vacation_requests_update_dates(req_id uuid, new_start date, new_end date) -> boolean
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
  return { key: `${y}-${String(m+1).padStart(2,"0")}`, label: `${MESES_ES[m]} ${y}` };
};

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

const fBodegaSel  = $("#f-bodega");
const fDeptoSel   = $("#f-depto");
const fRolSel     = $("#f-rol");
const fStatusSel  = $("#f-status");
const fOverlapsCb = $("#f-overlaps");    // mostrar solo empalmes
const fCrossOnly  = $("#f-cross-only");  // solo entre bodegas distintas

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

// ───────────────────────────────────────────────────────────────────────────────
// Estado
// ───────────────────────────────────────────────────────────────────────────────
let VAC_DATA = [];
let EMP_DATA = [];
let EMP_BY_ID = {};
let CURRENT_BODEGA = "";   // "", o bodega exacta
let CURRENT_DEPTO  = "";   // "", o departamento exacto
let CURRENT_ROLES  = [];   // [], o lista de roles seleccionados
let CURRENT_STATUS = "";   // "", "Aprobado", "Rechazado"
let OVERLAPS_ONLY  = false;   // true: solo solicitudes con empalme
let CROSS_ONLY     = false;   // true: empalme solo si son de distintas bodegas (sin filtro de bodega)
let OVERLAP_ID_SET = new Set(); // ids que tienen empalme según filtros actuales

// Orden empleados
let EMP_SORT_FIELD = "nombre";  // nombre, bodega, departamento, localizacion, rol, fecha_ingreso
let EMP_SORT_DIR   = "asc";     // "asc" | "desc"

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
  loadEmployeesAdmin();   // también cargamos empleados
});

logoutBtn.addEventListener("click", () => {
  adminPanel.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

refreshBtn.addEventListener("click", () => {
  loadVacations();
  loadEmployeesAdmin();
});

// Filtros vacaciones
if (fBodegaSel) {
  fBodegaSel.addEventListener("change", () => {
    CURRENT_BODEGA = fBodegaSel.value || "";
    computeOverlaps();
    renderList();
  });
}

// Filtro departamento
if (fDeptoSel) {
  fDeptoSel.addEventListener("change", () => {
    CURRENT_DEPTO = fDeptoSel.value || "";
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

  // 3) Filtros (bodega/departamento/rol) según empleados con solicitudes
  populateFilters();

  // 4) Empalmes (según filtros bodega/depto/rol/estado y flag cross-only)
  computeOverlaps();

  // 5) Render
  renderList();
}

// Llena combos de bodega, departamento y rol
function populateFilters() {
  const bodegasSet = new Set();
  const deptosSet  = new Set();
  const rolesSet   = new Set();

  for (const emp of Object.values(EMP_BY_ID)) {
    const bod = pick(emp, WH_CANDIDATES);
    if (bod) bodegasSet.add(String(bod));
    if (emp.departamento) deptosSet.add(String(emp.departamento).trim());
    if (emp.rol)          rolesSet.add(String(emp.rol).trim());
  }

  // Bodega
  if (fBodegaSel) {
    const current = CURRENT_BODEGA;
    const opts = [`<option value="">Todas</option>`];
    [...bodegasSet].sort((a,b) => a.localeCompare(b, "es")).forEach(b => {
      const sel = (b === current) ? " selected" : "";
      opts.push(`<option value="${escapeHtml(b)}"${sel}>${escapeHtml(b)}</option>`);
    });
    fBodegaSel.innerHTML = opts.join("");
    if (current && !bodegasSet.has(current)) CURRENT_BODEGA = "";
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

  // Rol (multiselección)
  if (fRolSel) {
    const selectedSet = new Set(CURRENT_ROLES);
    const options = [];

    [...rolesSet].sort((a,b) => a.localeCompare(b, "es")).forEach(r => {
      const sel = selectedSet.has(r) ? " selected" : "";
      options.push(`<option value="${escapeHtml(r)}"${sel}>${escapeHtml(r)}</option>`);
    });

    fRolSel.innerHTML = options.join("");

    // Limpiar roles que ya no existan
    CURRENT_ROLES = CURRENT_ROLES.filter(r => rolesSet.has(r));
  }
}

// Calcula empalmes usando SOLO el subconjunto que pasa filtros de BODEGA/DEPTO/ROLES/ESTADO
function computeOverlaps() {
  OVERLAP_ID_SET = new Set();
  if (!VAC_DATA || VAC_DATA.length < 2) return;

  const subset = VAC_DATA.filter(v => {
    const e = EMP_BY_ID[v.employee_id] || {};

    if (CURRENT_BODEGA) {
      const bod = pick(e, WH_CANDIDATES) ?? "";
      if (String(bod) !== CURRENT_BODEGA) return false;
    }
    if (CURRENT_DEPTO) {
      const dep = e.departamento ?? "";
      if (String(dep) !== CURRENT_DEPTO) return false;
    }
    if (CURRENT_ROLES && CURRENT_ROLES.length > 0) {
      const rol = (e.rol ?? "").trim();
      if (!CURRENT_ROLES.includes(rol)) return false;
    }
    if (CURRENT_STATUS) {
      if ((v.status || "") !== CURRENT_STATUS) return false;
    }
    return true;
  });

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

  const crossOnlyActive = CROSS_ONLY && !CURRENT_BODEGA;

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

// Render por bloques de MES
function renderList() {
  if (!VAC_DATA || VAC_DATA.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    return;
  }

  // 1) Filtros (bodega/depto/roles/estado/empalmes)
  let rows = VAC_DATA.filter(v => {
    const e = EMP_BY_ID[v.employee_id] || {};

    if (CURRENT_BODEGA) {
      const bod = pick(e, WH_CANDIDATES) ?? "";
      if (String(bod) !== CURRENT_BODEGA) return false;
    }
    if (CURRENT_DEPTO) {
      const dep = e.departamento ?? "";
      if (String(dep) !== CURRENT_DEPTO) return false;
    }
    if (CURRENT_ROLES && CURRENT_ROLES.length > 0) {
      const rol = (e.rol ?? "").trim();
      if (!CURRENT_ROLES.includes(rol)) return false;
    }
    if (CURRENT_STATUS) {
      if ((v.status || "") !== CURRENT_STATUS) return false;
    }
    if (OVERLAPS_ONLY && !OVERLAP_ID_SET.has(v.id)) return false;
    return true;
  });

  if (rows.length === 0) {
    vacList.innerHTML = "<p>Sin resultados para el filtro seleccionado.</p>";
    return;
  }

  // 2) Ordenar por start_date
  rows.sort((a,b) => new Date(a.start_date) - new Date(b.start_date));

  // 3) Agrupar por mes-año del start_date
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
      const cls = (v.status || "").toLowerCase();
      const overlapMark = OVERLAP_ID_SET.has(v.id) ? ` <span class="badge overlap">Empalme</span>` : "";

      html += `
        <div class="vac-item">
          <div>
            <strong>${escapeHtml(nombre)}</strong>
            ${rol ? `<span style="color:#555;">(${escapeHtml(rol)})</span>` : ""}
            (${escapeHtml(String(bodega))})${overlapMark}<br>
            ${depto ? `Depto: ${escapeHtml(depto)}<br>` : ""}
            ${escapeHtml(v.start_date)} → ${escapeHtml(v.end_date)}<br>
            Estado: <span class="badge ${cls}">${escapeHtml(v.status)}</span>
          </div>
          <div>
            ${
              v.status !== "Aprobado"
                ? `<button onclick="authorize('${v.id}')">✅ Autorizar</button>`
                : `<button onclick="reject('${v.id}')">❌ Rechazar</button>`
            }
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
// Acciones por RPC (vacaciones)
// ───────────────────────────────────────────────────────────────────────────────
window.authorize = async (id) => {
  if (!confirm("¿Autorizar esta solicitud?")) return;
  const { data, error } = await supabase.rpc("vacation_requests_approve", { req_id: id });
  if (error || data !== true) {
    alert("No se pudo autorizar: " + (error?.message || "RPC devolvió falso"));
    return;
  }
  await loadVacations();
};

window.reject = async (id) => {
  if (!confirm("¿Rechazar esta solicitud?")) return;
  const { data, error } = await supabase.rpc("vacation_requests_reject", { req_id: id });
  if (error || data !== true) {
    alert("No se pudo rechazar: " + (error?.message || "RPC devolvió falso"));
    return;
  }
  await loadVacations();
};

window.editDate = async (id, start, end) => {
  const newStart = prompt("Nueva fecha de inicio (YYYY-MM-DD):", start);
  const newEnd   = prompt("Nueva fecha de fin (YYYY-MM-DD):", end);
  if (!newStart || !newEnd) return;
  const { data, error } = await supabase.rpc("vacation_requests_update_dates", {
    req_id: id, new_start: newStart, new_end: newEnd
  });
  if (error || data !== true) {
    alert("No se pudo editar: " + (error?.message || "RPC devolvió falso"));
    return;
  }
  await loadVacations();
};

window.deleteVac = async (id) => {
  if (!confirm("¿Eliminar esta solicitud?")) return;

  const { data, error } = await supabase.rpc("vacation_requests_delete_admin", {
    req_id: id
  });

  if (error || data !== true) {
    console.error("Error al eliminar solicitud:", error);
    alert("No se pudo eliminar: " + (error?.message || "RPC devolvió falso"));
    return;
  }
  await loadVacations();
};

// ───────────────────────────────────────────────────────────────────────────────
// Empleados: carga, alta, import/export CSV, ordenamiento, editar/borrar
// ───────────────────────────────────────────────────────────────────────────────
function showEmpMsg(text, ok = false) {
  if (!empMsg) return;
  empMsg.textContent = text || "";
  empMsg.className = "msg " + (ok ? "ok" : "err");
}

// Helpers orden empleados
function normalizeText(v) {
  return (v == null ? "" : String(v)).trim().toLowerCase();
}

function compareText(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (aa < bb) return -1;
  if (aa > bb) return 1;
  return 0;
}

function compareDate(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const da = new Date(a);
  const db = new Date(b);
  if (da < db) return -1;
  if (da > db) return 1;
  return 0;
}

function getEmpSortLabel(field, label) {
  if (EMP_SORT_FIELD !== field) return escapeHtml(label);
  const arrow = EMP_SORT_DIR === "asc" ? "▲" : "▼";
  return `${escapeHtml(label)} ${arrow}`;
}

// Lee empleados desde la tabla employees (solo lectura, RLS debe permitir)
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

  const data = [...EMP_DATA];
  data.sort((a, b) => {
    let cmp = 0;
    switch (EMP_SORT_FIELD) {
      case "bodega":
        cmp = compareText(a.bodega, b.bodega);
        break;
      case "departamento":
        cmp = compareText(a.departamento, b.departamento);
        break;
      case "localizacion":
        cmp = compareText(a.localizacion, b.localizacion);
        break;
      case "rol":
        cmp = compareText(a.rol, b.rol);
        break;
      case "fecha_ingreso":
        cmp = compareDate(a.fecha_ingreso, b.fecha_ingreso);
        break;
      case "nombre":
      default:
        cmp = compareText(a.nombre, b.nombre);
        break;
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
