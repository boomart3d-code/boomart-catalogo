// Pruebas de la lógica del Amigo Secreto por correo (supabase/functions/amigo-secreto/logic.ts).
// Ejecutar: node --test scripts/amigo-secreto.test.mjs   (Node 22.18+ ejecuta TypeScript sin compilar)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validar, sortear, ideasDeRegalo, correoConfirmacion, correoParticipante, correoResumen, correoSuscripcion,
  CODIGO_DESCUENTO, MAX_P,
} from "../supabase/functions/amigo-secreto/logic.ts";

const base = () => ({
  accion: "crear", acepta: true, evento: "Navidad oficina", tipo: "oficina", fecha: "2026-12-23", presupuesto: "50",
  nota: "En la sala de reuniones", modo: "secreto", web: "",
  organizador: { nombre: "Organiza Prueba", email: "organiza@ejemplo.test" },
  participantes: [
    { nombre: "Ana Prueba", email: "ana@ejemplo.test" }, { nombre: "Luis Prueba", email: "luis@ejemplo.test" },
    { nombre: "Carmen Prueba", email: "carmen@ejemplo.test" }, { nombre: "Jorge Prueba", email: "JORGE@Ejemplo.test " },
  ],
  excepciones: [[0, 1]],
});
const rand = (n) => Math.floor(Math.random() * n);

test("validar acepta un sorteo correcto y limpia datos", () => {
  const v = validar(base());
  assert.equal(v.ok, true);
  assert.equal(v.sorteo.presupuesto, 50);
  assert.equal(v.sorteo.participantes[3].email, "jorge@ejemplo.test");
  assert.deepEqual(v.sorteo.excepciones, [[0, 1]]);
  assert.equal(v.sorteo.modo, "secreto");
});

test("validar rechaza lo que debe", () => {
  const casos = [
    [(b) => { b.acepta = false; }, /Confirma/],
    [(b) => { b.web = "robot"; }, /No se pudo/],
    [(b) => { b.organizador.email = "mal"; }, /correo de organizador/],
    [(b) => { b.participantes[1].email = "sin-arroba"; }, /Luis/],
    [(b) => { b.participantes[2].nombre = "ana prueba"; }, /repetido/],
    [(b) => { b.participantes[2].email = "ana@ejemplo.test"; }, /repetido/],
    [(b) => { b.participantes = b.participantes.slice(0, 2); }, /al menos 3/],
    [(b) => { b.participantes = Array.from({ length: MAX_P + 1 }, (_, i) => ({ nombre: "P" + i, email: `p${i}@ejemplo.test` })); }, /máximo/],
    [(b) => { b.presupuesto = "-5"; }, /presupuesto/],
  ];
  for (const [cambio, msg] of casos) { const b = base(); cambio(b); const v = validar(b); assert.equal(v.ok, false); assert.match(v.error, msg); }
});

test("validar descarta excepciones inválidas", () => {
  const b = base(); b.excepciones = [[0, 0], [0, 9], ["x", 1], [2, 3]];
  assert.deepEqual(validar(b).sorteo.excepciones, [[2, 3]]);
});

test("sortear respeta reglas en 2000 sorteos y cubre todas las combinaciones", () => {
  const n = 6, exc = [[0, 1]], vistos = new Set();
  for (let k = 0; k < 2000; k++) {
    const to = sortear(n, exc, rand);
    assert.ok(to);
    assert.equal(new Set(to).size, n);
    to.forEach((r, g) => { assert.notEqual(r, g); assert.ok(!(g === 0 && r === 1) && !(g === 1 && r === 0)); vistos.add(g + ">" + r); });
  }
  assert.equal(vistos.size, n * (n - 1) - 2);
});

test("sortear devuelve null si es imposible", () => {
  assert.equal(sortear(3, [[0, 1], [1, 2], [0, 2]], rand), null);
});

