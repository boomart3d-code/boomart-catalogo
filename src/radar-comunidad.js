import { radarApi } from "./radar-api.js?v=2";
import { connectSession, element, entryCard, jpegForUpload, labelFor, reasons } from "./radar-ui.js?v=1";

const copy = document.querySelector("[data-copy-link]");
const copyStatus = document.querySelector("[data-copy-status]");
if (navigator.clipboard) {
  copy.hidden = false;
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copy.dataset.url);
      copyStatus.textContent = "Enlace copiado.";
    } catch {
      copyStatus.textContent = "Puedes copiar la dirección de la nota desde el navegador.";
    }
  });
}

const root = document.querySelector("[data-radar-topic]");
const slug = root.dataset.radarTopic;
const status = root.querySelector("[data-status]");
const entries = root.querySelector("[data-entries]");
const voteForm = root.querySelector("[data-vote]");
const likeGroup = root.querySelector("[data-like-group]");
const likeButton = likeGroup.querySelector("button");
const likeCount = likeGroup.querySelector("[data-like-count]");
const send = root.querySelector("[data-contribution]");
const replyLabel = send.querySelector("[data-reply-label]");
const cancelReply = send.querySelector("[data-cancel-reply]");
const photoConsent = send.querySelector("[data-photo-consent]");
const avg = root.querySelector("[data-rating-result]");

function setButtons(form, pending) {
  form.querySelectorAll("button[type=submit]").forEach(button => { button.disabled = pending; });
}

