'use strict';

const fs = require('fs');
const path = require('path');
const { app, nativeImage } = require('electron');

const ASSETS = path.join(__dirname, '..', 'build');
const SOURCE = path.join(ASSETS, 'icon.png');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const RADIUS_RATIO = 0.235;

app.disableHardwareAcceleration();

/* 把方图裁成圆角方形图标 */
function cutRounded(img, size) {
  const bitmap = Buffer.from(img.toBitmap());
  const radius = Math.max(2, Math.round(size * RADIUS_RATIO));
  const max = size - 1;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const b = bitmap[i];
      const g = bitmap[i + 1];
      const r = bitmap[i + 2];


      const dx = Math.max(radius - x, x - (max - radius), 0);
      const dy = Math.max(radius - y, y - (max - radius), 0);
      const dist = Math.hypot(dx, dy);

      const outside = dist > radius;
      const nearWhite = r > 240 && g > 240 && b > 240;
      const inCornerBox = (x < radius * 1.6 || x > max - radius * 1.6) && (y < radius * 1.6 || y > max - radius * 1.6);

      if (outside || (inCornerBox && nearWhite)) {
        bitmap[i] = 0;
        bitmap[i + 1] = 0;
        bitmap[i + 2] = 0;
        bitmap[i + 3] = 0;
        continue;
      }


      const soft = Math.max(0, Math.min(1, radius - dist + 0.5));
      if (soft < 1) {
        bitmap[i] = Math.round(b * soft);
        bitmap[i + 1] = Math.round(g * soft);
        bitmap[i + 2] = Math.round(r * soft);
        bitmap[i + 3] = Math.round(bitmap[i + 3] * soft);
      }
    }
  }

  return nativeImage.createFromBitmap(bitmap, { width: size, height: size });
}

app.whenReady().then(() => {
  const image = nativeImage.createFromPath(SOURCE);
  if (image.isEmpty()) {
    console.error(`[icon] 读不到 ${SOURCE}`);
    app.exit(1);
    return;
  }

  const entries = SIZES.map((size) => ({
    size,
    png: cutRounded(image.resize({ width: size, height: size, quality: 'best' }), size).toPNG(),
  }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;

  entries.forEach((entry, index) => {
    const at = index * 16;
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, at);
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1);
    dir.writeUInt8(0, at + 2);
    dir.writeUInt8(0, at + 3);
    dir.writeUInt16LE(1, at + 4);
    dir.writeUInt16LE(32, at + 6);
    dir.writeUInt32LE(entry.png.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), Buffer.concat([header, dir, ...entries.map((e) => e.png)]));
  for (const entry of entries) {
    fs.writeFileSync(path.join(ASSETS, `icon-${entry.size}.png`), entry.png);
  }

  console.log(`[icon] 生成 ${entries.map((e) => e.size).join('/')} -> build/icon.ico`);
  app.exit(0);
});
