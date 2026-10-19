'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

/* 预生成 CRC32 查找表 */
const CRC_TABLE = (() => {
  const base = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    base[i] = c;
  }

  const table = new Int32Array(4 * 256);
  table.set(base, 0);
  for (let k = 1; k < 4; k += 1) {
    for (let i = 0; i < 256; i += 1) {
      const prev = table[(k - 1) * 256 + i];
      table[k * 256 + i] = (prev >>> 8) ^ base[prev & 0xff];
    }
  }
  return table;
})();

/* 计算缓冲区 CRC32 校验值 */
function crc32(buffer, seed = 0) {
  let c = (~seed) >>> 0;
  const len = buffer.length;
  let i = 0;

  for (; i + 4 <= len; i += 4) {
    c = (c ^ (buffer[i] | (buffer[i + 1] << 8) | (buffer[i + 2] << 16) | (buffer[i + 3] << 24))) >>> 0;
    c = (
      CRC_TABLE[3 * 256 + (c & 0xff)]
      ^ CRC_TABLE[2 * 256 + ((c >>> 8) & 0xff)]
      ^ CRC_TABLE[1 * 256 + ((c >>> 16) & 0xff)]
      ^ CRC_TABLE[(c >>> 24) & 0xff]
    ) >>> 0;
  }
  for (; i < len; i += 1) c = (CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)) >>> 0;

  return (c ^ 0xffffffff) >>> 0;
}

/* 递归列出目录内所有文件及包内相对路径 */
function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push({ full, rel: path.relative(root, full).split(path.sep).join('/') });
    }
  };
  walk(root);
  return out;
}

const DOS_TIME = 0;
const DOS_DATE = 0x21;

const uint64le = (value) => {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeUInt32LE(value >>> 0, 0);
  buffer.writeUInt32LE(Math.floor(value / 0x100000000) >>> 0, 4);
  return buffer;
};

const readUInt64LE = (buf, p) => buf.readUInt32LE(p) + buf.readUInt32LE(p + 4) * 0x100000000;

const MAX32 = 0xffffffff;

