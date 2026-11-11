<script setup>
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, required: true },
  desc: { type: String, default: '' },
})
</script>

<template>
  <header class="page-head">
    <div class="wrap">
      <div v-if="eyebrow" class="eyebrow">{{ eyebrow }}</div>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="desc" class="page-desc">{{ desc }}</p>
      <slot />
    </div>
  </header>
</template>

<style scoped>
.page-head {
  padding: 52px 0 36px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 40px;
}

.page-title {
  font-size: clamp(28px, 3.4vw, 42px);
  letter-spacing: -0.02em;
  margin-top: 10px;
  color: var(--ink);
}

.page-desc {
  margin-top: 14px;
  color: var(--ink-2);
  font-size: 15px;
  line-height: 1.8;
  max-width: 68ch;
}

@media (max-width: 720px) {
  .page-head {
    padding: 34px 0 26px;
    margin-bottom: 28px;
  }
}
</style>
