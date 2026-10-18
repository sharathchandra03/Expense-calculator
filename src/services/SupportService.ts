import { db, SupportTicket, SupportTicketCategory, SupportTicketDiagnostics, SupportTicketAttachment, generateUUID } from '@/db/schema'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

// ============================================================================
// TICKET ID GENERATOR
// ============================================================================

/**
 * Generate a unique, human-readable ticket ID (e.g., PF-7A3X2)
 */
export function generateTicketId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // No ambiguous chars (0/O, 1/I/L)
  let code = ''
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `PF-${code}`
}

// ============================================================================
// SESSION ID (anonymous guest tracking)
// ============================================================================

/**
 * Get or create a persistent anonymous session ID for guest users.
 * Stored in localStorage so it survives page reloads but not cross-device.
 */
export function getSessionId(): string {
  const key = 'pennyflow-support-session-id'
  let sessionId = localStorage.getItem(key)
  if (!sessionId) {
    sessionId = `guest_${generateUUID()}`
    localStorage.setItem(key, sessionId)
  }
  return sessionId
}

// ============================================================================
// DIAGNOSTICS COLLECTOR
// ============================================================================

/**
 * Automatically collect device/app diagnostics without prompting the user.
 * This data helps debug issues efficiently.
 */
export function collectDiagnostics(): SupportTicketDiagnostics {
  const ua = navigator.userAgent
  const platform = detectPlatform(ua)
  const os = detectOS(ua)
  const deviceType = detectDeviceType(ua)

  // Get theme from localStorage or provider
  const theme = localStorage.getItem('pennyflow-theme') || 
                document.documentElement.classList.contains('dark') ? 'dark' : 'light'

  return {
    appVersion: '1.0.0',
    platform,
    deviceType,
    os: os.name,
    osVersion: os.version,
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    theme,
    language: navigator.language || 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
    internetStatus: navigator.onLine ? 'online' : 'offline',
    userId: getUserId(),
    sessionId: getSessionId(),
  }
}

