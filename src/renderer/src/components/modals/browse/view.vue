<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useBrowseStore } from '../../../stores/browse';
import Modal from '../../ui/modal.vue';

const browse = useBrowseStore();

const preEl = ref<HTMLElement>();
const query = ref('');
const debounced = ref('');
const active = ref(0);
let timer = 0;
const MAX_MATCHES = 3000;

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const source = computed(() => browse.viewFile.text || '');

const matchCount = computed(() => {
  const term = debounced.value;
  if (!term) return 0;
  const text = source.value;
  let count = 0;
  try {
    const pattern = new RegExp(escapeRe(term), 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      count += 1;
      if (count >= MAX_MATCHES) break;
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  } catch {}
  return count;
});

const countText = computed(() => {
  if (!matchCount.value) return '0';
  return `${active.value + 1} / ${matchCount.value}${matchCount.value >= MAX_MATCHES ? '+' : ''}`;
});

const highlighted = computed(() => {
  const base = escapeHtml(source.value);
  const term = debounced.value;
  if (!term) return base;
  try {
    const pattern = new RegExp(escapeRe(escapeHtml(term)), 'gi');
    let injected = 0;
    return base.replace(pattern, (match) => {
      if (injected >= MAX_MATCHES) return match;
      injected += 1;
      return `<mark class="mark">${match}</mark>`;
    });
  } catch {
    return base;
  }
});

async function focusActive() {
  await nextTick();
  const pre = preEl.value;
  if (!pre) return;
  const marks = pre.querySelectorAll('mark');
  const total = marks.length;
  if (!total) return;
  if (active.value >= total) active.value = 0;
  marks.forEach((mark) => mark.classList.remove('active'));
  const currentMark = marks[active.value] as HTMLElement | undefined;
  if (!currentMark) return;
  currentMark.classList.add('active');
  const preRect = pre.getBoundingClientRect();
  const markRect = currentMark.getBoundingClientRect();
  pre.scrollTop = Math.max(
    0,
    pre.scrollTop + (markRect.top - preRect.top) - pre.clientHeight / 2 + markRect.height / 2
  );
}

watch(query, (value) => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    debounced.value = value.trim();
    active.value = 0;
    void focusActive();
  }, 180);
});

function goPrev() {
  if (!matchCount.value) return;
  active.value = (active.value - 1 + matchCount.value) % matchCount.value;
  void focusActive();
}

function goNext() {
  if (!matchCount.value) return;
  active.value = (active.value + 1) % matchCount.value;
  void focusActive();
}

watch(
  () => browse.viewFile.text,
  () => {
    query.value = '';
    debounced.value = '';
    active.value = 0;
  }
);
</script>

<template>
  <Modal id="viewfile-modal" v-show="browse.viewFile.open" title="查看清单文件" wide @close="browse.closeViewFile()">
    <div class="modal-note">{{ browse.viewFile.label }}</div>

    <div class="viewfile-search">
      <input
        class="viewfile-search-input"
        id="viewfile-search"
        type="search"
        v-model="query"
        placeholder="搜索内容（文件名 / 哈希 / 附加路径…）"
        @keydown.enter.prevent="goNext"
        @keydown.shift.enter.prevent="goPrev"
      />
      <button class="btn ghost tiny" id="viewfile-prev" :disabled="!matchCount" @click="goPrev">上一个</button>
      <span class="viewfile-search-count" id="viewfile-count">{{ countText }}</span>
      <button class="btn ghost tiny" id="viewfile-next" :disabled="!matchCount" @click="goNext">下一个</button>
    </div>

    <pre class="json-view" ref="preEl" tabindex="0" v-html="highlighted"></pre>

    <p class="modal-error" v-if="browse.viewFile.error">{{ browse.viewFile.error }}</p>

    <template #actions>
      <div class="modal-actions">
        <button class="btn ghost" @click="browse.openViewFileDir()">打开目录</button>
        <button class="btn ghost" @click="browse.copyViewFile()">复制内容</button>
        <span class="spacer"></span>
        <button class="btn primary" @click="browse.closeViewFile()">关闭</button>
      </div>
    </template>
  </Modal>
</template>
