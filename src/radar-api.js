const BUCKET = "radar-fotos";

export async function radarApi() {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]") {
    const { demoApi } = await import("./radar-demo.js?v=2");
    return demoApi();
  }
  if (document.readyState === "loading") {
    await new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  }
  const cfg = window.BOOMART_SUPABASE;
  if (!cfg || !window.supabase) throw new Error("radar_unavailable");
  const sb = window.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { storageKey: "boomart-radar-auth", detectSessionInUrl: true },
  });

  function unwrap({ data, error }) {
    if (error) throw error;
    return data;
  }

  async function rpc(name, args) {
    return unwrap(await sb.rpc("radar_" + name, args));
  }

  return {
    preview: false,
    session: async () => unwrap(await sb.auth.getSession()).session,
    watch: (callback) => sb.auth.onAuthStateChange((event, session) => {
      if (["SIGNED_IN", "SIGNED_OUT", "INITIAL_SESSION"].includes(event)) setTimeout(() => callback(session), 0);
    }),
    signIn: async (email) => unwrap(await sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: location.origin + location.pathname },
    })),
    signOut: async () => unwrap(await sb.auth.signOut()),
    discussion: (slug) => rpc("discussion", { p_slug: slug }),
    vote: (slug, rating) => rpc("rate", { p_slug: slug, p_rating: rating }),
    like: (slug, liked) => rpc("set_like", { p_slug: slug, p_liked: liked }),
    report: (id, reason) => rpc("report", { p_entry: id, p_reason: reason }),
    queue: () => rpc("moderation_queue"),
    review: (id, state) => rpc("moderate", { p_entry: id, p_state: state }),
    upload: async (request, file) => {
      await rpc("reserve_photo", { p_request: request });
      const key = request + ".jpg";
      const result = await sb.storage.from(BUCKET).upload(key, file, { contentType: "image/jpeg", upsert: false });
      if (result.error && ![409, "409"].includes(result.error.statusCode) && result.error.code !== "Duplicate") throw result.error;
      return key;
    },
    submit: ({ slug, alias, message, request, parent, photo }) => rpc("submit_entry", {
      p_slug: slug, p_alias: alias, p_message: message, p_request: request, p_parent: parent, p_photo: photo,
    }),
    photos: async (keys) => {
      if (!keys.length) return {};
      const rows = unwrap(await sb.storage.from(BUCKET).createSignedUrls([...new Set(keys)], 180));
      return Object.fromEntries(rows.filter(row => !row.error && row.signedUrl).map(row => [row.path, row.signedUrl]));
    },
  };
}
