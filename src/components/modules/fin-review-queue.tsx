'use client'
import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { HelpCircle, Smartphone } from 'lucide-react'
import { db, type ImportedTransaction } from '@/db/schema'
import { ImportService } from '@/services/ImportService'
import { Amount } from '@/components/ui/amount'
import { Card } from '@/components/ui/card'
import { CategorySheet } from '@/components/modules/quick-add-modal'
import { useToast } from '@/components/ui/toast-notification'
import { MODE_LABELS } from '@/lib/fin/engine/mode'
import type { TransactionMode } from '@/lib/fin/types'

/**
 * "Review required": imported transactions the engine could not categorise with
 * enough confidence. Choosing a category here also teaches PennyFlow the
 * counterparty for next time.
 */
export function FinReviewQueue() {
  const { showToast } = useToast()
  const [target, setTarget] = useState<ImportedTransaction | null>(null)

  const queue = useLiveQuery(async () => {
    // Re-run when imports or corrections change.
    await Promise.all([db.importedTransactions.count(), db.transactionOverrides.count()])
    return ImportService.reviewQueue()
  }, [], [] as ImportedTransaction[])

  if (!queue || queue.length === 0) return null

  const choose = async (category: string) => {
    if (!target) return
    const t = target
    setTarget(null)
    try {
      const similar = await ImportService.setUserCategory(t.id, category)
      showToast(
        similar > 0
          ? `Saved as ${category}. Also updated ${similar} similar transaction${similar > 1 ? 's' : ''}.`
          : `Saved as ${category}. PennyFlow will remember this.`,
        'success',
      )
    } catch {
      showToast('Could not save the category')
    }
  }

  return (
    <section aria-labelledby="fin-review-title" className="space-y-3">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-amber-500" aria-hidden />
        <h2 id="fin-review-title" className="text-[15px] font-bold text-foreground">Review required</h2>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-500">{queue.length}</span>
      </div>
      <p className="text-[12px] text-muted-foreground">
        PennyFlow was not sure about these. Until you choose, they are counted using their direction only (money in or out).
      </p>
      <div className="space-y-2">
        {queue.slice(0, 20).map((t) => (
          <Card key={t.id} className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-foreground">{t.merchantName ?? 'Unknown counterparty'}</p>
                <p className="truncate text-[11px] text-muted-foreground" title={t.narration}>{t.narration}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Smartphone className="h-3 w-3" aria-hidden />
                  {MODE_LABELS[t.mode as TransactionMode] ?? t.mode} · {new Date(t.timestamp).toLocaleDateString()}
                  {t.isSimulated && <span className="rounded bg-violet-500/15 px-1 font-bold text-violet-400">Sandbox</span>}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <Amount value={t.amount} size="sm" className={t.direction === 'credit' ? 'text-emerald-500' : 'text-foreground'} />
                <p className="text-[10px] text-muted-foreground">{t.direction === 'credit' ? 'Money in' : 'Money out'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTarget(t)}
              className="mt-2 h-9 w-full rounded-xl border border-border bg-secondary/50 text-[13px] font-semibold text-foreground active:scale-[0.99]"
            >
              Choose category
            </button>
          </Card>
        ))}
        {queue.length > 20 && <p className="text-center text-[12px] text-muted-foreground">{queue.length - 20} more after you clear these.</p>}
      </div>

      <CategorySheet
        open={!!target}
        type={target?.direction === 'credit' ? 'income' : 'expense'}
        value=""
        onClose={() => setTarget(null)}
        onSelect={choose}
      />
    </section>
  )
}
