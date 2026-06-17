'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE_URL } from '@/lib/constants'
import {
  CalendarDays, Clock, ArrowLeft, Check, Loader2, ChevronRight,
  PartyPopper, User, Phone, Mail, AlertCircle
} from 'lucide-react'

/* ------------------------------------------------------------------ *
 * Public, unauthenticated fetch helper.
 * The customer is NOT logged in, so we deliberately do NOT use fetchAPI()
 * (which injects the metria_token and redirects to /logout on 401).
 * ------------------------------------------------------------------ */
async function publicFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  let data: any = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const msg = data?.error || data?.message || 'Algo salió mal'
    const err = new Error(msg) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return data
}

interface BookingInfo {
  workspaceName: string
  bookingTitle: string
  bookingDurationMin: number
}

type Step = 'date' | 'time' | 'details' | 'done'

/* ---- date helpers (local wall clock, no timezone libs) ---- */
function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function buildDays(count: number): Date[] {
  const out: Date[] = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  for (let i = 0; i < count; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    out.push(d)
  }
  return out
}

function prettyDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const wd = WEEKDAYS[dt.getDay()]
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d} de ${MONTHS[m - 1]}`
}

export default function BookingClient({ slug }: { slug: string }) {
  const [info, setInfo] = useState<BookingInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [step, setStep] = useState<Step>('date')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)

  const [slots, setSlots] = useState<string[] | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const days = useMemo(() => buildDays(14), [])

  /* ---- load workspace booking info ---- */
  useEffect(() => {
    let active = true
    setLoading(true); setNotFound(false); setLoadError(null)
    publicFetch(`/public/booking/${encodeURIComponent(slug)}`)
      .then(data => { if (active) setInfo(data) })
      .catch((err: Error & { status?: number }) => {
        if (!active) return
        if (err.status === 404) setNotFound(true)
        else setLoadError(err.message)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug, reloadKey])

  /* ---- load slots when a date is picked ---- */
  const loadSlots = useCallback((dateKey: string) => {
    let active = true
    setSlotsLoading(true); setSlotsError(null); setSlots(null)
    publicFetch(`/public/booking/${encodeURIComponent(slug)}/slots?date=${dateKey}`)
      .then(data => { if (active) setSlots(Array.isArray(data?.slots) ? data.slots : []) })
      .catch((err: Error) => { if (active) setSlotsError(err.message) })
      .finally(() => { if (active) setSlotsLoading(false) })
    return () => { active = false }
  }, [slug])

  function pickDate(dateKey: string) {
    setSelectedDate(dateKey)
    setSelectedTime(null)
    setStep('time')
    loadSlots(dateKey)
  }

  function pickTime(time: string) {
    setSelectedTime(time)
    setStep('details')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (name.trim().length < 2) { setFormError('Ingresa tu nombre completo'); return }
    if (phone.replace(/\D/g, '').length < 6) { setFormError('Ingresa un teléfono válido'); return }
    if (!selectedDate || !selectedTime) { setStep('date'); return }

    setSubmitting(true)
    try {
      await publicFetch(`/public/booking/${encodeURIComponent(slug)}/book`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          date: selectedDate,
          time: selectedTime,
        }),
      })
      setStep('done')
    } catch (err) {
      const e2 = err as Error & { status?: number }
      // Slot got taken between selection and submit → bounce back to time picker
      if (e2.status === 409) {
        setFormError(null)
        setStep('time')
        if (selectedDate) loadSlots(selectedDate)
        setSlotsError(e2.message)
      } else {
        setFormError(e2.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  /* ============================== RENDER ============================== */

  if (loading) return <LoadingState />
  if (notFound) return <NotFoundState />
  if (loadError) return <ErrorState message={loadError} onRetry={() => setReloadKey(k => k + 1)} />
  if (!info) return null

  const initials = info.workspaceName.trim().slice(0, 2).toUpperCase()

  return (
    <main className="booking-root">
      <div className="booking-shell">
        {/* ---- Identity / context pane ---- */}
        <aside className="booking-aside">
          <div className="booking-brandmark" aria-hidden>{initials}</div>
          <p className="booking-business">{info.workspaceName}</p>
          <h1 className="booking-headline">{info.bookingTitle}</h1>
          <p className="booking-sub">
            Elige el día y la hora que mejor te acomode. Te confirmamos al instante.
          </p>

          <dl className="booking-meta">
            <div className="booking-meta-row">
              <Clock className="icon" aria-hidden />
              <dt className="sr-only">Duración</dt>
              <dd>{info.bookingDurationMin} minutos</dd>
            </div>
            <div className="booking-meta-row">
              <CalendarDays className="icon" aria-hidden />
              <dt className="sr-only">Selección</dt>
              <dd>
                {selectedDate
                  ? `${prettyDate(selectedDate)}${selectedTime ? ` · ${selectedTime}` : ''}`
                  : 'Sin fecha seleccionada'}
              </dd>
            </div>
          </dl>

          {/* progress dots */}
          <ol className="booking-steps" aria-label="Progreso de la reserva">
            {(['date', 'time', 'details'] as Step[]).map((s, i) => {
              const order: Step[] = ['date', 'time', 'details', 'done']
              const reached = order.indexOf(step) >= order.indexOf(s)
              return (
                <li key={s} className={`booking-step ${reached ? 'is-on' : ''}`}>
                  <span className="booking-step-dot">{i + 1}</span>
                  <span className="booking-step-label">
                    {s === 'date' ? 'Fecha' : s === 'time' ? 'Hora' : 'Tus datos'}
                  </span>
                </li>
              )
            })}
          </ol>
        </aside>

        {/* ---- Interactive pane ---- */}
        <section className="booking-panel">
          {step === 'date' && (
            <StepWrap title="Selecciona una fecha" subtitle="Próximos 14 días disponibles">
              <div className="day-grid">
                {days.map(d => {
                  const key = toKey(d)
                  const isToday = key === toKey(new Date())
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`day-chip ${selectedDate === key ? 'is-selected' : ''}`}
                      onClick={() => pickDate(key)}
                    >
                      <span className="day-chip-wd">{WEEKDAYS[d.getDay()]}</span>
                      <span className="day-chip-num">{d.getDate()}</span>
                      <span className="day-chip-mo">{isToday ? 'hoy' : MONTHS[d.getMonth()]}</span>
                    </button>
                  )
                })}
              </div>
            </StepWrap>
          )}

          {step === 'time' && selectedDate && (
            <StepWrap
              title="Selecciona una hora"
              subtitle={prettyDate(selectedDate)}
              onBack={() => setStep('date')}
            >
              {slotsLoading && (
                <div className="slot-grid">
                  {Array.from({ length: 9 }).map((_, i) => <div key={i} className="slot-skel" />)}
                </div>
              )}

              {!slotsLoading && slotsError && (
                <Inline tone="warn" icon={<AlertCircle className="icon" />}>
                  {slotsError}
                  <button type="button" className="link-btn" onClick={() => loadSlots(selectedDate)}>
                    Reintentar
                  </button>
                </Inline>
              )}

              {!slotsLoading && !slotsError && slots && slots.length === 0 && (
                <div className="empty-slots">
                  <div className="empty-ico"><CalendarDays className="icon" /></div>
                  <p className="empty-title">No hay horarios este día</p>
                  <p className="empty-sub">Prueba con otra fecha.</p>
                  <button type="button" className="link-btn" onClick={() => setStep('date')}>
                    Cambiar fecha
                  </button>
                </div>
              )}

              {!slotsLoading && !slotsError && slots && slots.length > 0 && (
                <div className="slot-grid">
                  {slots.map(t => (
                    <button
                      key={t}
                      type="button"
                      className={`slot ${selectedTime === t ? 'is-selected' : ''}`}
                      onClick={() => pickTime(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </StepWrap>
          )}

          {step === 'details' && selectedDate && selectedTime && (
            <StepWrap
              title="Tus datos"
              subtitle={`${prettyDate(selectedDate)} · ${selectedTime}`}
              onBack={() => setStep('time')}
            >
              <form className="book-form" onSubmit={submit} noValidate>
                <Field label="Nombre" icon={<User className="icon" />}>
                  <input
                    className="book-input" type="text" value={name} autoComplete="name"
                    onChange={e => setName(e.target.value)} placeholder="Tu nombre completo" required
                  />
                </Field>
                <Field label="Teléfono" icon={<Phone className="icon" />}>
                  <input
                    className="book-input" type="tel" value={phone} autoComplete="tel" inputMode="tel"
                    onChange={e => setPhone(e.target.value)} placeholder="+56 9 1234 5678" required
                  />
                </Field>
                <Field label="Correo (opcional)" icon={<Mail className="icon" />}>
                  <input
                    className="book-input" type="email" value={email} autoComplete="email"
                    onChange={e => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com"
                  />
                </Field>

                {formError && (
                  <Inline tone="error" icon={<AlertCircle className="icon" />}>{formError}</Inline>
                )}

                <button type="submit" className="book-cta" disabled={submitting}>
                  {submitting
                    ? <><Loader2 className="icon spin" /> Confirmando…</>
                    : <>Confirmar reserva <ChevronRight className="icon" /></>}
                </button>
                <p className="book-fineprint">
                  Al confirmar, {info.workspaceName} recibirá tus datos para coordinar la cita.
                </p>
              </form>
            </StepWrap>
          )}

          {step === 'done' && selectedDate && selectedTime && (
            <div className="done">
              <div className="done-badge"><PartyPopper className="icon" /></div>
              <h2 className="done-title">¡Reserva confirmada!</h2>
              <p className="done-sub">Tu cita con {info.workspaceName} quedó agendada.</p>
              <div className="done-card">
                <div className="done-row">
                  <CalendarDays className="icon" />
                  <span>{prettyDate(selectedDate)}</span>
                </div>
                <div className="done-row">
                  <Clock className="icon" />
                  <span>{selectedTime} · {info.bookingDurationMin} min</span>
                </div>
                <div className="done-row">
                  <User className="icon" />
                  <span>{name}</span>
                </div>
              </div>
              <p className="done-note">Guarda esta fecha. Si necesitas reagendar, contáctanos.</p>
            </div>
          )}
        </section>
      </div>

      <footer className="booking-footer">
        Reservas con <span className="booking-footer-brand">Metria</span>
      </footer>
    </main>
  )
}

/* ============================ sub-components ============================ */

function StepWrap({
  title, subtitle, onBack, children,
}: {
  title: string; subtitle?: string; onBack?: () => void; children: React.ReactNode
}) {
  return (
    <div className="step" key={title}>
      <header className="step-head">
        {onBack && (
          <button type="button" className="back-btn" onClick={onBack} aria-label="Volver">
            <ArrowLeft className="icon" />
          </button>
        )}
        <div>
          <h2 className="step-title">{title}</h2>
          {subtitle && <p className="step-sub">{subtitle}</p>}
        </div>
      </header>
      {children}
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{icon}{label}</span>
      {children}
    </label>
  )
}

function Inline({ tone, icon, children }: { tone: 'warn' | 'error'; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className={`inline-msg inline-${tone}`}>{icon}<span>{children}</span></div>
}

function LoadingState() {
  return (
    <main className="booking-root">
      <div className="booking-shell">
        <aside className="booking-aside">
          <div className="sk sk-mark" />
          <div className="sk sk-line w40" />
          <div className="sk sk-line w80 tall" />
          <div className="sk sk-line w70" />
        </aside>
        <section className="booking-panel">
          <div className="sk sk-line w50 tall" />
          <div className="day-grid">
            {Array.from({ length: 14 }).map((_, i) => <div key={i} className="sk sk-chip" />)}
          </div>
        </section>
      </div>
    </main>
  )
}

function NotFoundState() {
  return (
    <main className="booking-root center">
      <div className="state-card">
        <div className="state-ico"><AlertCircle className="icon" /></div>
        <h1 className="state-title">Enlace no válido</h1>
        <p className="state-sub">
          Este enlace de reservas no existe o fue desactivado. Revisa la dirección o
          pide un enlace actualizado a quien te lo compartió.
        </p>
      </div>
    </main>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="booking-root center">
      <div className="state-card">
        <div className="state-ico"><AlertCircle className="icon" /></div>
        <h1 className="state-title">No pudimos cargar la página</h1>
        <p className="state-sub">{message}</p>
        <button type="button" className="book-cta inline" onClick={onRetry}>Reintentar</button>
      </div>
    </main>
  )
}
