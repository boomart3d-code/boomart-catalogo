/*
 * Service worker del portal de Marcos («Mi vitrina»). Hace UNA sola cosa: que la aplicacion instalada abra aunque la senal sea mala.
 *  - Solo atiende pedidos GET del mismo sitio dentro de /vitrina/ (los archivos de la aplicacion).
 *  - Nunca toca: la API y las fotos (otro dominio), nada que no sea GET, ni /vitrina/admin/ (el panel de BoomArt comparte la carpeta).
 *  - Estrategia «red primero»: si hay internet siempre se usa lo ultimo publicado (y se guarda una copia); si la red tarda mas de 5 s
 *    o no hay senal, se usa la copia guardada. Asi una actualizacion nunca queda atrapada en el cache.
 *  - No guarda claves, sesiones ni datos de la tienda: eso vive en el almacenamiento de la pagina, no aqui.
 * Para retirarlo en una emergencia: publicar un sw.js que llame a self.registration.unregister() y borre los caches.
 */
"use strict";

const CACHE = "vitrina-app-v1";
const ESPERA_RED_MS = 5000;
const RAIZ = new URL("./", self.location.href);          // https://boomart.pe/vitrina/
const ADMIN = new URL("admin/", RAIZ).pathname;           // /vitrina/admin/

self.addEventListener("install", () => { self.skipWaiting(); });

self.addEventListener("activate", (evento) => {
  evento.waitUntil((async () => {
    for (const nombre of await caches.keys()) if (nombre.startsWith("vitrina-app-") && nombre !== CACHE) await caches.delete(nombre);
    await self.clients.claim();
  })());
});

function esNuestro(url) {
  return url.origin === RAIZ.origin && url.pathname.startsWith(RAIZ.pathname) && !url.pathname.startsWith(ADMIN) && url.pathname !== new URL("sw.js", RAIZ).pathname;
}

/** Guarda la copia y borra las versiones viejas del mismo archivo (por ejemplo styles.css?v=1 cuando llega ?v=2). */
async function guardar(cache, peticion, respuesta) {
  const url = new URL(peticion.url);
  for (const viejo of await cache.keys()) {
    const v = new URL(viejo.url);
    if (v.pathname === url.pathname && v.search !== url.search) await cache.delete(viejo);
  }
  await cache.put(peticion, respuesta);
}

async function redPrimero(evento) {
  const peticion = evento.request;
  const cache = await caches.open(CACHE);
  const red = fetch(peticion).then((respuesta) => {
    // La copia se guarda en segundo plano: la pantalla no espera a que termine de escribirse.
    if (respuesta && respuesta.ok && respuesta.type === "basic") evento.waitUntil(guardar(cache, peticion, respuesta.clone()).catch(() => null));
    return respuesta;
  });
  red.catch(() => { /* el error se atiende abajo; esto evita avisos sueltos si la copia gano la carrera */ });
  evento.waitUntil(red.catch(() => null));
  const copia = () => cache.match(peticion, { ignoreSearch: peticion.mode === "navigate" });
  try {
    return await Promise.race([red, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error("lenta")), ESPERA_RED_MS))]);
  } catch (error) {
    const guardada = await copia();
    return guardada || red;       // sin copia: se espera a la red; si tambien falla, el navegador muestra su aviso normal
  }
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if (!esNuestro(url)) return;
  evento.respondWith(redPrimero(evento));
});
