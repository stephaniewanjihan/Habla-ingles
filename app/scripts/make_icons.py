# Pure-python PNG icon generator (no Pillow): indigo rounded square,
# three white "chunk" bars of varying width.
import zlib, struct

def png(w, h, rows):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))
    raw = b''.join(b'\x00' + r for r in rows)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))

BG = (79, 70, 229, 255)      # indigo-600
FG = (255, 255, 255, 255)
TRANS = (0, 0, 0, 0)

def inside_rounded(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1: return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def make(size, path, full_bleed):
    s = size / 512.0
    bars = [  # (x0, y0, x1, y1) in 512-space: three chunk bars
        (120, 140, 392, 204),
        (120, 224, 300, 288),
        (120, 308, 356, 372),
    ]
    corner = 0 if full_bleed else 96 * s
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            if full_bleed or inside_rounded(x, y, 0, 0, size - 1, size - 1, corner):
                px = BG
                for (x0, y0, x1, y1) in bars:
                    if inside_rounded(x, y, x0 * s, y0 * s, x1 * s, y1 * s, 24 * s):
                        px = FG
                        break
            else:
                px = TRANS
            row += bytes(px)
        rows.append(bytes(row))
    open(path, 'wb').write(png(size, size, rows))
    print(path)

make(192, 'public/pwa-192.png', full_bleed=False)
make(512, 'public/pwa-512.png', full_bleed=True)   # maskable-safe full bleed
make(180, 'public/apple-touch-icon.png', full_bleed=True)
