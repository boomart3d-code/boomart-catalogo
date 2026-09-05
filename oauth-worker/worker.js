/*
 * Puente de inicio de sesion con GitHub para el panel de productos (Decap CMS).
 * No guarda nada, no tiene base de datos: solo intercambia el "codigo" que da GitHub
 * por un token de acceso, usando el Client Secret que NUNCA debe estar en la web publica.
 *
 * Como desplegar (una sola vez): ver oauth-worker/README.md en este mismo repositorio.
 *
 * Variables/"Secrets" que este Worker necesita (se configuran en el panel de Cloudflare,
 * NO en este archivo):
 *   GITHUB_OAUTH_ID      -> Client ID de tu GitHub OAuth App
 *   GITHUB_OAUTH_SECRET  -> Client Secret de tu GitHub OAuth App
 */

function randomState() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function handleAuth(url, env) {
  const provider = url.searchParams.get("provider");
  if (provider !== "github") {
    return new Response("Proveedor invalido", { status: 400 });
  }

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.GITHUB_OAUTH_ID);
  authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/callback?provider=github`);
  authorizeUrl.searchParams.set("scope", "public_repo,user");
  authorizeUrl.searchParams.set("state", randomState());

  return Response.redirect(authorizeUrl.toString(), 302);
}

function renderCallbackPage(status, payload) {
  const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
  const html = `<!doctype html>
<html>
  <body>
    <p>${status === "success" ? "Iniciando sesion..." : "No se pudo iniciar sesion."}</p>
    <script>
      (function () {
        function receiveMessage(event) {
          window.opener.postMessage(${JSON.stringify(message)}, event.origin);
          window.removeEventListener("message", receiveMessage, false);
        }
        window.addEventListener("message", receiveMessage, false);
        window.opener.postMessage("authorizing:github", "*");
      })();
    </script>
  </body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function handleCallback(url, env) {
  const provider = url.searchParams.get("provider");
  if (provider !== "github") {
    return new Response("Proveedor invalido", { status: 400 });
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Falta el codigo de GitHub", { status: 400 });
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_ID,
      client_secret: env.GITHUB_OAUTH_SECRET,
      code,
      redirect_uri: `${url.origin}/callback?provider=github`,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
    return renderCallbackPage("error", {
      message: tokenData.error_description || tokenData.error || "No se recibio un token de GitHub.",
    });
  }

  return renderCallbackPage("success", { token: tokenData.access_token, provider: "github" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/auth") {
      return handleAuth(url, env);
    }
    if (url.pathname === "/callback") {
      return handleCallback(url, env);
    }
    return new Response("BoomArt OAuth bridge activo.");
  },
};
