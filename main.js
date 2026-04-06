// main.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const LIMSA_LOGO_DATA_URL = "data:image/png;base64,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";

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
const $antig    = document.getElementById('v-antig');

let EMPLOYEES = [];
let CURRENT_EMP = null;

// ==== Utilidades ====
function showMsg(text, ok=false){
  $msg.textContent = text || '';
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
function fmtLong(d){
  if(!d) return '-';
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dt = m ? new Date(Date.UTC(+m[1], +m[2]-1, +m[3])) : new Date(s);
  if (isNaN(dt)) return s;
  return dt.toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}
function fmtDateTime(d){
  if(!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
function norm(s){
  return (s || "").toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
function escapeHtml(s){
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function initials(nombre){
  const p = String(nombre || '').split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase();
}
function yearsMonthsLabel(fromISO, toDate = new Date()){
  if(!fromISO) return '0.00';
  const s = String(fromISO);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const start = m ? new Date(Date.UTC(+m[1], +m[2]-1, +m[3])) : new Date(s);
  if (isNaN(start)) return '0.00';

  let totalMonths = (toDate.getUTCFullYear() - start.getUTCFullYear()) * 12
                  + (toDate.getUTCMonth() - start.getUTCMonth());
  const dayStart = start.getUTCDate();
  const dayNow   = toDate.getUTCDate();
  if (dayNow < dayStart) totalMonths -= 1;
  if (totalMonths < 0) totalMonths = 0;

  const years  = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  return `${years}.${String(months).padStart(2, '0')}`;
}

function lastDayOfMonth(date){
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function toISO(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

async function loadJsPdf(){
  const mod = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
  return mod.jsPDF || mod.default?.jsPDF || mod.default;
}

function buildSafeFilename(name){
  return String(name || 'vale_vacaciones').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

// ==== Render helpers ====
function renderEmployees(list){
  if(!list || list.length === 0){
    $emp.innerHTML = '<option value="">(Sin coincidencias)</option>';
    return;
  }
  $emp.innerHTML =
    '<option value="">Selecciona tu nombre…</option>' +
    list.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
}
function renderWarehouses(){
  const coll = new Intl.Collator('es-MX');
  const uniq = Array.from(new Set(EMPLOYEES.map(e => e.bodega ?? '(Sin bodega)'))).sort(coll.compare);
  $wh.innerHTML = [
    `<option value="">Todas las bodegas</option>`,
    ...uniq.map(b => `<option value="${b}">${b}</option>`)
  ].join('');
}

function applyFilter(){
  const q = norm($search.value);
  const selectedBod = $wh.value;

  let list = EMPLOYEES;
  if (selectedBod) {
    list = list.filter(e => (e.bodega ?? '(Sin bodega)') === selectedBod);
  }
  if (q) {
    list = list.filter(e => norm(e.nombre).includes(q));
  }
  renderEmployees(list);
}

async function loadEmployees(){
  const rpc = await supabase.rpc('employees_public_v2');

  if (rpc.error || !Array.isArray(rpc.data)) {
    showMsg('Error cargando colaboradores: ' + (rpc.error?.message || 'sin datos'));
    return;
  }

  EMPLOYEES = rpc.data.map(r => ({
    id: r.id,
    nombre: r.nombre,
    bodega: r.bodega ?? null,
    departamento: r.departamento ?? null,
    localizacion: r.localizacion ?? null
  }));

  renderWarehouses();
  applyFilter();
  showMsg('', true);
}

async function loadEmployeeInfo(empId){
  if (empId !== CURRENT_EMP) return;

  const { data: infoArr, error: e1 } = await supabase.rpc('employees_info', { emp_id: empId });
  if (empId !== CURRENT_EMP) return;
  if(e1){ showMsg('No se pudo leer información del colaborador: ' + e1.message); return; }
  const info = (infoArr && infoArr[0]) ? infoArr[0] : null;

  const { data: sumArr, error: e2 } = await supabase.rpc('employees_vac_summary_2026', { emp_id: empId });
  if (empId !== CURRENT_EMP) return;
  if(e2){ showMsg('No se pudo leer el resumen de vacaciones: ' + e2.message); return; }
  const summary = (sumArr && sumArr[0]) ? sumArr[0] : {
    cupo_2026: 0, usado_2026: 0, restante_2026: 0, elegible_desde: null, restante_visible: 0, cupo_visible: 0
  };

  $loc.textContent      = info?.localizacion ?? '-';
  $dep.textContent      = info?.departamento ?? '-';
  $bod.textContent      = info?.bodega ?? '-';
  $ingreso.textContent  = fmt(info?.fecha_ingreso);

  if ($antig) {
    $antig.textContent = yearsMonthsLabel(info?.fecha_ingreso, new Date());
  }

  const cupoVis = (typeof summary?.cupo_visible === 'number')
    ? summary.cupo_visible
    : (info?.cupo_2026 ?? summary?.cupo_2026 ?? 0);
  $cupo.textContent  = cupoVis;
  $usado.textContent = (summary?.usado_2026 ?? 0);

  const restVis = (typeof summary?.restante_visible === 'number')
    ? summary.restante_visible
    : (summary?.restante_2026 ?? 0);
  $restante.textContent = restVis;

  showMsg('', true);
  $empInfo.hidden = false;
}

async function generateVacationPdf(reqId){
  try {
    showMsg('Generando PDF…', true);

    const { data, error } = await supabase.rpc('vacation_request_prepare_pdf', { req_id: reqId });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) throw new Error('No se recibieron datos para el PDF.');

    const jsPDF = await loadJsPdf();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

    const pageW = 279.4;
    const pageH = 215.9;

    doc.setDrawColor(70);
    doc.setLineWidth(0.7);
    doc.roundedRect(7, 7, pageW - 14, pageH - 14, 4, 4);

    try {
      doc.addImage(LIMSA_LOGO_DATA_URL, 'PNG', 13, 12, 60, 17);
    } catch (_e) {
      // Si algo inesperado pasa con la imagen, el PDF sigue.
    }

    doc.setFont('times', 'bold');
    doc.setFontSize(19);
    doc.text('VALE DE VACACIONES', pageW / 2, 20, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Folio: ${row.folio || '-'}`, pageW - 12, 14, { align: 'right' });
    doc.text(`Impresión: ${fmtDateTime(row.printed_at)}`, pageW - 12, 20, { align: 'right' });

    let y = 42;
    const xLabel = 18;
    function lineField(label, value, xVal, lineEnd){
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(label, xLabel, y);

      doc.setFont('helvetica', 'normal');
      doc.text(String(value ?? ''), xVal, y);

      doc.line(xVal - 1, y + 1.7, lineEnd, y + 1.7);
      y += 15;
    }

    lineField('NOMBRE', row.nombre, 82, 255);
    lineField('FECHA DE INGRESO', fmtLong(row.fecha_ingreso), 82, 158);
    lineField('DÍAS QUE CORRESPONDEN EN EL AÑO VIGENTE', row.dias_corresponden, 150, 188);
    lineField('DÍAS A DISFRUTAR (PERIODO)', row.dias_disfrutar, 115, 175);
    lineField('A PARTIR DEL', fmtLong(row.start_date), 82, 155);
    lineField('HASTA EL', fmtLong(row.end_date), 82, 155);
    lineField('REGRESANDO A LABORAR EL DÍA', fmtLong(row.return_date), 155, 225);

    const sigY = 182;
    const leftX = 45;
    const centerX = pageW / 2;
    const rightX = pageW - 45;
    const sigW = 68;

    function signLine(cx, label){
      doc.line(cx - sigW/2, sigY, cx + sigW/2, sigY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(label, cx, sigY + 6, { align: 'center' });
    }

    signLine(leftX, 'FIRMA DEL COLABORADOR');
    signLine(centerX, 'FIRMA DE PERSONAL');
    signLine(rightX, 'FIRMA DEL JEFE');

    const fileName = `${row.folio || 'vale_vacaciones'}_${buildSafeFilename(row.nombre)}.pdf`;
    doc.save(fileName);

    showMsg(`PDF generado. Folio ${row.folio || '-'}.`, true);
    if ($emp.value === CURRENT_EMP) {
      await loadMine(CURRENT_EMP);
    }
  } catch (err) {
    showMsg('No se pudo generar el PDF: ' + (err?.message || JSON.stringify(err)));
  }
}

async function loadMine(empId){
  if (empId !== CURRENT_EMP) return;

  $my.innerHTML = 'Cargando…';

  let rows = null, err = null;
  const rpc = await supabase.rpc('vacation_requests_get', { emp_id: empId });
  if (empId !== CURRENT_EMP) return;

  if(!rpc.error && rpc.data){
    rows = rpc.data;
  } else {
    const s = await supabase
      .from('vacation_requests')
      .select('id, employee_id, start_date, end_date, status, created_at, pdf_folio, printed_at, print_count')
      .eq('employee_id', empId)
      .gte('start_date', '2026-01-01')
      .lte('end_date', '2026-12-31')
      .order('start_date', { ascending: true });
    if (empId !== CURRENT_EMP) return;
    rows = s.data; err = s.error;
  }


  let coveragesByReq = {};
  if (!err && rows?.length) {
    try {
      const { data: covRows, error: covErr } = await supabase.rpc('vacation_request_coverages_for_employee', { p_emp_id: empId });
      if (!covErr) {
        for (const c of (covRows || [])) {
          if (!coveragesByReq[c.request_id]) coveragesByReq[c.request_id] = [];
          coveragesByReq[c.request_id].push(c);
        }
        for (const reqId of Object.keys(coveragesByReq)) {
          coveragesByReq[reqId].sort((a,b) => String(a.cover_start_date).localeCompare(String(b.cover_start_date)));
        }
      }
    } catch(_e) {}
  }

  if(err){
    $my.textContent = 'Error: ' + (err.message || JSON.stringify(err));
    return;
  }
  if(!rows || rows.length === 0){
    $my.textContent = 'Sin solicitudes para 2026.';
    return;
  }

  $my.innerHTML = rows.map(r => {
    const days = (typeof r.biz_days === 'number') ? r.biz_days : null;
    const daysTxt = (days !== null) ? ` (${days} días)` : '';
    const canDelete = (r.status === 'Pendiente');
    const canPrint = (r.status === 'Aprobado');
    const delBtn = canDelete ? `<button class="btn-link" data-del="${r.id}">Borrar</button>` : '';
    const pdfLabel = r.pdf_folio ? 'Reimprimir solicitud PDF' : 'Generar solicitud de Vacaciones en PDF';
    const pdfBtn = canPrint ? `<button class="btn-link" data-pdf="${r.id}">${pdfLabel}</button>` : '';
    const printInfo = r.pdf_folio
      ? `<small>Folio: ${escapeHtml(r.pdf_folio)} · Impreso: ${escapeHtml(fmtDateTime(r.printed_at))} · Impresiones: ${escapeHtml(r.print_count ?? 0)}</small>`
      : '';

    const reqCoverages = coveragesByReq[r.id] || [];
    const coverInfo = (r.status === 'Aprobado')
      ? (reqCoverages.length
          ? `<div><small>Coberturas:</small><div>${reqCoverages.map(c => `<small>• <strong>${escapeHtml(c.cover_name || '')}</strong> (${escapeHtml(initials(c.cover_name || ''))}) — ${escapeHtml(c.cover_start_date)} a ${escapeHtml(c.cover_end_date)}</small>`).join('<br>')}</div>`
          : `<div><small>Coberturas: <strong>Sin cobertura</strong></small></div>`)
      : '';

    return `
      <div class="req">
        <div><strong>${fmt(r.start_date)} → ${fmt(r.end_date)}</strong>${daysTxt}</div>
        <small>Estado: ${escapeHtml(r.status)}</small>
        ${coverInfo}
        ${printInfo ? `<div>${printInfo}</div>` : ''}
        <div class="req-actions">${delBtn} ${pdfBtn}</div>
      </div>
    `;
  }).join('');

  $my.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const reqId = ev.currentTarget.getAttribute('data-del');
      if(!confirm('¿Borrar esta solicitud pendiente?')) return;

      const { data, error } = await supabase.rpc('vacation_requests_delete', {
        req_id: reqId,
        emp_id: $emp.value
      });
      if(error){
        showMsg('No se pudo borrar: ' + (error.message || JSON.stringify(error)));
        return;
      }
      showMsg(data ? 'Solicitud borrada.' : 'No se pudo borrar (¿ya no está Pendiente?).', !!data);
      if ($emp.value === CURRENT_EMP) {
        await loadMine(CURRENT_EMP);
        await loadEmployeeInfo(CURRENT_EMP);
      }
    });
  });

  $my.querySelectorAll('[data-pdf]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const reqId = ev.currentTarget.getAttribute('data-pdf');
      await generateVacationPdf(reqId);
    });
  });
}

async function submitRequest(){
  const empId = $emp.value;
  const s = $start.value;
  const t = $end.value;
  if(!empId) return showMsg('Selecciona tu nombre.');
  if(!s || !t) return showMsg('Completa las fechas.');
  if(s > t) return showMsg('La fecha de inicio no puede ser posterior al fin.');

  $submit.disabled = true;

  const ins = await supabase.rpc('vacation_requests_create', { emp_id: empId, s, e: t });
  if(ins.error){
    const { error } = await supabase
      .from('vacation_requests')
      .insert({ employee_id: empId, start_date: s, end_date: t, status: 'Pendiente' });
    if(error){
      showMsg('No se pudo registrar: ' + (error.message || JSON.stringify(error)));
      $submit.disabled = false;
      return;
    }
  }

  showMsg('Solicitud registrada correctamente.', true);
  await loadMine(empId);
  await loadEmployeeInfo(empId);
  $submit.disabled = false;
}

// ==== Eventos UI ====
$search.addEventListener('input', applyFilter);
$search.addEventListener('keydown', (ev) => {
  if(ev.key === 'Enter'){
    const opts = $emp.querySelectorAll('option');
    if(opts.length > 1 && opts[1].value){
      $emp.value = opts[1].value;
      $emp.dispatchEvent(new Event('change'));
    }
  }
});

$wh.addEventListener('change', () => {
  $emp.value = '';
  CURRENT_EMP = null;
  $empInfo.hidden = true;
  $my.innerHTML = '';
  showMsg('', true);
  $start.value = '';
  $end.value = '';
  applyFilter();
});

$emp.addEventListener('change', async (e) => {
  const id = e.target.value;

  $empInfo.hidden = true;
  $my.innerHTML = '';
  showMsg('', true);
  $start.value = '';
  $end.value = '';
  $submit.disabled = !!id;

  if(id){
    CURRENT_EMP = id;
    $my.textContent = 'Cargando…';
    await loadEmployeeInfo(id);
    await loadMine(id);
    if ($emp.value === CURRENT_EMP) $submit.disabled = false;
  } else {
    CURRENT_EMP = null;
    $submit.disabled = false;
  }
});

$start.addEventListener('change', () => {
  const s = $start.value;
  if(!s) return;

  const [yy, mm, dd] = s.split('-').map(Number);
  const startDate = new Date(yy, mm-1, dd);

  const candidate = new Date(startDate);
  candidate.setDate(candidate.getDate() + 3);

  if (candidate.getMonth() !== startDate.getMonth() || candidate.getFullYear() !== startDate.getFullYear()) {
    const eom = lastDayOfMonth(startDate);
    candidate.setFullYear(eom.getFullYear(), eom.getMonth(), eom.getDate());
  }

  const startISO = toISO(startDate);
  const endISO   = toISO(candidate);
  $end.min = startISO;
  $end.value = endISO;

  if (typeof $end.showPicker === 'function') {
    try { $end.showPicker(); } catch(_ ) {}
  } else {
    $end.focus();
  }
});

$submit.addEventListener('click', submitRequest);

loadEmployees();
