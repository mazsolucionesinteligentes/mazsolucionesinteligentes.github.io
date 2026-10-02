// Utilidades compartidas por las demos.
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const fmtARS = n => "$ " + Math.round(n).toLocaleString("es-AR");
const fmtARS2 = n => "$ " + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = n => (n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";

// Saca acentos y pasa a minúsculas para comparar texto libre.
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Muestra los pasos de la automatización uno por uno, con su tilde.
async function correrPasos(ul, pasos, ms = 520) {
  ul.innerHTML = pasos.map(p => `<li><span class="dot"></span>${esc(p)}</li>`).join("");
  const lis = $$("li", ul);
  for (const li of lis) {
    li.className = "run";
    await sleep(ms);
    li.className = "done";
  }
}

// Fecha de "hoy" fija para que las demos sean reproducibles.
const HOY = new Date(2026, 9, 1);
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const fmtFecha = d => d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

function descargarCSV(nombre, filas) {
  const csv = filas.map(f => f.map(v => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
