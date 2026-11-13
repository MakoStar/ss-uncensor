const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src', 'renderer', 'src');

/** 递归收集源码文件路径 */
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|vue)$/.test(name)) out.push(full);
  }
  return out;
}

/** 判断相对引用能否解析到文件 */
function resolves(base, spec) {
  const target = path.resolve(base, spec);
  return (
    fs.existsSync(target) ||
    fs.existsSync(`${target}.ts`) ||
    fs.existsSync(`${target}.vue`) ||
    fs.existsSync(path.join(target, 'index.ts')) ||
    fs.existsSync(path.join(target, 'index.js'))
  );
}

const broken = [];
for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  const base = path.dirname(file);
  const re = /(?:from\s+|import\s+)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue;
    if (resolves(base, spec)) continue;
    broken.push({
      file: path.relative(path.join(__dirname, '..'), file),
      line: text.slice(0, m.index).split('\n').length,
      spec
    });
  }
}

if (broken.length) {
  console.log(`✗ ${broken.length} 处相对 import 解析不到：`);
  for (const item of broken) console.log(`  ${item.file}:${item.line}  →  ${item.spec}`);
  process.exit(1);
}

console.log('✓ 渲染层相对 import 全部可解析');
