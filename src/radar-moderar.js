import { radarApi } from "./radar-api.js?v=1";
import { connectSession, element, entryCard, labelFor, reasons } from "./radar-ui.js?v=1";

const root = document.querySelector("[data-radar-moderation]");
const status = root.querySelector("[data-status]");
const queue = root.querySelector("[data-queue]");

async function run() {
  const api = await radarApi();
  let revision = 0;

  async function refresh(session, notice = "") {
    const version = ++revision;
    root.querySelector("[data-login]").hidden = Boolean(session);
    root.querySelector("[data-session]").hidden = !session;
    queue.hidden = true;
    queue.replaceChildren();
    status.textContent = session ? "Cargando bandeja…" : "Entra con tu cuenta de moderación.";
    if (!session) return;
    try {
      const list = await api.queue();
      const photos = await api.photos(list.map(entry => entry.photo_key).filter(Boolean)).catch(() => ({}));
      if (version !== revision) return;
      status.textContent = notice || (list.length ? "Selecciona qué aportes se pueden mostrar." : "La bandeja está al día.");
      for (const entry of list) {
        const card = entryCard(entry, photos[entry.photo_key]);
        const link = element("a", "Ver nota", "radar-text-button");
        link.href = "/radar/" + encodeURIComponent(entry.post_slug) + "/";
        card.append(element("p", entry.state === "pending" ? "Pendiente de revisión" : "Reportes: " + entry.reports.map(reason => reasons[reason] || reason).join(" · "), "radar-small"), link);
        const controls = element("div", undefined, "radar-entry-actions");
        for (const [action, title] of [
          ["approved", entry.state === "pending" ? "Aprobar" : "Mantener publicado"],
          ["hidden", entry.state === "pending" ? "Rechazar" : "Ocultar"],
        ]) {
          const button = element("button", title, "radar-action" + (action === "hidden" ? " radar-action-secondary" : ""));
          button.type = "button";
          button.addEventListener("click", async () => {
            for (const control of controls.children) control.disabled = true;
            try {
              await api.review(entry.id, action);
              await refresh(session, action === "approved" ? "Aporte aprobado." : "Aporte retirado de la galería pública.");
            } catch (error) {
              if (version !== revision) return;
              status.textContent = labelFor(error);
              for (const control of controls.children) control.disabled = false;
            }
          });
          controls.append(button);
        }
        card.append(controls);
        queue.append(card);
      }
      queue.hidden = false;
    } catch (error) {
      if (version === revision) status.textContent = labelFor(error);
    }
  }

  connectSession(root, api, refresh);
  await refresh(await api.session());
}
run().catch(error => { status.textContent = labelFor(error); });
