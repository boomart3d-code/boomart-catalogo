"use strict";
/* Perspectiva de un estampado sobre la foto de un modelo.
   ESTE ARCHIVO ES IDENTICO en BoomArt Estampados (web/perspectiva.js) y en la pagina de polos (polos/perspectiva.js):
   lo que ves en la app es exactamente lo que sale en la web. Si lo cambias en un lado, cambialo en el otro.

   Modelo: el estampado es un rectangulo plano (w x h) que se gira como un plano en el espacio: `yaw` (el cuerpo gira a un lado),
   `pitch` (cabeceo, arriba/abajo) y `rot` (inclinacion en la foto), con perspectiva. Encima se pueden mover las 4 esquinas a mano
   (`esq`, en px). El resultado es un cuadrilatero; la imagen se estira sobre el con una homografia. Por ultimo, `curvar` acorta
   el estampado hacia los lados como la tela sobre el torso (cilindro). */
const PERSP = (() => {
  const rad = (g) => (g * Math.PI) / 180;

  /* Cuadrilatero destino [[x,y] x4] (arriba-izq., arriba-der., abajo-der., abajo-izq.) en px de la foto. */
  function cuadro(g) {
    const { cx, cy, w, h } = g, yaw = rad(g.yaw || 0), pitch = rad(g.pitch || 0), rot = rad(g.rot || 0), esq = g.esq || null;
    const D = 3.5 * Math.max(w, h) + 1, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(rot), sr = Math.sin(rot);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y], i) => {
      const x1 = x * cyw, z1 = x * syw, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, s = D / (D + z2);       // gira como un plano y lo proyecta
      const X = x1 * s, Y = y2 * s;
      return [cx + X * cr - Y * sr + (esq ? esq[i * 2] : 0), cy + X * sr + Y * cr + (esq ? esq[i * 2 + 1] : 0)];
    });
  }

  /* Homografia cuadrado unidad -> cuadrilatero, y su inversa: (x, y) de la foto -> (u, v) del estampado (0 a 1). */
  function inversa(q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let a, b, c, d, e, f, g = 0, h = 0;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) { a = x1 - x0; b = x3 - x0; c = x0; d = y1 - y0; e = y3 - y0; f = y0; }
    else {
      const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
      g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den;
      a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0; d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
    }
    // inversa de [[a,b,c],[d,e,f],[g,h,1]]
    const A = e - f * h, B = c * h - b, C = b * f - c * e, Dd = f * g - d, E = a - c * g, F = c * d - a * f, G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
    return (x, y) => { const W = G * x + H * y + I; if (Math.abs(W) < 1e-12) return null; return [(A * x + B * y + C) / W, (Dd * x + E * y + F) / W]; };
  }

  /* x de la foto -> x "plano" antes de curvar el estampado (cilindro de radio R centrado en cxt; s = cuanto se curva, 0 a 1). */
  function curvar(x, cxt, R, s) {
    if (!(s > 0) || !(R > 0)) return x;
    const rel = x - cxt, u = Math.max(-0.97, Math.min(0.97, rel / R));
    return cxt + (1 - s) * rel + s * R * Math.asin(u);
  }

  /* Caja (x0, y0, x1, y1) que contiene el cuadrilatero, con margen. */
  function caja(q, pad = 0) {
    const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    return [Math.floor(Math.min(...xs) - pad), Math.floor(Math.min(...ys) - pad), Math.ceil(Math.max(...xs) + pad), Math.ceil(Math.max(...ys) + pad)];
  }

  /* Muestreo bilineal (con alfa premultiplicado) de la imagen RGBA `d` (w x h) en (u, v) de 0 a 1. Escribe [r,g,b,a] en `out`. */
  function muestrear(d, w, h, u, v, out) {
    const fx = u * w - 0.5, fy = v * h - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const xx = Math.min(w - 1, Math.max(0, x0 + i)), yy = Math.min(h - 1, Math.max(0, y0 + j)), o = (yy * w + xx) * 4, wt = (i ? tx : 1 - tx) * (j ? ty : 1 - ty), al = (d[o + 3] / 255) * wt;
      r += d[o] * al; g += d[o + 1] * al; b += d[o + 2] * al; a += al;
    }
    out[3] = a * 255; if (a > 1e-4) { out[0] = r / a; out[1] = g / a; out[2] = b / a; } else { out[0] = out[1] = out[2] = 0; }
    return out;
  }

  return { cuadro, inversa, curvar, caja, muestrear };
})();
