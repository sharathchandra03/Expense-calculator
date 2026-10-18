// Supabase Edge Function: notify-support-ticket
//
// Emails the operator whenever a new support ticket is created. Invoked by a
// database trigger (see migration 20260929000100_support_ticket_notify.sql)
// which POSTs the new row here.
//
// Required secrets (set with `supabase secrets set ...`):
//   RESEND_API_KEY        - your Resend API key (https://resend.com)
//   RESEND_FROM           - verified sender, e.g. "PennyFlow <support@yourdomain.com>"
//   SUPPORT_NOTIFY_EMAIL  - where to deliver notifications (your inbox)
//   NOTIFY_SHARED_SECRET  - shared secret; the trigger sends it as a header
//
// Deploy: supabase functions deploy notify-support-ticket --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface TicketAttachment {
  name: string
  type: string
  size: number
  path?: string
  url?: string | null
}

interface TicketRow {
  id: string
  user_id: string | null
  user_email: string | null
  guest_id: string | null
  category: string
  subject: string
  description: string | null
  steps_to_reproduce: string | null
  expected_behaviour: string | null
  actual_behaviour: string | null
  problem_to_solve: string | null
  suggestion: string | null
  rating: number | null
  attachments: TicketAttachment[] | null
  diagnostics: Record<string, unknown> | null
  priority: string
  status: string
  created_at: string
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'PennyFlow <onboarding@resend.dev>'
const SUPPORT_NOTIFY_EMAIL = Deno.env.get('SUPPORT_NOTIFY_EMAIL') ?? ''
const NOTIFY_SHARED_SECRET = Deno.env.get('NOTIFY_SHARED_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPPORT_BUCKET = 'support-attachments'

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function row(label: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  return `<tr>
    <td style="padding:6px 12px;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap">${esc(label)}</td>
    <td style="padding:6px 12px;color:#111827;font-size:13px">${esc(value).replace(/\n/g, '<br/>')}</td>
  </tr>`
}

async function freshSignedUrls(atts: TicketAttachment[]): Promise<TicketAttachment[]> {
  // Regenerate signed URLs so links in the email don't rely on the (possibly
  // expiring) URL stored at submit time. Requires service role.
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return atts
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const out: TicketAttachment[] = []
    for (const a of atts) {
      if (a.path) {
        const { data } = await admin.storage
          .from(SUPPORT_BUCKET)
          .createSignedUrl(a.path, 60 * 60 * 24 * 30) // 30 days
        out.push({ ...a, url: data?.signedUrl ?? a.url ?? null })
      } else {
        out.push(a)
      }
    }
    return out
  } catch {
    return atts
  }
}

Deno.serve(async (req) => {
  // Simple shared-secret gate so only our DB trigger can invoke this.
  if (NOTIFY_SHARED_SECRET) {
    const provided = req.headers.get('x-notify-secret')
    if (provided !== NOTIFY_SHARED_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  if (!RESEND_API_KEY || !SUPPORT_NOTIFY_EMAIL) {
    return new Response('Email not configured', { status: 500 })
  }

  let ticket: TicketRow
  try {
    const body = await req.json()
    // pg_net / Supabase webhook sends { record: {...} }; direct calls send the row.
    ticket = (body.record ?? body) as TicketRow
  } catch {
    return new Response('Bad payload', { status: 400 })
  }

  const submitter = ticket.user_email
    ? `${ticket.user_email} (account)`
    : ticket.guest_id
      ? `${ticket.guest_id} (guest)`
      : 'Unknown'

  const attachments = await freshSignedUrls(ticket.attachments ?? [])
  const attachmentsHtml = attachments.length
    ? attachments.map((a, i) =>
        a.url
          ? `<a href="${esc(a.url)}" style="display:inline-block;margin:4px 8px 4px 0;padding:6px 12px;background:#eef2ff;color:#4c3fd6;border-radius:8px;font-size:12px;text-decoration:none">📎 ${esc(a.name || `Screenshot ${i + 1}`)}</a>`
          : `<span style="font-size:12px;color:#9ca3af">${esc(a.name)} (upload failed)</span>`
      ).join('')
    : '<span style="font-size:13px;color:#9ca3af">No attachments</span>'

  const d = ticket.diagnostics ?? {}
  const diagLine = [
    d['os'], d['osVersion'], '·', d['deviceType'], '·', d['platform'],
    '·', d['screenSize'], '·', d['appVersion'] ? `v${d['appVersion']}` : '',
  ].filter(Boolean).join(' ')

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto">
    <div style="background:linear-gradient(135deg,#6d5efc,#4c3fd6);padding:24px;border-radius:16px 16px 0 0;color:#fff">
      <p style="margin:0;font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.08em">New support ticket · ${esc(ticket.category)}</p>
      <h1 style="margin:6px 0 0;font-size:20px">${esc(ticket.subject)}</h1>
      <p style="margin:8px 0 0;font-size:13px;opacity:.9">${esc(ticket.id)} · priority ${esc(ticket.priority)}</p>
    </div>
    <div style="border:1px solid #ececf0;border-top:0;border-radius:0 0 16px 16px;padding:16px 8px">
      <table style="width:100%;border-collapse:collapse">
        ${row('From', submitter)}
        ${row('Category', ticket.category)}
        ${row('Description', ticket.description)}
        ${row('Steps to reproduce', ticket.steps_to_reproduce)}
        ${row('Expected', ticket.expected_behaviour)}
        ${row('Actual', ticket.actual_behaviour)}
        ${row('Problem to solve', ticket.problem_to_solve)}
        ${row('Suggestion', ticket.suggestion)}
        ${row('Rating', ticket.rating ? `${ticket.rating} / 5` : '')}
        ${row('Device', diagLine)}
        ${row('Language / TZ', [d['language'], d['timezone']].filter(Boolean).join(' · '))}
        ${row('Submitted', ticket.created_at)}
      </table>
      <div style="padding:12px">
        <p style="margin:0 0 6px;color:#6b7280;font-size:13px">Screenshots</p>
        ${attachmentsHtml}
      </div>
    </div>
  </div>`

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [SUPPORT_NOTIFY_EMAIL],
      reply_to: ticket.user_email || undefined,
      subject: `[PennyFlow ${ticket.category}] ${ticket.subject} (${ticket.id})`,
      html,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    return new Response(`Email send failed: ${text}`, { status: 502 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
