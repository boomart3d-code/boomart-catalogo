from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np


OUT_W = 1200
OUT_H = 1500


def subject_crop(image: np.ndarray) -> np.ndarray:
    """Crop to 4:5 around the bright, low-saturation sculpture."""
    h, w = image.shape[:2]
    target_ratio = OUT_W / OUT_H
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    subject = ((gray > 142) & (hsv[:, :, 1] < 82)).astype(np.uint8)
    subject = cv2.morphologyEx(
        subject,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)),
        iterations=2,
    )
    points = cv2.findNonZero(subject)
    center_x = w / 2
    center_y = h / 2
    if points is not None:
        x, y, sw, sh = cv2.boundingRect(points)
        center_x = x + sw / 2
        center_y = y + sh / 2

    if w / h < target_ratio:
        crop_w = w
        crop_h = round(w / target_ratio)
    else:
        crop_h = h
        crop_w = round(h * target_ratio)

    x0 = int(np.clip(round(center_x - crop_w / 2), 0, w - crop_w))
    y0 = int(np.clip(round(center_y - crop_h / 2), 0, h - crop_h))
    crop = image[y0 : y0 + crop_h, x0 : x0 + crop_w]
    return cv2.resize(crop, (OUT_W, OUT_H), interpolation=cv2.INTER_LANCZOS4)


def radial(height: int, width: int, cx: float, cy: float, radius: float) -> np.ndarray:
    yy, xx = np.mgrid[0:height, 0:width]
    distance = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    return np.clip(1.0 - distance / radius, 0.0, 1.0).astype(np.float32)


def boomart_grade(image: np.ndarray) -> np.ndarray:
    """Apply BoomArt's charcoal, warm-gallery and restrained-red language.

    The operation is strictly photographic: every source pixel remains from the
    real product. No architecture, lettering, print texture or geometry is
    generated or replaced.
    """
    frame = subject_crop(image).astype(np.float32) / 255.0
    hsv = cv2.cvtColor((frame * 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor((frame * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY)

    # Soft protection for the white sculpture. It remains neutral and legible;
    # the stronger BoomArt treatment lands on the surrounding environment.
    white = np.clip((gray.astype(np.float32) - 105.0) / 95.0, 0.0, 1.0)
    white *= np.clip((115.0 - hsv[:, :, 1].astype(np.float32)) / 80.0, 0.0, 1.0)
    white = cv2.GaussianBlur(white, (0, 0), 9.0)
    environment = 1.0 - white

    # Deeper charcoal background and a gentle premium contrast curve.
    darkened = np.clip((frame - 0.025) * 1.08, 0.0, 1.0)
    background_factor = (0.77 + 0.23 * white)[:, :, None]
    graded = darkened * background_factor

    # Gallery light: amber upper-left; explosive red kept subtle on the right.
    amber = radial(OUT_H, OUT_W, OUT_W * 0.14, OUT_H * 0.12, OUT_W * 0.88)
    red = radial(OUT_H, OUT_W, OUT_W * 1.02, OUT_H * 0.54, OUT_W * 0.62)
    amber *= environment * 0.085
    red *= environment * 0.055
    graded[:, :, 2] += amber + red
    graded[:, :, 1] += amber * 0.56
    graded[:, :, 0] += amber * 0.16 + red * 0.10

    # Light the filament without recolouring it; sharpen only micro-detail.
    neutral_lift = (white * 0.045)[:, :, None]
    graded += neutral_lift
    blurred = cv2.GaussianBlur(graded, (0, 0), 1.15)
    graded = np.clip(graded + (graded - blurred) * 0.16, 0.0, 1.0)

    # Restrained vignette focuses attention and removes the casual snapshot feel.
    yy, xx = np.mgrid[0:OUT_H, 0:OUT_W]
    nx = (xx - OUT_W / 2) / (OUT_W / 2)
    ny = (yy - OUT_H / 2) / (OUT_H / 2)
    vignette = np.clip(1.0 - 0.13 * (nx * nx + ny * ny), 0.80, 1.0)
    graded *= (vignette * environment + white)[:, :, None]

    return (np.clip(graded, 0.0, 1.0) * 255).astype(np.uint8)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Uso: grade_boomart_product_photos.py FUENTE SALIDA")
    source_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    source = cv2.imread(str(source_path), cv2.IMREAD_COLOR)
    if source is None:
        raise RuntimeError(f"No se pudo leer {source_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(
        str(output_path),
        boomart_grade(source),
        [cv2.IMWRITE_PNG_COMPRESSION, 7],
    )


if __name__ == "__main__":
    main()
