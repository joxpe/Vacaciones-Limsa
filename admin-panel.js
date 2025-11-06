// admin-panel.js (bloques por mes + filtros + RPCs + passwd local)
// - Contraseña local: "limsa2026"
// - Usa anon key (sin Auth)
// - Acciones por RPC (SECURITY DEFINER):
//   vacation_requests_delete(req_id uuid, emp_id uuid) -> boolean
//   vacation_requests_approve(req_id uuid) -> boolean
//   vacation_requests_reject(req_id uuid) -> boolean
//   vacation_requests_update_dates(req_id uuid, new_start date, new_end date) -> boolean

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const LOCAL_PASSWORD = "limsa2026";

const NAME_CANDIDATES = ["nombre", "name", "full_name", "display_name", "empleado"];
const WH_CANDIDATES   = ["bodega", "warehouse", "almacen", "site", "location", "ubicacion"];

const $  = (sel) => document.querySelector(sel);
const pick = (obj, keys) => { for (const k of keys) if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k]; };
const escapeHtml = (s) => String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");

// Meses en español (capitalizados)
const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const monthYearKey = (isoDate) => {
  const d = new Date(isoDate);
  const y = d.getFullYear();
  const m = d.getMonth(); // 0..11
  return { key: `${y}-${String(m+1).padStart(2,"0")}`, label: `${MESES_ES[m]} ${y}` };
};

// UI
const loginScreen = $("#login-screen");
const adminPanel  = $("#admin-panel");
const loginBtn    = $("#login-btn");
const logoutBtn   = $("#logout-btn");
const refreshBtn  = $("#refresh-btn");
const vacList     = $("#vac-list");
const errorMsg    = $("#login-error");
const fBodegaSel  = $("#f-bodega");
const fStatusSel  = $("#f-status");
const fOverlapsCb = $("#f-overlaps");    // mostrar solo empalmes
const fCrossOnly  = $("#f-cross-only");  // limitar empalmes a "entre bodegas distintas"

// Estado
let VAC_DATA = [];
let EMP_BY_ID = {};
let CURRENT_BODEGA = "";        // "", o una bodega exacta
let CURRENT_STATUS = "";        // "", "Aprobado", "Rechazado"
let OVERLAPS_ONLY  = false;     // true -> solo solicitudes con empalme
let CROSS_ONLY     = false;     // true -> empalme solo si son de distintas bodegas
let OVERLAP_ID_SET = new Set(); // ids que tienen empalme según flags actuales

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

// Filtros
if (fBodegaSel) {
  fBodegaSel.addEventListener("change", () => {
    CURRENT_BODEGA = fBodegaSel.value || "";
    renderList();
  });
}
if (fStatusSel) {
  fStatusSel.addEventListener("change", () => {
    CURRENT_STATUS = fStatusSel.value || "";
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
    // Cambia el conjunto de empalmes: hay que recalcular
    computeOverlaps();
    renderList();
  });
}

// Carga de datos
async function loadVacations() {
  vacList.innerHTML = "<p>Cargando...</p>";

  // 1) Solicitudes
  const { data: vacs, error: err1 } = await supabase
    .from("vacation_requests")
    .select("id, employee_id, start_date, end_date, status, created_at")
    .order("start_date", { ascending: true });

  if (err1) { vacList.innerHTML = `<p style="color:red;">Error al leer solicitudes: ${err1.message}</p>`; console.error(err1); return; }
  VAC_DATA = vacs || [];
  if (VAC_DATA.length === 0) { vacList.innerHTML = "<p>No hay solicitudes registradas.</p>"; return; }

  // 2) Empleados
  const empIds = [...new Set(VAC_DATA.map(v => v.employee_id).filter(Boolean))];
  EMP_BY_ID = {};
  if (empIds.length > 0) {
    const { data: emps, error: err2 } = await supabase.from("employees").select("*").in("id", empIds);
    if (err2) console.warn("No se pudieron cargar empleados:", err2.message);
    else if (emps) for (const e of emps) EMP_BY_ID[e.id] = e;
  }

  // 3) Empalmes
  computeOverlaps();

  // 4) Bodegas + render
  populateBodegaFilter();
  renderList();
}

