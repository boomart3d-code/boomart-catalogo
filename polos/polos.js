"use strict";
/* Polos de autor · BoomArt.
   El catálogo carga fotografías artísticas preparadas localmente. Su escala visual es independiente de las medidas DTF.
   Se conserva el compositor del navegador para manifiestos anteriores. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const soles = n => CATALOGO_UI.precioConfirmado({precio:n}) ? "S/ " + Number(n).toFixed(0) : "Próximamente";
const WA = "51925666542";
let D = null;                                  // datos (polos.json)
const GEN = { v: (() => { try { return localStorage.getItem("polos.gen") || "todos"; } catch (e) { return "todos"; } })() };
const fijarGen = (g) => { GEN.v = g; try { localStorage.setItem("polos.gen", g); } catch (e) { /* sin memoria */ } };
const segGen = (id) => `<div class="seg gen" id="${id}" role="group" aria-label="Ver fotos para">${[["hombre", "Hombre"], ["mujer", "Mujer"], ["todos", "Todos"]].map(([k, n]) => `<button type="button" data-g="${k}" class="${GEN.v === k ? "on" : ""}">${n}</button>`).join("")}</div>`;
const prodDe = (id) => D.productos.find((p) => p.id === id);
const avDe = (id) => D.avatares.find((a) => a.id === id);
const colorDe = (id) => D.colores.find((c) => c.id === id);

/* ---------------------------------------------------------------- imágenes y compositor */
const cache = new Map(), pesosImagen = new Map();
function limitarImagenes(){while(cache.size>1 && (cache.size>32 || [...pesosImagen.values()].reduce((a,b)=>a+b,0)>64*1024*1024)){const vieja=cache.keys().next().value;cache.delete(vieja);pesosImagen.delete(vieja);}}
const cargar = (url, intento = 0) => {               // si una imagen falla (red, servidor ocupado) no se queda en la memoria: se reintenta
  if (!cache.has(url)) cache.set(url, new Promise((ok, mal) => { const i = new Image(); i.decoding = "async"; i.onload = () => {if(cache.has(url)) pesosImagen.set(url,i.naturalWidth*i.naturalHeight*4);limitarImagenes();ok(i);}; i.onerror = () => { cache.delete(url); pesosImagen.delete(url); intento < 2 ? setTimeout(() => cargar(url, intento + 1).then(ok, mal), 350 * (intento + 1)) : mal(new Error("No se pudo cargar " + url)); }; i.src = url; }));
  limitarImagenes();
  return cache.get(url);
};
const mascaras = new Map();
async function mascara(toma, W, H) {                       // recorte suave de la prenda (solo para que el estampado no pase del borde)
  const k = `${toma.mascara}@${W}`; if (mascaras.has(k)) return mascaras.get(k);
  const im = await cargar(toma.mascara), c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high"; x.filter = `blur(${Math.max(0.6, W / 1500).toFixed(2)}px)`; x.drawImage(im, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < m.length; i++, j += 4) m[i] = d[j];
  mascaras.set(k, m); return m;
}
const tomaCol = (toma, prod) => ({ ...toma, ...(toma.por_color?.[prod.color] || {}) });          // medidas y recorte de la foto en el color de este polo (los mismos que usa la app)
function piezasPara(prod, toma, genero) {
  toma = tomaCol(toma, prod);
  // La galería web es independiente de la impresión: cada foto usa su propia ubicación, giro, tamaño y curvatura (los ajustó Adrián en la app).
  const est = prod.estampados, out = [];
  const add = (ub, a) => {
    const e = est[ub]; if (!e) return; const aj = e.ajuste?.[toma.clave] || {}, k = toma.pxcm, esc = aj.escala ?? 1;
    const p = { url: e.archivo, wcm: e.ancho_cm * esc, hcm: e.alto_cm * esc, ...a };
    if (p.top !== undefined) { p.cy = p.top + (e.alto_cm * k) / 2; delete p.top; }               // el tamaño cambia alrededor del centro
    p.cx += (aj.dx || 0) * k; p.cy += (aj.dy || 0) * k;
    p.rot = (a.rot || 0) + (aj.rot || 0); p.curva = toma.radio ? (aj.curva ?? e.curva_auto ?? 0) : 0; p.yaw = aj.yaw || 0; p.pitch = aj.pitch || 0; p.esq = aj.esq ? aj.esq.map((x) => x * k) : null;      // giro y cuánto se adapta a la curva del torso (0 a 1)
    out.push(p);
  };
  [["pecho", "pecho"], ["pecho_pequeno", "pecho_pequeno"], ["espalda", "espalda"], ["espalda_alta", "espalda_alta"], ["manga", "manga_derecha"]].forEach(([k, ub]) => { if (toma[k]) add(ub, { ...toma[k] }); });   // cada toma trae solo las anclas que se ven en ella
  return out;
}

