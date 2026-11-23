"""Prepare the supplied background and hand-drawn sprite strip for Phaser.

The character sheet arrives as black ink on an opaque white background. This
script turns the white paper into transparency, slices the eight separate
drawings, and packs them into a fixed-grid strip whose frames share a baseline.
That fixed grid is what `this.load.spritesheet()` expects at runtime.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE_HERO = ROOT / "art-source" / "hero-run-source.png"
SOURCE_CITY = ROOT / "art-source" / "yellow-city-source.png"
OUTPUT_DIR = ROOT / "public" / "assets"

FRAME_WIDTH = 320
FRAME_HEIGHT = 360
ART_SCALE = 1.15
BASELINE = 344  # leave a small transparent margin below the feet
MIN_COMPONENT_PIXELS = 100


def ink_to_alpha(image: Image.Image) -> Image.Image:
    """Interpret paper whiteness as alpha, preserving antialiased ink edges."""
    rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8).copy()
    rgb = rgba[:, :, :3].astype(np.float32)
    luminance = rgb.mean(axis=2)

    # Soft alpha from ink coverage. Pure paper becomes transparent; solid ink
    # remains opaque. Recolor the ink so there is no dirty white fringe.
    alpha = np.clip(255.0 - luminance, 0.0, 255.0)
    rgba[:, :, 3] = np.minimum(rgba[:, :, 3], alpha.astype(np.uint8))
    rgba[:, :, 0] = 12
    rgba[:, :, 1] = 12
    rgba[:, :, 2] = 10
    return Image.fromarray(rgba, "RGBA")


def column_runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """Find the horizontal extents of each disconnected ink drawing."""
    occupied = mask.any(axis=0)
    runs: list[tuple[int, int]] = []
    start: int | None = None

    for x, has_ink in enumerate(occupied):
        if has_ink and start is None:
            start = x
        elif not has_ink and start is not None:
            runs.append((start, x - 1))
            start = None

    if start is not None:
        runs.append((start, len(occupied) - 1))

    return [
        (left, right)
        for left, right in runs
        if int(mask[:, left : right + 1].sum()) >= MIN_COMPONENT_PIXELS
    ]


def main() -> None:
    if not SOURCE_HERO.exists():
        raise SystemExit(f"Missing source character sheet: {SOURCE_HERO}")
    if not SOURCE_CITY.exists():
        raise SystemExit(f"Missing source background: {SOURCE_CITY}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    hero = ink_to_alpha(Image.open(SOURCE_HERO))
    alpha = np.asarray(hero)[:, :, 3]
    mask = alpha > 20
    runs = column_runs(mask)

    if len(runs) != 8:
        raise SystemExit(f"Expected 8 drawings in the strip, found {len(runs)}")

    sheet = Image.new("RGBA", (FRAME_WIDTH * len(runs), FRAME_HEIGHT), (0, 0, 0, 0))

    for index, (left, right) in enumerate(runs):
        component_mask = mask[:, left : right + 1]
        rows = np.where(component_mask.any(axis=1))[0]
        if rows.size == 0:
            raise SystemExit(f"Drawing {index} is empty")

        top, bottom = int(rows.min()), int(rows.max())
        figure = hero.crop((left, top, right + 1, bottom + 1))
        figure = figure.resize(
            (round(figure.width * ART_SCALE), round(figure.height * ART_SCALE)),
            Image.Resampling.LANCZOS,
        )

        x = index * FRAME_WIDTH + (FRAME_WIDTH - figure.width) // 2
        y = BASELINE - figure.height
        sheet.alpha_composite(figure, (x, y))

    hero_path = OUTPUT_DIR / "hero-run.png"
    sheet.save(hero_path, optimize=True)

    # A very thin pale-gold keyline keeps the black silhouette readable when
    # it passes in front of the city's own black architecture.
    expanded_alpha = sheet.getchannel("A").filter(ImageFilter.MaxFilter(9))
    outline = Image.new("RGBA", sheet.size, (246, 236, 90, 0))
    outline.putalpha(expanded_alpha)
    outline_path = OUTPUT_DIR / "hero-run-outline.png"
    outline.save(outline_path, optimize=True)

    Image.open(SOURCE_CITY).convert("RGB").save(OUTPUT_DIR / "yellow-city.jpg", quality=92, optimize=True)

    print(f"Wrote {hero_path.relative_to(ROOT)} ({sheet.width}x{sheet.height}, 8 frames)")
    print(f"Wrote {outline_path.relative_to(ROOT)}")
    print(f"Wrote {(OUTPUT_DIR / 'yellow-city.jpg').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
