'use strict';

const fs = require('fs');
const path = require('path');
const { discoverSources, buildManifest } = require('../manifest/build');
const { serializeManifest, getMeta } = require('../manifest/parse');
const { versionCompare } = require('../manifest/merge');
const { buildArgs } = require('../network/fetcher');
const { FETCHER, DIRS, patchDir, refPath, resourcePath, setPlatform } = require('../config/paths');
const { KEYS, NETWORK, MANI_ONLY_PATTERN, PLATFORMS, SERVER_REGIONS, DEFAULT_PLATFORM, resolvePlatform } = require('../config');
const { defaultList, resolveList, resolveOutputDir, buildArgs: uncensorArgs, listRegion, listFiles } = require('../uncensor/download');
const { missingList, readList, downloadedNames } = require('../uncensor/audit');

let failed = 0;

let out = (...args) => console.log(...args);

/* 输出一条断言结果 */
function assert(name, cond, detail = '') {
  out(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!cond) failed += 1;
}

/* 检查多个路径是否都有数据 */
function hasData(...paths) {
  return paths.every((p) => fs.existsSync(p));
}

/* 自检版本比较函数 */
function testVersionCompare() {
  assert('versionCompare 1.13.0 < 1.16.0', versionCompare('1.13.0', '1.16.0', 3) === -1);
  assert('versionCompare 1.16.0 > 1.13.2', versionCompare('1.16.0', '1.13.2', 3) === 1);
  assert('versionCompare 1.13.0 = 1.13.0', versionCompare('1.13.0', '1.13.0', 3) === 0);
  assert('versionCompare more components wins', versionCompare('1.13', '1.13.0', 3) === -1);
}

/* 自检抓取参数拼装 */
function testFetchArgs() {
  assert('fetcher exists', !FETCHER || fs.existsSync(FETCHER), FETCHER ? path.basename(FETCHER) : '未安装，跳过');

  const all = buildArgs();
  const text = all.join(' ');
  const single = buildArgs({ region: 'JP' }).join(' ');
  const tuned = buildArgs({ platform: 'and', timeout: 60, retries: 7, overwrite: true, logLevel: 'debug' }).join(' ');

  assert('client is the last token', all[all.length - 1] === 'client');

  assert('one call covers every region', text.includes(`${KEYS.useDefaultRegion}=false`));
  assert('no region pinned when fetching all', !all.includes(`${KEYS.region}=CN`));
  assert('single-region mode pins the region', single.includes(`${KEYS.region}=JP`));
  assert('single-region mode leaves the region filter alone', !single.includes(KEYS.useDefaultRegion));
  assert('platform goes through the shorthand key', text.includes(`${KEYS.platform}=${DEFAULT_PLATFORM}`));
  assert('resource regex keeps the download to .mani', text.includes(`${KEYS.resPatterns}=${MANI_ONLY_PATTERN}`));
  assert('resource regex is enabled', text.includes(`${KEYS.useResourceRegex}=true`));

  assert('seven overrides by default', all.filter((arg) => arg === '-s').length === 7, `${all.filter((arg) => arg === '-s').length} -s`);
  assert('timeout and retries are sent', text.includes('NETWORK.TIMEOUT_SECS=900') && text.includes('NETWORK.TOTAL_RETRIES=3'));
  assert('no log level flag by default', !text.includes('--log_level'));
  assert('directories keep the fetcher defaults', !/FILEPATH\./.test(text));
  assert('no config file is written', !text.includes('gen_config') && !text.includes('gen-config'));
  assert('no route or filename overrides', !text.includes('ROUTE.') && !text.includes('FILENAME.'));
  assert('server list covers five regions', SERVER_REGIONS.join(',') === 'CN,EN,JP,KR,TW');

  assert('platform override lands in the command', tuned.includes(`${KEYS.platform}=and`));
  assert('timeout is overridable', tuned.includes('NETWORK.TIMEOUT_SECS=60'));
  assert('retries are overridable', tuned.includes('NETWORK.TOTAL_RETRIES=7'));
  assert('overwrite is overridable', tuned.includes('OVERWRITE_RESOURCE=true'));
  assert('log level is overridable', tuned.includes('--log_level debug'));
  assert('outdated filter can be kept off', buildArgs({ filterOutdated: false }).join(' ').includes('FILTER_OUTDATED_PATCH=false'));
  assert('merge can be left on', !buildArgs({ mergePatch: true }).join(' ').includes('MERGE_PATCH=false'));
}

function testMeta(region) {
  const sources = discoverSources(patchDir(region));
  const lines = buildManifest({ ...sources, mode: 'snapshot' });
  const mani = { meta: [], bundles: [] };
  for (const line of lines) {
    const at = line.indexOf(':');
    if (line.startsWith('$')) mani.meta.push({ key: line.slice(0, at), value: line.slice(at + 1) });
    else mani.bundles.push(line);
  }
  const info = mani.meta.filter((m) => m.key === '$BIN_DIFF_PATCH_INFO');
  assert(
    `[${region}] $BIN_DIFF_PATCH_INFO count equals patch count`,
    info.length === sources.patches.length,
    `${info.length} / ${sources.patches.length}`
  );
  assert(
    `[${region}] $BIN_DIFF_PATCH_VER takes the base value`,
    getMeta(mani, '$BIN_DIFF_PATCH_VER', '') === String(sources.patches.length),
    getMeta(mani, '$BIN_DIFF_PATCH_VER', '')
  );
  const latest = sources.patches[sources.patches.length - 1].mani.bundles.length;
  assert(
    `[${region}] resource count equals the latest patch`,
    mani.bundles.length === latest,
    `${mani.bundles.length} / ${latest}`
  );
}