/* Foto real del modelo con el polo del color del producto + estampados -> canvas */
const datosPx = new Map();
function datosEstampado(url, im) {              // pixeles del estampado (se leen una vez) para ponerlo en perspectiva
  if (!datosPx.has(url)) { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(im, 0, 0); datosPx.set(url, { d: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }); }
  return datosPx.get(url);
}
async function componer(prod, av, toma, W) {
  toma = tomaCol(toma, prod);
  const H = Math.round(W * 1.25), k = W / 2048, n = W * H, F = toma.fotos[prod.color];
  const piezas = piezasPara(prod, toma, av.genero);
  const [foto, m] = await Promise.all([cargar(W > 1400 ? F.zoom : F.foto), mascara(toma, W, H)]);
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true }); ctx.imageSmoothingQuality = "high"; ctx.drawImage(foto, 0, 0, W, H);
  if (!piezas.length) return cv;
  const id = ctx.getImageData(0, 0, W, H), d = id.data;
  // luz de la tela: versión muy desenfocada (iluminación general y pliegues grandes) y luminosidad fina (textura)
  const bl = document.createElement("canvas"); bl.width = W; bl.height = H; const bx = bl.getContext("2d", { willReadFrequently: true });
  bx.filter = `blur(${Math.round(W * 0.02)}px)`; bx.drawImage(foto, 0, 0, W, H); const bd = bx.getImageData(0, 0, W, H).data;
  const lum = new Float32Array(n), Lb = new Float32Array(n); let suma = 0, cuenta = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) { lum[i] = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114; Lb[i] = bd[j] * 0.299 + bd[j + 1] * 0.587 + bd[j + 2] * 0.114; if (m[i] > 128) { suma += Lb[i]; cuenta++; } }
  const mu = Math.max(suma / Math.max(cuenta, 1), 6), oscuro = mu < 90;
  for (const p of piezas) {
    const im = await cargar(p.url), px = datosEstampado(p.url, im), w = p.wcm * toma.pxcm * k, h = p.hcm * toma.pxcm * k, cx = p.cx * k, cy = p.cy * k;
    const quad = PERSP.cuadro({ cx, cy, w, h, rot: p.rot || 0, yaw: p.yaw, pitch: p.pitch, esq: p.esq ? p.esq.map((e) => e * k) : null }), inv = PERSP.inversa(quad);   // el estampado se pone en perspectiva sobre la foto
    const [qx0, qy0, qx1, qy1] = PERSP.caja(quad, 10 * k), x0 = Math.max(4, qx0), x1 = Math.min(W - 5, qx1), y0 = Math.max(4, qy0), y1 = Math.min(H - 5, qy1);
    const kw = 520 * k, cur = p.curva || 0, cxt = toma.cx * k, Rt = (toma.radio || 1) * k, mm = [0, 0, 0, 0];             // fuerza del plegado del estampado sobre la tela
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x; if (!m[i]) continue;
      // el estampado sigue la curvatura de la tela: se desplaza según el gradiente de la luz general
      const gx = (Lb[i + 3] - Lb[i - 3]) / (6 * mu), gy = (Lb[i + 3 * W] - Lb[i - 3 * W]) / (6 * mu);
      const ox = Math.max(-4 * k, Math.min(4 * k, -gx * kw)), oy = Math.max(-4 * k, Math.min(4 * k, -gy * kw));
      const uv = inv(PERSP.curvar(x, cxt, Rt, cur) + ox, y + oy);                                                          // de la foto al estampado plano
      if (!uv || uv[0] < 0 || uv[0] > 1 || uv[1] < 0 || uv[1] > 1) continue;
      PERSP.muestrear(px.d, px.w, px.h, uv[0], uv[1], mm); const a = mm[3]; if (a < 1) continue;
      const f = (a / 255) * (m[i] / 255), macro = Math.min(1.15, Math.max(0.8, Lb[i] / mu)), micro = 1 + (Math.min(1.25, Math.max(0.8, lum[i] / Math.max(Lb[i], 6))) - 1) * 0.7;
      let s = macro * micro; if (oscuro) s = 1 + (s - 1) * 0.8; else s = Math.min(1.04, s);   // en tela negra la tinta (con base blanca) se ve viva
      const o = i * 4;
      d[o] = d[o] * (1 - f) + Math.min(255, mm[0] * s) * f; d[o + 1] = d[o + 1] * (1 - f) + Math.min(255, mm[1] * s) * f; d[o + 2] = d[o + 2] * (1 - f) + Math.min(255, mm[2] * s) * f;
    }
  }
  ctx.putImageData(id, 0, 0); return cv;
}
const lru = new Map();
async function escenaCanvas(prodId, avId, tomaId, W) {
  const k = `${prodId}|${avId}|${tomaId}|${W}`; if (lru.has(k)) { const v = lru.get(k); lru.delete(k); lru.set(k, v); return v; }
  const prod = prodDe(prodId), av = avDe(avId), toma = av.tomas.find((t) => t.toma === tomaId) || av.tomas[0];
  let cv;
  const final = prod.galeria?.[`${avId}|${tomaId}`];
  if (final) {
    const im=await cargar(W <= 400 ? final.mini : W > 1400 ? final.zoom : final.foto);
    cv=document.createElement('canvas');cv.width=W;cv.height=Math.round(W*1.25);
    cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
  } else cv = await componer(prod, av, toma, W);
  lru.set(k, cv); while(lru.size>1 && (lru.size>14 || [...lru.values()].reduce((n,c)=>n+c.width*c.height*4,0)>48*1024*1024))lru.delete(lru.keys().next().value); return cv;
}
function pintar(destino, origen) { destino.width = origen.width; destino.height = origen.height; destino.getContext("2d").drawImage(origen, 0, 0); }
async function pintarEn(canvas, prodId, avId, tomaId, W) { try { const c = await escenaCanvas(prodId, avId, tomaId, W); pintar(canvas, c); return true; } catch (e) { console.warn(e); return false; } }

/* ---------------------------------------------------------------- utilidades de interfaz */
const tomaNombre = { frente: "Frente", espalda: "Espalda", "lateral-derecho": "Lateral", "detalle-pecho": "Detalle del pecho", "detalle-manga": "Detalle de la manga", "detalle-espalda-alta": "Detalle de la espalda", "frente-plano": "Polo tendido", "espalda-plana": "Polo tendido · espalda", "percha-frente": "En percha" };
/* Cada polo muestra una selección corta de fotos (las más reales, revisadas con el estampado puesto), por género. */
const selDe = (p, g) => (p.seleccion[g] || []).map(([av, toma]) => ({ av, toma }));
const selTodas = (p) => { const h = selDe(p, "hombre"), m = selDe(p, "mujer"), out = []; for (let i = 0; i < Math.max(h.length, m.length); i++) { if (h[i]) out.push(h[i]); if (m[i]) out.push(m[i]); } return out; };
const selGen = (p) => (GEN.v === "todos" ? selTodas(p) : selDe(p, GEN.v));
const portada = (p) => selDe(p, "hombre")[0];
const alterna = (p) => selDe(p, "mujer")[0];

