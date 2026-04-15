#!/usr/bin/env python3
"""
URIA 앱 아이콘 생성기
실행: python3 make_icons.py
생성: icon-192.png, icon-512.png
"""
import struct, zlib, base64

def make_png(size):
    """단색 PNG 생성 (라이브러리 없이)"""
    bg = (12, 12, 14)    # #0c0c0e
    acc = (167, 139, 250) # #a78bfa

    # 픽셀 데이터 생성
    pixels = []
    cx, cy = size // 2, size // 2
    r = int(size * 0.38)
    inner = int(size * 0.06)

    for y in range(size):
        row = []
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = (dx*dx + dy*dy) ** 0.5
            # 원형 아이콘
            if dist < r:
                # U 글자 모양
                lx = int(size * 0.28)
                rx = int(size * 0.72)
                ty = int(size * 0.25)
                by = int(size * 0.70)
                stroke = int(size * 0.10)

                in_u = (
                    (lx <= x <= lx + stroke and ty <= y <= by) or
                    (rx - stroke <= x <= rx and ty <= y <= by) or
                    (lx <= x <= rx and by - stroke <= y <= by)
                )
                if in_u:
                    row.extend(acc)
                else:
                    row.extend(bg)
            else:
                row.extend((0, 0, 0))
        pixels.append(bytes([0] + row))

    # PNG 구조 생성
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    idat = zlib.compress(b''.join(pixels))

    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', idat) +
            chunk(b'IEND', b''))

for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png')]:
    with open(name, 'wb') as f:
        f.write(make_png(size))
    print(f'✅ {name} 생성됨 ({size}x{size})')

print('\n아이콘 생성 완료!')
