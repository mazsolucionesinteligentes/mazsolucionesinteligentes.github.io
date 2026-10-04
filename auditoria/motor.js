/**
 * MAZ Soluciones Inteligentes · Auditoría de suscripciones
 * Motor: lee movimientos (tablas de Excel/CSV o texto pegado de un PDF) y encuentra los cobros que se repiten.
 * Corre entero en el navegador: no manda nada a ningún lado.
 */
(function (raiz) {
  'use strict';

  const MESES = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
    sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };
  const NOMBRE_MES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Líneas que no son consumos: pagos, saldos, impuestos, intereses, devoluciones.
  const RE_NO_CONSUMO = /\b(su pago|pago en|pago tarjeta|saldo|total|subtotal|impuesto|iva\b|percep|db\.? ?rg|rg ?\d|ret\.|retenci|interes|sellos|iibb|ingresos brutos|bonif|devoluc|reintegro|credito por|ajuste|transferencia recibida|acreditaci|deposito|haberes|sueldo|limite|vencimiento|cierre|tasa|tna|tea|cft)\b/i;
  const RE_FECHA_INICIO = /^\s*(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{1,2}[-\/.]\d{1,2}(?:[-\/.]\d{2,4})?|\d{1,2}[\s\-.]*[a-zA-Z]{3}[a-zA-Z]*\.?(?:[\s\-.]*\d{2,4}\b)?)\s*/;
  const RE_CUOTA = /\b(c\.|cuota|cta\.?|cuo)\s*\d{1,2}\s*\/\s*\d{1,2}\b/i;
  const RE_PROCESADOR = /^(merpago|mercadopago|mercado pago|mp|paypal|dlo|dlocal|ebanx|payu|pagos360|stripe|2checkout|fs|sp|sq|tst|pago qr)\b\s*\*?\s*/i;

  // Servicios conocidos: nombre lindo, categoría (para detectar duplicados) y si es una suscripción segura.
  const CONOCIDOS = [
    [/netflix/, 'Netflix', 'Video'], [/spotify/, 'Spotify', 'Música'], [/youtube ?music/, 'YouTube Music', 'Música'],
    [/youtube|google \*?youtube/, 'YouTube Premium', 'Video'], [/disney/, 'Disney+', 'Video'], [/star ?\+|starplus/, 'Star+', 'Video'],
    [/\bhbo\b|\bmax\b/, 'Max (HBO)', 'Video'], [/prime ?video|amazon ?prime|primevideo/, 'Amazon Prime', 'Video'],
    [/paramount/, 'Paramount+', 'Video'], [/crunchyroll/, 'Crunchyroll', 'Video'], [/deezer/, 'Deezer', 'Música'],
    [/tidal/, 'Tidal', 'Música'], [/apple ?music/, 'Apple Music', 'Música'], [/icloud/, 'iCloud', 'Almacenamiento'],
    [/apple\.com|itunes|apple com bill/, 'Apple (App Store)', 'Apple'], [/google ?one|google ?storage/, 'Google One', 'Almacenamiento'],
    [/workspace|g ?suite|google \*?work/, 'Google Workspace', 'Ofimática'], [/(microsoft|msft|office)\W*365|microsoft\W*office/, 'Microsoft 365', 'Ofimática'],
    [/xbox/, 'Xbox', 'Juegos'], [/microsoft|msft/, null, 'Microsoft'],
    [/onedrive/, 'OneDrive', 'Almacenamiento'], [/dropbox/, 'Dropbox', 'Almacenamiento'], [/zoom/, 'Zoom', 'Videollamadas'],
    [/canva/, 'Canva', 'Diseño'], [/acrobat/, 'Adobe Acrobat', 'PDF'], [/adobe/, 'Adobe', 'Diseño'],
    [/ilovepdf/, 'iLovePDF', 'PDF'], [/smallpdf/, 'Smallpdf', 'PDF'], [/chatgpt|openai/, 'ChatGPT', 'IA'],
    [/anthropic|claude/, 'Claude', 'IA'], [/gemini/, 'Gemini', 'IA'], [/copilot/, 'Copilot', 'IA'],
    [/notion/, 'Notion', 'Gestión de proyectos'], [/trello|atlassian/, 'Trello / Atlassian', 'Gestión de proyectos'],
    [/asana/, 'Asana', 'Gestión de proyectos'], [/monday/, 'monday.com', 'Gestión de proyectos'], [/clickup/, 'ClickUp', 'Gestión de proyectos'],
    [/slack/, 'Slack', 'Chat de equipo'], [/figma/, 'Figma', 'Diseño'], [/github/, 'GitHub', 'Desarrollo'],
    [/mailchimp/, 'Mailchimp', 'Mail marketing'], [/hubspot/, 'HubSpot', 'CRM'], [/shopify/, 'Shopify', 'Tienda online'],
    [/tiendanube|nuvemshop/, 'Tiendanube', 'Tienda online'], [/wix/, 'Wix', 'Sitio web'], [/godaddy/, 'GoDaddy', 'Sitio web'],
    [/hostinger/, 'Hostinger', 'Sitio web'], [/linkedin/, 'LinkedIn Premium', 'LinkedIn'], [/\baws\b|amazon web services/, 'Amazon Web Services', 'Nube'],
    [/google ?cloud/, 'Google Cloud', 'Nube'], [/digitalocean/, 'DigitalOcean', 'Nube'], [/lexdoctor/, 'LexDoctor', 'Software de gestión'],
    [/personal|movistar|claro|telecentro|fibertel|\bflow\b|telecom|starlink|iplan/, null, 'Internet y telefonía'],
    [/megatlon|sportclub|smart ?fit|gimnasio|gym/, null, 'Gimnasio'],
  ];
  // En estas categorías, tener dos o más servicios suele ser un duplicado.
  const CATS_DUPLICABLES = ['Almacenamiento', 'Ofimática', 'Videollamadas', 'Música', 'Video', 'PDF', 'IA', 'Gestión de proyectos', 'Diseño'];

  function sinAcentos(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function norm(s) { return sinAcentos(s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  /** Número argentino o internacional → Number. "1.234,56" · "-1234.5" · "1.234,56-" · "$ 1.234" */
  function leerNumero(v) {
    if (typeof v === 'number') return v;
    let t = String(v || '').replace(/[^\d,.\-]/g, '');
    if (!t || !/\d/.test(t)) return NaN;
    let neg = t.includes('-');
    t = t.replace(/-/g, '');
    const ult = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
    const dec = ult >= 0 ? t.length - ult - 1 : 0;
    const n = ult >= 0 && dec > 0 && dec <= 2 ? Number(t.slice(0, ult).replace(/[.,]/g, '') + '.' + t.slice(ult + 1)) : Number(t.replace(/[.,]/g, ''));
    return neg ? -n : n;
  }

  /** Fecha de una celda o un texto → {anio, mes, dia} o null. */
  function leerFecha(v, hoy) {
    hoy = hoy || new Date();
    if (v instanceof Date && !isNaN(v)) return { anio: v.getFullYear(), mes: v.getMonth() + 1, dia: v.getDate() };
    if (typeof v === 'number' && v > 30000 && v < 80000) { // número de serie de Excel
      const d = new Date(Math.round((v - 25569) * 86400000));
      return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
    }
    const s = norm(v);
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return valida(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?\b/);
    if (m) return valida(m[3] ? anio4(+m[3]) : inferirAnio(+m[2], hoy), +m[2], +m[1]);
    m = s.match(/^(\d{1,2})[\s\-.]*([a-z]{3})[a-z]*\.?[\s\-.]*(\d{2,4})?\b/);
    if (m && MESES[m[2]]) return valida(m[3] ? anio4(+m[3]) : inferirAnio(MESES[m[2]], hoy), MESES[m[2]], +m[1]);
    return null;
  }
  function anio4(a) { return a < 100 ? 2000 + a : a; }
  function inferirAnio(mes, hoy) { return mes > hoy.getMonth() + 2 ? hoy.getFullYear() - 1 : hoy.getFullYear(); }
  function valida(a, m, d) { return m >= 1 && m <= 12 && d >= 1 && d <= 31 && a > 2000 && a < 2100 ? { anio: a, mes: m, dia: d } : null; }

  /** Texto del comercio sin números de comprobante ni ruido. */
  function limpiarComercio(s) {
    return String(s || '')
      .replace(/\b[A-Z]?\d{5,}\b/g, ' ')
      .replace(/\s\*\s?/g, ' *')
      .replace(/\b(K|F|L|USD|U\$S|ARS|\$)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /** Clave para agrupar: sin procesador de pago, sin números, primeras dos palabras significativas. */
  function claveComercio(desc) {
    let s = norm(desc).replace(RE_PROCESADOR, '').replace(/[*#]/g, ' ').replace(/www\.|\.com(\.ar)?|\.net|\.io|\.us/g, ' ');
    s = s.replace(/\b\d[\d\/.,-]*\b/g, ' ').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();
    const palabras = s.split(' ').filter(w => w.length > 1 && !['sa', 'srl', 'sas', 'inc', 'llc', 'ltd', 'arg', 'ar', 'bs', 'as', 'ba', 'caba', 'compra', 'debito', 'automatico', 'deb', 'aut', 'pago'].includes(w));
    return palabras.slice(0, 2).join(' ') || s.slice(0, 20);
  }

  function conocido(desc) {
    const n = norm(desc).replace(/[*#._]/g, ' ').replace(/\s+/g, ' ');
    for (const [re, nombre, cat] of CONOCIDOS) if (re.test(n)) return { nombre, cat };
    return null;
  }

  // ---------- lectores ----------

  /** Tabla (filas de celdas) de un Excel o CSV → { movimientos, ignoradas }. */
  function leerTabla(filas, origen, hoy) {
    const movs = [], ignoradas = [];
    const txt = c => norm(c instanceof Date ? '' : c);
    let h = -1, col = {};
    for (let i = 0; i < Math.min(filas.length, 40); i++) {
      const f = filas[i].map(txt);
      const cf = f.findIndex(c => /^(fecha|date|fecha (de )?(operacion|movimiento|origen|compra))/.test(c));
      const cd = f.findIndex(c => /(descrip|concepto|detalle|comercio|movimiento|referencia|establecimiento)/.test(c));
      if (cf >= 0 && cd >= 0) {
        h = i;
        col = {
          fecha: cf, desc: cd,
          debito: f.findIndex(c => /(debito|cargo|egreso|retiro)/.test(c) && !/credito/.test(c)),
          credito: f.findIndex(c => /(credito|abono|ingreso|deposito)/.test(c)),
          usd: f.findIndex(c => /(dolar|usd|u\$s)/.test(c)),
          importe: f.findIndex(c => /(importe|monto|pesos|valor|total|\$)/.test(c) && !/(dolar|usd|u\$s|saldo)/.test(c)),
        };
        break;
      }
    }
    if (h < 0) return leerTablaSinTitulos(filas, origen, hoy);
    const cuerpo = filas.slice(h + 1);
    // Si hay importes negativos, los consumos son los negativos; si son todos positivos, todos son consumos.
    const hayNegativos = col.importe >= 0 && cuerpo.some(f => leerNumero(f[col.importe]) < 0);
    cuerpo.forEach((f, i) => {
      const fecha = leerFecha(f[col.fecha], hoy);
      const desc = String(f[col.desc] || '').trim();
      if (!fecha || !desc) return;
      let monto = NaN, moneda = '$';
      if (col.debito >= 0) monto = Math.abs(leerNumero(f[col.debito]));
      else if (col.importe >= 0) {
        const v = leerNumero(f[col.importe]);
        monto = hayNegativos ? (v < 0 ? -v : NaN) : v;
      }
      if (col.usd >= 0 && !(monto > 0)) {
        const u = Math.abs(leerNumero(f[col.usd]));
        if (u > 0) { monto = u; moneda = 'USD'; }
      }
      agregar(movs, ignoradas, fecha, desc, monto, moneda, origen + ' · fila ' + (h + i + 2));
    });
    return { movimientos: movs, ignoradas };
  }

  /** Sin títulos reconocibles: en cada fila, primera celda con fecha, texto más largo y último número. */
  function leerTablaSinTitulos(filas, origen, hoy) {
    const movs = [], ignoradas = [];
    filas.forEach((f, i) => {
      const iF = f.findIndex(c => leerFecha(c, hoy));
      if (iF < 0) return;
      const textos = f.map((c, j) => [j, String(c || '')]).filter(([j, c]) => j !== iF && /[a-z]{3}/i.test(c));
      if (!textos.length) return;
      const desc = textos.sort((a, b) => b[1].length - a[1].length)[0][1];
      const nums = f.map(leerNumero).filter((n, j) => j !== iF && !isNaN(n) && n !== 0);
      if (!nums.length) return;
      const v = nums[nums.length - 1];
      agregar(movs, ignoradas, leerFecha(f[iF], hoy), desc, Math.abs(v), '$', origen + ' · fila ' + (i + 1), v < 0 ? false : undefined);
    });
    return { movimientos: movs, ignoradas };
  }

  /** Texto copiado de un resumen en PDF: una línea por consumo, con fecha al principio e importe al final. */
  function leerTexto(texto, origen, hoy) {
    const movs = [], ignoradas = [];
    const reMonto = /(-?\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\d+,\d{2}-?|-?\d{1,3}(?:,\d{3})*\.\d{2}-?)(?=\s|$)/g;
    String(texto || '').split(/\r?\n/).forEach((linea, i) => {
      const l = linea.replace(/\s+/g, ' ').trim();
      if (!l) return;
      const fecha = leerFecha(l, hoy);
      if (!fecha) return;
      const montos = l.match(reMonto);
      if (!montos) return ignoradas.push(l);
      const ultimo = montos[montos.length - 1];
      const sinFecha = l.replace(RE_FECHA_INICIO, '');
      let desc = sinFecha.slice(0, sinFecha.lastIndexOf(ultimo));
      for (const m of montos.slice(0, -1)) desc = desc.replace(m, ' ');
      const usd = /\b(usd|u\$s|us\$|dolar)/i.test(l);
      const v = leerNumero(ultimo);
      agregar(movs, ignoradas, fecha, desc, Math.abs(v), usd ? 'USD' : '$', origen + ' · línea ' + (i + 1), v < 0 ? false : undefined, l);
    });
    return { movimientos: movs, ignoradas };
  }

  function agregar(movs, ignoradas, fecha, desc, monto, moneda, donde, esConsumo, original) {
    const d = limpiarComercio(desc);
    if (esConsumo === false || !(monto > 0) || !d || RE_NO_CONSUMO.test(norm(d))) return;
    if (RE_CUOTA.test(desc)) return; // compras en cuotas: no son suscripciones
    if (!/[a-z]{2}/i.test(d)) return ignoradas.push(original || desc);
    movs.push({ fecha, mesClave: fecha.anio + '-' + String(fecha.mes).padStart(2, '0'), desc: d, monto: Math.round(monto * 100) / 100, moneda, donde });
  }

  // ---------- análisis ----------

  function mediana(xs) { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; }
  function nombreMes(clave) { const [a, m] = clave.split('-'); return NOMBRE_MES[+m] + ' ' + a; }

  /** Movimientos → lista de cobros que se repiten, con avisos. */
  function analizar(movs) {
    const meses = [...new Set(movs.map(m => m.mesClave))].sort();
    const primerMes = meses[0], ultimoMes = meses[meses.length - 1];
    const grupos = {};
    for (const m of movs) {
      const k = claveComercio(m.desc) + '|' + m.moneda;
      (grupos[k] = grupos[k] || []).push(m);
    }
    const items = [];
    for (const [k, lista] of Object.entries(grupos)) {
      lista.sort((a, b) => a.mesClave.localeCompare(b.mesClave) || a.fecha.dia - b.fecha.dia);
      const porMes = {};
      for (const m of lista) (porMes[m.mesClave] = porMes[m.mesClave] || []).push(m);
      const mesesG = Object.keys(porMes).sort();
      const montos = lista.map(m => m.monto);
      const med = mediana(montos);
      const veces = lista.length / mesesG.length;
      const con = conocido(lista[0].desc);
      // Comercios desconocidos: tienen que aparecer todos los meses con un monto parecido (si no, es un súper, nafta, etc.).
      const fijoEstricto = montos.every(x => Math.abs(x - med) <= med * 0.25);
      const recurrente = veces <= 2.5 && (con ? mesesG.length >= 2 : mesesG.length >= Math.max(2, meses.length) && fijoEstricto);
      // Servicio conocido cobrado una sola vez: si fue el último mes, es nuevo; si fue antes, parece un plan anual.
      const nuevoEsteMes = !recurrente && con && con.nombre && mesesG.length === 1 && mesesG[0] === ultimoMes && meses.length >= 2;
      const anual = !recurrente && !nuevoEsteMes && con && con.nombre && mesesG.length === 1 && meses.length >= 2;
      if (!recurrente && !anual && !nuevoEsteMes) continue;

      const avisos = [];
      const primero = lista[0].monto, ultimo = lista[lista.length - 1].monto;
      if (recurrente && ultimo > primero * 1.03) {
        avisos.push({ tipo: 'aumento', texto: 'Aumentó ' + Math.round((ultimo / primero - 1) * 100) + '% (' + nombreMes(lista[0].mesClave) + ' → ' + nombreMes(lista[lista.length - 1].mesClave) + ')' });
      }
      for (const mc of mesesG) {
        const enMes = porMes[mc];
        if (enMes.length >= 2 && enMes.some((a, i) => enMes.some((b, j) => j > i && Math.abs(a.monto - b.monto) <= a.monto * 0.05))) {
          avisos.push({ tipo: 'doble', texto: 'Se cobró ' + enMes.length + ' veces en ' + nombreMes(mc) });
        }
      }
      if (recurrente && mesesG[0] > primerMes) {
        avisos.push({ tipo: 'nuevo', texto: 'Empezó a cobrarse en ' + nombreMes(mesesG[0]) + ' (¿era una prueba gratis?)' });
      }
      if (recurrente && mesesG[mesesG.length - 1] < ultimoMes) {
        avisos.push({ tipo: 'baja', texto: 'No aparece en ' + nombreMes(ultimoMes) + ': puede que ya esté dado de baja' });
      }
      if (nuevoEsteMes) avisos.push({ tipo: 'nuevo', texto: 'Aparece por primera vez en ' + nombreMes(ultimoMes) + ' (¿era una prueba gratis?)' });
      if (anual) avisos.push({ tipo: 'anual', texto: 'Se cobró una sola vez: parece un plan anual (el ahorro se calcula dividido 12)' });

      const ultimoMesG = porMes[mesesG[mesesG.length - 1]];
      const mensual = anual ? lista[0].monto / 12 : ultimoMesG[ultimoMesG.length - 1].monto;
      items.push({
        id: k,
        nombre: (con && con.nombre) || lista[lista.length - 1].desc,
        detalle: lista[lista.length - 1].desc,
        categoria: con ? con.cat : 'Otros cobros fijos',
        moneda: lista[0].moneda,
        mensual: Math.round(mensual * 100) / 100,
        meses: mesesG.length,
        cobros: lista.map(m => ({ mes: m.mesClave, dia: m.fecha.dia, monto: m.monto })),
        avisos,
      });
    }
    // Duplicados: dos o más servicios de la misma categoría.
    const porCat = {};
    for (const it of items) if (CATS_DUPLICABLES.includes(it.categoria)) (porCat[it.categoria] = porCat[it.categoria] || []).push(it);
    for (const [cat, its] of Object.entries(porCat)) {
      if (its.length < 2) continue;
      for (const it of its) {
        it.avisos.push({ tipo: 'duplicado', texto: cat + ': también pagan ' + its.filter(x => x !== it).map(x => x.nombre).join(', ') });
      }
    }
    const peso = it => (it.avisos.length ? 0 : 1);
    items.sort((a, b) => peso(a) - peso(b) || b.mensual - a.mensual);
    return { items, meses };
  }

  const api = { leerNumero, leerFecha, leerTabla, leerTexto, analizar, claveComercio, nombreMes, NOMBRE_MES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.MotorAuditoria = api;
})(this);