function visible(nodo) { const o = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("ver"); o.unobserve(e.target); } }), { threshold: 0.12 }); o.observe(nodo); }
function bloquear(si) { document.body.classList.toggle("fijo", si); }
const fondoPlano = () => "#ece5d7";

let preferenciaTalla='M';
function tablaMedidas(g) { const tabla=D.medidas?.[g]; return tabla ? Object.fromEntries(Object.entries(tabla).map(([t,m])=>[t,[m.pecho,m.largo,m.hombros,m.manga]])) : TALLAS[g]; }
function leerSeleccion() {try{return JSON.parse(localStorage.getItem('boomart.polos.seleccion')||'[]').filter(v=>D.productos.some(p=>p.id===v.id));}catch{return []}}
function actualizarContadorSeleccion(){const b=$("#abrirSeleccion");if(b)b.textContent=`Mi selección (${leerSeleccion().length})`;}
function guardarSeleccion(v){const lista=leerSeleccion();if(!lista.some(x=>x.clave===v.clave))lista.push(v);try{localStorage.setItem('boomart.polos.seleccion',JSON.stringify(lista));}catch{}actualizarContadorSeleccion();const b=$("#fGuardar");if(b)b.textContent='Guardado en mi selección ✓';}
function dialogoContenido(titulo,html){const dialog=$("#dialogoColeccion");dialog.innerHTML=`<div class="dialogo-cab"><h2>${titulo}</h2><button type="button" aria-label="Cerrar ventana">✕</button></div>${html}`;dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();return dialog;}
function abrirGuia(g){const datos=Object.entries(tablaMedidas(g)).map(([t,m])=>`<tr><th>${t}</th>${m.map(n=>`<td>${n} cm</td>`).join('')}</tr>`).join('');dialogoContenido(`Guía de tallas · ${g==='mujer'?'Mujer':'Hombre'}`,`<p>Medidas de la prenda tendida, en centímetros. Si estás entre dos tallas, elige la mayor para una caída más suelta. Pueden variar hasta 1 cm por la confección.</p><div class="tabla-desplazable"><table><thead><tr><th>Talla</th><th>Pecho</th><th>Largo</th><th>Hombros</th><th>Manga</th></tr></thead><tbody>${datos}</tbody></table></div>`);}
function abrirSeleccion(){const lista=leerSeleccion(),d=dialogoContenido('Mi selección',lista.length?`<p>Conserva aquí tus piezas favoritas. No es una compra ni una reserva.</p><ul class="seleccion-lista">${lista.map(v=>`<li><span>${esc(CATALOGO_UI.mensaje(v))}</span><button type="button" data-quitar="${esc(v.clave)}">Quitar</button></li>`).join('')}</ul><a class="btn btn-osc" target="_blank" rel="noopener" href="https://wa.me/${WA}?text=${encodeURIComponent('Hola BoomArt. Me interesa esta selección de la colección:\n'+lista.map(CATALOGO_UI.mensaje).join('\n'))}">Consultar mi selección</a>`:'<p>Aún no guardaste ninguna pieza. Explora la colección y elige corte y talla.</p>');d.querySelectorAll('[data-quitar]').forEach(b=>b.onclick=()=>{try{localStorage.setItem('boomart.polos.seleccion',JSON.stringify(leerSeleccion().filter(v=>v.clave!==b.dataset.quitar)))}catch{}d.close();actualizarContadorSeleccion();abrirSeleccion()});}

/* ---------------------------------------------------------------- portada (hero) */
const heroLista = () => D.productos.flatMap(p => ['hombre','mujer'].flatMap(g => selDe(p,g).slice(0,1).map(s=>({p:p.id,av:s.av,t:s.toma,cap:`${p.nombre} · ${colorDe(p.color).nombre}`})))).slice(0,4);
function iniciarHero() {
  const HERO = heroLista(), A = $("#heroA"), B = $("#heroB"), pts = $("#heroPts"), cap = $("#heroCap"); let i = -1, actual = A, tok = 0;
  pts.innerHTML = HERO.map(() => "<i></i>").join("");
  const mostrar = async (n) => {
    const t = ++tok, h = HERO[n], sig = actual === A ? B : A;
    const ok = await pintarEn(sig, h.p, h.av, h.t, 900); if (!ok || t !== tok) return;
    actual.classList.remove("on"); sig.classList.add("on"); actual = sig; i = n; cap.textContent = h.cap;
    $$("i", pts).forEach((x, k) => x.classList.toggle("on", k === n));
  };
  mostrar(0).then(() => { setInterval(() => { if (!document.hidden && $("#hoja").hidden && $("#prob").hidden) mostrar((i + 1) % HERO.length); }, 5600); });
  pts.onclick = (e) => { const k = $$("i", pts).indexOf(e.target); if (k >= 0) mostrar(k); };
}

