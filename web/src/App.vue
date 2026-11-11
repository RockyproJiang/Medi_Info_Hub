<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { currentUser, clearSession, isLoggedIn } from './lib/api.js'

const route = useRoute()
const router = useRouter()
const user = ref(currentUser())
const logged = ref(isLoggedIn())
const menuOpen = ref(false)

function sync() {
  user.value = currentUser()
  logged.value = isLoggedIn()
}

onMounted(() => {
  window.addEventListener('yl-auth', sync)
  window.addEventListener('storage', sync)
})
onBeforeUnmount(() => {
  window.removeEventListener('yl-auth', sync)
  window.removeEventListener('storage', sync)
})

const nav = [
  { to: '/policies', label: '政策库' },
  { to: '/knowledge', label: '知识库' },
  { to: '/tools', label: '测算中心' },
  { to: '/family', label: '家庭规划' },
  { to: '/products', label: '产品图谱' },
  { to: '/care', label: '医养服务' },
  { to: '/data', label: '数据洞察' },
  { to: '/research', label: '调研数据库' },
  { to: '/lab', label: '量化实验室' },
  { to: '/advisor', label: 'AI 顾问' },
]

const isActive = (to) => route.path === to || route.path.startsWith(to + '/')

function logout() {
  clearSession()
  router.push('/')
}

const year = new Date().getFullYear()
</script>

<template>
  <header class="site-head">
    <div class="wrap head-inner">
      <RouterLink to="/" class="brand" aria-label="医讯通首页">
        <span class="mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="30" height="30">
            <path d="M4 22.5 L16 5 L28 22.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M9 26 L23 26" stroke="currentColor" stroke-width="1.6" />
            <path d="M16 12 L16 26" stroke="currentColor" stroke-width="1.2" opacity="0.55" />
            <circle cx="16" cy="9.4" r="1.9" fill="currentColor" />
          </svg>
        </span>
        <span class="brand-text">
          <strong>医讯通</strong>
          <em>养老金融 · 医养服务平台</em>
        </span>
      </RouterLink>

      <nav class="nav" :class="{ open: menuOpen }">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: isActive(item.to) }"
          @click="menuOpen = false"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="head-actions">
        <template v-if="logged">
          <RouterLink v-if="user?.role === 'admin'" to="/admin" class="btn ghost small">管理后台</RouterLink>
          <RouterLink to="/account" class="account-link">
            <span class="avatar">{{ (user?.displayName || user?.username || 'U').slice(0, 1) }}</span>
            <span class="uname">{{ user?.displayName || user?.username }}</span>
          </RouterLink>
          <button class="text-btn" @click="logout">退出</button>
        </template>
        <template v-else>
          <RouterLink to="/account?login=1" class="text-btn">登录</RouterLink>
          <RouterLink to="/account?register=1" class="btn small">创建账户</RouterLink>
        </template>
        <button class="burger" aria-label="打开菜单" @click="menuOpen = !menuOpen">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>

  <main class="site-main">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>

  <footer class="site-foot">
    <div class="wrap">
      <div class="foot-grid">
        <div class="foot-brand">
          <div class="fb-title">医讯通</div>
          <p class="fb-desc">
            面向中国家庭的养老金融与医养公共信息平台。政策原文索引、待遇测算工具、家庭规划、医养服务参考与 AI 顾问，帮助你把养老这件事算清楚。
          </p>
          <div class="fb-meta mono">EST. 2025 · v1.1.0</div>
        </div>

        <div class="foot-col">
          <div class="fc-title">内容</div>
          <RouterLink to="/policies">政策库</RouterLink>
          <RouterLink to="/knowledge">知识库</RouterLink>
          <RouterLink to="/data">数据洞察</RouterLink>
          <RouterLink to="/research">调研数据库</RouterLink>
          <RouterLink to="/lab">量化实验室</RouterLink>
        </div>

        <div class="foot-col">
          <div class="fc-title">工具</div>
          <RouterLink to="/tools">退休年龄测算</RouterLink>
          <RouterLink to="/tools">养老金估算</RouterLink>
          <RouterLink to="/family">家庭养老规划</RouterLink>
          <RouterLink to="/tools">养老缺口测算</RouterLink>
          <RouterLink to="/tools">税优测算</RouterLink>
        </div>

        <div class="foot-col">
          <div class="fc-title">医养</div>
          <RouterLink to="/care">医养服务参考</RouterLink>
          <RouterLink to="/knowledge/medical-insurance-for-elderly">退休医保指南</RouterLink>
          <RouterLink to="/knowledge/elderly-care-institutions-guide">养老机构选型</RouterLink>
          <RouterLink to="/policies/medical-insurance-retiree-2025">医保衔接政策</RouterLink>
        </div>

        <div class="foot-col">
          <div class="fc-title">关于</div>
          <RouterLink to="/about">免责声明</RouterLink>
          <RouterLink to="/about">数据来源</RouterLink>
          <RouterLink to="/advisor">AI 顾问说明</RouterLink>
        </div>
      </div>

      <div class="foot-bottom">
        <span>© {{ year }} 医讯通 · 本站内容为公开信息整理与测算演示，不构成投资建议</span>
        <span class="mono">本平台不销售任何金融产品</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-head {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(244, 242, 236, 0.92);
  backdrop-filter: blur(12px) saturate(1.2);
  border-bottom: 1px solid var(--line);
}