async function run() {
  const api = await radarApi();
  const points = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 });
  let session;
  let available = false;
  let reply = null;
  let requestId = null;
  let photoKey = null;
  let revision = 0;

  function selectReply(entry) {
    reply = entry ? entry.id : null;
    replyLabel.hidden = !entry;
    cancelReply.hidden = !entry;
    replyLabel.textContent = entry ? "Respondes a " + entry.display_name : "";
    if (entry) send.elements.mensaje.focus();
  }

  function focusLogin() {
    status.textContent = "Entra con tu correo para participar.";
    root.querySelector("[data-sign-in] input").focus();
  }

  function addReport(card, entry) {
    const form = element("form", undefined, "radar-report-form");
    const label = element("label", "Motivo del reporte");
    const select = element("select");
    select.required = true;
    for (const [value, title] of Object.entries(reasons)) {
      const option = element("option", title);
      option.value = value;
      select.append(option);
    }
    const submit = element("button", "Enviar reporte", "radar-action radar-action-secondary");
    submit.type = "submit";
    label.append(select);
    form.append(label, submit);
    card.append(form);
    select.focus();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        await api.report(entry.id, select.value);
        form.replaceWith(element("p", "Reporte recibido por moderación.", "radar-small"));
      } catch (error) {
        status.textContent = labelFor(error);
        submit.disabled = false;
      }
    });
  }

  function drawEntries(list, photos) {
    const container = document.createDocumentFragment();
    if (!list.length) container.append(element("p", "Aún no hay aportes. Puedes abrir la conversación.", "radar-small"));
    const grouped = new Map();
    const roots = [];
    for (const entry of list) {
      if (!entry.parent_id) { roots.push(entry); continue; }
      const group = grouped.get(entry.parent_id) || [];
      group.push(entry);
      grouped.set(entry.parent_id, group);
    }
    for (const entry of roots) {
      const append = (item) => {
        const card = entryCard(item, photos[item.photo_key]);
        const actions = element("div", undefined, "radar-entry-actions");
        if (!item.parent_id) {
          const answer = element("button", "Responder", "radar-text-button");
          answer.type = "button";
          answer.addEventListener("click", () => session ? selectReply(item) : focusLogin());
          actions.append(answer);
        }
        const report = element("button", "Reportar", "radar-text-button");
        report.type = "button";
        report.addEventListener("click", () => {
          if (!session) { focusLogin(); return; }
          report.disabled = true;
          addReport(card, item);
        });
        actions.append(report);
        card.append(actions);
        container.append(card);
      };
      append(entry);
      for (const child of grouped.get(entry.id) || []) append(child);
    }
    entries.replaceChildren(container);
  }

  function showParticipation() {
    root.querySelector("[data-login]").hidden = !available || Boolean(session);
    root.querySelector("[data-session]").hidden = !available || !session;
    root.querySelector("[data-community-content]").hidden = !available;
    send.hidden = !available || !session;
  }

  async function refresh() {
    const version = ++revision;
    try {
      const data = await api.discussion(slug);
      const list = data.entries;
      const photos = await api.photos(list.map(entry => entry.photo_key).filter(Boolean)).catch(() => ({}));
      if (version !== revision) return;
      drawEntries(list, photos);
      avg.textContent = data.votes > 0
        ? points.format(Number(data.average)) + " / 5 · " + data.votes + (data.votes === 1 ? " voto" : " votos")
        : "Aún sin valoraciones.";
      for (const input of voteForm.elements.rating) input.checked = Number(input.value) === data.my_rating;
      likeGroup.hidden = !Number.isInteger(data.likes);
      likeButton.setAttribute("aria-pressed", String(data.my_like === true));
      likeCount.textContent = points.format(data.likes ?? 0) + " Me gusta";
      available = true;
      showParticipation();
      if (status.textContent === "Cargando conversación…") status.textContent = "";
    } catch (error) {
      if (version !== revision) return;
      available = false;
      showParticipation();
      status.textContent = labelFor(error);
    }
  }

  async function updateSession(newSession) {
    const oldId = session?.user.id;
    session = newSession;
    if (oldId && oldId !== newSession?.user.id) {
      send.reset();
      selectReply(null);
      requestId = null;
      photoKey = null;
      photoConsent.hidden = true;
    }
    showParticipation();
    status.textContent = available ? "" : "Cargando conversación…";
    await refresh();
  }

  connectSession(root, api, updateSession);

  likeButton.addEventListener("click", async () => {
    if (!session) { focusLogin(); return; }
    const liked = likeButton.getAttribute("aria-pressed") !== "true";
    likeButton.disabled = true;
    try {
      await api.like(slug, liked);
      status.textContent = "";
      await refresh();
    } catch (error) {
      status.textContent = labelFor(error);
    } finally {
      likeButton.disabled = false;
    }
  });

  voteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session) { focusLogin(); return; }
    const vote = Number(new FormData(voteForm).get("rating"));
    if (![1, 2, 3, 4, 5].includes(vote)) { status.textContent = "Elige de una a cinco estrellas."; return; }
    setButtons(voteForm, true);
    try {
      await api.vote(slug, vote);
      status.textContent = "Valoración guardada.";
      await refresh();
    } catch (error) {
      status.textContent = labelFor(error);
    } finally {
      setButtons(voteForm, false);
    }
  });

  cancelReply.addEventListener("click", () => selectReply(null));
  send.elements.foto.addEventListener("change", () => {
    photoKey = null;
    requestId = null;
    photoConsent.hidden = !send.elements.foto.files.length;
    send.elements.permiso.checked = false;
  });

  send.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!session) { focusLogin(); return; }
    setButtons(send, true);
    status.textContent = "Enviando tu aporte…";
    try {
      const alias = send.elements.alias.value.trim();
      const message = send.elements.mensaje.value.trim();
      if (alias.length < 2 || message.length < 5) throw new Error("radar_invalid_entry");
      const file = send.elements.foto.files[0];
      if (file && !send.elements.permiso.checked) throw new Error("radar_image_permission");
      requestId ??= crypto.randomUUID();
      if (file && !photoKey) photoKey = await api.upload(requestId, await jpegForUpload(file));
      await api.submit({ slug, alias, message, request: requestId, parent: reply, photo: photoKey });
      send.reset();
      send.elements.alias.value = alias;
      selectReply(null);
      photoConsent.hidden = true;
      photoKey = null;
      requestId = null;
      status.textContent = "Recibimos tu aporte. Queda pendiente de revisión.";
    } catch (error) {
      status.textContent = labelFor(error);
    } finally {
      setButtons(send, false);
    }
  });

  await updateSession(await api.session());
}

run().catch(error => { status.textContent = labelFor(error); });