/* ---------------------------------------------------------------- colección */
const filtro = { tema: "todos", color: "todos", busqueda:"", orden:"coleccion", limite:12 };
function pintarFiltros() {
  const temas = ["todos", ...new Set(D.productos.map((p) => p.tema))], colores = ["todos", ...new Set(D.productos.map((p) => p.color))];
  $("#filtros").innerHTML = temas.map((t) => `<button class="chip ${filtro.tema === t ? "on" : ""}" data-t="${esc(t)}">${t === "todos" ? "Todos" : esc(t)}</button>`).join("") +
    '<span style="width:14px"></span>' + colores.map((c) => `<button class="chip ${filtro.color === c ? "on" : ""}" data-c="${c}">${c === "todos" ? "Cualquier color" : esc(colorDe(c).nombre)}</button>`).join("");
  $$("#filtros [data-t]").forEach((b) => (b.onclick = () => { filtro.tema = b.dataset.t; pintarFiltros(); pintarGrilla(); }));
  $$("#filtros [data-c]").forEach((b) => (b.onclick = () => { filtro.color = b.dataset.c; pintarFiltros(); pintarGrilla(); }));
}
function pintarGrilla() {
  const resultado = CATALOGO_UI.filtrar(D.productos, filtro);
  const lista = resultado.slice(0,filtro.limite);
  const contador=document.getElementById('catalogoCuenta');if(contador) contador.textContent=`${resultado.length} diseño${resultado.length===1?'':'s'}`;
  const mas=document.getElementById('catalogoMas');if(mas) {mas.hidden=resultado.length<=lista.length;mas.onclick=()=>{filtro.limite+=12;pintarGrilla()};}
  const g = $("#grilla"); g.innerHTML = "";
  if (!lista.length) g.innerHTML = '<p class="nota">No encontramos diseños con esa selección. Prueba otra colección o restablece los filtros.</p>';
  lista.forEach((p, n) => {
    const pc = portada(p), al = alterna(p), c = colorDe(p.color);
    const t = el(`<button class="tarjeta" type="button" aria-label="Ver ${esc(p.nombre)}" style="transition-delay:${n * 90}ms">
      <div class="foto"><canvas class="a"></canvas><canvas class="b"></canvas></div>
      <div class="meta"><div><h3>${esc(p.nombre)}</h3><span class="tema">${esc(p.tema)} · ${esc(c.nombre)}</span><div class="puntos"><i class="dot" style="--c:${c.hex}" title="${esc(c.nombre)}"></i></div></div><span class="precio">${soles(p.precio)}</span></div></button>`);
    g.appendChild(t); visible(t);
    pintarEn($(".a", t), p.id, pc.av, pc.toma, 720); pintarEn($(".b", t), p.id, al.av, al.toma, 720);
    t.onclick = () => (location.hash = `#/p/${p.id}`);
  });
}

/* ---------------------------------------------------------------- escena con zoom (ficha y probador) */
function crearEscena(cont, fondo) {
  cont.innerHTML = `<div class="escena" tabindex="0" role="button" aria-label="Ampliar la foto"><canvas class="c1"></canvas><canvas class="c2" style="opacity:0"></canvas><img class="p" alt="" hidden><div class="lupa"><canvas></canvas></div><div class="zoom-pista">Clic para ampliar</div><div class="gira">Preparando la foto…</div></div>`;
  const esc_ = $(".escena", cont), c1 = $(".c1", cont), c2 = $(".c2", cont), img = $(".p", cont), lupa = $(".lupa", cont), lc = $("canvas", lupa);
  let frente = c1, atras = c2, estado = null, grande = null, tok = 0;
  const api = {
    async mostrar(s) {                           // s: {prod, av, toma} | {plano}
      estado = s; grande = null; const t = ++tok; esc_.classList.add("carga");
      if (s.plano) { img.hidden = false; img.src = s.plano; esc_.style.background = fondo; frente.style.opacity = 0; atras.style.opacity = 0; esc_.classList.remove("carga"); return; }
      img.hidden = true; esc_.style.background = "";
      const ok = await pintarEn(atras, s.prod, s.av, s.toma, 1100); if (t !== tok) return;
      esc_.classList.remove("carga"); if (!ok) return;
      atras.style.opacity = 1; frente.style.opacity = 0; [frente, atras] = [atras, frente];
    },
    abrir() { if (estado) abrirVisor(estado.plano ? { ...estado, fondo } : estado); },
  };
  esc_.onclick = () => api.abrir(); esc_.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); api.abrir(); } };
  if (matchMedia("(hover:hover)").matches) {
    esc_.onmouseenter = async () => { if (!estado || estado.plano) return; const s = estado; try { const c = await escenaCanvas(s.prod, s.av, s.toma, 2048); if (s === estado) grande = c; } catch (e) { /* sin lupa */ } };
    esc_.onmousemove = (e) => {
      if (!grande) return; const r = esc_.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, L = 210;
      lupa.style.left = e.clientX - r.left - L / 2 + "px"; lupa.style.top = e.clientY - r.top - L / 2 + "px"; lupa.classList.add("on");
      lc.width = L; lc.height = L; const z = 2.4, sw = (L / r.width) * grande.width / z, sh = (L / r.height) * grande.height / z;
      lc.getContext("2d").drawImage(grande, x * grande.width - sw / 2, y * grande.height - sh / 2, sw, sh, 0, 0, L, L);
    };
    esc_.onmouseleave = () => lupa.classList.remove("on");
  }
  return api;
}

