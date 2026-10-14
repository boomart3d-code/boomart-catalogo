"""Prepara los datos de DB-IP Lite para cargarlos en Supabase (solo lee los .gz y escribe CSV).

Salida (en la carpeta de salida):
  pais_v4.csv, pais_v6.csv   -> fam,ini,fin,pais       (países de todo el mundo, rangos fusionados)
  peru_v4.csv, peru_v6.csv   -> fam,ini,fin,region,ciudad (solo Perú)

IPv4 se guarda como entero de 32 bits. IPv6 se guarda con sus primeros 48 bits (/48) para los países (alcanza para decidir el país y
cabe en un bigint) y con 64 bits (/64) para Perú (tabla chica, columna numeric).
"""
import csv
import gzip
import ipaddress
import os
import sys

ENTRADA = sys.argv[1]
SALIDA = sys.argv[2]
os.makedirs(SALIDA, exist_ok=True)


def num(ip_txt, bits_v6=48):
    ip = ipaddress.ip_address(ip_txt)
    if ip.version == 4:
        return 4, int(ip)
    return 6, int(ip) >> (128 - bits_v6)  # primeros 48 bits (países) o 64 bits (Perú)


def leer(nombre):
    with gzip.open(os.path.join(ENTRADA, nombre), "rt", encoding="utf-8", newline="") as f:
        for fila in csv.reader(f):
            yield fila


def normalizar(rangos):
    """rangos: lista de (ini, fin, clave). Recorta solapes, descarta vacíos y fusiona contiguos iguales."""
    rangos.sort(key=lambda r: (r[0], r[1]))
    out = []
    for ini, fin, clave in rangos:
        if out:
            pini, pfin, pclave = out[-1]
            if ini <= pfin:  # solape: el nuevo empieza después del anterior
                ini = pfin + 1
            if fin < ini:
                continue
            # Solo se unen rangos pegados (contiguos) con el mismo valor.
            if pclave == clave and ini == pfin + 1:
                out[-1] = (pini, fin, clave)
                continue
        out.append((ini, fin, clave))
    return out


# --- países (todo el mundo) ---
por_fam = {4: [], 6: []}
total = 0
for fila in leer("dbip-country-lite-2026-10.csv.gz"):
    a, b, pais = fila[0], fila[1], fila[2]
    total += 1
    if pais in ("ZZ", "", "XX"):
        continue
    fam, ini = num(a)
    _, fin = num(b)
    por_fam[fam].append((ini, fin, pais))
print("países: filas leídas", total)
for fam in (4, 6):
    nor = normalizar(por_fam[fam])
    with open(os.path.join(SALIDA, f"pais_v{fam}.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        for ini, fin, pais in nor:
            w.writerow([fam, ini, fin, pais])
    print(f"  v{fam}: {len(por_fam[fam])} -> {len(nor)} rangos")

# --- Perú (región y ciudad) ---
peru = {4: [], 6: []}
for fila in leer("dbip-city-lite-2026-10.csv.gz"):
    if len(fila) < 8 or fila[3] != "PE":
        continue
    fam, ini = num(fila[0], 64)
    _, fin = num(fila[1], 64)
    peru[fam].append((ini, fin, (fila[4].strip(), fila[5].strip())))
for fam in (4, 6):
    nor = normalizar(peru[fam])
    with open(os.path.join(SALIDA, f"peru_v{fam}.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        for ini, fin, (region, ciudad) in nor:
            w.writerow([fam, ini, fin, region, ciudad])
    print(f"  Perú v{fam}: {len(peru[fam])} -> {len(nor)} rangos")
