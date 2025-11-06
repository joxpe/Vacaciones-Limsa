import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// 🔐 Contraseña de administrador
const ADMIN_PASSWORD = "limsa2026";

// DOM
const loginScreen = document.getElementById("login-screen");
const adminPanel  = document.getElementById("admin-panel");
const loginBtn    = document.getElementById("login-btn");
const logoutBtn   = document.getElementById("logout-btn");
const refreshBtn  = document.getElementById("refresh-btn");
const vacList     = document.getElementById("vac-list");
const errorMsg    = document.getElementById("login-error");

// Utils para detectar columnas desconocidas
const pick = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return undefined;
};

// Campos posibles en employees
const NAME_CANDIDATES = ["nombre","name","full_name","display_name","empleado"];
const WH_CANDIDATES   = ["bodega","warehouse","almacen","site","location","ubicacion"];

// Login
loginBtn.addEventListener("click", () => {
  const pass = document.getElementById("admin-pass").value.trim();
  if (pass === ADMIN_PASSWORD) {
    loginScreen.classList.add("hidden");
    adminPanel.classList.remove("hidden");
    loadVacations();
  } else {
    errorMsg.textContent = "Contraseña incorrecta";
  }
});

logoutBtn.addEventListener("click", () => {
  adminPanel.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

refreshBtn.addEventListener("click", loadVacations);

// Cargar solicitudes + datos de empleados (2 consultas, sin join)
async function loadVacations() {
  vacList.innerHTML = "<p>Cargando...</p>";

  // 1) Solicitudes
  const { data: vacs, error: err1 } = await supabase
    .from("vacation_requests")
    .select("id,employee_id,start_date,end_date,status,created_at")
    .order("start_date", { ascending: true });

  if (err1) {
    vacList.innerHTML = `<p style="color:red;">Error: ${err1.message}</p>`;
    console.error(err1);
    return;
  }
  if (!vacs || vacs.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    return;
  }

  // 2) Empleados (ids únicos)
  const empIds = [...new Set(vacs.map(v => v.employee_id).filter(Boolean))];
  let empById = {};
  if (empIds.length > 0) {
    const { data: emps, error: err2 } = await supabase
      .from("employees")
      .select("*")
      .in("id", empIds);

    if (err2) {
      // No detenemos la UI; mostramos sin nombres si falla
      console.warn("No se pudieron cargar empleados:", err2.message);
    } else if (emps) {
      for (const e of emps) empById[e.id] = e;
    }
  }

  // Render
  vacList.innerHTML = vacs.map(v => {
    const e = empById[v.employee_id] || {};
    const nombre = pick(e, NAME_CANDIDATES) ?? `Empleado ${v.employee_id.slice(0,8)}`;
    const bodega = pick(e, WH_CANDIDATES) ?? "-";
    return `
      <div class="vac-item">
        <div>
          <strong>${nombre}</strong> (${bodega})<br>
          ${v.start_date} → ${v.end_date}<br>
          Estado: <b>${v.status}</b>
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
  }).join("");
}

// ✅ Aprobar (valores válidos: Propuesta, Pendiente, Aprobado, Rechazado)
window.authorize = async (id) => {
  const { error } = await supabase
    .from("vacation_requests")
    .update({ status: "Aprobado" })
    .eq("id", id);
  if (error) alert("Error: " + error.message);
  else loadVacations();
};

// ❌ Rechazar
window.reject = async (id) => {
  const { error } = await supabase
    .from("vacation_requests")
    .update({ status: "Rechazado" })
    .eq("id", id);
  if (error) alert("Error: " + error.message);
  else loadVacations();
};

// 🗓 Editar fechas
window.editDate = async (id, start, end) => {
  const newStart = prompt("Nueva fecha de inicio (YYYY-MM-DD):", start);
  const newEnd   = prompt("Nueva fecha de fin (YYYY-MM-DD):", end);
  if (!newStart || !newEnd) return;

  const { error } = await supabase
    .from("vacation_requests")
    .update({ start_date: newStart, end_date: newEnd })
    .eq("id", id);

  if (error) alert("Error: " + error.message);
  else loadVacations();
};

// 🗑 Eliminar
window.deleteVac = async (id) => {
  if (!confirm("¿Eliminar esta solicitud?")) return;
  const { error } = await supabase
    .from("vacation_requests")
    .delete()
    .eq("id", id);
  if (error) alert("Error: " + error.message);
  else loadVacations();
};
