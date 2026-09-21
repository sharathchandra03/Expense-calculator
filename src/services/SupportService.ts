import { db, SupportTicket, SupportTicketCategory, SupportTicketDiagnostics, SupportTicketAttachment, generateUUID } from '@/db/schema'

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
    syncStatus: navigator.onLine ? 'synced' : 'pending',
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

  // Attempt online sync (placeholder for future backend)
  if (navigator.onLine) {
    // In production, this would POST to a backend API
    // For now, mark as synced since we store locally
    await db.supportTickets.update(ticketId, { syncStatus: 'synced' })
  }

  return ticket
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

  let synced = 0
  for (const ticket of pendingTickets) {
    try {
      // In production: POST to backend API here
      await db.supportTickets.update(ticket.id, {
        syncStatus: 'synced',
        updatedAt: new Date().toISOString(),
      })
      synced++
    } catch {
      await db.supportTickets.update(ticket.id, { syncStatus: 'failed' })
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
