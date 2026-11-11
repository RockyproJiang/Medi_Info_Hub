<script setup>
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div class="wrap nf">
    <div class="nf-mark mono">404</div>
    <h1 class="nf-title">这个页面不存在</h1>
    <p class="nf-path mono">{{ route.fullPath }}</p>
    <p class="nf-desc">可能是链接已失效，或者地址输错了。下面这几个入口或许有用。</p>
    <div class="nf-links">
      <RouterLink to="/" class="btn">回到首页</RouterLink>
      <RouterLink to="/policies" class="btn ghost">政策库</RouterLink>
      <RouterLink to="/tools" class="btn ghost">测算中心</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.nf {
  padding: 110px 0 80px;
  max-width: 640px;
}

.nf-mark {
  font-size: 13px;
  letter-spacing: 0.3em;
  color: var(--cinnabar);
  margin-bottom: 18px;
}

.nf-title {
  font-size: clamp(30px, 4vw, 44px);
  letter-spacing: -0.03em;
  color: var(--ink);
}

.nf-path {
  margin-top: 14px;
  font-size: 12px;
  color: var(--ink-4);
  padding: 8px 12px;
  background: var(--paper-2);
  display: inline-block;
  word-break: break-all;
}

.nf-desc {
  margin-top: 20px;
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink-2);
}

.nf-links {
  margin-top: 30px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
