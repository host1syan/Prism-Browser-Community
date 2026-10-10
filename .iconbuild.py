#!/usr/bin/env python3
"""Renders the chosen app-icon mark (Y 徽章) into build/icon.ico / icon.icns /
icon.iconset/ / icon.png.

The mark is drawn on a 64-unit grid: a gradient rounded square (2–2.5 units of
transparent margin, matching the icon it replaces), a white ring, and a white Y
whose arms stop short of the ring so a visible gap survives at 16px. Ring and Y
geometry are stepped per output size — one geometry scaled down turns to mush.

Requires rsvg-convert. Writes only into build/.
"""
import os
import struct
import subprocess
import sys
import tempfile

GRAD_A = '#5B4BFF'
GRAD_B = '#00D4C8'
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'build')

DEFS = (f'<defs><linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="{GRAD_A}"/>'
        f'<stop offset="100%" stop-color="{GRAD_B}"/></linearGradient></defs>')

# box inset, corner radius, ring radius, ring stroke, Y scale, Y stroke
SPEC = {
    16: (2.0, 12.0, 22.5, 3.2, 0.72, 5.6),
    24: (2.0, 12.5, 23.0, 3.4, 0.76, 5.6),
    32: (2.0, 13.0, 23.0, 3.5, 0.80, 5.6),
    48: (2.5, 13.5, 23.5, 3.6, 0.82, 5.6),
}
SIZES = (16, 24, 32, 48, 64, 128, 256, 512, 1024)


def spec(size):
    for step in (48, 32, 24, 16):
        if size >= step:
            return SPEC[step]
    return SPEC[48]


def body(size):
    inset, radius, ring_r, ring_w, y_scale, y_w = spec(size)

    def s(x, y):
        return 32 + (x - 32) * y_scale, 32 + (y - 32) * y_scale

    a, j, b, tail = s(21.5, 19.5), s(32, 34.5), s(42.5, 19.5), s(32, 49)
    d = (f'M{a[0]:.2f} {a[1]:.2f} L{j[0]:.2f} {j[1]:.2f} L{b[0]:.2f} {b[1]:.2f} '
         f'M{j[0]:.2f} {j[1]:.2f} V{tail[1]:.2f}')
    side = 64 - 2 * inset
    return (f'<rect x="{inset}" y="{inset}" width="{side}" height="{side}" rx="{radius}" '
            f'fill="url(#brand)"/>'
            f'<circle cx="32" cy="32" r="{ring_r}" fill="none" stroke="#FFFFFF" '
            f'stroke-width="{ring_w}"/>'
            f'<path d="{d}" fill="none" stroke="#FFFFFF" stroke-width="{y_w * y_scale:.2f}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')


def svg(size):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
            f'viewBox="0 0 64 64">{DEFS}{body(size)}</svg>')


def rasterise(size, path):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'i.svg')
        with open(src, 'w', encoding='utf-8') as fh:
            fh.write(svg(size))
        subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), src, '-o', path],
                       check=True)


def build_ico(pngs, path):
    """ICONDIR + one ICONDIRENTRY per size, each entry a PNG (Vista+ format)."""
    count = len(pngs)
    header = struct.pack('<HHH', 0, 1, count)
    offset = 6 + 16 * count
    entries, blobs = b'', b''
    for size, blob in pngs:
        dim = 0 if size >= 256 else size
        entries += struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(blob), offset)
        blobs += blob
        offset += len(blob)
    with open(path, 'wb') as fh:
        fh.write(header + entries + blobs)


# icns type codes that carry PNG data, mapped to the pixel size they hold.
ICNS_PNG = (('icp4', 16), ('icp5', 32), ('icp6', 64), ('ic07', 128), ('ic08', 256),
            ('ic09', 512), ('ic10', 1024), ('ic11', 32), ('ic12', 64), ('ic13', 256),
            ('ic14', 512))


def build_icns(pngs, path):
    by_size = dict(pngs)
    chunks = b''
    for code, size in ICNS_PNG:
        blob = by_size.get(size)
        if blob is None:
            continue
        chunks += code.encode('ascii') + struct.pack('>I', len(blob) + 8) + blob
    with open(path, 'wb') as fh:
        fh.write(b'icns' + struct.pack('>I', len(chunks) + 8) + chunks)


ICONSET = (('icon_16x16.png', 16), ('icon_16x16@2x.png', 32), ('icon_32x32.png', 32),
           ('icon_32x32@2x.png', 64), ('icon_128x128.png', 128), ('icon_128x128@2x.png', 256),
           ('icon_256x256.png', 256), ('icon_256x256@2x.png', 512),
           ('icon_512x512.png', 512), ('icon_512x512@2x.png', 1024))


def main():
    if not os.path.isdir(OUT):
        sys.exit(f'no such directory: {OUT}')
    with tempfile.TemporaryDirectory() as tmp:
        rendered = {}
        for size in SIZES:
            path = os.path.join(tmp, f'{size}.png')
            rasterise(size, path)
            with open(path, 'rb') as fh:
                rendered[size] = fh.read()

        build_ico([(s, rendered[s]) for s in (16, 24, 32, 48, 64, 128, 256)],
                  os.path.join(OUT, 'icon.ico'))
        build_icns([(s, rendered[s]) for s in (16, 32, 64, 128, 256, 512, 1024)],
                   os.path.join(OUT, 'icon.icns'))

        iconset = os.path.join(OUT, 'icon.iconset')
        os.makedirs(iconset, exist_ok=True)
        for name, size in ICONSET:
            with open(os.path.join(iconset, name), 'wb') as fh:
                fh.write(rendered[size])

        with open(os.path.join(OUT, 'icon.png'), 'wb') as fh:
            fh.write(rendered[1024])

    for name in ('icon.ico', 'icon.icns', 'icon.png'):
        print(f'{name}: {os.path.getsize(os.path.join(OUT, name))} bytes')


if __name__ == '__main__':
    main()
