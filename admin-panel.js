import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// Cambia esta contraseña solo tú la sabrás:
const ADMIN_PASSWORD = "limsa2026";

const loginScreen = document.getElementById("login-screen");
const adminPanel = document.getElementById("admin-panel");
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const refreshBtn = document.getElementById("refresh-btn");
const vacList = document.getElementById("vac-list");
const errorMsg = document.getElementById("login-error");

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

async function loadVacations() {
  vacList.innerHTML = "<p>Cargando...</p>";
  const { data, error } = await supabase.from("vacaciones").select("*").order("fecha_inicio");
  if (error) {
    vacList.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
    return;
  }

  vacList.innerHTML = data.map(v => `
    <div class="vac-item">
      <div>
        <strong>${v.nombre}</strong> (${v.bodega})<br>
        ${v.fecha_inicio} → ${v.fecha_fin} <br>
        Estado: ${v.estado}
      </div>
      <div>
        <button onclick="authorize('${v.id}')">Autorizar</button>
        <button onclick="editDate('${v.id}', '${v.fecha_inicio}', '${v.fecha_fin}')">Editar</button>
        <button onclick="deleteVac('${v.id}')">🗑</button>
      </div>
    </div>
  `).join("");
}

window.authorize = async (id) => {
  await supabase.from("vacaciones").update({ estado: "AUTORIZADA" }).eq("id", id);
  loadVacations();
};

window.editDate = async (id, inicio, fin) => {
  const newStart = prompt("Nueva fecha de inicio:", inicio);
  const newEnd = prompt("Nueva fecha de fin:", fin);
  if (!newStart || !newEnd) return;
  await supabase.from("vacaciones").update({
    fecha_inicio: newStart,
    fecha_fin: newEnd
  }).eq("id", id);
  loadVacations();
};

window.deleteVac = async (id) => {
  if (confirm("¿Eliminar esta solicitud?")) {
    await supabase.from("vacaciones").delete().eq("id", id);
    loadVacations();
  }
};