/* ---------------------------------------------------------------- visor con zoom (rueda, arrastre, pellizco) */
let visorAbierto = false;
async function abrirVisor(s, foco) {                  // foco: {x, y} en coordenadas de la foto de 2048 x 2560 y zoom relativo
  const V = $("#visor"), esc_ = $("#visorEsc"), lienzo = $("#visorLienzo"); visorAbierto = true; V.hidden = false; bloquear(true); setTimeout(() => V.classList.add("abierto"), 20);
  lienzo.innerHTML = ""; const cv = document.createElement("canvas");
  if (s.plano) {                                    // polo tendido: la imagen sobre su fondo, a gran tamaño
    $("#visorTit").textContent = s.titulo || "Polo tendido"; const im = await cargar(s.plano); cv.width = 2048; cv.height = 2560;
    const x = cv.getContext("2d"); x.fillStyle = s.fondo || "#0b0b0b"; x.fillRect(0, 0, 2048, 2560); x.imageSmoothingQuality = "high";
    const k = Math.min(1900 / im.width, 2300 / im.height); x.drawImage(im, (2048 - im.width * k) / 2, (2560 - im.height * k) / 2, im.width * k, im.height * k);
  } else {
    const prod = prodDe(s.prod); $("#visorTit").textContent = `${prod.nombre} · ${colorDe(prod.color).nombre} · ${tomaNombre[s.toma]}`; pintar(cv, await escenaCanvas(s.prod, s.av, s.toma, 2048));
  }
  lienzo.appendChild(cv);
  const vw = () => esc_.clientWidth, vh = () => esc_.clientHeight; let sc = 1, x = 0, y = 0, fit = 1;
  const aplicar = () => { lienzo.style.transform = `translate(${x}px,${y}px) scale(${sc})`; $("#vZoom").textContent = Math.round((sc / fit) * 100) + " %"; };
  const limitar = () => { const w = cv.width * sc, h = cv.height * sc; x = w <= vw() ? (vw() - w) / 2 : Math.min(0, Math.max(vw() - w, x)); y = h <= vh() ? (vh() - h) / 2 : Math.min(0, Math.max(vh() - h, y)); };
  const ajustar = () => { fit = Math.min(vw() / cv.width, vh() / cv.height); sc = fit; limitar(); aplicar(); };
  const zoomEn = (nuevo, px, py) => { nuevo = Math.min(fit * 6, Math.max(fit, nuevo)); const k = nuevo / sc; x = px - (px - x) * k; y = py - (py - y) * k; sc = nuevo; limitar(); aplicar(); };
  ajustar();
  if (foco) { const z = fit * (foco.zoom || 3); sc = z; x = vw() / 2 - foco.x * z; y = vh() / 2 - foco.y * z; limitar(); aplicar(); }
  esc_.onwheel = (e) => { e.preventDefault(); const r = esc_.getBoundingClientRect(); zoomEn(sc * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX - r.left, e.clientY - r.top); };
  const ptr = new Map(); let ult = null, dist0 = 0, sc0 = 1;
  esc_.onpointerdown = (e) => { esc_.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); esc_.classList.add("arrastra"); ult = [e.clientX, e.clientY]; if (ptr.size === 2) { const [a, b] = [...ptr.values()]; dist0 = Math.hypot(a[0] - b[0], a[1] - b[1]); sc0 = sc; } };
  esc_.onpointermove = (e) => {
    if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size === 2) { const [a, b] = [...ptr.values()], r = esc_.getBoundingClientRect(); zoomEn(sc0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / dist0, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); }
    else if (ptr.size === 1 && ult) { x += e.clientX - ult[0]; y += e.clientY - ult[1]; ult = [e.clientX, e.clientY]; limitar(); aplicar(); }
  };
  const soltar = (e) => { ptr.delete(e.pointerId); ult = null; if (!ptr.size) esc_.classList.remove("arrastra"); };
  esc_.onpointerup = soltar; esc_.onpointercancel = soltar;
  esc_.ondblclick = (e) => { const r = esc_.getBoundingClientRect(); zoomEn(sc > fit * 1.2 ? fit : fit * 2.6, e.clientX - r.left, e.clientY - r.top); };
  $("#vMas").onclick = () => zoomEn(sc * 1.4, vw() / 2, vh() / 2); $("#vMenos").onclick = () => zoomEn(sc / 1.4, vw() / 2, vh() / 2); $("#vReset").onclick = ajustar;
  $("#vCerrar").onclick = cerrarVisor; V.onclick = (e) => { if (e.target === V) cerrarVisor(); }; window.addEventListener("resize", ajustar, { once: true });
}
function cerrarVisor() { const V = $("#visor"); V.classList.remove("abierto"); visorAbierto = false; setTimeout(() => { V.hidden = true; $("#visorLienzo").innerHTML = ""; }, 280); if ($("#hoja").hidden && $("#prob").hidden) bloquear(false); }

