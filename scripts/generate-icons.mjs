import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'public', 'icons')
mkdirSync(output, { recursive: true })

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, checksum])
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const lines = [
    [.32, .72, .32, .28], [.32, .28, .68, .72], [.68, .72, .68, .28],
  ]
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = x / size
      const ny = y / size
      let color = [11, 12, 12]
      const border = Math.max(Math.abs(nx - .5), Math.abs(ny - .5))
      if (border > .325 && border < .34) color = [41, 43, 41]
      const onLine = lines.some(([ax, ay, bx, by]) =>
        segmentDistance(nx, ny, ax, ay, bx, by) < .022)
      const onDot = Math.hypot(nx - .32, ny - .28) < .026 || Math.hypot(nx - .68, ny - .72) < .026
      if (onLine || onDot) color = [242, 201, 76]
      const offset = (y * size + x) * 4
      pixels.set([...color, 255], offset)
    }
  }

  const scanlines = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y += 1) {
    const start = y * (size * 4 + 1)
    scanlines[start] = 0
    pixels.copy(scanlines, start + 1, y * size * 4, (y + 1) * size * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) writeFileSync(path.join(output, `icon-${size}.png`), createIcon(size))
console.log('Generated Nexus PWA icons.')
