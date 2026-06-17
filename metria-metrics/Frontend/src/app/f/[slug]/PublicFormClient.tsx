'use client'

import { useState, useEffect, useMemo } from 'react'
import { API_BASE_URL } from '@/lib/constants'
import {
  Loader2, CheckCircle2, AlertCircle, ArrowRight, ChevronDown, ShieldCheck
} from 'lucide-react'

/* ------------------------------------------------------------------ *
 * Public, unauthenticated fetch — the prospect is NOT logged in, so we
 * deliberately avoid fetchAPI() (which injects the metria_token and
 * redirects on 401). Mirrors the public booking page.
 * ------------------------------------------------------------------ */
async function publicFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  })
  let data: any = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || 'Algo salió mal') as Error & {
      status?: number
      fieldErrors?: Record<string, string>
    }
    err.status = res.status
    err.fieldErrors = data?.fieldErrors
    throw err
  }
  return data
}

type FormFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select'

interface FormField {
  id: string
  label: string
  type: FormFieldType
  required: boolean
  options?: string[]
}

interface PublicForm {
  slug: string
  name: string
  description: string | null
  fields: FormField[]
  submitButtonText: string
  successMessage: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function PublicFormClient({ slug }: { slug: string }) {
  const [form, setForm] = useState<PublicForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  /* ---- load the public form definition ---- */
  useEffect(() => {
    let active = true
    setLoading(true); setNotFound(false); setLoadError(null)
    publicFetch(`/public/forms/${encodeURIComponent(slug)}`)
      .then((data: PublicForm) => {
        if (!active) return
        setForm(data)
        // Seed empty values keyed by field id.
        const seed: Record<string, string> = {}
        data.fields.forEach(f => { seed[f.id] = '' })
        setValues(seed)
      })
      .catch((err: Error & { status?: number }) => {
        if (!active) return
        if (err.status === 404) setNotFound(true)
        else setLoadError(err.message)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug, reloadKey])

  /* ---- signature: required-field completion ---- */
  const progress = useMemo(() => {
    if (!form) return { done: 0, total: 0, pct: 0 }
    const required = form.fields.filter(f => f.required)
    const total = required.length
    const filled = required.filter(f => {
      const v = (values[f.id] ?? '').trim()
      if (!v) return false
      if (f.type === 'email') return EMAIL_RE.test(v)
      return true
    }).length
    return { done: filled, total, pct: total === 0 ? 100 : Math.round((filled / total) * 100) }
  }, [form, values])

  function setValue(id: string, v: string) {
    setValues(prev => ({ ...prev, [id]: v }))
    if (errors[id]) setErrors(prev => { const n = { ...prev }; delete n[id]; return n })
    if (submitError) setSubmitError(null)
  }

  function validate(f: PublicForm): Record<string, string> {
    const next: Record<string, string> = {}
    for (const field of f.fields) {
      const v = (values[field.id] ?? '').trim()
      if (!v) {
        if (field.required) next[field.id] = `${field.label} es obligatorio`
        continue
      }
      if (field.type === 'email' && !EMAIL_RE.test(v)) {
        next[field.id] = 'Ingresa un correo válido'
      }
      if (field.type === 'tel' && v.replace(/\D/g, '').length < 6) {
        next[field.id] = 'Ingresa un teléfono válido'
      }
    }
    return next
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSubmitError(null)

    const found = validate(form)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }

    setSubmitting(true)
    try {
      await publicFetch(`/public/forms/${encodeURIComponent(slug)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ data: values })
      })
      setDone(true)
    } catch (err) {
      const e2 = err as Error & { status?: number; fieldErrors?: Record<string, string> }
      if (e2.fieldErrors && Object.keys(e2.fieldErrors).length > 0) {
        setErrors(e2.fieldErrors)
        setSubmitError('Revisa los campos marcados.')
      } else if (e2.status === 404) {
        setNotFound(true)
      } else {
        setSubmitError(e2.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  /* ============================== RENDER ============================== */

  if (loading) return <LoadingState />
  if (notFound) return <NotFoundState />
  if (loadError) return <ErrorState message={loadError} onRetry={() => setReloadKey(k => k + 1)} />
  if (!form) return null

  const initials = form.name.trim().slice(0, 2).toUpperCase() || 'F'

  return (
    <main className="lf-root">
      <article className="lf-card">
        {/* progress ribbon — the signature element */}
        {!done && progress.total > 0 && (
          <div className="lf-ribbon" role="presentation">
            <span className="lf-ribbon-fill" style={{ width: `${progress.pct}%` }} />
          </div>
        )}

        {done ? (
          <div className="lf-done">
            <div className="lf-done-badge"><CheckCircle2 className="lf-icon" /></div>
            <h1 className="lf-done-title">{form.successMessage}</h1>
            <p className="lf-done-sub">Recibimos tus datos correctamente.</p>
          </div>
        ) : (
          <>
            <header className="lf-head">
              <div className="lf-brandmark" aria-hidden>{initials}</div>
              <h1 className="lf-title">{form.name}</h1>
              {form.description && <p className="lf-desc">{form.description}</p>}
              {progress.total > 0 && (
                <p className="lf-progress-label">
                  {progress.done} de {progress.total} obligatorio{progress.total !== 1 ? 's' : ''} completado{progress.done !== 1 ? 's' : ''}
                </p>
              )}
            </header>

            <form className="lf-form" onSubmit={submit} noValidate>
              {form.fields.map(field => (
                <FieldInput
                  key={field.id}
                  field={field}
                  value={values[field.id] ?? ''}
                  error={errors[field.id]}
                  onChange={v => setValue(field.id, v)}
                />
              ))}

              {submitError && (
                <div className="lf-alert" role="alert">
                  <AlertCircle className="lf-icon" />
                  <span>{submitError}</span>
                </div>
              )}

              <button type="submit" className="lf-cta" disabled={submitting}>
                {submitting
                  ? <><Loader2 className="lf-icon lf-spin" /> Enviando…</>
                  : <>{form.submitButtonText} <ArrowRight className="lf-icon" /></>}
              </button>

              <p className="lf-fineprint">
                <ShieldCheck className="lf-icon" />
                Tus datos se envían de forma segura y solo se usan para contactarte.
              </p>
            </form>
          </>
        )}
      </article>

      <footer className="lf-footer">
        Formularios con <span className="lf-footer-brand">Metria</span>
      </footer>
    </main>
  )
}

/* ============================ sub-components ============================ */

function FieldInput({
  field, value, error, onChange
}: {
  field: FormField
  value: string
  error?: string
  onChange: (v: string) => void
}) {
  const id = `lf-${field.id}`
  const inputType =
    field.type === 'email' ? 'email' :
    field.type === 'tel' ? 'tel' : 'text'
  const autoComplete =
    field.type === 'email' ? 'email' :
    field.type === 'tel' ? 'tel' :
    /nombre|name/i.test(field.label) ? 'name' : 'off'

  return (
    <div className={`lf-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id} className="lf-label">
        {field.label}
        {field.required && <span className="lf-req" aria-hidden> *</span>}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          id={id}
          className="lf-input lf-textarea"
          value={value}
          rows={4}
          onChange={e => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
      ) : field.type === 'select' ? (
        <div className="lf-select-wrap">
          <select
            id={id}
            className="lf-input lf-select"
            value={value}
            onChange={e => onChange(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : undefined}
          >
            <option value="" disabled>Selecciona una opción</option>
            {(field.options ?? []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <ChevronDown className="lf-icon lf-select-chevron" aria-hidden />
        </div>
      ) : (
        <input
          id={id}
          type={inputType}
          inputMode={field.type === 'tel' ? 'tel' : undefined}
          autoComplete={autoComplete}
          className="lf-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
      )}

      {error && (
        <span id={`${id}-err`} className="lf-error">{error}</span>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <main className="lf-root">
      <article className="lf-card">
        <header className="lf-head">
          <div className="lf-sk lf-sk-mark" />
          <div className="lf-sk lf-sk-line w60 tall" />
          <div className="lf-sk lf-sk-line w90" />
        </header>
        <div className="lf-form">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="lf-field">
              <div className="lf-sk lf-sk-line w40" />
              <div className="lf-sk lf-sk-input" />
            </div>
          ))}
          <div className="lf-sk lf-sk-cta" />
        </div>
      </article>
    </main>
  )
}

function NotFoundState() {
  return (
    <main className="lf-root center">
      <div className="lf-state">
        <div className="lf-state-ico"><AlertCircle className="lf-icon" /></div>
        <h1 className="lf-state-title">Formulario no encontrado</h1>
        <p className="lf-state-sub">
          Este formulario no existe o ya no está disponible. Revisa el enlace o
          pide uno actualizado a quien te lo compartió.
        </p>
      </div>
    </main>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="lf-root center">
      <div className="lf-state">
        <div className="lf-state-ico"><AlertCircle className="lf-icon" /></div>
        <h1 className="lf-state-title">No pudimos cargar el formulario</h1>
        <p className="lf-state-sub">{message}</p>
        <button type="button" className="lf-cta lf-cta-inline" onClick={onRetry}>Reintentar</button>
      </div>
    </main>
  )
}
