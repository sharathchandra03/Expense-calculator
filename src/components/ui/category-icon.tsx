'use client'

import React from 'react'
import { getIconComponent } from '@/lib/category-icon-registry'
import { resolveCategoryMeta, type CategoryType } from '@/lib/category-meta'
import { cn } from '@/lib/utils'

interface CategoryIconProps {
  name: string
  type: CategoryType
  isCustom?: boolean
  /** icon key / color coming from a DB row (custom categories) */
  icon?: string
  color?: string
  /** diameter of the circular badge in px */
  size?: number
  /** icon stroke size in px (defaults to ~55% of size) */
  iconSize?: number
  className?: string
  /** when false, render the raw icon with no circular background */
  withBackground?: boolean
}

/**
 * Renders a category's icon inside a tinted circular badge, resolving the icon
 * key and color from the category metadata system. Used across the picker,
 * manager, and anywhere a category is displayed with its icon.
 */
export function CategoryIcon({
  name,
  type,
  isCustom,
  icon,
  color,
  size = 44,
  iconSize,
  className,
  withBackground = true,
}: CategoryIconProps) {
  const meta = resolveCategoryMeta({ name, type, isCustom, icon, color })
  const Icon = getIconComponent(meta.icon)
  const stroke = iconSize ?? Math.round(size * 0.5)

  const glyph = React.createElement(Icon, {
    style: { width: stroke, height: stroke, color: meta.color },
    ...(withBackground ? {} : { className }),
  })

  if (!withBackground) {
    return glyph
  }

  return (
    <span
      className={cn('flex items-center justify-center rounded-full flex-shrink-0', className)}
      style={{
        width: size,
        height: size,
        backgroundColor: `${meta.color}22`,
      }}
    >
      {glyph}
    </span>
  )
}