function testRegion(region) {
  const reference = refPath(region);
  const sources = discoverSources(patchDir(region));
  const text = serializeManifest(buildManifest({ ...sources, mode: 'snapshot' }));
  const name = `[${region}] build`;

  if (!fs.existsSync(reference)) {
    assert(`${name} (no reference, generation only)`, text.length > 0, `${sources.patches.length} patches`);
    return;
  }
  const expected = fs.readFileSync(reference);
  const same = Buffer.from(text, 'utf8').equals(expected);
  assert(`${name} is byte-identical to reference`, same, `${Buffer.byteLength(text, 'utf8')} / ${expected.length} bytes`);
  if (!same) {
    const a = text.split('\n');
    const b = expected.toString('utf8').split('\n');
    const at = a.findIndex((line, i) => line !== b[i]);
    out(`    first diverging line ${at}\n    built     ${a[at]}\n    reference ${b[at]}`);
  }
}

function testUncensorArgs() {
  const list = defaultList();
  const args = uncensorArgs({ path: list });
  const text = args.join(' ');

  assert('uses the uncensor subcommand', args[0] === 'uncensor');
  assert('enables the custom list', text.includes('--custom'));
  assert('points at an absolute list path', text.includes(`--path=${list}`));
  assert('passes the region from the list', text.includes('--region=TW'));
  assert('points at the generated diff list by default', list.startsWith(DIRS.generatedDiff));
  assert('sets the platform through GLOBAL', text.includes(`${KEYS.platform}=${DEFAULT_PLATFORM}`));
  assert('no resource dir override by default', !text.includes(KEYS.uncensorResource));
  assert('no manifest or metadata dir overrides', !text.includes('TASK.UNCENSOR.FILEPATH.MANIFEST') && !text.includes('TASK.UNCENSOR.FILEPATH.METADATA'));
  assert('no config patching leftovers', !text.includes('--gen-config') && !text.includes('--gen_config'));
  assert('raises the read timeout above the 180s default', text.includes(`${KEYS.timeout}=${NETWORK.timeout}`));
  assert('lets the fetcher retry bodies itself', text.includes(`${KEYS.retries}=${NETWORK.retries}`));

  const tuned = uncensorArgs({ path: list, timeout: 60, httpRetries: 7 }).join(' ');
  assert('timeout is overridable', tuned.includes(`${KEYS.timeout}=60`));
  assert('body retries are overridable', tuned.includes(`${KEYS.retries}=7`));
}

function testPlatform() {
  assert('platform falls back to the default', resolvePlatform('nope') === DEFAULT_PLATFORM);
  assert('platform names are win/and/ios', Object.keys(PLATFORMS).join(',') === 'win,and,ios');

  setPlatform('win');
  const win = buildArgs({ region: 'CN' }).join(' ');
  assert('win sets GLOBAL.DEFAULT_PLATFORM', win.includes(`${KEYS.platform}=win`));

  setPlatform('and');
  const and = buildArgs({ region: 'CN' }).join(' ');
  assert('and sets GLOBAL.DEFAULT_PLATFORM', and.includes(`${KEYS.platform}=and`));
  assert('and needs no filename overrides', !and.includes('ss_and') && !and.includes('ss_win'));
  assert('only the platform token differs', win.replace('PLATFORM=win', 'PLATFORM=and') === and);

  setPlatform(DEFAULT_PLATFORM);
}

function testResolution() {
  assert('resolved list exists', fs.existsSync(resolveList()), resolveList());
  assert('output dir is under the repo', resolveOutputDir() === DIRS.resource);
}

function testAudit() {
  const list = readList(defaultList());
  assert('audit reads the wanted region', list.region === 'TW');
  assert('audit reads every wanted file', list.files.length > 0, String(list.files.length));

  const dir = resourcePath('TW');
  const names = downloadedNames('TW');
  const onDisk = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
  assert('audit counts the resource dir', names.size === onDisk, `${names.size} on disk`);

  assert('missing list lands in output/Generated/diff', missingList().startsWith(DIRS.generatedDiff));
}

function testListMeta() {
  assert(`region is read from the list (${defaultList()})`, listRegion(defaultList()) === 'TW');
  assert('file count is read from the list', listFiles(defaultList()) > 0, String(listFiles(defaultList())));
}

function run(options: any ={}) {
  out = options.quiet ? () => {} : (...args) => console.log(...args);
  failed = 0;
  out('ss-uncensor verification\n');
  testVersionCompare();
  out();
  testFetchArgs();
  out();
  testPlatform();
  out();

  if (!hasData(DIRS.manifest)) {
    out(`SKIP  build / audit cases, no data under ${DIRS.manifest}`);
    out(`\n${failed === 0 ? 'all passed' : `${failed} failed`}`);
    return failed;
  }

  testMeta('CN');
  testRegion('CN');
  out();
  testMeta('TW');
  testRegion('TW');
  out();

  if (!hasData(defaultList())) {
    out(`SKIP  download cases, no list at ${defaultList()}`);
    out(`\n${failed === 0 ? 'all passed' : `${failed} failed`}`);
    return failed;
  }

  testUncensorArgs();
  out();
  testResolution();
  out();
  testAudit();
  out();
  testListMeta();

  out(`\n${failed === 0 ? 'all passed' : `${failed} failed`}`);
  return failed;
}

if (require.main === module) {
  process.exitCode = run() === 0 ? 0 : 1;
}

module.exports = { run };
