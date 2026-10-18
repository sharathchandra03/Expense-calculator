'use client'

import React from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6 animate-fade-in-up">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1 h-6 w-1 rounded-full bg-gradient-to-b from-[#6d5efc] to-[#a78bfa]"
        />
        <div>
          <h1 className="text-[22px] font-bold text-foreground tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}
