import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const sizes = [16, 32, 48, 128]
const outputDir = resolve('public/icons')

mkdirSync(outputDir, { recursive: true })

for (const size of sizes) {
  writeFileSync(resolve(outputDir, `icon-${size}.png`), createIcon(size))
}

function createIcon(size) {
  const data = Buffer.alloc((size * 4 + 1) * size)

  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1)
    data[row] = 0

    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4
      const u = x / Math.max(size - 1, 1)
      const v = y / Math.max(size - 1, 1)
      const radius = Math.hypot(u - 0.5, v - 0.5)
      const inMark = Math.abs(x - y) <= size * 0.08 || Math.abs(x + y - size) <= size * 0.08

      data[offset] = inMark ? 255 : Math.round(31 + 42 * u)
      data[offset + 1] = inMark ? 255 : Math.round(122 + 92 * (1 - radius))
      data[offset + 2] = inMark ? 255 : Math.round(95 + 85 * v)
      data[offset + 3] = radius > 0.62 ? 0 : 255
    }
  }

  const chunks = [
    chunk('IHDR', ihdr(size, size)),
    chunk('IDAT', deflateSync(data)),
    chunk('IEND', Buffer.alloc(0)),
  ]

  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks])
}

function ihdr(width, height) {
  const buffer = Buffer.alloc(13)
  buffer.writeUInt32BE(width, 0)
  buffer.writeUInt32BE(height, 4)
  buffer[8] = 8
  buffer[9] = 6
  buffer[10] = 0
  buffer[11] = 0
  buffer[12] = 0
  return buffer
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  const crc = Buffer.alloc(4)

  length.writeUInt32BE(data.length, 0)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([length, typeBuffer, data, crc])
}

function crc32(buffer) {
  let crc = 0xffffffff

  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}
