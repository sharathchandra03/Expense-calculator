'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  color?: 'primary' | 'secondary' | 'destructive' | 'success'
}

const colorConfig = {
  primary: { bg: 'bg-primary/10', icon: 'text-primary' },
  secondary: { bg: 'bg-secondary/50', icon: 'text-muted-foreground' },
  destructive: { bg: 'bg-destructive/10', icon: 'text-destructive' },
  success: { bg: 'bg-emerald-500/10', icon: 'text-emerald-500' },
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  color = 'secondary',
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      {/* Icon Container */}
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className={cn('w-16 h-16 rounded-2xl flex items-center justify-center mb-4', colorConfig[color].bg)}
      >
        <Icon className={cn('w-8 h-8', colorConfig[color].icon)} />
      </motion.div>

      {/* Content */}
      <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mb-6">{description}</p>}

      {/* Action Button */}
      {action && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={action.onClick}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
        >
          {action.label}
        </motion.button>
      )}
    </motion.div>
  )
}
