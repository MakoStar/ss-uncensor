<script setup lang="ts">
import { useToastStore, TOAST_ICON } from '../../stores/toast';

const toasts = useToastStore();
</script>

<template>
  <TransitionGroup tag="div" class="toasts" id="toasts" name="toast">
    <div v-for="item in toasts.items" :key="item.id" class="toast" :class="`toast-${item.kind}`">
      <span class="toast-icon">{{ TOAST_ICON[item.kind] || 'i' }}</span>
      <span class="toast-text">
        <template v-if="item.title && item.text">
          <b>{{ item.title }}</b>
          <span>{{ item.text }}</span>
        </template>
        <template v-else>{{ item.title || item.text }}</template>
      </span>
    </div>
  </TransitionGroup>
</template>
