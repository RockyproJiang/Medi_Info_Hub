import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { title: '首页' } },
  { path: '/policies', name: 'policies', component: () => import('./views/PoliciesView.vue'), meta: { title: '政策库' } },
  { path: '/policies/:slug', name: 'policy', component: () => import('./views/PolicyDetailView.vue'), meta: { title: '政策详情' } },
  { path: '/knowledge', name: 'knowledge', component: () => import('./views/KnowledgeView.vue'), meta: { title: '知识库' } },
  { path: '/knowledge/:slug', name: 'article', component: () => import('./views/ArticleDetailView.vue'), meta: { title: '文章' } },
  { path: '/products', name: 'products', component: () => import('./views/ProductsView.vue'), meta: { title: '产品图谱' } },
  { path: '/care', name: 'care', component: () => import('./views/CareView.vue'), meta: { title: '医养服务' } },
  { path: '/family', name: 'family', component: () => import('./views/FamilyView.vue'), meta: { title: '家庭养老规划' } },
  { path: '/tools', name: 'tools', component: () => import('./views/ToolsView.vue'), meta: { title: '测算中心' } },
  { path: '/data', name: 'data', component: () => import('./views/DataView.vue'), meta: { title: '数据洞察' } },
  { path: '/research', name: 'research', component: () => import('./views/ResearchView.vue'), meta: { title: '调研数据库' } },
  { path: '/lab', name: 'lab', component: () => import('./views/LabView.vue'), meta: { title: '量化实验室' } },
  { path: '/advisor', name: 'advisor', component: () => import('./views/AdvisorView.vue'), meta: { title: 'AI 顾问' } },
  { path: '/account', name: 'account', component: () => import('./views/AccountView.vue'), meta: { title: '我的账户' } },
  { path: '/admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { title: '管理后台', requiresAdmin: true } },
  { path: '/about', name: 'about', component: () => import('./views/AboutView.vue'), meta: { title: '关于与免责' } },
  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('./views/NotFoundView.vue'), meta: { title: '页面不存在' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, top: 96, behavior: 'smooth' }
    return { top: 0 }
  },
})

router.beforeEach((to) => {
  const token = localStorage.getItem('yl_token')
  const user = JSON.parse(localStorage.getItem('yl_user') || 'null')
  if (to.meta.requiresAuth && !token) return { name: 'account', query: { login: '1', redirect: to.fullPath } }
  if (to.meta.requiresAdmin && (!token || user?.role !== 'admin')) return { name: 'home' }
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 医讯通` : '医讯通 · 养老金融公共信息服务平台'
})

export default router
