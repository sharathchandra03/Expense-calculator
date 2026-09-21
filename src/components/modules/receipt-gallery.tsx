'use client'

import React, { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Image as ImageIcon, X, Download, Calendar, Tag, Search } from 'lucide-react'

/**
 * Receipt Gallery — All uploaded transaction photos in one place
 * Shows receipts with transaction name, amount, category, and date
 */
export function ReceiptGallery() {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [lightboxTitle, setLightboxTitle] = useState('')
  const [search, setSearch] = useState('')

  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const safeTx = Array.isArray(transactions) ? transactions : []

  // Filter only transactions with receipts
  const receipts = safeTx
    .filter(tx => tx.receiptImage)
    .filter(tx => {
      if (!search) return true
      const q = search.toLowerCase()
      return tx.description.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q)
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const openLightbox = (image: string, title: string) => {
    setLightboxImage(image)
    setLightboxTitle(title)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="flex flex-col space-y-5 pb-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Receipt Gallery</h1>
        <p className="text-xs text-muted-foreground">All your transaction photos in one place</p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3">
        <div className="px-3 py-2 rounded-xl bg-secondary/50 border border-border/30">
          <p className="text-lg font-bold text-foreground">{receipts.length}</p>
          <p className="text-[9px] text-muted-foreground font-bold uppercase">Receipts</p>
        </div>
        <div className="px-3 py-2 rounded-xl bg-secondary/50 border border-border/30">
          <p className="text-lg font-bold text-foreground">
            {formatCurrency(receipts.reduce((sum, tx) => sum + tx.amount, 0))}
          </p>
          <p className="text-[9px] text-muted-foreground font-bold uppercase">Total Value</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search receipts by name or category..."
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-secondary border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/60"
        />
      </div>

      {/* Gallery Grid */}
      {receipts.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {receipts.map((tx, i) => (
            <motion.button
              key={tx.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => openLightbox(tx.receiptImage!, `${tx.description || tx.category} - ${formatCurrency(tx.amount)}`)}
              className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-border/50 bg-secondary/30 hover:border-primary/30 transition-all"
            >
              {/* Receipt Image */}
              <img
                src={tx.receiptImage!}
                alt={tx.description || tx.category}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />

              {/* Overlay with info */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-2.5">
                <p className="text-[11px] font-bold text-white leading-tight line-clamp-1">
                  {tx.description || tx.category}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] font-semibold text-white/80">
                    {formatCurrency(tx.amount)}
                  </span>
                  <span className="text-[9px] text-white/60">
                    {formatDate(tx.date)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Tag className="w-2.5 h-2.5 text-white/50" />
                  <span className="text-[9px] text-white/50 capitalize">{tx.category}</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 rounded-2xl bg-secondary/20 border border-dashed border-border/50 text-center">
          <ImageIcon className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-semibold text-muted-foreground">No receipts yet</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1 max-w-[200px]">
            Attach a receipt when adding an expense and it will appear here
          </p>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/95 flex flex-col items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            {/* Title bar */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4 bg-gradient-to-b from-black/60 to-transparent z-10">
              <p className="text-sm font-semibold text-white truncate max-w-[70%]">{lightboxTitle}</p>
              <button
                onClick={() => setLightboxImage(null)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image */}
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={lightboxImage}
              alt="Receipt"
              className="max-w-full max-h-[75vh] rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
