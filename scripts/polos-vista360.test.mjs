import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...x) => path.join(ROOT, 'polos', ...x);
const read = async (...x) => (await readFile(P(...x), 'utf8')).replace(/\r\n/g, '\n');
const SEGURO = /^[a-z0-9][a-z0-9._-]*$/;
const ESTADOS = ['generado', 'revisado', 'aprobado', 'publicado'];
const data = JSON.parse(await read('data', 'polos.json'));
const conVista = data.productos.filter(p => p.vista360);

async function paginasGeneradas() {
  const salida = [P('index.html')];
  for (const carpeta of ['diseno', 'coleccion']) {
    for (const d of await readdir(P(carpeta))) salida.push(P(carpeta, d, 'index.html'));
  }
  return salida;
}

test('la plantilla trae el bloque del 360 oculto y sin recursos', async () => {
  const t = await read('plantilla.html');
  assert.match(t, /<div class="ficha-360" id="ficha360" hidden>/);
  assert.match(t, /<button id="ver360" type="button"/);
  assert.doesNotMatch(t, /vista360\//, 'la plantilla no debe nombrar secuencias concretas');
  assert.doesNotMatch(t, /visor360\.(js|css)/, 'el visor no se carga desde la plantilla');
  assert.doesNotMatch(t, /<link[^>]+rel="(preload|prefetch|preconnect)"[^>]+360/i);
});

test('ninguna pagina generada pide el visor ni las imagenes del 360 al abrirse', async () => {
  for (const archivo of await paginasGeneradas()) {
    const html = await readFile(archivo, 'utf8');
    assert.doesNotMatch(html, /visor360\.(js|css)/, archivo);
    assert.doesNotMatch(html, /(src|href|srcset|imagesrcset)="[^"]*vista360\//, archivo);
  }
});

test('polos.js solo descarga el visor desde el boton', async () => {
  const js = await read('polos.js');
  assert.equal((js.match(/visor360\.js\?v=/g) || []).length, 1);
  assert.equal((js.match(/cargarVisor360\(/g) || []).length, 2, 'una definicion y una llamada (dentro de alternar360)');
  assert.match(js, /function alternar360\(\)[\s\S]*cargarVisor360\(\)/);
  assert.match(js, /\$\("ver360"\)\.onclick = alternar360/);
  assert.match(js, /details\.addEventListener\("close", \(\) => \{\n\s*cerrar360\(\);/, 'al cerrar la ficha se libera el visor');
});

test('el visor es pequeno, sin dependencias y aislado del carrito', async () => {
  const js = await read('visor360.js');
  const css = await read('visor360.css');
  assert.ok(Buffer.byteLength(js) <= 12 * 1024, 'visor360.js supera 12 KB');
  assert.doesNotMatch(js, /https?:\/\//, 'sin recursos externos');
  assert.doesNotMatch(js, /\beval\(|new Function\(|\bimport\s|\brequire\(/);
  assert.match(js, /AbortController/);
  assert.match(js, /rueda\.setAttribute\("role", "slider"\)/, 'el giro se controla con una rueda accesible por teclado');
  assert.match(js, /rueda\.addEventListener\("keydown", alTecla\)/, 'la rueda responde a las flechas');
  assert.match(js, /control\.append\(mFrente, rueda, mEspalda\);\s*contenedor\.append\(lienzo, control\);/, 'la rueda va debajo de la foto, no encima');
  assert.doesNotMatch(js, /aria-valuemax", "0"|perilla\.max/, 'la rueda gira sin fin: no tiene tope');
  assert.doesNotMatch(css, /\.v360-(control|rueda|rueda-lona|marcas|marca)[^{]*\{[^}]*position:\s*absolute/, 'los controles de giro no se superponen al polo');
  assert.match(js, /function alBajar\(e\) \{[\s\S]{0,200}closest\("button"\)\) return;[\s\S]{0,400}setPointerCapture/, 'los botones del visor no deben iniciar arrastre (perdian el clic)');
  const selectores = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]+\{/g, '').split('}').map(b => b.split('{')[0].trim()).filter(Boolean);
  for (const grupo of selectores) for (const s of grupo.split(',')) assert.match(s.trim(), /^\.v360/, 'selector fuera de .v360: ' + s.trim());
});

for (const p of conVista) {
  for (const [corte, v] of Object.entries(p.vista360)) {
    test(`vista360 de ${p.id} (${corte}): manifiesto, archivos y presupuesto`, async () => {
      assert.ok(['hombre', 'mujer', 'unisex'].includes(corte));
      assert.match(v.manifest, /^vista360\/[a-z0-9-]+\/[a-f0-9]{12}\/manifest\.json$/);
      const manifestPath = P(...v.manifest.split('/'));
      assert.ok(manifestPath.startsWith(P('vista360') + path.sep), 'ruta fuera de vista360');
      const raw = await readFile(manifestPath, 'utf8');
      const m = JSON.parse(raw);
      const raiz = path.dirname(manifestPath);
      assert.equal(m.schema_version, 1);
      assert.equal(m.id, p.id);
      assert.ok(ESTADOS.includes(m.estado), 'estado no permitido: ' + m.estado);
      assert.equal(m.variante.corte, corte);
      assert.equal(m.variante.talla, v.talla);
      assert.equal(m.vista.referencial, true, 'las medidas son referenciales y debe decirlo');
      for (const prohibido of ['D:\\', 'C:\\', 'osore', 'ppp', 'precio', 'flete', 'costo']) assert.ok(!raw.toLowerCase().includes(prohibido.toLowerCase()), 'el manifiesto contiene ' + prohibido);
      const c = m.cuadros;
      assert.equal(c.cantidad, c.archivos.length);
      assert.equal(c.cantidad, c.azimutes_grados.length);
      assert.ok(c.inicio_indice >= 0 && c.inicio_indice < c.cantidad);
      const rutas = [m.poster, ...c.archivos, ...Object.values(m.detalle).map(d => d.archivo)];
      let totalCuadros = 0;
      for (const r of rutas) {
        for (const parte of r.split('/')) assert.match(parte, SEGURO, 'ruta no segura: ' + r);
        assert.ok(!path.isAbsolute(r) && !r.split('/').includes('..'));
        const archivo = path.join(raiz, ...r.split('/'));
        assert.ok(archivo.startsWith(raiz + path.sep), 'fuera de la carpeta del manifiesto: ' + r);
        const s = await stat(archivo);
        assert.ok(s.size > 0, 'vacio: ' + r);
        if (c.archivos.includes(r)) totalCuadros += s.size;
      }
      assert.ok(totalCuadros <= 3 * 1024 * 1024, 'el recorrido supera 3 MB: ' + totalCuadros);
      const primero = (await stat(path.join(raiz, ...c.archivos[c.inicio_indice].split('/')))).size;
      const poster = (await stat(path.join(raiz, m.poster))).size;
      assert.ok(primero + poster + Buffer.byteLength(raw) <= 300 * 1024, 'la primera vista supera 300 KB sin contar el codigo');
      // sin archivos huerfanos en la carpeta de la secuencia
      const presentes = [];
      const recorrer = async d => { for (const e of await readdir(d, {withFileTypes: true})) e.isDirectory() ? await recorrer(path.join(d, e.name)) : presentes.push(path.relative(raiz, path.join(d, e.name)).split(path.sep).join('/')); };
      await recorrer(raiz);
      const esperados = new Set([...rutas, 'manifest.json']);
      assert.deepEqual(presentes.filter(f => !esperados.has(f)), [], 'archivos sin usar en el paquete');
    });
  }
}

test('la secuencia se puede quitar por producto sin afectar fotos ni compra', () => {
  for (const p of data.productos) {
    assert.ok(p.fotos?.length > 0, p.id + ' debe conservar sus fotos');
    assert.ok(p.precio > 0 && p.tallas?.length, p.id + ' debe conservar precio y tallas');
  }
});