function detectPlatform(ua: string): string {
  if (/android/i.test(ua)) return 'Android'
  if (/iPad|iPhone|iPod/.test(ua)) return 'iOS'
  if (/Win/.test(ua)) return 'Windows'
  if (/Mac/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Unknown'
}

function detectOS(ua: string): { name: string; version: string } {
  const osPatterns: Array<{ regex: RegExp; name: string }> = [
    { regex: /Windows NT (\d+\.\d+)/, name: 'Windows' },
    { regex: /Mac OS X (\d+[._]\d+[._]?\d*)/, name: 'macOS' },
    { regex: /Android (\d+\.?\d*)/, name: 'Android' },
    { regex: /iPhone OS (\d+_\d+)/, name: 'iOS' },
    { regex: /Linux/, name: 'Linux' },
  ]

  for (const { regex, name } of osPatterns) {
    const match = ua.match(regex)
    if (match) {
      return { name, version: (match[1] || '').replace(/_/g, '.') }
    }
  }
  return { name: 'Unknown', version: '' }
}

function detectDeviceType(ua: string): string {
  if (/Mobi|Android.*Mobile|iPhone/.test(ua)) return 'Mobile'
  if (/iPad|Android(?!.*Mobile)|Tablet/.test(ua)) return 'Tablet'
  return 'Desktop'
}

function getUserId(): string | undefined {
  try {
    const profile = localStorage.getItem('finance-os-profile')
    if (profile) {
      const p = JSON.parse(profile)
      if (p.email) return p.email
    }
  } catch {}
  return undefined
}

// ============================================================================
// TICKET SUBMISSION
// ============================================================================

export interface SubmitTicketData {
  category: SupportTicketCategory
  subject: string
  description: string
  stepsToReproduce?: string
  expectedBehaviour?: string
  actualBehaviour?: string
  problemToSolve?: string
  suggestion?: string
  rating?: number
  attachments?: SupportTicketAttachment[]
}

/**
 * Submit a new support ticket. Saves locally first (offline-first),
 * then attempts to sync if online.
 */
export async function submitSupportTicket(data: SubmitTicketData): Promise<SupportTicket> {
  const ticketId = generateTicketId()
  const diagnostics = collectDiagnostics()
  const now = new Date().toISOString()

  const ticket: SupportTicket = {
    id: ticketId,
    userId: diagnostics.userId,
    guestId: diagnostics.userId ? undefined : diagnostics.sessionId,
    category: data.category,
    subject: data.subject,
    description: data.description,
    stepsToReproduce: data.stepsToReproduce,
    expectedBehaviour: data.expectedBehaviour,
    actualBehaviour: data.actualBehaviour,
    problemToSolve: data.problemToSolve,
    suggestion: data.suggestion,
    rating: data.rating,
    attachments: data.attachments || [],
    diagnostics,
    priority: determinePriority(data.category),
    status: 'open',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending', // upgraded to 'synced' below once pushed to Supabase
    messages: [],
  }

  // Save to local DB
  await db.supportTickets.add(ticket)

  // Log to system
  await db.systemLogs.add({
    id: generateUUID(),
    timestamp: now,
    type: 'system',
    description: `Support ticket ${ticketId} submitted: ${data.subject}`,
  })

  // Attempt to push to Supabase so the submission is captured server-side.
  // Offline-first: if this fails (offline / not configured), the ticket stays
  // 'pending' locally and syncPendingTickets() retries when back online.
  if (navigator.onLine && isSupabaseConfigured) {
    try {
      await pushTicketToSupabase(ticket)
      await db.supportTickets.update(ticketId, { syncStatus: 'synced' })
      ticket.syncStatus = 'synced'
    } catch {
      await db.supportTickets.update(ticketId, { syncStatus: 'pending' })
      ticket.syncStatus = 'pending'
    }
  } else {
    // No backend available — keep locally, mark pending for later sync.
    await db.supportTickets.update(ticketId, { syncStatus: 'pending' })
    ticket.syncStatus = 'pending'
  }

  return ticket
}

// ============================================================================
// SUPABASE PUSH (server-side capture)
// ============================================================================

const SUPPORT_BUCKET = 'support-attachments'

/** Convert a base64 data URL to a Blob for upload. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',')
  const mimeMatch = meta.match(/data:([^;]+)/)
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * Push a locally-saved ticket to Supabase: upload each screenshot to Storage,
 * then insert the ticket row (attributed to the signed-in account when there
 * is one). Returns true on success.
 *
 * Throws on failure so callers can mark the ticket 'pending'/'failed' and retry.
 */
export async function pushTicketToSupabase(ticket: SupportTicket): Promise<boolean> {
  if (!isSupabaseConfigured) return false

  // Resolve the current auth user (if signed in) so we can attribute the ticket.
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const userEmail = user?.email ?? ticket.diagnostics.userId ?? null

  // Namespace uploads by uploader (user id or guest id) so RLS/ownership works
  // and the operator can see who sent what.
  const owner = userId ?? ticket.guestId ?? 'guest'

  // 1. Upload attachments to Storage, collecting public-less references.
  const uploadedAttachments: Array<{ name: string; type: string; size: number; path: string; url: string | null }> = []

  for (const att of ticket.attachments || []) {
    if (!att.data) continue
    try {
      const blob = dataUrlToBlob(att.data)
      const safeName = att.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${owner}/${ticket.id}/${att.id}-${safeName}`
      const { error: uploadErr } = await supabase.storage
        .from(SUPPORT_BUCKET)
        .upload(path, blob, { contentType: att.type, upsert: true })
      if (uploadErr) throw uploadErr

      // Signed URL so the operator can view it (valid ~7 days); store path too.
      const { data: signed } = await supabase.storage
        .from(SUPPORT_BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 7)

      uploadedAttachments.push({
        name: att.name,
        type: att.type,
        size: att.size,
        path,
        url: signed?.signedUrl ?? null,
      })
    } catch (err) {
      // A single attachment failure shouldn't lose the whole ticket — record a
      // marker and continue so text content still reaches the operator.
      uploadedAttachments.push({ name: att.name, type: att.type, size: att.size, path: '', url: null })
    }
  }

  // 2. Insert the ticket row.
  const row = {
    id: ticket.id,
    user_id: userId,
    user_email: userEmail,
    guest_id: userId ? null : (ticket.guestId ?? ticket.diagnostics.sessionId),
    category: ticket.category,
    subject: ticket.subject,
    description: ticket.description,
    steps_to_reproduce: ticket.stepsToReproduce ?? null,
    expected_behaviour: ticket.expectedBehaviour ?? null,
    actual_behaviour: ticket.actualBehaviour ?? null,
    problem_to_solve: ticket.problemToSolve ?? null,
    suggestion: ticket.suggestion ?? null,
    rating: ticket.rating ?? null,
    attachments: uploadedAttachments,
    diagnostics: ticket.diagnostics,
    priority: ticket.priority,
    status: ticket.status,
  }

  const { error: insertErr } = await supabase.from('support_tickets').upsert(row, { onConflict: 'id' })
  if (insertErr) throw insertErr

  return true
}

/**
 * Determine initial priority based on category
 */
function determinePriority(category: SupportTicketCategory): SupportTicket['priority'] {
  switch (category) {
    case 'bug':
      return 'high'
    case 'issue':
      return 'medium'
    case 'feature_request':
      return 'low'
    case 'question':
      return 'low'
    case 'feedback':
      return 'low'
    default:
      return 'medium'
  }
}

// ============================================================================
// OFFLINE QUEUE & SYNC
// ============================================================================

/**
 * Retry syncing any pending tickets when connection is restored.
 * Call this on 'online' event.
 */
export async function syncPendingTickets(): Promise<number> {
  const pendingTickets = await db.supportTickets
    .where('syncStatus')
    .equals('pending')
    .toArray()

  if (!isSupabaseConfigured || !navigator.onLine) return 0

  let synced = 0
  for (const ticket of pendingTickets) {
    try {
      await pushTicketToSupabase(ticket)
      await db.supportTickets.update(ticket.id, {
        syncStatus: 'synced',
        updatedAt: new Date().toISOString(),
      })
      synced++
    } catch {
      // Leave as 'pending' so we retry on the next online event rather than
      // marking 'failed' (which would never be retried automatically).
      await db.supportTickets.update(ticket.id, { syncStatus: 'pending' })
    }
  }

  return synced
}

/**
 * Get all user's support tickets (for ticket history)
 */
export async function getUserTickets(): Promise<SupportTicket[]> {
  return db.supportTickets
    .orderBy('createdAt')
    .reverse()
    .toArray()
}

/**
 * Get a single ticket by ID
 */
export async function getTicketById(id: string): Promise<SupportTicket | undefined> {
  return db.supportTickets.get(id)
}

// ============================================================================
// ATTACHMENT UTILITIES
// ============================================================================

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']

export interface AttachmentValidationResult {
  valid: boolean
  error?: string
}

/**
 * Validate a file before attaching
 */
export function validateAttachment(file: File): AttachmentValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum size is 5MB (got ${(file.size / 1024 / 1024).toFixed(1)}MB)` }
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: `Unsupported file type: ${file.type}. Allowed: images and videos.` }
  }
  return { valid: true }
}

