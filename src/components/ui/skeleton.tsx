'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  variant?: 'card' | 'circle' | 'text' | 'line'
}

export function Skeleton({ className, variant = 'text' }: SkeletonProps) {
  const variants = {
    card: 'h-20 rounded-xl',
    circle: 'h-10 w-10 rounded-full',
    text: 'h-4 w-full rounded',
    line: 'h-3 w-3/4 rounded',
  }

  return (
    <motion.div
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 2, repeat: Infinity }}
      className={cn('bg-secondary/50', variants[variant], className)}
    />
  )
}

interface SkeletonGroupProps {
  count?: number
  variant?: 'card' | 'transaction' | 'metric'
}

export function SkeletonGroup({ count = 3, variant = 'card' }: SkeletonGroupProps) {
  if (variant === 'transaction') {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30"
          >
            <Skeleton variant="circle" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" className="w-1/3" />
              <Skeleton variant="line" className="w-1/4" />
            </div>
            <Skeleton variant="text" className="w-1/4" />
          </motion.div>
        ))}
      </div>
    )
  }

  if (variant === 'metric') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-4 rounded-xl bg-secondary/30 space-y-3"
          >
            <Skeleton variant="circle" className="h-8 w-8" />
            <Skeleton variant="line" className="w-1/2" />
            <Skeleton variant="text" className="w-2/3" />
          </motion.div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.05 }}
        >
          <Skeleton variant="card" />
        </motion.div>
      ))}
    </div>
  )
}