// Llena el combo de bodega
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

// Calcula empalmes según flags (CROSS_ONLY afecta el set)
function computeOverlaps() {
  OVERLAP_ID_SET = new Set();
  if (!VAC_DATA || VAC_DATA.length < 2) return;

  const items = VAC_DATA.map(v => {
    const e = EMP_BY_ID[v.employee_id] || {};
    const bodega = pick(e, WH_CANDIDATES) ?? "";
    return {
      id: v.id,
      bodega: String(bodega),
      s: new Date(v.start_date),
      e: new Date(v.end_date)
    };
  });

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (!a.bodega || !b.bodega) continue;

      // Aplica la restricción "solo entre bodegas distintas" si está activada
      if (CROSS_ONLY && a.bodega === b.bodega) continue;

      // Empalme si comparten al menos un día (incluye bordes)
      const startMax = (a.s > b.s) ? a.s : b.s;
      const endMin   = (a.e < b.e) ? a.e : b.e;
      if (startMax <= endMin) {
        OVERLAP_ID_SET.add(a.id);
        OVERLAP_ID_SET.add(b.id);
      }
    }
  }
}

// Render por BLOQUES de mes (Enero 2026, Febrero 2026, …)
function renderList() {
  if (!VAC_DATA || VAC_DATA.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    return;
  }

  // 1) Aplica filtros (bodega/estado/empalmes)
  let rows = VAC_DATA.filter(v => {
    if (CURRENT_BODEGA) {
      const e = EMP_BY_ID[v.employee_id] || {};
      const bod = pick(e, WH_CANDIDATES) ?? "";
      if (String(bod) !== CURRENT_BODEGA) return false;
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

  // 2) Ordena por fecha de inicio
  rows.sort((a,b) => new Date(a.start_date) - new Date(b.start_date));

  // 3) Agrupa por mes-año del start_date
  const groups = new Map(); // key -> { label, items: [] }
  for (const v of rows) {
    const { key, label } = monthYearKey(v.start_date);
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key).items.push(v);
  }

  // 4) Genera HTML por bloques
  let html = "";
  for (const { label, items } of groups.values()) {
    html += `<h3 style="margin:16px 0 8px 0;">${escapeHtml(label)}:</h3>\n`;
    for (const v of items) {
      const e = EMP_BY_ID[v.employee_id] || {};
      const nombre = pick(e, NAME_CANDIDATES) ?? `Empleado ${String(v.employee_id).slice(0, 8)}`;
      const bodega = pick(e, WH_CANDIDATES)   ?? "-";
      const cls = (v.status || "").toLowerCase();
      const overlapMark = OVERLAP_ID_SET.has(v.id) ? ` <span class="badge overlap">Empalme</span>` : "";
      html += `
        <div class="vac-item">
          <div>
            <strong>${escapeHtml(nombre)}</strong> (${escapeHtml(String(bodega))})${overlapMark}<br>
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

// ── Acciones por RPC ───────────────────────────────────────────────────────────
window.authorize = async (id) => {
  if (!confirm("¿Autorizar esta solicitud?")) return;
  const { data, error } = await supabase.rpc("vacation_requests_approve", { req_id: id });
  if (error || data !== true) { alert("No se pudo autorizar: " + (error?.message || "RPC devolvió falso")); return; }
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
  const { data, error } = await supabase.rpc("vacation_requests_update_dates", {
    req_id: id, new_start: newStart, new_end: newEnd
  });
  if (error || data !== true) { alert("No se pudo editar: " + (error?.message || "RPC devolvió falso")); return; }
  await loadVacations();
};

window.deleteVac = async (id) => {
  if (!confirm("¿Eliminar esta solicitud?")) return;
  const row = (VAC_DATA || []).find(v => v.id === id);
  const empId = row?.employee_id;
  if (!empId) { alert("No se pudo identificar al empleado de la solicitud."); return; }
  const { data, error } = await supabase.rpc("vacation_requests_delete", { req_id: id, emp_id: empId });
  if (error || data !== true) { alert("No se pudo eliminar: " + (error?.message || "RPC devolvió falso")); return; }
  await loadVacations();
};