/* ---------------------------------------------------------------- ficha de producto */
const TALLAS = { hombre: { S: [49, 68, 44, 20], M: [52, 71, 46, 21], L: [55, 74, 48, 22] }, mujer: { S: [42, 58, 36, 16], M: [45, 61, 38, 17], L: [48, 64, 40, 18] } };
const NOMBRE_UB = { pecho: "Pecho", pecho_pequeno: "Pectoral", espalda: "Espalda completa", espalda_alta: "Espalda alta", manga_derecha: "Manga derecha" };
const VISTA_UB = { pecho: "frente", pecho_pequeno: "frente", espalda: "espalda", espalda_alta: "espalda", manga_derecha: "lateral-derecho" };
const tomasDe = (prod, av) => av.tomas.filter((t) => selTodas(prod).some((s) => s.av === av.id && s.toma === t.toma));   // las fotos de este modelo que muestra el polo
const DETALLE_UB = { pecho: "detalle-pecho", pecho_pequeno: "detalle-pecho", manga_derecha: "detalle-manga", espalda_alta: "detalle-espalda-alta" };
function anclaDe(prod, avId, ub) {                  // centro (en la foto de 2048 x 2560) del estampado `ub` para acercarse a él
  const av = avDe(avId), toma = av.tomas.find((t) => t.toma === VISTA_UB[ub]); if (!toma) return null;
  const p = piezasPara(prod, toma, av.genero).find((q) => q.url === prod.estampados[ub].archivo); if (!p) return null;
  return { toma: toma.toma, x: p.cx, y: p.cy };
}
function abrirFicha(id) {
  const p = prodDe(id); if (!p) return location.replace("#/");
  const H = $("#hoja"), st = { talla: preferenciaTalla, genero:GEN.v==='mujer'?'mujer':'hombre', item: 0 }, c = colorDe(p.color);
  const armarItems = () => selDe(p,st.genero).map((s) => { const a = avDe(s.av); return { av: s.av, toma: s.toma, nom: a.producto ? tomaNombre[s.toma] : `${a.nombre} · ${tomaNombre[s.toma]}` }; });     // solo las fotos del género elegido (o todas)
  let items = armarItems();
  const ubs = Object.keys(p.estampados);
  H.innerHTML = `<div class="hoja-barra"><button class="volver" type="button" id="fVolver">Colección</button><span class="migas">Polos / ${esc(p.nombre)}</span></div>
  <div class="ficha"><div class="galeria"><div class="minis" id="fMinis"></div><div id="fEscena"></div></div>
  <div class="info"><p class="tema">${esc(p.tema)}</p><h1 id="fNombre">${esc(p.nombre)}</h1><span class="precio">${soles(p.precio)}</span><p class="nota">${CATALOGO_UI.precioConfirmado(p) ? "Colección de autor BoomArt." : "Próximamente. El precio y la disponibilidad se anunciarán con el lanzamiento de la colección."}</p>
    <p class="desc">${esc(p.texto)}</p>
    <div class="bloque"><h4>Color <b style="letter-spacing:.06em">${esc(c.nombre)}</b></h4><div class="colores"><i class="sw on" style="--c:${c.hex}"></i><span class="unico">Este diseño se ofrece solo en ${esc(c.nombre.toLowerCase())}.</span></div></div>
    <div class="bloque"><h4>Elige tu corte</h4>${segGen("fGen")}</div>
    <div class="bloque"><h4>Talla <a id="fGuia">Guía de tallas</a></h4><div class="tallas-b" id="fTallas"></div></div>
    <div class="bloque"><h4>Ver de cerca</h4><div class="cerca" id="fCerca">${ubs.map((u) => `<button type="button" class="chip" data-u="${u}">${esc(NOMBRE_UB[u] || u)}</button>`).join("")}</div></div>
    <div class="acciones"><button class="btn btn-osc grande" type="button" id="fProbar">Ver todos los modelos</button><button class="btn btn-osc grande" type="button" id="fGuardar">Guardar selección</button><a class="btn btn-linea-osc grande" id="fPedir" target="_blank" rel="noopener">Consultar esta pieza</a><button class="compartir" type="button" id="fCompartir">Compartir diseño ↗</button></div>
    <div class="detalles"><details open><summary>Detalles del diseño</summary><ul class="medidas" id="fMed"></ul></details>
      <details><summary>Tela y prenda</summary><p>${p.id === "hogwarts-blanco" ? "Informacion de tela y confeccion por confirmar." : `${esc(p.material || "Algodón pima 100 % peinado, hilado en anillo.")} ${p.gramaje ? esc(p.gramaje)+" g/m²." : ""} Doble costura reforzada en hombros, mangas y dobladillo, cuello acanalado de alta recuperación con cinta interior y tela preencogida.`}</p></details>
      <details><summary>Impresión DTF</summary><p>Impresión a 300 ppp con tintas de pigmento: color intenso, bordes definidos y tacto flexible. El arte se prepara de forma independiente para cada prenda y se verifica antes de imprimir.</p></details>
      <details><summary>Cuidados</summary><p>Espera 24 a 48 horas antes del primer lavado. Lava del revés, en ciclo suave con agua fría (hasta 30 °C), sin lejía ni suavizante. Seca a la sombra o a baja temperatura. Plancha del revés, a temperatura media-baja, sin pasar la plancha sobre el estampado.</p></details></div></div></div>`;
  const escena = crearEscena($("#fEscena", H), fondoPlano(p));
  const minis = $("#fMinis", H);
  const igualarAlto = () => { const e = $("#fEscena .escena", H); if (!e) return; const v = e.clientHeight + "px"; if (minis.style.maxHeight !== v) minis.style.maxHeight = v; };       // la lista de fotos se desplaza sola, con la altura de la foto principal
  igualarAlto(); new ResizeObserver(igualarAlto).observe($("#fEscena", H));
  const mostrar = () => {
    const it = items[st.item]; items.forEach((x, n) => x.btn.classList.toggle("on", n === st.item));
    escena.mostrar({ prod: p.id, av: it.av, toma: it.toma });
  };
  const pintarMinis = () => {
    minis.innerHTML = "";
    items.forEach((it, n) => {
      const b = el(`<button class="mini" type="button" aria-label="${esc(it.nom)}"><canvas></canvas></button>`); minis.appendChild(b);
      b.onclick = () => { st.item = n; mostrar(); }; it.btn = b; pintarEn($("canvas", b), p.id, it.av, it.toma, 260);
    });
  };
  const cambiarGen = (g) => { if(g==='todos')return; st.genero=g; fijarGen(g); items = armarItems(); st.item = 0; minis.scrollTop = 0; $$("#fGen button", H).forEach((x) => {x.classList.toggle("on", x.dataset.g === g);x.setAttribute("aria-pressed",String(x.dataset.g===g));}); pintarMinis(); mostrar(); pedir(); };
  $$("#fGen button", H).forEach((b) => (b.onclick = () => cambiarGen(b.dataset.g)));
  pintarMinis();
  const pintarTallasF = () => { $("#fTallas", H).innerHTML = (p.tallas || ["S", "M", "L"]).map((t) => `<button class="talla ${t === st.talla ? "on" : ""}" type="button" data-t="${t}">${t}</button>`).join(""); $$("#fTallas .talla", H).forEach((b) => (b.onclick = () => { st.talla = b.dataset.t; preferenciaTalla=st.talla; pintarTallasF(); pedir(); })); };
  const pedir = () => { const v=CATALOGO_UI.variante(p,st.genero,st.talla); $("#fGuardar",H).textContent=leerSeleccion().some(x=>x.clave===v.clave)?'Guardado en mi selección ✓':'Guardar selección'; $("#fPedir",H).href=`https://wa.me/${WA}?text=${encodeURIComponent('Hola BoomArt. Me interesa '+CATALOGO_UI.mensaje(v)+'. Quisiera conocer los detalles de la colección.')}`; };

  $("#fMed", H).innerHTML = Object.entries(p.estampados).map(([ub, e]) => `<li><span>${NOMBRE_UB[ub] || ub}</span><b>${ub==='pecho'||ub==='espalda'?'Diseño principal':'Detalle de autor'}</b></li>`).join("");
  $$("#fCerca .chip", H).forEach((b) => (b.onclick = () => {
    const u = b.dataset.u, det = items.find((x) => x.toma === DETALLE_UB[u]); if (det) return abrirVisor({ prod: p.id, av: det.av, toma: det.toma });        // foto de detalle tomada de cerca
    for (const x of items) {                                                                                                                      // si no hay, se acerca al estampado en la primera foto donde se ve
      const a = avDe(x.av), t = a.tomas.find((q) => q.toma === x.toma), pz = t && piezasPara(p, t, a.genero).find((q) => q.url === p.estampados[u].archivo);
      if (pz) return abrirVisor({ prod: p.id, av: x.av, toma: x.toma }, { x: pz.cx, y: pz.cy, zoom: 3.2 });
    }
  }));
  pintarTallasF(); pedir(); mostrar();
  $("#fVolver", H).onclick = () => (location.hash = "#/"); $("#fProbar", H).onclick = () => (location.hash = `#/p/${p.id}/probador`);
  $("#fGuia",H).onclick=()=>abrirGuia(st.genero);
  $("#fGen [data-g=todos]",H)?.remove();
  $$("#fGen button",H).forEach(b=>{b.classList.toggle('on',b.dataset.g===st.genero);b.setAttribute('aria-pressed',String(b.dataset.g===st.genero))});
  $("#fGuardar",H).onclick=()=>guardarSeleccion(CATALOGO_UI.variante(p,st.genero,st.talla));
  $("#fCompartir",H).onclick=async()=>{const url=location.href;try{if(navigator.share)await navigator.share({title:`${p.nombre} · BoomArt`,url});else{await navigator.clipboard.writeText(url);$("#fCompartir",H).textContent='Enlace copiado ✓';}}catch(e){if(e.name!=='AbortError')$("#fCompartir",H).textContent='Copia el enlace de la barra de direcciones';}};
  mostrarHoja(H);
}

