const DB = "boomart-radar-preview";
const SESSION = "boomart-radar-preview-session";
const MODERATOR = "moderacion@demo.test";
const read = () => JSON.parse(localStorage.getItem(DB) || '{"entries":[],"votes":[],"photos":{},"reports":[]}');
const write = (state) => localStorage.setItem(DB, JSON.stringify(state));
const session = () => JSON.parse(localStorage.getItem(SESSION) || "null");
const visible = (state, entry) => entry.state === "approved" &&
  (!entry.parent_id || state.entries.some(parent => parent.id === entry.parent_id && parent.state === "approved"));

function activeAccount() {
  const current = session();
  if (!current) throw new Error("radar_auth_required");
  return current.user.id;
}

function moderator() {
  if (activeAccount() !== MODERATOR) throw new Error("radar_forbidden");
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function demoApi() {
  const callbacks = new Set();
  const notify = () => callbacks.forEach(callback => callback(session()));
  addEventListener("storage", event => { if (event.key === SESSION) notify(); });
  return {
    preview: true,
    session: async () => session(),
    watch: (callback) => callbacks.add(callback),
    signIn: async (email) => {
      localStorage.setItem(SESSION, JSON.stringify({ user: { id: email.toLowerCase() } }));
      notify();
    },
    signOut: async () => { localStorage.removeItem(SESSION); notify(); },
    discussion: async (slug) => {
      const state = read();
      const votes = state.votes.filter(vote => vote.slug === slug);
      const likes = (state.likes ?? []).filter(like => like.slug === slug);
      const author = session()?.user.id;
      return {
        entries: state.entries.filter(entry => entry.post_slug === slug && visible(state, entry)),
        votes: votes.length,
        average: votes.length ? votes.reduce((sum, vote) => sum + vote.rating, 0) / votes.length : null,
        my_rating: votes.find(vote => vote.author === author)?.rating,
        likes: likes.length,
        my_like: likes.some(like => like.author === author),
      };
    },
    vote: async (slug, rating) => {
      const author = activeAccount();
      const state = read();
      state.votes = state.votes.filter(vote => vote.slug !== slug || vote.author !== author);
      state.votes.push({ slug, rating, author });
      write(state);
    },
    like: async (slug, liked) => {
      const author = activeAccount();
      const state = read();
      state.likes = (state.likes ?? []).filter(like => like.slug !== slug || like.author !== author);
      if (liked) state.likes.push({ slug, author });
      write(state);
    },
    upload: async (request, file) => {
      const owner = activeAccount();
      const url = await toDataUrl(file);
      const state = read();
      const key = request + ".jpg";
      state.photos[key] = { url, owner };
      write(state);
      return key;
    },
    submit: async ({ slug, alias, message, request, parent, photo }) => {
      const author = activeAccount();
      const state = read();
      const prior = state.entries.find(entry => entry.request === request && entry.author === author);
      if (prior) return prior.id;
      if (parent && !state.entries.some(entry => entry.id === parent && entry.post_slug === slug && visible(state, entry))) {
        throw new Error("radar_invalid_parent");
      }
      if (photo && state.photos[photo]?.owner !== author) throw new Error("radar_invalid_photo");
      const id = crypto.randomUUID();
      state.entries.push({
        id, request, post_slug: slug, display_name: alias, message, author, state: "pending",
        created_at: new Date().toISOString(), photo_key: photo, parent_id: parent,
      });
      write(state);
      return id;
    },
    report: async (id, reason) => {
      const reporter = activeAccount();
      const state = read();
      if (!state.reports.some(report => report.id === id && report.reporter === reporter)) {
        state.reports.push({ id, reporter, reason });
        write(state);
      }
    },
    queue: async () => {
      moderator();
      const state = read();
      return state.entries.map(entry => ({
        ...entry, reports: state.reports.filter(report => report.id === entry.id).map(report => report.reason),
      })).filter(entry => entry.state === "pending" || (entry.state === "approved" && entry.reports.length));
    },
    review: async (id, result) => {
      moderator();
      const state = read();
      const entry = state.entries.find(item => item.id === id && item.state !== "hidden");
      if (!entry) throw new Error("radar_entry_unavailable");
      entry.state = result;
      state.reports = state.reports.filter(report => report.id !== id);
      write(state);
    },
    photos: async (keys) => {
      const state = read();
      const author = session()?.user.id;
      return Object.fromEntries(keys.filter(key => state.photos[key] &&
        (author === MODERATOR || author === state.photos[key].owner ||
          state.entries.some(entry => entry.photo_key === key && visible(state, entry)))
      ).map(key => [key, state.photos[key].url]));
    },
  };
}