test("ideas de regalo del catálogo real: dentro del presupuesto, variadas y sin Halloween", () => {
  const productos = JSON.parse(readFileSync(new URL("../catalogo.json", import.meta.url), "utf8")).products;
  const ideas = ideasDeRegalo(productos, 50);
  assert.ok(ideas.length > 0 && ideas.length <= 4);
  for (const p of ideas) { assert.ok(Number(p.priceFrom) <= 50); assert.doesNotMatch(p.category || "", /halloween/i); }
  assert.equal(new Set(ideas.map((p) => p.category)).size, ideas.length);
  assert.deepEqual(ideasDeRegalo(productos, 5), []);
  assert.ok(ideasDeRegalo(productos, null).every((p) => Number(p.priceFrom) <= 80));
});

test("correo del participante: su amigo secreto, datos, ideas, código y botón de ofertas; escapa HTML", () => {
  const b = base(); b.participantes[2].nombre = "<script>x</script>";
  const s = validar(b).sorteo;
  const ideas = [{ name: "Maceta Groot", url: "https://boomart.pe/producto/maceta-groot/", priceFrom: 45, category: "Macetas" }];
  const c = correoParticipante(s, 0, s.participantes[2].nombre, ideas, "https://boomart.pe/amigo-secreto/?ofertas=TOKEN");
  assert.equal(c.to, "ana@ejemplo.test");
  assert.match(c.subject, /Navidad oficina/);
  assert.match(c.html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(c.html, /<script>/);
  assert.match(c.html, /Organiza Prueba te incluyó/);
  assert.match(c.html, /S\/ 50/);
  assert.match(c.html, /Maceta Groot/);
  assert.match(c.html, new RegExp(CODIGO_DESCUENTO));
  assert.match(c.html, /\?ofertas=TOKEN/);
  assert.doesNotMatch(c.html, /Luis Prueba|Jorge Prueba/); // no muestra a otros participantes
  assert.match(c.text, /Te tocó regalarle a: <script>x<\/script>/);
});

test("resumen al organizador: sin parejas en modo secreto, con parejas en modo admin", () => {
  const s = validar(base()).sorteo, to = [2, 3, 0, 1];
  const secreto = correoResumen(s, to, []);
  assert.doesNotMatch(secreto.html, /le regala a/);
  assert.doesNotMatch(secreto.text, /->/);
  assert.match(secreto.html, /Nadie, ni siquiera tú/);
  const admin = correoResumen({ ...s, modo: "admin" }, to, [3]);
  assert.match(admin.html, /Ana Prueba<\/td><td[^>]*>le regala a<\/td><td[^>]*>Carmen Prueba/);
  assert.match(admin.html, /3 de 4/);
  assert.match(admin.text, /Ana Prueba -> Carmen Prueba/);
});

test("correo de confirmación y de suscripción llevan sus enlaces", () => {
  const s = validar(base()).sorteo;
  const c = correoConfirmacion(s, "https://boomart.pe/amigo-secreto/?confirmar=ABC");
  assert.equal(c.to, "organiza@ejemplo.test");
  assert.match(c.html, /\?confirmar=ABC/);
  assert.match(c.html, /4 participantes/);
  const u = correoSuscripcion("Ana Prueba", "ana@ejemplo.test", "https://boomart.pe/amigo-secreto/?baja=XYZ");
  assert.match(u.html, /\?baja=XYZ/);
});

test("participante y organizador reciben la invitación a organizar otro sorteo; la confirmación no", () => {
  const s = validar(base()).sorteo;
  const enlace = /amigo-secreto\/\?utm_source=amigo-secreto&(amp;)?utm_medium=email&(amp;)?utm_campaign=organiza-el-tuyo/;
  const p = correoParticipante(s, 0, s.participantes[1].nombre, [], "https://boomart.pe/amigo-secreto/?ofertas=T");
  assert.match(p.html, enlace); assert.match(p.text, enlace);
  const r = correoResumen(s, [1, 2, 3, 0], []);
  assert.match(r.html, enlace); assert.match(r.text, enlace);
  assert.doesNotMatch(correoConfirmacion(s, "https://boomart.pe/amigo-secreto/?confirmar=A").html, /organiza-el-tuyo/);
});
