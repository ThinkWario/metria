import puppeteer from 'puppeteer'
import { prisma } from '../../lib/prisma'
import { getWorkspaceTimezone } from '../scheduling/scheduling.service'
import { formatApptDateTime } from '../scheduling/appointment-notifications.service'
import { SOLAR_SOURCE } from './leadIngestion.service'
import { DRILLCHILE_LOGO_DATA_URI } from './drillchileLogo'

const MODALIDAD_LABELS: Record<string, string> = {
  presencial: 'Reunión presencial',
  videollamada: 'Videollamada',
  llamada: 'Llamada telefónica',
  correo: 'Correo electrónico'
}

export interface VisitLetterData {
  numeroSolicitud?: string | null
  fechaEmision: string
  ejecutivoNombre?: string | null
  ejecutivoTitulo?: string | null
  zonaComuna?: string | null
  nombre: string
  rut?: string | null
  direccion?: string | null
  comuna?: string | null
  telefono?: string | null
  email?: string | null
  numeroClienteElectrico?: string | null
  distribuidora?: string | null
  fechaVisita?: string | null
  tecnicoResponsable?: string | null
  fechaPropuesta?: string | null
  fechaMaximaRespuesta?: string | null
  modalidad?: string | null
  observaciones?: string | null
}

/** Fetches and normalizes everything the letter needs for an existing, persisted lead. */
export async function getVisitLetterDataForContact(workspaceId: string, contactId: string): Promise<VisitLetterData> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { visitLetterExecutiveName: true, visitLetterExecutiveTitle: true }
  })

  const rawFields = ((contact.qualificationData as any)?.rawFields ?? {}) as Record<string, string>
  const visitLetter = ((contact.qualificationData as any)?.visitLetter ?? {}) as Record<string, string>

  const appointment = await prisma.appointment.findFirst({
    where: { workspaceId, contactId, type: 'SITE_VISIT' },
    orderBy: { scheduledAt: 'desc' }
  })
  let fechaVisita: string | undefined
  if (appointment) {
    const tz = await getWorkspaceTimezone(workspaceId)
    fechaVisita = formatApptDateTime(appointment.scheduledAt, tz)
  }

  return {
    numeroSolicitud: visitLetter.numeroSolicitud,
    fechaEmision: new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Santiago' }).format(new Date()),
    ejecutivoNombre: workspace?.visitLetterExecutiveName,
    ejecutivoTitulo: workspace?.visitLetterExecutiveTitle,
    zonaComuna: rawFields.comuna,
    nombre: contact.name,
    rut: contact.rut ? rawFields.rut ?? contact.rut : undefined,
    direccion: rawFields.direccion,
    comuna: rawFields.comuna,
    telefono: contact.phone,
    email: contact.email,
    numeroClienteElectrico: visitLetter.numeroClienteElectrico,
    distribuidora: rawFields.distribuidora,
    fechaVisita,
    tecnicoResponsable: visitLetter.tecnicoResponsable,
    fechaPropuesta: visitLetter.fechaPropuesta,
    fechaMaximaRespuesta: visitLetter.fechaMaximaRespuesta,
    modalidad: visitLetter.modalidad,
    observaciones: visitLetter.observaciones
  }
}

/**
 * Resolves the public token used in the letter's download link — the
 * wizard's own sessionId for solar_direct leads (already unguessable,
 * already used the same way for the "Ver cotización" link). Contacts
 * without one (e.g. created manually, never went through the wizard) have
 * no public link — the CRM must use the in-situ generator instead.
 */
export async function getVisitLetterPublicToken(workspaceId: string, contactId: string): Promise<string | null> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId }, select: { sessionId: true, source: true } })
  if (!contact || contact.source !== SOLAR_SOURCE || !contact.sessionId) return null
  return contact.sessionId
}

export async function getVisitLetterDataByToken(workspaceId: string, sessionId: string): Promise<VisitLetterData> {
  const contact = await prisma.contact.findUnique({
    where: { workspaceId_source_sessionId: { workspaceId, source: SOLAR_SOURCE, sessionId } }
  })
  if (!contact) throw new Error('Contact not found')
  return getVisitLetterDataForContact(workspaceId, contact.id)
}

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Underscored blank matching the printed form's fill-in-the-blank style when a value is missing. */
function fieldValue(value: string | null | undefined, blankChars = 24): string {
  return value ? escapeHtml(value) : '_'.repeat(blankChars)
}