/**
 * Read a file and return a base64-encoded attachment object
 */
export function readFileAsAttachment(file: File): Promise<SupportTicketAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = e.target?.result as string
      resolve({
        id: generateUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        data,
        thumbnail: file.type.startsWith('image/') ? data : undefined,
      })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ============================================================================
// ADMIN (OPERATOR) — read all tickets via secure RPC
// ============================================================================

export interface AdminTicketAttachment {
  name: string
  type: string
  size: number
  path?: string
  url?: string | null
}

export interface AdminTicket {
  id: string
  user_id: string | null
  user_email: string | null
  guest_id: string | null
  category: SupportTicketCategory
  subject: string
  description: string | null
  steps_to_reproduce: string | null
  expected_behaviour: string | null
  actual_behaviour: string | null
  problem_to_solve: string | null
  suggestion: string | null
  rating: number | null
  attachments: AdminTicketAttachment[]
  diagnostics: Record<string, unknown> | null
  priority: string
  status: string
  created_at: string
  updated_at: string
}

/**
 * Fetch ALL support tickets. Only succeeds when the signed-in user is an
 * operator (enforced server-side by the SECURITY DEFINER RPC). Throws
 * 'not authorized' otherwise.
 */
export async function adminListTickets(): Promise<AdminTicket[]> {
  if (!isSupabaseConfigured) throw new Error('Cloud not configured')
  const { data, error } = await supabase.rpc('admin_list_support_tickets')
  if (error) throw new Error(error.message)
  return (data ?? []) as AdminTicket[]
}

/** Update a ticket's status (operator only). */
export async function adminUpdateTicketStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.rpc('admin_update_ticket_status', { p_id: id, p_status: status })
  if (error) throw new Error(error.message)
}

/**
 * Generate a fresh signed URL for a stored attachment path. Operators have a
 * storage read policy so this works from their session.
 */
export async function adminSignAttachment(path: string, expiresSec = 60 * 60): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage
    .from(SUPPORT_BUCKET)
    .createSignedUrl(path, expiresSec)
  return data?.signedUrl ?? null
}
