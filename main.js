// main.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// ==== Elementos del DOM ====
const $wh      = document.getElementById('warehouse');
const $emp     = document.getElementById('employee');
const $search  = document.getElementById('search');
const $start   = document.getElementById('start');
const $end     = document.getElementById('end');
const $submit  = document.getElementById('submit');
const $msg     = document.getElementById('msg');
const $my      = document.getElementById('my-requests');
const $empInfo = document.getElementById('emp-info');

const $loc      = document.getElementById('v-localizacion');
const $dep      = document.getElementById('v-departamento');
const $bod      = document.getElementById('v-bodega');
const $ingreso  = document.getElementById('v-ingreso');
const $cupo     = document.getElementById('v-cupo');
const $usado    = document.getElementById('v-usado');
const $restante = document.getElementById('v-restante');

let EMPLOYEES = [];     // cache de empleados [{id, nombre, bodega, ...}]
let CURRENT_EMP = null; // empleado vigente (para bloquear renders desfasados)

// ==== Utilidades ====
function showMsg(text, ok=false){
  $msg.textContent = text;
  $msg.className = 'msg ' + (ok ? 'ok' : 'err');
}
function fmt(d){
  if(!d) return '-';
  if (d instanceof Date && !isNaN(d)) {
    return d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' });
  }
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const dt = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
    return dt.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' });
  }
  const dt = new Date(s);
  if (!isNaN(dt)) {
    return dt.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' });
  }
  return s;
}
function norm(s){
  return (s || "").toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// ==== Cálculo de días de vacaciones (LFT 2023) ====
function yearsCompleted(entryISO, onISO) {
  if (!entryISO || !onISO) return 0;
  const a = new Date(entryISO);
  const b = new Date(onISO);
  if (isNaN(a) || isNaN(b)) return 0;
  let y = b.getFullYear() - a.getFullYear();
  const beforeAnniv = (b.getMonth() < a.getMonth()) ||
                      (b.getMonth() === a.getMonth() && b.ge
