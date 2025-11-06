// admin-panel.js (versión simple + filtro por bodega)
// Contraseña local: "limsa2026" (no usa Supabase Auth)

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
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const pick = (obj, keys) => {
  for (const k of keys) if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  return undefined;
};

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

// Estado en memoria para renderizar rápido
let VAC_DATA = [];       // solicitudes
let EMP_BY_ID = {};      // mapa empleado -> datos
let CURRENT_BODEGA = ""; // filtro actual

// ───────────────────────────────────────────────────────────────────────────────
// Login local
// ───────────────────────────────────────────────────────────────────────────────
loginBtn.addEventListener("click", async () => {
  errorMsg.textContent = "";
  const pass = $("#admin-pass").value.trim();
  if (pass !== LOCAL_PASSWORD) {
    errorMsg.textContent = "Contraseña incorrecta";
    return;
  }
  loginScreen.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  loadVacations();
});

logoutBtn.addEventListener("click", () => {
  adminPanel.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

refreshBtn.addEventListener("click", loadVacations);

// Cambios del filtro
if (fBodegaSel) {
  fBodegaSel.addEventListener("change", () => {
    CURRENT_BODEGA = fBodegaSel.value || "";
    renderList();
  });
}

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

  // Poblar el combo de Bodega (único, ordenado)
  populateBodegaFilter();

  // Render inicial
  renderList();
}

// Llena el <select> de bodega con valores únicos
function populateBodegaFilter() {
  if (!fBodegaSel) return;

  const bodegasSet = new Set();
  for (const emp of Object.values(EMP_BY_ID)) {
    const bod = pick(emp, WH_CANDIDATES);
    if (bod) bodegasSet.add(String(bod));
  }

  // Mantener "Todas" y regenerar opciones
  const current = CURRENT_BODEGA;
  const opts = [`<option value="">Todas</option>`];

  [...bodegasSet].sort((a,b) => a.localeCompare(b, 'es')).forEach(b => {
    const sel = (b === current) ? ' selected' : '';
    opts.push(`<option value="${escapeHtml(b)}"${sel}>${escapeHtml(b)}</option>`);
  });

  fBodegaSel.innerHTML = opts.join("");
  // Si el filtro actual ya no existe, reset
  if (current && !bodegasSet.has(current)) {
    CURRENT_BODEGA = "";
  }
}

// Render de la lista aplicando el filtro
function renderList() {
  if (!VAC_DATA || VAC_DATA.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    return;
  }

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

// Pequeña ayuda para escapar HTML en strings
function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ───────────────────────────────────────────────────────────────────────────────
// Acciones
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

  if (error) {
    alert("No se pudo editar: " + error.message);
  } else {
    loadVacations();
  }
};

window.deleteVac = async (id) => {
  if (!confirm("¿Eliminar esta solicitud?")) return;

  const { error } = await supabase
    .from("vacation_requests")
    .delete()
    .eq("id", id);

  if (error) {
    alert("No se pudo eliminar: " + error.message);
  } else {
    loadVacations();
  }
};
