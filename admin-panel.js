// admin-panel.js (versión simple con filtro + delete por RPC como main.js)
// - Usa solo la anon key (no Auth).
// - Contraseña local: "limsa2026"
// - Carga solicitudes + empleados (2 consultas, sin JOIN).
// - Filtro por bodega.
// - Autorizar/Rechazar/Editar por update().
// - Borrar por RPC: vacation_requests_delete(req_id, emp_id)

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ───────────────────────────────────────────────────────────────────────────────
// Ajustes
// ───────────────────────────────────────────────────────────────────────────────
const LOCAL_PASSWORD = "limsa2026";

// Detectores genéricos de columnas en employees
const NAME_CANDIDATES = ["nombre", "name", "full_name", "display_name", "empleado"];
const WH_CANDIDATES   = ["bodega", "warehouse", "almacen", "site", "location", "ubicacion"];

const $  = (sel) => document.querySelector(sel);
const pick = (obj, keys) => {
  for (const k of keys) if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  return undefined;
};
const escapeHtml = (s) =>
  String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
           .replaceAll('"',"&quot;").replaceAll("'","&#039;");

// ───────────────────────────────────────────────────────────────────────────────
// UI
// ───────────────────────────────────────────────────────────────────────────────
const loginScreen = $("#login-screen");
const adminPanel  = $("#admin-panel");
const loginBtn    = $("#login-btn");
const logoutBtn   = $("#logout-btn");
const refreshBtn  = $("#refresh-btn");
const vacList     = $("#vac-list");
const errorMsg    = $("#login-error");
const fBodegaSel  = $("#f-bodega");

// Estado en memoria
let VAC_DATA = [];       // solicitudes
let EMP_BY_ID = {};      // mapa empleado -> datos
let CURRENT_BODEGA = ""; // filtro actual

// Login local
loginBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";
  const pass = $("#admin-pass").value.trim();
  if (pass !== LOCAL_PASSWORD) { errorMsg.textContent = "Contraseña incorrecta"; return; }
  loginScreen.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  loadVacations();
});

logoutBtn.addEventListener("click", () => {
  adminPanel.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

refreshBtn.addEventListener("click", loadVacations);

// Cambio de filtro
if (fBodegaSel) {
  fBodegaSel.addEventListener("change", () => {
    CURRENT_BODEGA = fBodegaSel.value || "";
    renderList();
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// Carga de datos
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
  if (VAC_DATA.length === 0) { vacList.innerHTML = "<p>No hay solicitudes registradas.</p>"; return; }

  // 2) Empleados
  const empIds = [...new Set(VAC_DATA.map(v => v.employee_id).filter(Boolean))];
  EMP_BY_ID = {};
  if (empIds.length > 0) {
    const { data: emps, error: err2 } = await supabase
      .from("employees")
      .select("*")
      .in("id", empIds);

    if (err2) {
      console.warn("No se pudieron cargar empleados:", err2.message);
    } else if (emps) {
      for (const e of emps) EMP_BY_ID[e.id] = e;
    }
  }

  populateBodegaFilter();
  renderList();
}

// Llena el combo de bodega con valores únicos
function populateBodegaFilter() {
  if (!fBodegaSel) return;

  const bodegasSet = new Set();
  for (const emp of Object.values(EMP_BY_ID)) {
    const bod = pick(emp, WH_CANDIDATES);
    if (bod) bodegasSet.add(String(bod));
  }

  const current = CURRENT_BODEGA;
  const opts = [`<option value="">Todas</option>`];
  [...bodegasSet].sort((a,b) => a.localeCompare(b, 'es')).forEach(b => {
    const sel = (b === current) ? ' selected' : '';
    opts.push(`<option value="${escapeHtml(b)}"${sel}>${escapeHtml(b)}</option>`);
  });

  fBodegaSel.innerHTML = opts.join("");
  if (current && !bodegasSet.has(current)) CURRENT_BODEGA = "";
}

// Render con filtro
function renderList() {
  if (!VAC_DATA || VAC_DATA.length === 0) { vacList.innerHTML = "<p>No hay solicitudes registradas.</p>"; return; }

  const rows = VAC_DATA
    .filter(v => {
      if (!CURRENT_BODEGA) return true;
      const e = EMP_BY_ID[v.employee_id] || {};
      const bod = pick(e, WH_CANDIDATES) ?? "";
      return String(bod) === CURRENT_BODEGA;
    })
    .map(v => {
      const e = EMP_BY_ID[v.employee_id] || {};
      const nombre = pick(e, NAME_CANDIDATES) ?? `Empleado ${String(v.employee_id).slice(0, 8)}`;
      const bodega = pick(e, WH_CANDIDATES)   ?? "-";
      const cls = (v.status || "").toLowerCase();
      return `
        <div class="vac-item">
          <div>
            <strong>${escapeHtml(nombre)}</strong> (${escapeHtml(String(bodega))})<br>
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
    });

  vacList.innerHTML = rows.length ? rows.join("") : "<p>Sin resultados para el filtro seleccionado.</p>";
}

// ───────────────────────────────────────────────────────────────────────────────
// Acciones (update/delete)
// ───────────────────────────────────────────────────────────────────────────────
window.authorize = async (id) => {
  if (!confirm("¿Autorizar esta solicitud?")) return;
  const { error } = await supabase
    .from("vacation_requests")
    .update({ status: "Aprobado" })
    .eq("id", id);
  if (error) alert("No se pudo autorizar: " + error.message);
  else loadVacations();
};

window.reject = async (id) => {
  if (!confirm("¿Rechazar esta solicitud?")) return;
  const { error } = await supabase
    .from("vacation_requests")
    .update({ status: "Rechazado" })
    .eq("id", id);
  if (error) alert("No se pudo rechazar: " + error.message);
  else loadVacations();
};

window.editDate = async (id, start, end) => {
  const newStart = prompt("Nueva fecha de inicio (YYYY-MM-DD):", start);
  const newEnd   = prompt("Nueva fecha de fin (YYYY-MM-DD):", end);
  if (!newStart || !newEnd) return;

  const { error } = await supabase
    .from("vacation_requests")
    .update({ start_date: newStart, end_date: newEnd })
    .eq("id", id);

  if (error) alert("No se pudo editar: " + error.message);
  else loadVacations();
};

// Borrado REAL usando el mismo RPC que main.js
window.deleteVac = async (id) => {
  if (!confirm("¿Eliminar esta solicitud?")) return;

  // Buscar employee_id en memoria
  const row = (VAC_DATA || []).find(v => v.id === id);
  const empId = row?.employee_id;
  if (!empId) { alert("No se pudo identificar al empleado de la solicitud."); return; }

  const { data, error } = await supabase.rpc("vacation_requests_delete", {
    req_id: id,
    emp_id: empId
  });

  if (error) {
    alert("No se pudo eliminar: " + (error.message || JSON.stringify(error)));
    return;
  }

  if (!data) {
    // RPC puede devolver null/false si no cumple condición (p.ej. no está Pendiente)
    alert("No se pudo eliminar: ¿la solicitud no está en estado permitido para eliminar?");
    return;
  }

  await loadVacations();
};
