import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// 🔐 Contraseña de administrador
const ADMIN_PASSWORD = "limsa2026";

// Elementos del DOM
const loginScreen = document.getElementById("login-screen");
const adminPanel = document.getElementById("admin-panel");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const refreshBtn = document.getElementById("refresh-btn");
const vacList = document.getElementById("vac-list");
const errorMsg = document.getElementById("login-error");

// 🎯 Inicio de sesión
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

// 🚪 Cerrar sesión
logoutBtn.addEventListener("click", () => {
  adminPanel.classList.add("hidden");
  loginScreen.classList.remove("hidden");
});

// 🔄 Refrescar lista
refreshBtn.addEventListener("click", loadVacations);

// 🧾 Cargar solicitudes con datos del empleado (join explícito por el FK)
async function loadVacations() {
  vacList.innerHTML = "<p>Cargando...</p>";

  const { data, error } = await supabase
    .from("vacation_requests")
    .select(`
      id,
      start_date,
      end_date,
      status,
      created_at,
      employees:employees!vacation_requests_employee_id_fkey (
        id,
        nombre,
        bodega
      )
    `)
    .order("start_date", { ascending: true });

  if (error) {
    vacList.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    vacList.innerHTML = "<p>No hay solicitudes registradas.</p>";
    return;
  }

  vacList.innerHTML = data
    .map((v) => {
      const emp = v.employees || {};
      const nombre = emp.nombre ?? "Sin nombre";
      const bodega = emp.bodega ?? "-";
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
    })
    .join("");
}

// ✅ Autorizar solicitud (status válido según tu CHECK)
window.authorize = async (id) => {
  const { error } = await supabase
    .from("vacation_requests")
    .update({ status: "Aprobado" })
    .eq("id", id);
  if (error) alert("Error: " + error.message);
  else loadVacations();
};

// ❌ Rechazar solicitud
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
  const newEnd = prompt("Nueva fecha de fin (YYYY-MM-DD):", end);
  if (!newStart || !newEnd) return;

  const { error } = await supabase
    .from("vacation_requests")
    .update({
      start_date: newStart,
      end_date: newEnd,
    })
    .eq("id", id);

  if (error) alert("Error: " + error.message);
  else loadVacations();
};

// 🗑 Eliminar solicitud
window.deleteVac = async (id) => {
  if (!confirm("¿Eliminar esta solicitud?")) return;
  const { error } = await supabase
    .from("vacation_requests")
    .delete()
    .eq("id", id);

  if (error) alert("Error: " + error.message);
  else loadVacations();
};