.head-inner {
  height: var(--nav-h);
  display: flex;
  align-items: center;
  gap: 28px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--pine);
  flex-shrink: 0;
}

.mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-text strong {
  font-family: var(--serif);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.brand-text em {
  font-style: normal;
  font-size: 9.5px;
  letter-spacing: 0.14em;
  color: var(--ink-3);
  margin-top: 2px;
}

.nav {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
}

.nav-link {
  position: relative;
  padding: 6px 12px;
  font-size: 14px;
  color: var(--ink-2);
  border-radius: var(--radius);
  transition: color 0.15s ease, background 0.15s ease;
  white-space: nowrap;
}

.nav-link:hover {
  color: var(--pine);
  background: var(--pine-soft);
}

.nav-link.active {
  color: var(--pine);
  font-weight: 500;
}

.nav-link.active::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -1px;
  height: 2px;
  background: var(--cinnabar);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.text-btn {
  background: none;
  border: 0;
  padding: 0;
  font-size: 13.5px;
  color: var(--ink-2);
  border-bottom: 1px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.text-btn:hover {
  color: var(--pine);
  border-color: var(--pine);
}

.account-link {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  color: var(--ink);
}

.avatar {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  background: var(--pine);
  color: var(--white);
  font-size: 12px;
  border-radius: var(--radius);
  font-family: var(--serif);
}

.uname {
  max-width: 88px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.burger {
  display: none;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 34px;
  height: 34px;
  background: none;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0 8px;
}

.burger span {
  display: block;
  height: 1.5px;
  background: var(--ink);
}

.site-main {
  flex: 1;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
}

/* ---------- 页脚 ---------- */

.site-foot {
  margin-top: 96px;
  border-top: 1px solid var(--line);
  background: var(--paper-2);
  padding: 56px 0 26px;
}

.foot-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr 1fr 1fr;
  gap: 40px;
}

.fb-title {
  font-family: var(--serif);
  font-size: 19px;
  color: var(--pine);
  letter-spacing: 0.04em;
}

.fb-desc {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.85;
  color: var(--ink-3);
  max-width: 42ch;
}

.fb-meta {
  margin-top: 16px;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: var(--ink-4);
}

.foot-col {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.fc-title {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--ink-4);
  text-transform: uppercase;
  font-family: var(--mono);
  margin-bottom: 4px;
}

.foot-col a {
  font-size: 13.5px;
  color: var(--ink-2);
  width: fit-content;
  border-bottom: 1px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.foot-col a:hover {
  color: var(--pine);
  border-color: var(--pine);
}

.foot-bottom {
  margin-top: 44px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
  color: var(--ink-3);
  flex-wrap: wrap;
}

@media (max-width: 1080px) {
  .nav-link {
    padding: 6px 8px;
    font-size: 13.5px;
  }
  .foot-grid {
    grid-template-columns: 1fr 1fr;
    gap: 32px;
  }
}

@media (max-width: 900px) {
  .nav {
    position: absolute;
    top: var(--nav-h);
    left: 0;
    right: 0;
    flex-direction: column;
    align-items: stretch;
    background: var(--paper);
    border-bottom: 1px solid var(--line);
    padding: 8px 18px 16px;
    gap: 0;
    display: none;
  }
  .nav.open {
    display: flex;
  }
  .nav-link {
    padding: 11px 4px;
    border-bottom: 1px solid var(--line);
    font-size: 15px;
  }
  .nav-link.active::after {
    display: none;
  }
  .burger {
    display: flex;
  }
  .uname {
    display: none;
  }
  .head-inner {
    gap: 12px;
    justify-content: space-between;
  }
  .head-actions {
    gap: 10px;
  }
}

@media (max-width: 560px) {
  .foot-grid {
    grid-template-columns: 1fr;
  }
  .brand-text em {
    display: none;
  }
  .site-foot {
    margin-top: 60px;
  }
}
</style>
