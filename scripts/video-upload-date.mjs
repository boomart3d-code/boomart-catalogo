// Las fechas históricas solo tienen día: se normalizan al inicio de ese día
// en Perú. Si se conoce la hora o zona original, se conserva sin convertirla.
export function videoUploadDate(value = "2026-10-15") {
  const input = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(input);
  if (!match) throw new Error(`uploadDate de video inválido: ${input}`);

  const [, day, hour, minute, second, fraction = "", zone] = match;
  const date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new Error(`Día inexistente en uploadDate: ${input}`);
  }
  if (hour === undefined) return `${day}T00:00:00-05:00`;
  if (+hour > 23 || +minute > 59 || +(second || 0) > 59) {
    throw new Error(`Hora inválida en uploadDate: ${input}`);
  }
  if (zone && zone !== "Z") {
    const [hours, minutes] = zone.slice(1).split(":").map(Number);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
      throw new Error(`Zona horaria inválida en uploadDate: ${input}`);
    }
  }
  return `${day}T${hour}:${minute}:${second || "00"}${fraction}${zone || "-05:00"}`;
}
