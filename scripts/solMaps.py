#!/usr/bin/env python3
"""
Builds the Sol system's real surface maps (public/maps/*.bin) from public-domain
NASA / USGS data. Run once; the outputs are committed. Needs Pillow and numpy:

    pip install pillow numpy
    python3 scripts/solMaps.py <download dir>

Sources (download into <download dir>):
  Earth  land_ocean_ice_2048.jpg            NASA Blue Marble (2002), eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/
         gebco_08_rev_elev_21600x10800.png  NASA Visible Earth, GEBCO_08 land elevation, .../73000/73934/
         gebco_08_rev_bath_21600x10800.png  NASA Visible Earth, GEBCO_08 bathymetry, .../73000/73963/
  Moon   lroc_color_poles_1k.jpg, ldem_3_8bit.jpg   NASA SVS CGI Moon Kit (LRO LROC WAC colour, LOLA elevation), svs.gsfc.nasa.gov/4720
  Mars   megt90n000cb.img                   MGS MOLA MEGDR 4 px/deg topography, pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/
         Mars_MGS_TES_Albedo_mosaic_global_7410m.tif   USGS Astrogeology, MGS TES albedo
  Pluto  Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif   USGS Astrogeology, New Horizons LORRI/MVIC mosaic

Format (see src/gen/realSurface.ts), gzipped: 'SOLM', u16 version, u16 height map
width and height, u16 colour map width and height, u16 0; then the height map
(one byte per pixel, terrain value n = v / 127.5 - 1) and the colour map (sRGB,
three bytes per pixel). Both are equirectangular, west (-180°) to east and
north to south, rows top first.
"""
import gzip
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
OUT = Path(__file__).resolve().parent.parent / 'public' / 'maps'
W, H = 1024, 512


def resize(a: np.ndarray, w: int = W, h: int = H) -> np.ndarray:
    """Box-filtered resize of a float array (H, W) or (H, W, C)."""
    if a.ndim == 2:
        return np.array(Image.fromarray(a.astype(np.float32), 'F').resize((w, h), Image.BOX))
    return np.stack([resize(a[..., c], w, h) for c in range(a.shape[2])], -1)


