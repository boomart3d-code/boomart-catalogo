"""Compara el resultado de los CSV compactos contra los archivos originales de DB-IP (muestra aleatoria)."""
import bisect
import csv
import gzip
import ipaddress
import os
import random
import sys

ENTRADA, LISTO = sys.argv[1], sys.argv[2]
random.seed(7)


def cargar_compacto(nombre):
    filas = list(csv.reader(open(os.path.join(LISTO, nombre), encoding="utf-8", newline="")))
    return [int(r[1]) for r in filas], [int(r[2]) for r in filas], [tuple(r[3:]) for r in filas]


def buscar_compacto(tabla, ip, bits=48):
    a = ipaddress.ip_address(ip)
    v = int(a) if a.version == 4 else int(a) >> (128 - bits)
    ini, fin, dat = tabla[a.version]
    i = bisect.bisect_right(ini, v) - 1
    return dat[i] if i >= 0 and fin[i] >= v else None


pais = {4: cargar_compacto("pais_v4.csv"), 6: cargar_compacto("pais_v6.csv")}
peru = {4: cargar_compacto("peru_v4.csv"), 6: cargar_compacto("peru_v6.csv")}

# Original: lista de rangos (ini, fin, pais, region, ciudad) por familia, ordenada
crudo = {4: [], 6: []}
with gzip.open(os.path.join(ENTRADA, "dbip-city-lite-2026-10.csv.gz"), "rt", encoding="utf-8", newline="") as f:
    for fila in csv.reader(f):
        a, b = ipaddress.ip_address(fila[0]), ipaddress.ip_address(fila[1])
        crudo[a.version].append((int(a), int(b), fila[3], fila[4].strip(), fila[5].strip()))
for fam in (4, 6):
    crudo[fam].sort()

# Original de países (country-lite), para comparar el país contra su propia fuente
crudo_p = {4: [], 6: []}
with gzip.open(os.path.join(ENTRADA, "dbip-country-lite-2026-10.csv.gz"), "rt", encoding="utf-8", newline="") as f:
    for fila in csv.reader(f):
        a, b = ipaddress.ip_address(fila[0]), ipaddress.ip_address(fila[1])
        crudo_p[a.version].append((int(a), int(b), fila[2]))
for fam in (4, 6):
    crudo_p[fam].sort()
inis_p = {fam: [r[0] for r in crudo_p[fam]] for fam in (4, 6)}

mal = ok = 0
ejemplos = []
for fam in (4, 6):
    rs = crudo[fam]
    inis = [r[0] for r in rs]
    muestra = random.sample(rs, min(4000, len(rs)))
    # forzar muchas filas de Perú
    muestra += random.sample([r for r in rs if r[2] == "PE"], min(1500, sum(1 for r in rs if r[2] == "PE")))
    for ini, fin, pa, reg, ciu in muestra:
        v = random.randint(ini, fin)
        ip = str(ipaddress.ip_address(v)) if fam == 4 else str(ipaddress.ip_address(v))
        # el original para esa IP exacta
        i = bisect.bisect_right(inis, v) - 1
        esperado = rs[i] if i >= 0 and rs[i][1] >= v else None
        if esperado is None:
            continue
        # IPv6: el compacto usa solo 48 bits; se prueba con la misma IP
        got_p = buscar_compacto(pais, ip)
        got_peru = buscar_compacto(peru, ip, 64)
        if esperado[2] in ("ZZ", ""):
            continue
        j = bisect.bisect_right(inis_p[fam], v) - 1
        rp = crudo_p[fam][j] if j >= 0 and crudo_p[fam][j][1] >= v else None
        if rp is None or rp[2] in ("ZZ", ""):
            continue
        esp_pais = (rp[2],)
        esp_peru = (esperado[3], esperado[4]) if esperado[2] == "PE" else None
        if got_p == esp_pais and got_peru == esp_peru:
            ok += 1
        else:
            mal += 1
            if len(ejemplos) < 8:
                ejemplos.append((ip, esperado[2:], got_p, got_peru))
print("coinciden:", ok, "· difieren:", mal)
for e in ejemplos:
    print("  difiere:", e)