/* 拼装 zip 本地文件头 */
function localHeader(crc, size, nameBuffer, zip64) {
  let extra = null;
  if (zip64) {

    extra = Buffer.alloc(20);
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(16, 2);
    uint64le(size).copy(extra, 4);
    uint64le(size).copy(extra, 12);
  }

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(45, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(zip64 ? MAX32 : size, 18);
  header.writeUInt32LE(zip64 ? MAX32 : size, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(extra ? extra.length : 0, 28);

  return extra ? Buffer.concat([header, nameBuffer, extra]) : Buffer.concat([header, nameBuffer]);
}

/* 拼装 zip 中央目录条目 */
function centralHeader(nameBuffer, crc, size, offset, zip64Size, zip64Offset) {
  let extra = null;
  if (zip64Size || zip64Offset) {

    const body = Buffer.concat([uint64le(size), uint64le(size), uint64le(offset)]);
    extra = Buffer.alloc(4 + body.length);
    extra.writeUInt16LE(0x0001, 0);
    extra.writeUInt16LE(body.length, 2);
    body.copy(extra, 4);
  }

  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(45, 4);
  header.writeUInt16LE(45, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(zip64Size ? MAX32 : size, 20);
  header.writeUInt32LE(zip64Size ? MAX32 : size, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(extra ? extra.length : 0, 30);
  header.writeUInt32LE(zip64Offset ? MAX32 : offset, 42);

  return extra ? Buffer.concat([header, nameBuffer, extra]) : Buffer.concat([header, nameBuffer]);
}

/* 往文件句柄写一段数据 */
function write(handle, buffer) {
  return handle.write(buffer).then((result) => (result.bytesWritten < buffer.length ? new Promise((resolve) => handle.once('drain', resolve)) : null));
}

const uint32le = (value) => {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
};

/* 构造可被识别的中断错误 */
function abortedError() {
  const err: any = new Error('打包已中断');
  err.code = 'ZIP_ABORTED';
  return err;
}

/* 把指定文件列表打成 zip 并回报进度 */
async function packFiles(files, outFile, { onProgress = (() => {}) as any, chunkSize = 8 << 20, forceZip64 = false, isCancelled = (() => false) as any } = {}) {
  const fd = await fsp.open(outFile, 'w');
  const entries = [];
  let offset = 0;
  let written = 0;

  try {
    for (const item of files) {
      if (isCancelled()) throw abortedError();
      const stat = fs.statSync(item.full);

      if (!forceZip64 && stat.size >= MAX32) throw new Error(`文件超过 zip 单文件上限：${item.rel}`);

      const nameBuffer = Buffer.from(item.rel, 'utf8');
      const localOffset = offset;
      const zip64Size = forceZip64 || stat.size >= MAX32;
      const header = localHeader(0, stat.size, nameBuffer, zip64Size);

      await write(fd, header);
      offset += header.length;

      let crc = 0;
      let size = 0;

      const stream = fs.createReadStream(item.full, { highWaterMark: chunkSize });
      for await (const slice of stream) {
        if (isCancelled()) {
          stream.destroy();
          throw abortedError();
        }
        crc = crc32(slice, crc);
        size += slice.length;
        await write(fd, slice);
        offset += slice.length;
        written += slice.length;
        onProgress(written);
      }

      fs.writeSync(fd.fd, uint32le(crc), 0, 4, localOffset + 14);
      entries.push({ nameBuffer, crc, size, localOffset });
    }

    const total = offset;
    const anyZip64 = forceZip64
      || total >= MAX32
      || entries.some((e) => e.localOffset >= MAX32 || e.size >= MAX32);

    const centralStart = offset;
    for (const entry of entries) {
      const zip64Size = forceZip64 || entry.size >= MAX32;
      const zip64Offset = forceZip64 || entry.localOffset >= MAX32;
      const central = centralHeader(entry.nameBuffer, entry.crc, entry.size, entry.localOffset, zip64Size, zip64Offset);
      await write(fd, central);
      offset += central.length;
    }
    const centralSize = offset - centralStart;

    if (anyZip64) {

      const z64 = Buffer.alloc(56);
      z64.writeUInt32LE(0x06064b50, 0);
      uint64le(44).copy(z64, 4);
      z64.writeUInt16LE(45, 12);
      z64.writeUInt16LE(45, 14);
      z64.writeUInt32LE(0, 16);
      z64.writeUInt32LE(0, 20);
      uint64le(entries.length).copy(z64, 24);
      uint64le(entries.length).copy(z64, 32);
      uint64le(centralSize).copy(z64, 40);
      uint64le(centralStart).copy(z64, 48);
      await write(fd, z64);
      offset += z64.length;

      const locator = Buffer.alloc(20);
      locator.writeUInt32LE(0x07064b50, 0);
      locator.writeUInt32LE(0, 4);
      uint64le(offset - z64.length).copy(locator, 8);
      locator.writeUInt32LE(1, 16);
      await write(fd, locator);
      offset += locator.length;
    }

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(anyZip64 ? 0xffff : entries.length, 8);
    end.writeUInt16LE(anyZip64 ? 0xffff : entries.length, 10);
    end.writeUInt32LE(anyZip64 ? MAX32 : centralSize, 12);
    end.writeUInt32LE(anyZip64 ? MAX32 : centralStart, 16);
    await write(fd, end);
    offset += end.length;
  } finally {
    await fd.close();
  }

  return { file: outFile, bytes: offset, files: entries.length };
}

/* 把整个目录打成 zip */
function zipDir(dir, outFile, options = {}) {
  return packFiles(listFiles(dir), outFile, options);
}

/* 读取 zip 中央目录返回条目清单 */
async function listZip(file) {
  const fd = await fsp.open(file, 'r');
  try {
    const total = (await fd.stat()).size;

    const tailLen = Math.min(total, 65557 + 22);
    const tail = Buffer.alloc(tailLen);
    await fd.read(tail, 0, tailLen, total - tailLen);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('找不到 EOCD');

    let count = tail.readUInt16LE(eocd + 10);
    let centralStart = tail.readUInt32LE(eocd + 16);
    let centralSize = tail.readUInt32LE(eocd + 12);

    if (count === 0xffff || centralStart === MAX32 || centralSize === MAX32) {
      if (eocd - 20 < 0) throw new Error('EOCD 不含 ZIP64 定位符');
      const loc = eocd - 20;
      if (tail.readUInt32LE(loc) !== 0x07064b50) throw new Error('找不到 ZIP64 EOCD 定位符');
      const z64 = Buffer.alloc(56);
      await fd.read(z64, 0, 56, readUInt64LE(tail, loc + 8));
      if (z64.readUInt32LE(0) !== 0x06064b50) throw new Error('找不到 ZIP64 EOCD 记录');
      count = readUInt64LE(z64, 32);
      centralSize = readUInt64LE(z64, 40);
      centralStart = readUInt64LE(z64, 48);
    }

    const central = Buffer.alloc(centralSize);
    await fd.read(central, 0, central.length, centralStart);

    const out = [];
    let cursor = 0;
    for (let i = 0; i < count; i += 1) {
      if (central.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`第 ${i} 条中央目录签名错误`);
      let size = central.readUInt32LE(cursor + 24);
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      const name = central.toString('utf8', cursor + 46, cursor + 46 + nameLength);
      if (size === MAX32) {

        const exStart = cursor + 46 + nameLength;
        if (central.readUInt16LE(exStart) === 0x0001) size = readUInt64LE(central, exStart + 4);
      }
      out.push({ name, size });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return out;
  } finally {
    await fd.close();
  }
}

/* 解析 zip 结构并逐条校验 CRC */
function verifyZip(file) {
  const buf = fs.readFileSync(file);

  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('找不到 EOCD');

  const total = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < total; i += 1) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`第 ${i} 条中央目录签名错误`);

    const crc = buf.readUInt32LE(cursor + 16);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const nameLength = buf.readUInt16LE(cursor + 28);
    const extraLength = buf.readUInt16LE(cursor + 30);
    const commentLength = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`${name} 的本地头偏移不对（${localOffset}）`);
    }
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localName = buf.toString('utf8', localOffset + 30, localOffset + 30 + localNameLength);
    if (localName !== name) throw new Error(`${name} 的本地头名称对不上（${localName}）`);

    const dataStart = localOffset + 30 + localNameLength + buf.readUInt16LE(localOffset + 28);
    const data = buf.subarray(dataStart, dataStart + compressedSize);
    if (crc32(data) !== crc) throw new Error(`${name} CRC 不匹配`);

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return { entries: total };
}

/* 把 zip 解压到目标目录并回报进度 */
async function unzipTo(file, destDir, { onProgress = (() => {}) as any, chunkSize = 8 << 20, pick = null } = {}) {
  const fd = await fsp.open(file, 'r');
  try {

    if (typeof fd.setMaxListeners === 'function') fd.setMaxListeners(0);

    const total = (await fd.stat()).size;

    const tailLen = Math.min(total, 65557 + 22);
    const tail = Buffer.alloc(tailLen);
    await fd.read(tail, 0, tailLen, total - tailLen);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('找不到 EOCD');

    let entries = tail.readUInt16LE(eocd + 10);
    let centralStart = tail.readUInt32LE(eocd + 16);
    let centralSize = tail.readUInt32LE(eocd + 12);

    if (entries === 0xffff || centralStart === MAX32 || centralSize === MAX32) {
      if (eocd - 20 < 0) throw new Error('EOCD 不含 ZIP64 定位符');
      const loc = eocd - 20;
      if (tail.readUInt32LE(loc) !== 0x07064b50) throw new Error('找不到 ZIP64 EOCD 定位符');
      const z64Offset = readUInt64LE(tail, loc + 8);
      const z64 = Buffer.alloc(56);
      await fd.read(z64, 0, 56, z64Offset);
      if (z64.readUInt32LE(0) !== 0x06064b50) throw new Error('找不到 ZIP64 EOCD 记录');
      entries = readUInt64LE(z64, 32);
      centralSize = readUInt64LE(z64, 40);
      centralStart = readUInt64LE(z64, 48);
    }

    const centralEnd = centralStart + centralSize;
    const central = Buffer.alloc(centralEnd - centralStart);
    await fd.read(central, 0, central.length, centralStart);

    const destAbs = path.resolve(destDir);
    await fsp.mkdir(destAbs, { recursive: true });

    const listing = [];
    let cursor = 0;
    for (let i = 0; i < entries; i += 1) {
      if (central.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`第 ${i} 条中央目录签名错误`);

      const crc = central.readUInt32LE(cursor + 16);
      let compressedSize = central.readUInt32LE(cursor + 20);
      const nameLength = central.readUInt16LE(cursor + 28);
      const extraLength = central.readUInt16LE(cursor + 30);
      const commentLength = central.readUInt16LE(cursor + 32);
      let localOffset = central.readUInt32LE(cursor + 42);
      const name = central.toString('utf8', cursor + 46, cursor + 46 + nameLength);

      if (compressedSize === MAX32 || localOffset === MAX32) {
        const exStart = cursor + 46 + nameLength;
        const exEnd = exStart + extraLength;
        let p = exStart;
        while (p + 4 <= exEnd) {
          const id = central.readUInt16LE(p);
          const sz = central.readUInt16LE(p + 2);
          if (id === 0x0001) {
            const body = p + 4;
            if (compressedSize === MAX32) compressedSize = readUInt64LE(central, body + 8);
            if (localOffset === MAX32) localOffset = readUInt64LE(central, body + 16);
          }
          p += 4 + sz;
        }
      }
      cursor += 46 + nameLength + extraLength + commentLength;
      listing.push({ crc, compressedSize, localOffset, name });
    }

    let jobs = listing;
    if (typeof pick === 'function') {
      jobs = [];
      for (const item of listing) {
        const picked = pick(item.name);
        if (!picked) continue;
        jobs.push({ ...item, dest: picked.dest, rel: picked.rel || item.name });
      }
    } else {
      jobs = listing.map((item) => ({ ...item, dest: destAbs, rel: item.name }));
    }
    const zipTotal = jobs.reduce((sum, item) => sum + item.compressedSize, 0);

    let done = 0;
    for (const item of jobs) {
      const { crc, compressedSize, name, dest, rel } = item;
      const localOffset = item.localOffset;

      const local = Buffer.alloc(30);
      await fd.read(local, 0, 30, localOffset);
      if (local.readUInt32LE(0) !== 0x04034b50) throw new Error(`${name} 的本地头签名错误`);
      const dataStart = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);

      const target = path.resolve(dest, rel.split('/').join(path.sep));
      if (target !== dest && !target.startsWith(dest + path.sep)) {
        throw new Error(`zip 内出现非法路径：${name}`);
      }
      await fsp.mkdir(path.dirname(target), { recursive: true });

      let crcRun = 0;
      let size = 0;
      const rs = fs.createReadStream(null, {
        fd,
        start: dataStart,
        end: dataStart + compressedSize - 1,
        highWaterMark: chunkSize,

        autoClose: false,
      });
      const ws = fs.createWriteStream(target, { flags: 'w' });
      await new Promise((resolve, reject) => {
        rs.on('data', (chunk) => {
          crcRun = crc32(chunk, crcRun);
          size += chunk.length;

          onProgress(done + size, zipTotal);
        });
        rs.on('error', reject);
        ws.on('error', reject);
        ws.on('finish', resolve);
        rs.pipe(ws);
      });
      if (size !== compressedSize || crcRun !== crc) {
        throw new Error(`${name} CRC 不匹配（zip 可能损坏）`);
      }
      done += size;
    }

    return { file, destDir: destAbs, entries, bytes: done };
  } finally {
    await fd.close();
  }
}

module.exports = { zipDir, zipFiles: packFiles, listZip, unzipTo, crc32, listFiles, verifyZip };