def bleed(color: np.ndarray, keep: np.ndarray, steps: int = 12) -> np.ndarray:
    """Spreads the colours of `keep` pixels into their neighbours, so sampling near an edge never picks up what's beyond it."""
    color = color.astype(np.float32).copy()
    known = keep.copy()
    for _ in range(steps):
        acc = np.zeros_like(color)
        cnt = np.zeros(known.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(color, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        grow = ~known & (cnt > 0)
        color[grow] = acc[grow] / cnt[grow][:, None]
        known = known | grow
    return color


def write(name: str, height: np.ndarray, color: np.ndarray) -> None:
    h = np.clip(np.round(height), 0, 255).astype(np.uint8)
    # Colour at half the height map's resolution, in steps of 4: a quarter of the bytes, and they compress far better.
    color = resize(color, color.shape[1] // 2, color.shape[0] // 2)
    c = (np.clip(np.round(color / 4), 0, 63) * 4 + 2).astype(np.uint8)
    header = b'SOLM' + struct.pack('<6H', 1, h.shape[1], h.shape[0], c.shape[1], c.shape[0], 0)
    data = gzip.compress(header + h.tobytes() + c.tobytes(), 9, mtime=0)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f'{name}.bin').write_bytes(data)
    print(f'{name}: height {h.shape[1]}x{h.shape[0]}, colour {c.shape[1]}x{c.shape[0]}, {len(data) / 1024:.0f} KiB')


def land_value(t: np.ndarray) -> np.ndarray:
    """Land 0..1 (sea level .. highest) → bytes 128..255 (n just above 0 .. 1)."""
    return 128 + 127 * np.clip(t, 0, 1)


def sea_value(t: np.ndarray) -> np.ndarray:
    """Sea 0..1 (shore .. deepest) → bytes 127..0 (n just below 0 .. -1)."""
    return 127 - 127 * np.clip(t, 0, 1)


def earth() -> None:
    rgb = np.array(Image.open(SRC / 'land_ocean_ice_2048.jpg').convert('RGB')).astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # The Blue Marble's ocean is dark blue (turquoise over shallows); everything else is land, ice sheets or sea ice (kept as flat white land).
    ocean = (b > 1.25 * r) & (b > 0.9 * g) & (r + g + b < 500)
    land = resize((~ocean).astype(np.float32)) > 0.5
    # GEBCO_08 land elevation: 0 at sea level up to Everest's ~250. Lowlands stand a little proud, so coasts read.
    elev = np.array(Image.open(SRC / 'gebco_08_rev_elev_21600x10800.png').convert('L').reduce(4)).astype(np.float32)
    elev = resize(elev) / 249
    # GEBCO_08 bathymetry: 255 on the shelf down to 0 in the trenches.
    bath = np.array(Image.open(SRC / 'gebco_08_rev_bath_21600x10800.png').convert('L').reduce(4)).astype(np.float32)
    depth = 1 - resize(bath) / 255
    height = np.where(land, land_value(0.07 + 0.93 * elev ** 0.6), sea_value(0.08 + 0.92 * depth ** 0.7))
    color = resize(rgb)
    color = bleed(color, land)
    write('earth', height, color)


def moon() -> None:
    rgb = np.array(Image.open(SRC / 'lroc_color_poles_1k.jpg').convert('RGB')).astype(np.float32)
    elev = np.array(Image.open(SRC / 'ldem_3_8bit.jpg').convert('L')).astype(np.float32)
    # The LROC mosaic is shot at high sun and is flat: stretch its brightness (2nd–98th percentile) to the
    # contrast the Moon shows from Earth, dark maria against bright highlands (albedo ~0.07 against ~0.12–0.18).
    grey = rgb.mean(-1, keepdims=True)
    lo, hi = np.percentile(grey, [2, 98])
    stretched = 0.18 + 0.72 * np.clip((grey - lo) / (hi - lo), 0, 1)
    rgb = rgb / np.maximum(grey, 1) * stretched * 255
    # No sea: the whole byte range is relief. Half resolution (the Moon is half Earth's size) and smoothed of JPEG noise.
    write('moon', blur(resize(elev, W // 2, H // 2), 1), resize(rgb))


def mars() -> None:
    mola = np.fromfile(SRC / 'megt90n000cb.img', dtype='>i2').reshape(720, 1440).astype(np.float32)
    # 0..360°E → -180..180°.
    mola = np.roll(mola, 720, axis=1)
    t = (resize(mola) - mola.min()) / (mola.max() - mola.min())
    # Olympus Mons is 29 km above Hellas' floor; most of the planet sits within a few km. Spread the middle.
    height = 255 * t ** 0.8
    albedo = np.array(Image.open(SRC / 'Mars_MGS_TES_Albedo_mosaic_global_7410m.tif')).astype(np.float32)
    # 0.06 is the mosaic's fill (round the south pole): fill it from the nearest data.
    valid = albedo > 0.0601
    albedo = bleed(albedo[..., None], valid, 200)[..., 0]
    a = resize(albedo)
    # TES Lambert albedo 0.1 (dark basalt: Syrtis Major, Acidalia) to 0.3 (bright dust: Tharsis, Arabia).
    k = np.clip((a - 0.09) / (0.3 - 0.09), 0, 1)[..., None]
    dark = np.array([84, 60, 46], np.float32)
    bright = np.array([196, 128, 82], np.float32)
    color = dark + (bright - dark) * k ** 0.9
    # The residual polar caps (TES saturates there): water ice past ~80°N, CO₂ ice past ~84°S, edges ragged by the albedo.
    lat = np.linspace(90, -90, H, endpoint=False)[:, None] - 90 / H
    lat = np.repeat(lat, W, axis=1)
    cap = np.clip((lat - 80.5 + 3 * (k[..., 0] - 0.5)) / 2.5, 0, 1) + np.clip((-lat - 84 + 2 * (k[..., 0] - 0.5)) / 2, 0, 1)
    cap = np.clip(cap, 0, 1)[..., None]
    color = color + (np.array([236, 230, 222], np.float32) - color) * cap
    write('mars', height, color)


def pluto() -> None:
    img = Image.open(SRC / 'Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif')
    print('pluto source', img.size, img.mode)
    img = img.convert('L').reduce(8)
    g = resize(np.array(img).astype(np.float32))
    # Unimaged (the south, in winter darkness during the flyby) is 0: fill it smoothly from what was seen, fading to the mean.
    known = (g > 8).astype(np.float32)
    near = blur(g * known, 24) / np.maximum(blur(known, 24), 1e-3)
    weight = np.clip(blur(known, 24) * 4, 0, 1)
    fill = near * weight + (g[known > 0].mean()) * (1 - weight)
    g = np.where(known > 0, g, fill)
    t = np.clip(g / 255, 0, 1)
    # A grey mosaic: tint it with Pluto's colours (New Horizons MVIC): dark red-brown tholins (Cthulhu) to the pale nitrogen ice of Sputnik Planitia.
    dark = np.array([70, 38, 28], np.float32)
    mid = np.array([196, 150, 112], np.float32)
    light = np.array([246, 236, 222], np.float32)
    t3 = t[..., None]
    color = np.where(t3 < 0.5, dark + (mid - dark) * (t3 / 0.5), mid + (light - mid) * ((t3 - 0.5) / 0.5))
    # No real relief map at this size: the ice plain sits low, the rest takes its relief from the brightness, softly.
    height = 255 * (0.5 + 0.25 * (blur(t, 6) - 0.5))
    write('pluto', height, color)


def blur(a: np.ndarray, radius: int) -> np.ndarray:
    """Three box blurs (≈ a Gaussian), wrapping east-west."""
    a = a.astype(np.float32)
    for _ in range(3):
        for axis in (0, 1):
            a = sum(np.roll(a, d, axis) for d in range(-radius, radius + 1)) / (2 * radius + 1)
    return a


if __name__ == '__main__':
    for body in sys.argv[2:] or ['earth', 'moon', 'mars', 'pluto']:
        globals()[body]()
