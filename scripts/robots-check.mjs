// Evaluador minimo de robots.txt (RFC 9309) para comprobar, con el nombre de un rastreador,
// si una ruta esta permitida. Sirve para verificar que OAI-AdsBot y OAI-SearchBot pueden
// entrar a las paginas y fotos del feed. Funciones puras.

/** Convierte el texto de robots.txt en grupos { agents: [...], rules: [{ allow, path }] }. */
export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") current.rules.push({ allow: key === "allow", path: value });
  }
  return groups;
}

// Patron de robots.txt (con * y $) a expresion regular anclada al inicio de la ruta.
function patternToRegex(pattern) {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Grupo que le corresponde a un rastreador: el suyo por nombre, y si no, el comodin (*). */
export function groupFor(groups, userAgent) {
  const token = String(userAgent).toLowerCase();
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  if (own.length) {
    // varios grupos con el mismo nombre se combinan; gana el agente mas especifico (mas largo)
    const best = Math.max(...own.flatMap((g) => g.agents.filter((a) => a !== "*" && token.includes(a)).map((a) => a.length)));
    return own.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a) && a.length === best));
  }
  return groups.filter((g) => g.agents.includes("*"));
}

/** ¿Puede el rastreador `userAgent` pedir `pathname`? Gana la regla mas larga; en empate, Allow. */
export function robotsAllows(text, userAgent, pathname) {
  const groups = groupFor(parseRobots(text), userAgent);
  if (!groups.length) return true;
  let best = null;
  for (const g of groups) {
    for (const r of g.rules) {
      if (r.path === "") continue; // "Disallow:" vacio = todo permitido
      if (!patternToRegex(r.path).test(pathname)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow && !best.allow)) best = r;
    }
  }
  return best ? best.allow : true;
}