/* ---------------------------------------------------------------- probador de modelos */
function abrirProbador(id) {
  const p = prodDe(id) || D.productos[0], H = $("#prob"), c = colorDe(p.color);
  const lista = () => [...new Set(selGen(p).map((s) => s.av))].map(avDe).filter((a) => !a.producto);                       // los modelos de la selección, según el género
  const st = { av: lista()[0].id, toma: selGen(p).find((s) => s.av === lista()[0].id).toma };
  H.innerHTML = `<div class="hoja-barra"><button class="volver" type="button" id="pVolver">${esc(p.nombre)}</button><span class="migas">Modelos</span></div>
  <div class="prob-cuerpo"><div class="prob-esc" id="pEscena"></div><aside class="prob-lat">
    <h2>${esc(p.nombre)}</h2><p class="sub">Polo ${esc(c.nombre.toLowerCase())}, en distintas fotografías y ángulos. Explora la dirección artística del diseño.</p>
    <div class="bloque"><h4>Fotos para</h4>${segGen("pGen")}</div>
    <div class="bloque"><h4>Modelo <b id="pModNom" style="letter-spacing:.06em"></b></h4><div class="modelos" id="pModelos"></div></div>
    <div class="bloque"><h4>Vista</h4><div class="tomas" id="pTomas"></div></div>
    <div class="prob-acc"><button class="btn btn-osc grande" id="pZoom" type="button">Acercar y ver detalles</button><a class="btn btn-linea-osc grande" id="pPedir" target="_blank" rel="noopener">Pedir este polo</a></div>
  </aside></div>`;
  const escena = crearEscena($("#pEscena", H), fondoPlano(p));
  const refrescar = () => {
    const av = avDe(st.av), tomas = tomasDe(p, av); if (!tomas.some((t) => t.toma === st.toma)) st.toma = tomas[0].toma;
    $("#pModelos", H).innerHTML = lista().map((a) => `<button class="modelo ${a.id === st.av ? "on" : ""}" type="button" data-a="${a.id}" title="${esc(a.nombre)}"><canvas></canvas><span>${esc(a.nombre)}</span></button>`).join("");
    $$("#pModelos .modelo", H).forEach((b) => { const a = avDe(b.dataset.a); const tt = tomasDe(p, a), mini = tt.find((t) => /^(frente|espalda)/.test(t.toma)) || tt[0]; pintarEn($("canvas", b), p.id, a.id, mini.toma, 200); b.onclick = () => { st.av = a.id; refrescar(); }; });
    $("#pModNom", H).textContent = av.nombre;
    $("#pTomas", H).innerHTML = tomas.map((t) => `<button class="toma ${t.toma === st.toma ? "on" : ""}" type="button" data-t="${t.toma}">${tomaNombre[t.toma]}</button>`).join("");
    $$("#pTomas .toma", H).forEach((b) => (b.onclick = () => { st.toma = b.dataset.t; refrescar(); }));
    $("#pPedir", H).href = `https://wa.me/${WA}?text=${encodeURIComponent(`Hola BoomArt 👋 Quiero el polo ${p.nombre} (${c.nombre.toLowerCase()}).`)}`;
    escena.mostrar({ prod: p.id, av: st.av, toma: st.toma });
  };
  $$("#pGen button", H).forEach((b) => (b.onclick = () => {
    fijarGen(b.dataset.g); $$("#pGen button", H).forEach((x) => x.classList.toggle("on", x === b));
    if (!lista().some((a) => a.id === st.av)) st.av = lista()[0].id; refrescar();
  }));
  $("#pZoom", H).onclick = () => escena.abrir();
  $("#pVolver", H).onclick = () => (location.hash = `#/p/${p.id}`);
  refrescar(); mostrarHoja(H);
}

