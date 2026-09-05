# Activar el inicio de sesión del panel de productos

Esto se hace **una sola vez**. Son puros clics en dos páginas web (GitHub y
Cloudflare) — no hace falta instalar nada ni usar la terminal.

## Paso 1 — Crear la "llave" de acceso en GitHub

1. Abre <https://github.com/settings/developers> (con tu cuenta `boomart3d-code` iniciada).
2. Click en **"New OAuth App"**.
3. Completa el formulario así:
   - **Application name**: `BoomArt Panel de productos`
   - **Homepage URL**: `https://boomart.pe`
   - **Authorization callback URL**: (la completas en el Paso 3, después de crear el Worker — por ahora pon `https://boomart.pe` y ya la corriges)
4. Click **"Register application"**.
5. Anota el **Client ID** que aparece.
6. Click **"Generate a new client secret"** y anota ese valor también (solo se muestra una vez).

Guarda esos dos valores un momento, los vas a necesitar en el Paso 2.

## Paso 2 — Crear el "puente" en Cloudflare (gratis)

1. Entra a <https://dash.cloudflare.com/> y crea una cuenta gratis si no tienes una (puedes registrarte con tu correo).
2. En el menú, busca **Workers y Pages** → **Create** (Crear) → **Create Worker** (elige la plantilla en blanco / "Hello World").
3. Ponle un nombre, por ejemplo `boomart-cms-auth`, y dale **Deploy**.
4. Una vez creado, entra a **Edit code** (Editar código).
5. Borra todo el código de ejemplo y pega en su lugar **todo el contenido** del archivo
   [`oauth-worker/worker.js`](worker.js) de esta misma carpeta.
6. Dale **Deploy** (Guardar y desplegar).
7. Copia la URL de tu Worker que aparece arriba, algo como:
   `https://boomart-cms-auth.tu-usuario.workers.dev`

## Paso 3 — Conectar las dos partes

1. **En Cloudflare**: ve a tu Worker → pestaña **Settings** → **Variables and Secrets** →
   agrega dos "Secret":
   - `GITHUB_OAUTH_ID` = el Client ID del Paso 1
   - `GITHUB_OAUTH_SECRET` = el Client Secret del Paso 1
   - Guarda.
2. **En GitHub**: vuelve a <https://github.com/settings/developers>, entra a tu app
   `BoomArt Panel de productos` → edítala → cambia **Authorization callback URL** a:
   `https://TU-WORKER.workers.dev/callback` (usa la URL real de tu Worker del Paso 2.7)
   → Guarda.
3. **Avísame la URL de tu Worker** — yo actualizo `admin/config.yml` con esa dirección
   y publico el cambio.

## Listo

Después de esto, entra a `https://boomart.pe/admin/`, click en **"Login with GitHub"**,
acepta el permiso, y ya puedes editar el catálogo desde ahí.

## ¿Es seguro?

Sí. El Worker solo hace de intermediario para el inicio de sesión — no guarda tus
datos ni tiene acceso a nada más que a este repositorio de GitHub. Nadie más que tú
puede editar el catálogo: para entrar hace falta iniciar sesión con la cuenta de
GitHub `boomart3d-code`.
