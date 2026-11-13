<script setup lang="ts">
defineProps<{ title: string; wide?: boolean; id?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <div :id="id" class="modal-mask" @click.self="emit('close')">
    <div class="modal" :class="{ wide }" role="dialog" aria-modal="true">
      <h3>{{ title }}</h3>
      <slot />
      <slot name="actions" />
    </div>
  </div>
</template>
