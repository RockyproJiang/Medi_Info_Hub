const B = 'http://127.0.0.1:8787'
const j = (r) => r.json()
const assert = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra ? ' :: ' + extra : ''))
  if (!cond) process.exitCode = 1
}
;(async () => {
  const h = await fetch(B + '/api/health').then(j)
  assert('health', h.ok === true)

  const meta = await fetch(B + '/api/meta').then(j)
  const s = meta.data.stats
  assert('meta-care-services', s.careServices === 6, JSON.stringify(s))
  assert('meta-policies>=13', s.policies >= 13, 'policies=' + s.policies)
  assert('meta-articles>=14', s.articles >= 14, 'articles=' + s.articles)

  const cs = await fetch(B + '/api/care-services').then(j)
  assert('care-list', cs.ok && cs.data.total === 6, cs.data.types.map((t) => t.service_type + ':' + t.c).join(','))

  const csf = await fetch(B + '/api/care-services?serviceType=' + encodeURIComponent('机构养老')).then(j)
  assert('care-filter', csf.ok && csf.data.items.every((i) => i.service_type === '机构养老'), csf.data.items.map((i) => i.slug).join(','))

  const csq = await fetch(B + '/api/care-services?q=' + encodeURIComponent('失能')).then(j)
  assert('care-search', csq.ok && csq.data.items.length >= 2, 'n=' + csq.data.items.length)

  const pol = await fetch(B + '/api/policies?category=' + encodeURIComponent('医疗保障')).then(j)
  const polItems = pol.data.items || pol.data
  assert('policy-medical-cat', pol.ok && polItems.length >= 1, 'n=' + polItems.length)

  const art = await fetch(B + '/api/articles?category=' + encodeURIComponent('医疗保障')).then(j)
  const artItems = art.data.items || art.data
  assert('article-medical-cat', art.ok && artItems.length >= 1, 'n=' + artItems.length)

  const artSlug = await fetch(B + '/api/articles/elderly-care-institutions-guide').then(j)
  const artItem = artSlug.data.item || artSlug.data
  assert('article-by-slug', artSlug.ok && artItem.title.includes('养老机构'), artItem.title || '')

  const polSlug = await fetch(B + '/api/policies/medical-insurance-retiree-2025').then(j)
  const polItem = polSlug.data.item || polSlug.data
  assert('policy-by-slug', polSlug.ok && polItem.title.includes('医保'), polItem.title || '')

  const login = await fetch(B + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'demo', password: 'Demo@2025' }),
  }).then(j)
  assert('login-demo', login.ok)
  const tk = login.data.token

  const hh = await fetch(B + '/api/calc/household', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
    body: JSON.stringify({
      inflation: 0.025,
      returnRate: 0.035,
      members: [
        { name: '父亲', currentAge: 58, retireAge: 60, currentMonthlyExpense: 6000, pensionMonthly: 3500, currentSavings: 300000, monthlySaving: 2000, extraCareReserve: 200000 },
        { name: '母亲', currentAge: 55, retireAge: 55, currentMonthlyExpense: 5000, pensionMonthly: 2500, currentSavings: 100000, monthlySaving: 500, extraCareReserve: 100000 },
      ],
    }),
  }).then(j)
  assert('household-calc', hh.ok && hh.data.members.length === 2 && Number.isFinite(hh.data.household.gap),
    'members=' + hh.data.members.map((m) => m.name + '=' + m.gap).join(',') + ' householdGap=' + hh.data.household.gap + ' coverage=' + hh.data.household.coverage + '% requiredMonthly=' + hh.data.household.requiredMonthlySaving)

  const hhNoAuth = await fetch(B + '/api/calc/household', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert('household-requires-auth', hhNoAuth.status === 401, 'status=' + hhNoAuth.status)

  const rec = await fetch(B + '/api/records', { headers: { Authorization: 'Bearer ' + tk } }).then(j)
  const recs = rec.data.items || rec.data
  assert('household-saved-to-records', rec.ok && recs.some((r) => r.calc_type === 'household'), 'n=' + recs.length)

  console.log('E2E DONE')
})().catch((e) => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