/* ---------------------------------------------------------------- hojas y rutas */
const cierresHoja=new WeakMap();
function mostrarHoja(H) { clearTimeout(cierresHoja.get(H)); H.hidden = false; bloquear(true); H.scrollTop = 0; setTimeout(() => {H.classList.add("abierta");H.querySelector("button, a[href], input")?.focus({preventScroll:true});}, 30); }
function cerrarHoja(H, quitarBloqueo = true) { H.classList.remove("abierta"); cierresHoja.set(H,setTimeout(() => { H.hidden = true; H.innerHTML = ""; }, 380)); if (quitarBloqueo && $("#visor").hidden) bloquear(false); }
function ruta() {
  const m = location.hash.match(/^#\/p\/([\w-]+)(\/probador)?$/), F = $("#hoja"), P = $("#prob");
  if (visorAbierto) cerrarVisor();
  if (!m) { if (!F.hidden) cerrarHoja(F); if (!P.hidden) cerrarHoja(P); return; }
  if (m[2]) { if (!F.hidden) { F.classList.remove("abierta"); setTimeout(() => { F.hidden = true; F.innerHTML = ""; }, 380); } abrirProbador(m[1]); }
  else { if (!P.hidden) { P.classList.remove("abierta"); setTimeout(() => { P.hidden = true; P.innerHTML = ""; }, 380); } if (F.hidden || F.dataset.id !== m[1]) { F.dataset.id = m[1]; abrirFicha(m[1]); } }
}
document.addEventListener("keydown", (e) => { if ($("#dialogoColeccion")?.open) return; if (e.key === "Escape") { if (visorAbierto) cerrarVisor(); else if (location.hash.startsWith("#/p/")) history.back(); } });

/* ---------------------------------------------------------------- páginas: tallas, teaser, scroll */
function pintarTallas(g = "hombre") {
  $("#tablaTallas").innerHTML = `<thead><tr><th>Talla</th><th>Pecho</th><th>Largo</th><th>Hombros</th><th>Manga</th></tr></thead><tbody>${Object.entries(tablaMedidas(g)).map(([t, v]) => `<tr><td>${t}</td>${v.map((x) => `<td>${x} cm</td>`).join("")}</tr>`).join("")}</tbody>`;
  $$("#segTallas button").forEach((b) => b.classList.toggle("on", b.dataset.g === g));
}
function pintarTeaser() {
  const v = $("#ptVis"), lista = D.productos.flatMap(p=>['hombre','mujer'].flatMap(g=>selDe(p,g).slice(0,1).map(s=>({pid:p.id,...s})))).slice(0,4);
  v.innerHTML = lista.map((s) => `<figure><canvas></canvas><figcaption>${esc(avDe(s.av).nombre)}</figcaption></figure>`).join("");
  $$("canvas", v).forEach((cv, i) => pintarEn(cv, lista[i].pid, lista[i].av, lista[i].toma, 560));
}
function arrancar() {
  D.avatares.forEach((a) => a.tomas.forEach((t) => { if (!tomaNombre[t.toma]) tomaNombre[t.toma] = t.nombre; }));
  pintarFiltros(); pintarGrilla(); pintarTeaser(); pintarTallas(); iniciarHero();
  $("#buscarDisenos").oninput=e=>{filtro.busqueda=e.target.value;filtro.limite=12;pintarGrilla()};
  $("#ordenDisenos").onchange=e=>{filtro.orden=e.target.value;pintarGrilla()};
  $("#limpiarFiltros").onclick=()=>{Object.assign(filtro,{tema:'todos',color:'todos',busqueda:'',limite:12});$("#buscarDisenos").value='';pintarFiltros();pintarGrilla()};
  $("#abrirSeleccion").onclick=abrirSeleccion;
  actualizarContadorSeleccion();
  $$("#segTallas button").forEach((b) => (b.onclick = () => pintarTallas(b.dataset.g)));
  $$("[data-ir]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const t = $(a.getAttribute("href")); if (t) t.scrollIntoView({ behavior: "smooth" }); }));
  $("#abrirProbadorHome").onclick = () => (location.hash = "#/p/" + D.productos[0].id + "/probador");
  const cab = $("#cab"); const f = () => cab.classList.toggle("solido", scrollY > 40); addEventListener("scroll", f, { passive: true }); f();
  addEventListener("hashchange", ruta); ruta();
}
fetch("data/polos.json", { cache: "no-store" }).then((r) => r.json()).then((d) => { D = d; arrancar(); }).catch((e) => { document.body.insertAdjacentHTML("beforeend", `<p style="padding:90px 24px;color:#b50f25">No se pudieron cargar los datos: ${esc(e.message)}</p>`); });

// Contener el foco en el visor abierto; los dialogos nativos gestionan su propio foco.
document.addEventListener('keydown',e=>{
 if(e.key!=='Tab'||document.querySelector('dialog[open]'))return;
 const modal=!$('#visor').hidden?$('#visor'):!$('#prob').hidden?$('#prob'):!$('#hoja').hidden?$('#hoja'):null;
 if(!modal)return;
 const elementos=[...modal.querySelectorAll('button:not([disabled]),a[href],input,select,[tabindex="0"]')].filter(x=>x.getClientRects().length);
 if(!elementos.length)return;
 const primero=elementos[0],ultimo=elementos[elementos.length-1];
 if(e.shiftKey&&(document.activeElement===primero||!modal.contains(document.activeElement))){e.preventDefault();ultimo.focus();}
 else if(!e.shiftKey&&(document.activeElement===ultimo||!modal.contains(document.activeElement))){e.preventDefault();primero.focus();}
});
