const MIRRORS = [
  { key: 'official', label: 'GitHub 官方（默认）', prefix: '', note: '直连 github.com，国内可能较慢或失败' },
  {
    key: 'gh-proxy-com',
    label: 'gh-proxy.com 加速',
    prefix: 'https://gh-proxy.com/',
    note: '第三方反代，下载与版本查询都可用'
  },
  {
    key: 'ghproxy',
    label: 'ghproxy.net 加速',
    prefix: 'https://ghproxy.net/',
    note: '第三方反代，只代理下载（版本查询会走别的线路）'
  },
  { key: 'gitdl', label: 'gitdl.cn 加速', prefix: 'https://gitdl.cn/', note: '第三方反代，备用' },
  { key: 'gh-proxy-net', label: 'gh-proxy.net 加速', prefix: 'https://gh-proxy.net/', note: '第三方反代，备用' },
  { key: 'ghproxy-cfd', label: 'ghproxy.cfd 加速', prefix: 'https://ghproxy.cfd/', note: '第三方反代，备用' },
  { key: 'ghfast', label: 'ghfast.top 加速', prefix: 'https://ghfast.top/', note: '第三方反代，近期经常连不上' },
  { key: 'ghproxy-cc', label: 'ghproxy.cc 加速', prefix: 'https://ghproxy.cc/', note: '第三方反代，近期经常连不上' }
];

const MIRROR_KEYS = MIRRORS.map((item) => item.key);

const DEFAULT_MIRROR = 'official';

/** 按标识取出镜像配置 */
function mirrorOf(key: unknown): { key: string; label: string; prefix: string; note: string } {
  const text = String(key || '');
  return MIRRORS.find((item) => item.key === text) || MIRRORS[0];
}

/** 给地址拼上镜像前缀 */
function mirrorUrl(url: unknown, key: unknown): string {
  const text = String(url || '');
  const mirror = mirrorOf(key);
  if (!mirror.prefix || !/^https?:\/\//i.test(text)) return text;
  return mirror.prefix + text;
}

/** 列出镜像下拉选项 */
function mirrorOptions(): { value: string; label: string; note: string }[] {
  return MIRRORS.map((item) => ({ value: item.key, label: item.label, note: item.note }));
}

module.exports = { MIRRORS, MIRROR_KEYS, DEFAULT_MIRROR, mirrorOf, mirrorUrl, mirrorOptions };
