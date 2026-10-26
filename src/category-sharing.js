(() => {
  const canShare = () => typeof navigator.share === "function" &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch { /* Older browsers and denied clipboard permissions. */ }
    const focus = document.activeElement;
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
    try {
      document.body.append(input);
      input.select();
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      input.remove();
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    }
  };

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-category-share]");
    if (!button || button.disabled) return;
    const row = button.closest(".category-share-row");
    const feedback = row?.querySelector(".category-share-feedback");
    const category = button.dataset.categoryName;
    const rawUrl = button.dataset.categoryUrl;
    if (!category || !rawUrl) return;
    // Share the category's own address, never the current search or product modal.
    const url = new URL(rawUrl);
    if (url.origin !== "https://boomart.pe") return;
    url.search = "";
    url.hash = "";
    url.searchParams.set("src", "compartir");
    if (feedback) feedback.replaceChildren();
    const restoreFocus = document.activeElement === button;
    button.disabled = true;
    let method = "copiar";
    try {
      if (canShare()) {
        try {
          await navigator.share({
            title: `${category} | BoomArt`,
            text: `Mira el catálogo de ${category} de BoomArt.`,
            url: url.href,
          });
          method = "menu";
        } catch (error) {
          if (error.name === "AbortError") return;
          method = "copiar";
        }
      }
      if (method === "copiar") {
        const copied = await copyLink(url.href);
        // A category may change while its share sheet is open.
        if (feedback && button.dataset.categoryUrl === rawUrl) {
          if (copied) {
            feedback.textContent = "Enlace copiado";
          } else {
            feedback.textContent = "Copia este enlace: ";
            const input = document.createElement("input");
            input.readOnly = true;
            input.value = url.href;
            input.setAttribute("aria-label", `Enlace del catálogo de ${category}`);
            input.addEventListener("focus", () => input.select());
            feedback.append(input);
          }
        }
        if (!copied) return;
      }
      try {
        window.BoomartTrack?.event("compartir", { o: method, d: { categoria: category } });
      } catch { /* Measurement must not interrupt sharing. */ }
    } finally {
      button.disabled = false;
      if (restoreFocus && button.isConnected && !button.closest("[hidden]")) {
        button.focus({ preventScroll: true });
      }
    }
  });
})();
