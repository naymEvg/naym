import React, { useEffect, useMemo, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { create } from 'zustand'
import ky from 'ky'
import { CheckCircle2, UploadCloud, LogOut, Image as ImageIcon, ShieldCheck, FileDown, Settings2 } from 'lucide-react'
import { createAnalytics } from './lib/analytics'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000/api'

const api = ky.create({ prefixUrl: API_BASE, retry: 0 })

const analytics = createAnalytics(() => useAuth.getState().token)

const useAuth = create((set, get) => ({
  user: null,
  token: null,
  login: async (email, password) => {
    const res = await api.post('auth/login', { json: { email, password } }).json()
    set({ user: res.user, token: res.token })
    analytics.track('login', { email })
    toast.success('Вход выполнен')
  },
  logout: () => { analytics.track('logout'); set({ user: null, token: null }) }
}))

function useAuthedKy() {
  const token = useAuth((s) => s.token)
  return useMemo(() => api.extend({
    hooks: {
      beforeRequest: [ (req) => {
        if (token) req.headers.set('Authorization', `Bearer ${token}`)
      } ]
    }
  }), [token])
}

function LoginScreen() {
  const login = useAuth((s) => s.login)
  const [email, setEmail] = useState('user@example.com')
  const [password, setPassword] = useState('password')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
    } catch (e) {
      toast.error('Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card w-full max-w-md p-6">
        <h1 className="text-2xl font-semibold mb-1">Visa Assistant</h1>
        <p className="text-sm text-neutral-600 mb-6">Ваш помощник по визовым документам</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain" />
          </div>
          <div>
            <label className="label">Пароль</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn btn-primary w-full" disabled={loading}>{loading ? 'Входим…' : 'Войти'}</button>
          <p className="text-xs text-neutral-500">Для админа используйте email admin@visa.local</p>
        </form>
      </div>
    </div>
  )
}

function CountryPicker({ onSelect }) {
  const k = useAuthedKy()
  const [countries, setCountries] = useState([])
  useEffect(() => {
    k.get('countries').json().then((r) => setCountries(r.countries)).catch(() => toast.error('Не удалось загрузить страны'))
  }, [])
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {countries.map(c => (
        <button key={c.id} className="card p-4 text-left hover:shadow-md transition-shadow" onClick={() => onSelect(c)}>
          <div className="flex items-center gap-3">
            <div className="text-2xl">{c.emoji}</div>
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-neutral-500">{c.code}</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

const useDossier = create((set) => ({
  country: null,
  checklist: [],
  validator: null,
  attachments: {},
  setCountry: (c) => set({ country: c }),
  setChecklist: (arr) => set({ checklist: arr }),
  setValidator: (v) => set({ validator: v }),
  attach: (id, payload) => set((s) => ({ attachments: { ...s.attachments, [id]: payload } })),
  reset: () => set({ country: null, checklist: [], validator: null, attachments: {} })
}))

function Uploader({ country, checklist, onAttach }) {
  const k = useAuthedKy()
  const validator = useDossier((s) => s.validator)
  const user = useAuth((s) => s.user)
  const [busy, setBusy] = useState(false)
  const [consent, setConsent] = useState(() => localStorage.getItem('consentAccepted') === '1')
  const [consentOpen, setConsentOpen] = useState(false)
  const [pending, setPending] = useState(null)

  async function precheck(file) {
    const tips = []
    const rules = validator || {}
    const maxSize = Number(rules.max_size_bytes || 1572864)
    if (file.size > maxSize) tips.push(`Файл больше ${(maxSize/1024/1024).toFixed(1)} МБ — сожмите перед загрузкой`)
    const ext = String(file.name.split('.').pop() || '').toLowerCase()
    const allowed = (rules.file_types || ['jpg','jpeg','png']).map(x => x.toLowerCase())
    if (!allowed.includes(ext)) tips.push(`Нужен формат: ${allowed.join(', ')}`)
    try {
      const dims = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => { const w = img.naturalWidth, h = img.naturalHeight; URL.revokeObjectURL(url); resolve({ w, h }) }
        img.onerror = reject
        img.src = url
      })
      const minW = Number(rules.min_pixel_width || 600)
      const minH = Number(rules.min_pixel_height || 800)
      if (dims.w < minW || dims.h < minH) tips.push(`Разрешение мало: ${dims.w}x${dims.h}, минимум ${minW}x${minH}`)
      if (rules.aspect_ratio) {
        const [aw, ah] = String(rules.aspect_ratio).split(':').map(Number)
        if (aw && ah) {
          const target = aw/ah, real = dims.w/Math.max(1, dims.h)
          if (Math.abs(real - target) > 0.02*target) tips.push(`Соотношение сторон ≈ ${real.toFixed(2)} — нужно ${rules.aspect_ratio}`)
        }
      }
    } catch {}
    if (tips.length) toast.message('Быстрая проверка', { description: tips[0] })
  }

  async function handleFile(item, file) {
    if (!consent) {
      setPending({ item, file })
      setConsentOpen(true)
      analytics.track('consent_open')
      return
    }
    await precheck(file)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set('countryId', country.id)
      fd.set('docType', item.docType)
      fd.set('checklistItemId', item.id)
      fd.set('file', file)
      const res = await k.post('upload', { body: fd }).json()
      onAttach(item.id, { fileId: res.id, fileUrl: res.fileUrl, checks: res.checks, ok: res.ok, name: file.name })
      analytics.track('upload_photo', { itemId: item.id, ok: res.ok })
      if (res.ok) { toast.success('Фото прошло проверку'); analytics.track('photo_pass', { itemId: item.id }) }
      else toast.warning('Есть замечания к фото')
    } catch (e) {
      toast.error('Ошибка загрузки файла')
    } finally {
      setBusy(false)
    }
  }

  function acceptConsent() {
    localStorage.setItem('consentAccepted', '1')
    setConsent(true)
    setConsentOpen(false)
    analytics.track('consent_accept')
    if (pending) {
      const { item, file } = pending
      setPending(null)
      handleFile(item, file)
    }
  }

  return (
    <div className="space-y-3">
      <ConsentBlock />
      {checklist.map((item) => (
        <div key={item.id} className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{item.label}</div>
              <div className="text-xs text-neutral-500">{item.required ? 'Обязательный' : 'Необязательный'} • {item.docType}</div>
            </div>
            <label className="btn btn-secondary cursor-pointer">
              <UploadCloud size={16} /> Загрузить
              <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFile(item, e.target.files[0])} />
            </label>
          </div>
          <Attachment item={item} />
        </div>
      ))}
      {busy && <div className="text-sm text-neutral-600">Обработка изображения…</div>}
      {consentOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="card max-w-lg w-full p-5">
            <div className="font-semibold text-lg mb-2">Согласие на загрузку и хранение документов</div>
            <p className="text-sm text-neutral-700 mb-3">
              Мы храним ваши файлы на серверах в РФ без шифрования (MVP), используем только для формирования досье на визу. Срок хранения: 30 дней или до удаления вами. Мы не гарантируем выдачу визы.
            </p>
            <ul className="list-disc ml-5 text-sm text-neutral-700 mb-3">
              <li>Передача данных — по защищённому HTTPS</li>
              <li>Доступ к файлам — только с вашим токеном</li>
              <li>Вы можете удалить файлы через поддержку</li>
            </ul>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => setConsentOpen(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={acceptConsent}>Согласен(а)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConsentBlock() {
  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
      Подсказка: загрузите фото на светлом фоне. Форматы: JPG/PNG, не более 1.5 МБ. Соотношение сторон указано в правилах страны.
    </div>
  )
}

function Attachment({ item }) {
  const attachments = useDossier((s) => s.attachments)
  const att = attachments[item.id]
  if (!att) return <div className="mt-3 text-sm text-neutral-500">Файл не загружен</div>
  const ok = att.ok
  return (
    <div className="mt-3 grid gap-2">
      <div className="flex items-center gap-2">
        <span className={`badge ${ok ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
          <ShieldCheck size={14} className="mr-1" /> {ok ? 'Проверка пройдена' : 'Есть замечания'}
        </span>
        <a href={`${att.fileUrl}?token=${encodeURIComponent(useAuth.getState().token || '')}`} target="_blank" className="text-sm text-brand-700 hover:underline flex items-center gap-1"><ImageIcon size={14}/>Просмотр</a>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 text-sm">
        {Object.entries(att.checks || {}).map(([k, v]) => (
          <div key={k} className={`rounded-lg border p-2 ${v.ok ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
            <div className="font-medium">{labelMap[k] || k}</div>
            <div className="text-neutral-700">{v.message}</div>
            {!v.ok && v.tips && v.tips.length > 0 && (
              <ul className="list-disc ml-5 text-neutral-600">
                {v.tips.slice(0,3).map((t, i) => (<li key={i}>{t}</li>))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const labelMap = {
  file_type: 'Формат файла',
  size: 'Размер файла',
  dimensions: 'Разрешение',
  aspect_ratio: 'Соотношение сторон',
  background: 'Фон',
  borders: 'Рамки/поля'
}

function Dashboard() {
  const k = useAuthedKy()
  const user = useAuth((s) => s.user)
  const logout = useAuth((s) => s.logout)
  const { country, setCountry, setChecklist, checklist, attachments, reset, setValidator } = useDossier()
  const [loading, setLoading] = useState(false)

  useEffect(() => { reset() }, [])

  useEffect(() => {
    if (!user || !country) return
    const key = `va_${user.id}_${country.id}`
    try {
      const data = { checklist, attachments }
      localStorage.setItem(key, JSON.stringify(data))
    } catch {}
  }, [user, country, checklist, attachments])

  async function pickCountry(c) {
    setCountry(c)
    const res = await k.get(`countries/${c.id}/checklist`).json()
    setChecklist(res.checklist)
    setValidator(res.validator)
    analytics.track('start_checklist', { countryId: c.id })
    toast.message('Чеклист загружен', { description: 'Загрузите документы по списку' })
    // hydrate progress if exists
    try {
      const key = `va_${useAuth.getState().user.id}_${c.id}`
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.attachments) useDossier.setState({ attachments: parsed.attachments })
      }
    } catch {}
  }

  async function saveDossier() {
    if (!country) return
    setLoading(true)
    try {
      const checklistPayload = checklist.map((item) => ({ id: item.id, label: item.label, required: item.required, docType: item.docType, fileId: attachments[item.id]?.fileId || null }))
      const res = await k.post(`users/${user.id}/dossier`, { json: { countryId: country.id, checklist: checklistPayload } }).json()
      toast.success('Досье сохранено', { description: 'Можно экспортировать ZIP' })
      return res.id
    } catch (e) {
      toast.error('Не удалось сохранить досье')
    } finally {
      setLoading(false)
    }
  }

  async function exportZip() {
    const id = await saveDossier()
    if (!id) return
    const token = useAuth.getState().token
    const url = `${API_BASE}/dossier/${id}/export?token=${encodeURIComponent(token || '')}`
    const a = document.createElement('a')
    a.href = url
    a.download = `dossier-${country.id}.zip`
    a.rel = 'noopener'
    a.target = '_blank'
    a.click()
    analytics.track('export_zip', { countryId: country.id })
    toast.success('Экспорт начался')
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 bg-white/80 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-semibold">Visa Assistant</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-neutral-600">{user.email}</span>
            <button className="btn btn-secondary" onClick={logout}><LogOut size={16}/>Выход</button>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4 grid gap-6">
        {!country ? (
          <>
            <h2 className="text-lg font-medium">Выберите страну</h2>
            <CountryPicker onSelect={pickCountry} />
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{country.emoji} {country.name}</h2>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => window.location.reload()}>Сменить страну</button>
                <button className="btn btn-primary" onClick={exportZip}><FileDown size={16}/>Экспорт ZIP</button>
              </div>
            </div>
            <Uploader country={country} checklist={checklist} onAttach={(id, p) => useDossier.getState().attach(id, p)} />
            <div className="text-sm text-neutral-600">Прогресс сохраняется локально и при экспорте.</div>
            {user.role === 'admin' && <AdminRules country={country} />}
          </>
        )}
      </main>
      <Toaster richColors position="top-right" />
    </div>
  )
}

function AdminRules({ country }) {
  const k = useAuthedKy()
  const [json, setJson] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => { setJson(JSON.stringify(country.validator, null, 2)) }, [country.id])

  async function onSave() {
    try {
      const validator = JSON.parse(json)
      const res = await k.post(`admin/country/${country.id}/rules`, { json: { validator } }).json()
      toast.success('Правила опубликованы', { description: `Версия ${res.version}` })
    } catch (e) {
      toast.error('Ошибка сохранения правил')
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Settings2 size={18}/> <div className="font-medium">Админ: Правила валидатора</div></div>
        <button className="btn btn-secondary" onClick={() => setOpen(!open)}>{open ? 'Скрыть' : 'Показать'}</button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3">
          <textarea className="input font-mono h-64" value={json} onChange={(e) => setJson(e.target.value)} />
          <button className="btn btn-primary w-fit" onClick={onSave}>Опубликовать</button>
          <p className="text-xs text-neutral-500">JSON-структура должна содержать ключи: file_types, max_size_bytes, min_pixel_width, min_pixel_height, required_mm, aspect_ratio, background_hint, head_box_ratio, face_direction, glasses_allowed</p>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const user = useAuth((s) => s.user)
  return user ? <Dashboard/> : <LoginScreen/>
}