function checkbox(label: string, checked: boolean): string {
  return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:18px;">
    <span style="display:inline-block;width:11px;height:11px;border:1.5px solid #1e293b;text-align:center;line-height:9px;font-size:9px;">${checked ? '✓' : ''}</span>
    ${escapeHtml(label)}
  </span>`
}

export function buildVisitLetterHtml(data: VisitLetterData): string {
  const modalidadKey = (data.modalidad ?? '').toLowerCase()

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; }
  .page { width: 210mm; min-height: 297mm; padding: 16mm 18mm; page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .brand { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0f172a; padding-bottom: 10px; margin-bottom: 18px; }
  .brand-logo { height: 34px; width: auto; display: block; }
  .brand-sub { font-size: 9px; color: #64748b; text-align: right; }
  .kicker { font-size: 11px; font-weight: 700; color: #0d9488; letter-spacing: 0.5px; }
  h1 { font-size: 22px; margin: 4px 0 2px; color: #0f172a; }
  .subtitle { font-size: 12px; color: #475569; margin: 0 0 16px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #cbd5e1; margin-bottom: 20px; }
  .info-cell { padding: 8px 12px; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; }
  .info-cell:nth-child(2n) { border-right: none; }
  .info-label { font-size: 8.5px; font-weight: 700; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase; }
  .info-value { font-size: 12px; font-weight: 600; margin-top: 3px; color: #0f172a; }
  h2 { font-size: 13px; color: #0f172a; border-bottom: 1.5px solid #0d9488; padding-bottom: 4px; margin: 20px 0 8px; }
  p { font-size: 10.5px; line-height: 1.55; margin: 0 0 8px; }
  .callout { background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 4px; padding: 10px 12px; font-size: 10px; margin: 10px 0; }
  .callout b { color: #0d9488; }
  table.commitments { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 4px; }
  table.commitments th { background: #0f172a; color: #fff; text-align: left; padding: 5px 8px; font-size: 9px; }
  table.commitments td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
  table.commitments td:first-child { width: 22px; text-align: center; font-weight: 700; }
  .footer-note { text-align: center; font-size: 8px; color: #94a3b8; position: absolute; bottom: 10mm; left: 0; right: 0; }
  .data-grid { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #cbd5e1; margin-bottom: 18px; }
  .data-cell { padding: 8px 12px; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; }
  .data-cell:nth-child(2n) { border-right: none; }
  .data-label { font-size: 8.5px; font-weight: 700; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase; }
  .data-value { font-size: 11.5px; margin-top: 4px; color: #0f172a; border-bottom: 1px solid #94a3b8; padding-bottom: 2px; min-height: 14px; }
  table.schedule { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 16px; }
  table.schedule td { border: 1px solid #cbd5e1; padding: 7px 10px; }
  table.schedule td:first-child { width: 38%; font-weight: 700; background: #f8fafc; }
  .modalidad-row { font-size: 10.5px; margin-bottom: 18px; }
  .obs-box { border: 1px solid #cbd5e1; border-radius: 4px; min-height: 70px; padding: 8px 10px; font-size: 10.5px; white-space: pre-wrap; margin-bottom: 20px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #cbd5e1; margin-top: 8px; }
  .sig-col { padding: 14px 16px; }
  .sig-col:first-child { border-right: 1px solid #cbd5e1; }
  .sig-header { background: #0f172a; color: #fff; text-align: center; font-size: 10px; font-weight: 700; padding: 6px; margin: -14px -16px 16px; }
  .sig-col:last-child .sig-header { background: #0d9488; }
  .sig-line { font-size: 10px; margin-bottom: 20px; border-bottom: 1px solid #94a3b8; padding-bottom: 2px; }
  .tagline { text-align: center; font-size: 9px; font-weight: 700; color: #0d9488; margin-top: 22px; font-style: italic; }
</style>
</head>
<body>

<div class="page">
  <div class="brand">
    <img class="brand-logo" src="${DRILLCHILE_LOGO_DATA_URI}" alt="DrillChile" />
    <div class="brand-sub">Solicitud formal de evaluación<br/>Carta de intención de proyecto solar</div>
  </div>

  <div class="kicker">SOLICITUD FORMAL DE EVALUACIÓN</div>
  <h1>CARTA DE INTENCIÓN DE PROYECTO SOLAR</h1>
  <p class="subtitle">Visita técnica gratuita y levantamiento de factibilidad</p>

  <div class="info-grid">
    <div class="info-cell"><div class="info-label">N.º de solicitud</div><div class="info-value">${fieldValue(data.numeroSolicitud, 14)}</div></div>
    <div class="info-cell"><div class="info-label">Fecha de emisión</div><div class="info-value">${escapeHtml(data.fechaEmision)}</div></div>
    <div class="info-cell"><div class="info-label">Ejecutivo responsable</div><div class="info-value">${fieldValue(data.ejecutivoNombre, 20)}</div></div>
    <div class="info-cell"><div class="info-label">Zona / comuna</div><div class="info-value">${fieldValue(data.zonaComuna, 18)}</div></div>
  </div>

  <h2>1. OBJETO DE LA SOLICITUD</h2>
  <p>Por medio del presente documento, el cliente solicita formalmente a Drill Chile la realización de una visita técnica gratuita destinada a evaluar la factibilidad de implementar un sistema de energía solar en la propiedad individualizada en esta carta.</p>
  <p>El cliente declara tener un interés serio y efectivo en desarrollar el proyecto, siempre que la solución presentada resulte técnicamente viable, responda a sus necesidades energéticas y se encuentre dentro de las condiciones comerciales posteriormente informadas.</p>
  <div class="callout"><b>DECLARACIÓN DE INTENCIÓN.</b> La visita es solicitada con la intención formal de evaluar y avanzar en la ejecución del proyecto solar, sujeto al resultado del levantamiento técnico y a las condiciones de la propuesta.</div>

  <h2>2. COMPROMISOS DEL CLIENTE DURANTE LA EVALUACIÓN</h2>
  <table class="commitments">
    <tr><th>N.º</th><th>COMPROMISO</th></tr>
    <tr><td>1</td><td>Entregar información verdadera y suficiente sobre el consumo eléctrico, el inmueble y las condiciones conocidas de la instalación.</td></tr>
    <tr><td>2</td><td>Facilitar el acceso a los sectores necesarios para efectuar el levantamiento técnico de manera segura.</td></tr>
    <tr><td>3</td><td>Autorizar la toma de fotografías y mediciones exclusivamente para evaluar, dimensionar y documentar el proyecto.</td></tr>
    <tr><td>4</td><td>Participar en la presentación de la propuesta técnica, energética y económica preparada por Drill Chile.</td></tr>
    <tr><td>5</td><td>Comunicar formalmente su decisión de aceptación, solicitud de modificaciones o desistimiento dentro de los cinco días hábiles siguientes a la presentación de la propuesta.</td></tr>
    <tr><td>6</td><td>Informar oportunamente cualquier condición técnica, económica o personal que pueda impedir o retrasar la ejecución del proyecto.</td></tr>
  </table>

  <h2>3. RECONOCIMIENTO DEL TRABAJO TÉCNICO</h2>
  <p>El cliente reconoce que la visita técnica gratuita requiere planificación, traslado, asignación de personal especializado, levantamiento de información, evaluación del inmueble y preparación de una propuesta personalizada.</p>
  <p>La solución definitiva, sus alcances, equipos, plazos y condiciones se establecerán en la cotización correspondiente. La contratación del proyecto se formalizará mediante la aceptación expresa de dicha cotización y la suscripción de los documentos aplicables.</p>
</div>

<div class="page">
  <div class="brand">
    <img class="brand-logo" src="${DRILLCHILE_LOGO_DATA_URI}" alt="DrillChile" />
    <div class="brand-sub">Carta de intención de proyecto solar<br/>Página 2</div>
  </div>

  <h1 style="font-size:18px;">ANTECEDENTES Y ACUERDOS DE LA VISITA</h1>
  <p class="subtitle">Registro para completar antes y durante el levantamiento técnico</p>

  <h2>4. DATOS DEL CLIENTE Y DEL PROYECTO</h2>
  <div class="data-grid">
    <div class="data-cell"><div class="data-label">Nombre completo / Razón social</div><div class="data-value">${fieldValue(data.nombre)}</div></div>
    <div class="data-cell"><div class="data-label">RUT</div><div class="data-value">${fieldValue(data.rut)}</div></div>
    <div class="data-cell"><div class="data-label">Dirección del proyecto</div><div class="data-value">${fieldValue(data.direccion)}</div></div>
    <div class="data-cell"><div class="data-label">Comuna / región</div><div class="data-value">${fieldValue(data.comuna)}</div></div>
    <div class="data-cell"><div class="data-label">Teléfono</div><div class="data-value">${fieldValue(data.telefono)}</div></div>
    <div class="data-cell"><div class="data-label">Correo electrónico</div><div class="data-value">${fieldValue(data.email)}</div></div>
    <div class="data-cell"><div class="data-label">N.º de cliente eléctrico</div><div class="data-value">${fieldValue(data.numeroClienteElectrico)}</div></div>
    <div class="data-cell"><div class="data-label">Empresa distribuidora</div><div class="data-value">${fieldValue(data.distribuidora)}</div></div>
  </div>

  <h2>5. PROGRAMACIÓN Y SEGUIMIENTO</h2>
  <table class="schedule">
    <tr><td>Fecha y hora de la visita</td><td>${fieldValue(data.fechaVisita, 30)}</td></tr>
    <tr><td>Técnico responsable</td><td>${fieldValue(data.tecnicoResponsable, 40)}</td></tr>
    <tr><td>Presentación de la propuesta</td><td>${fieldValue(data.fechaPropuesta, 30)}</td></tr>
    <tr><td>Fecha máxima de respuesta</td><td>${fieldValue(data.fechaMaximaRespuesta, 20)}</td></tr>
  </table>

  <div class="modalidad-row">
    <b>Modalidad acordada para la presentación y seguimiento:</b><br/><br/>
    ${checkbox('Reunión presencial', modalidadKey === 'presencial')}
    ${checkbox('Videollamada', modalidadKey === 'videollamada')}
    ${checkbox('Llamada telefónica', modalidadKey === 'llamada')}
    ${checkbox('Correo electrónico', modalidadKey === 'correo')}
  </div>

  <h2>6. OBSERVACIONES DEL LEVANTAMIENTO</h2>
  <div class="obs-box">${data.observaciones ? escapeHtml(data.observaciones) : ''}</div>

  <h2>7. ACEPTACIÓN Y FIRMAS</h2>
  <p>Declaro haber leído y comprendido el contenido de esta solicitud. Confirmo que los antecedentes proporcionados son correctos y ratifico mi interés formal en evaluar y avanzar en el desarrollo del proyecto solar propuesto por Drill Chile.</p>

  <div class="signatures">
    <div class="sig-col">
      <div class="sig-header">FIRMA DEL CLIENTE</div>
      <div class="sig-line">Nombre: ${fieldValue(data.nombre, 30)}</div>
      <div class="sig-line">RUT: ${fieldValue(data.rut, 20)}</div>
      <div class="sig-line">Fecha: ____ / ____ / ________</div>
    </div>
    <div class="sig-col">
      <div class="sig-header">FIRMA REPRESENTANTE DRILL CHILE</div>
      <div class="sig-line">Nombre: ${fieldValue(data.ejecutivoNombre, 30)}</div>
      <div class="sig-line">Cargo: ${fieldValue(data.ejecutivoTitulo, 30)}</div>
      <div class="sig-line">Fecha: ____ / ____ / ________</div>
    </div>
  </div>

  <div class="tagline">VISITA TÉCNICA GRATUITA · SOLICITADA CON INTENCIÓN FORMAL DE DESARROLLAR EL PROYECTO SOLAR</div>
</div>

</body>
</html>`
}

export async function generateVisitLetterPdf(data: VisitLetterData): Promise<Buffer> {
  const html = buildVisitLetterHtml(data)
  const browser = await puppeteer.launch({
    headless: true,
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
