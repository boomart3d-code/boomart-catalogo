const dateFormat = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "America/Lima" });
export const reasons = {
  respeto: "Falta de respeto", privacidad: "Datos personales", derechos: "Uso de foto sin permiso",
  spam: "Publicidad o mensajes repetidos", otro: "Otro motivo",
};

export function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
}

export function labelFor(error) {
  const text = error?.message || "";
  if (text.includes("radar_slow_down")) return "Alcanzaste el límite temporal de aportes o fotos. Vuelve a intentarlo más tarde.";
  if (text.includes("radar_forbidden")) return "Este acceso está reservado al equipo de moderación.";
  if (text.includes("radar_auth_required")) return "Entra con tu correo para continuar.";
  if (text.includes("radar_invalid_parent") || text.includes("radar_entry_unavailable")) return "Ese comentario ya no está disponible.";
  if (text.includes("radar_invalid_photo")) return "La foto no quedó vinculada. Elígela de nuevo y reintenta.";
  if (text.includes("radar_image_format")) return "Elige una foto JPG, PNG o WebP de hasta 12 MB.";
  if (text.includes("radar_image_size")) return "La foto es demasiado pesada después de comprimirla. Prueba con una versión más pequeña.";
  if (text.includes("radar_image_permission")) return "Confirma que tienes permiso para publicar la fotografía.";
  if (text.includes("radar_invalid_entry")) return "Revisa el alias y el aporte. El texto debe tener entre 5 y 1200 caracteres.";
  if (error?.code === "PGRST202") return "La comunidad aún no está habilitada.";
  return "No pudimos completar la acción. Inténtalo de nuevo.";
}

export function connectSession(root, api, update) {
  const authForm = root.querySelector("[data-sign-in]");
  const authStatus = root.querySelector("[data-status]");
  const hint = root.querySelector("[data-login-hint]");
  const enter = authForm.querySelector("button");
  root.querySelector("[data-preview]").hidden = !api.preview;
  if (api.preview) {
    hint.textContent = root.hasAttribute("data-radar-moderation")
      ? "Para probar la bandeja, entra con moderacion@demo.test."
      : "Usa un correo de prueba, por ejemplo lector@demo.test. La vista local no enviará un correo.";
    enter.textContent = "Entrar en la vista de prueba";
  }
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    enter.disabled = true;
    try {
      await api.signIn(authForm.elements.correo.value.trim());
      authForm.reset();
      if (!api.preview) authStatus.textContent = "Revisa tu correo para abrir el enlace y entrar.";
    } catch (error) {
      authStatus.textContent = labelFor(error);
    } finally {
      enter.disabled = false;
    }
  });

  root.querySelector("[data-sign-out]").addEventListener("click", async () => {
    try { await api.signOut(); }
    catch (error) { authStatus.textContent = labelFor(error); }
  });
  api.watch(update);
}

export function entryCard(entry, url) {
  const card = element("article", undefined, entry.parent_id ? "radar-entry radar-entry-reply" : "radar-entry");
  const time = element("time", dateFormat.format(new Date(entry.created_at)));
  time.dateTime = entry.created_at;
  const who = element("header");
  who.append(element("strong", entry.display_name), time);
  card.append(who, element("p", entry.message));
  if (url) {
    const image = element("img");
    image.src = url;
    image.alt = "Foto de colección compartida por " + entry.display_name;
    image.loading = "lazy";
    card.append(image);
  }
  return card;
}

export async function jpegForUpload(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12_000_000) {
    throw new Error("radar_image_format");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#faf7f0";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!jpeg || jpeg.size > 2_500_000) throw new Error("radar_image_size");
    return jpeg;
  } finally {
    bitmap.close();
  }
}
