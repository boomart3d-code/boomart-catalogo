"""Sube los CSV compactos a Supabase (PostgREST, CSV por lotes) mientras la ventana de carga temporal está abierta."""
import os
import re
import sys
import time
import urllib.error
import urllib.request

LISTO = sys.argv[1]
CONFIG = sys.argv[2]
LOTE = int(sys.argv[3]) if len(sys.argv) > 3 else 5000

txt = open(CONFIG, encoding="utf-8").read()
URL = re.search(r'url:\s*"([^"]+)"', txt).group(1)
KEY = re.search(r'publishableKey:\s*"([^"]+)"', txt).group(1)

PLAN = [
    ("geo_ip_pais", "fam,ini,fin,pais", ["pais_v4.csv", "pais_v6.csv"]),
    ("geo_ip_peru", "fam,ini,fin,region,ciudad", ["peru_v4.csv", "peru_v6.csv"]),
]


def enviar(tabla, cabecera, lineas):
    cuerpo = (cabecera + "\n" + "\n".join(lineas) + "\n").encode("utf-8")
    req = urllib.request.Request(
        f"{URL}/rest/v1/{tabla}",
        data=cuerpo,
        method="POST",
        headers={"apikey": KEY, "Content-Type": "text/csv; charset=utf-8", "Prefer": "return=minimal"},
    )
    for intento in range(1, 6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status
        except urllib.error.HTTPError as e:
            detalle = e.read().decode("utf-8", "replace")[:300]
            print(f"   HTTP {e.code} en {tabla} (intento {intento}): {detalle}", flush=True)
            if e.code in (400, 401, 403, 404, 409):
                raise
        except Exception as e:  # red
            print(f"   error de red (intento {intento}): {e}", flush=True)
        time.sleep(2 * intento)
    raise RuntimeError("no se pudo enviar el lote")


for tabla, cabecera, archivos in PLAN:
    total = 0
    for nombre in archivos:
        with open(os.path.join(LISTO, nombre), encoding="utf-8", newline="") as f:
            lineas = [l.rstrip("\r\n") for l in f if l.strip()]
        for i in range(0, len(lineas), LOTE):
            enviar(tabla, cabecera, lineas[i:i + LOTE])
            total += len(lineas[i:i + LOTE])
        print(f"{tabla}: {nombre} listo ({len(lineas)} filas, acumulado {total})", flush=True)
print("CARGA TERMINADA")
