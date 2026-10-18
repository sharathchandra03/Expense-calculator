'use client'

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, CustomCategory, generateUUID } from '@/db/schema'
import { cn } from '@/lib/utils'
import { motion, Reorder, useDragControls } from 'framer-motion'
import {
  Plus, ArrowLeft, LayoutGrid, List, GripVertical, Check,
  ChevronRight, Trash2, Save,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast-notification'
import { CategoryIcon } from '@/components/ui/category-icon'
import { sortCategories, setCategoryOrder, type CategoryType } from '@/lib/category-order'
import {
  DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES,
  getDefaultCategory, setDefaultCategory, setDefaultCategoryMeta, resolveCategoryMeta,
} from '@/lib/category-meta'
import {
  ICON_SECTIONS, CATEGORY_COLORS, getIconComponent,
  DEFAULT_CATEGORY_COLOR, DEFAULT_ICON_KEY,
} from '@/lib/category-icon-registry'

// A unified category item shown in the manager — a built-in default or a DB custom.
export interface CategoryItem {
  name: string
  type: CategoryType
  isCustom: boolean
  icon?: string
  color?: string
  createdAt?: string
  cat?: CustomCategory
}

// ---------------------------------------------------------------------------
// Hidden-defaults helpers (kept compatible with the old implementation)
// ---------------------------------------------------------------------------

function getHiddenDefaults(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('pennyflow-hidden-categories')
    if (stored) return JSON.parse(stored)
  } catch {}
  return []
}

function saveHiddenDefaults(hidden: string[]) {
  localStorage.setItem('pennyflow-hidden-categories', JSON.stringify(hidden))
}

// ---------------------------------------------------------------------------
// Shared hook: builds the ordered, unified category list per type
// ---------------------------------------------------------------------------

export function useCategoryItems() {
  const categories = useLiveQuery(() => db.customCategories.toArray()) ?? []
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const [hiddenDefaults, setHiddenDefaults] = useState<string[]>(getHiddenDefaults)
  const [version, setVersion] = useState(0)

  const safeCategories = Array.isArray(categories) ? categories : []

  const usageCount = useMemo(() => {
    const list = Array.isArray(transactions) ? transactions : []
    const map: Record<string, number> = {}
    list.forEach((tx) => { map[tx.category] = (map[tx.category] || 0) + 1 })
    return map
  }, [transactions])

  const build = (type: CategoryType): CategoryItem[] => {
    const defaults = type === 'expense' ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES
    const customs = safeCategories.filter((c) => c.type === type)
    const customNames = customs.map((c) => c.name.toLowerCase())
    const items: CategoryItem[] = []
    defaults.forEach((name) => {
      if (!customNames.includes(name.toLowerCase()) && !hiddenDefaults.includes(name)) {
        items.push({ name, type, isCustom: false })
      }
    })
    customs.forEach((c) => {
      items.push({ name: c.name, type, isCustom: true, icon: c.icon, color: c.color, createdAt: c.createdAt, cat: c })
    })
    return sortCategories(items, type, usageCount)
  }

  const expenseItems = useMemo(() => build('expense'), /* eslint-disable-line */ [safeCategories, hiddenDefaults, usageCount, version])
  const incomeItems = useMemo(() => build('income'), /* eslint-disable-line */ [safeCategories, hiddenDefaults, usageCount, version])

  const bump = () => setVersion((v) => v + 1)

  const hideDefault = (name: string) => {
    const updated = [...hiddenDefaults, name]
    setHiddenDefaults(updated)
    saveHiddenDefaults(updated)
  }
  const restoreDefault = (name: string) => {
    const updated = hiddenDefaults.filter((h) => h !== name)
    setHiddenDefaults(updated)
    saveHiddenDefaults(updated)
  }

  return { expenseItems, incomeItems, hiddenDefaults, hideDefault, restoreDefault, bump }
}

// ---------------------------------------------------------------------------
// Main component — routes between list, add/edit, and default-picker views
// ---------------------------------------------------------------------------

type View =
  | { kind: 'list' }
  | { kind: 'edit-form'; type: CategoryType; editing?: CategoryItem }
  | { kind: 'default-picker'; type: CategoryType }

export function CustomCategories() {
  const [view, setView] = useState<View>({ kind: 'list' })

  if (view.kind === 'edit-form') {
    return (
      <CategoryForm
        type={view.type}
        editing={view.editing}
        onBack={() => setView({ kind: 'list' })}
      />
    )
  }

  if (view.kind === 'default-picker') {
    return (
      <DefaultCategoryPicker
        type={view.type}
        onBack={() => setView({ kind: 'list' })}
      />
    )
  }

  return <CategoryList onNavigate={setView} />
}

// ---------------------------------------------------------------------------
// List view — tabs, default-category row, edit order, grid/list toggle
// ---------------------------------------------------------------------------

function CategoryList({ onNavigate }: { onNavigate: (v: View) => void }) {
  const { expenseItems, incomeItems, hiddenDefaults, hideDefault, restoreDefault, bump } = useCategoryItems()
  const [tab, setTab] = useState<CategoryType>('expense')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [editingOrder, setEditingOrder] = useState(false)
  const [confirmState, setConfirmState] = useState<{ open: boolean; item?: CategoryItem }>({ open: false })

  const items = tab === 'expense' ? expenseItems : incomeItems
  const defaultCat = getDefaultCategory(tab) ?? items[0]?.name

  const handleReorder = (reordered: CategoryItem[]) => {
    setCategoryOrder(tab, reordered.map((i) => i.name))
    bump()
  }

  const handleRemove = async () => {
    const item = confirmState.item
    if (!item) { setConfirmState({ open: false }); return }
    if (item.isCustom && item.cat) {
      await db.customCategories.delete(item.cat.id)
      bump()
    } else {
      hideDefault(item.name)
    }
    setConfirmState({ open: false })
  }

  const hiddenExpense = DEFAULT_EXPENSE_CATEGORIES.filter((c) => hiddenDefaults.includes(c))
  const hiddenIncome = DEFAULT_INCOME_CATEGORIES.filter((c) => hiddenDefaults.includes(c))
  const hiddenForTab = tab === 'expense' ? hiddenExpense : hiddenIncome

  return (
    <div className="flex flex-col pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold tracking-tight">Categories</h1>
        <button
          onClick={() => setEditingOrder((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full transition-colors',
            editingOrder ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'
          )}
        >
          <List className="w-3.5 h-3.5" />
          {editingOrder ? 'Done' : 'Edit order'}
        </button>
      </div>

      {/* Expense / Income tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-secondary/60 mb-4">
        {(['expense', 'income'] as CategoryType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-[13px] font-semibold capitalize transition-all',
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Default category row */}
      <button
        onClick={() => onNavigate({ kind: 'default-picker', type: tab })}
        className="flex items-center justify-between w-full bg-card border border-border rounded-2xl px-4 py-3.5 mb-4 shadow-card hover:border-primary/30 transition-colors"
      >
        <div className="flex items-center gap-3 text-left">
          {defaultCat && (
            <CategoryIcon
              name={defaultCat}
              type={tab}
              isCustom={items.find((i) => i.name === defaultCat)?.isCustom}
              icon={items.find((i) => i.name === defaultCat)?.icon}
              color={items.find((i) => i.name === defaultCat)?.color}
              size={36}
            />
          )}
          <div>
            <p className="text-[11px] text-muted-foreground">Default Category</p>
            <p className="text-[14px] font-bold text-foreground">{defaultCat ?? 'None'}</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>

      {/* Layout toggle */}
      {!editingOrder && (
        <div className="flex items-center justify-end mb-3">
          <div className="flex gap-1 p-1 rounded-full bg-secondary/60">
            <button
              onClick={() => setLayout('grid')}
              className={cn('p-1.5 rounded-full transition-colors', layout === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
              aria-label="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLayout('list')}
              className={cn('p-1.5 rounded-full transition-colors', layout === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Category content */}
      {items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground/60 py-6 text-center">No categories yet.</p>
      ) : editingOrder ? (
        <Reorder.Group axis="y" values={items} onReorder={handleReorder} className="flex flex-col gap-2">
          {items.map((item) => (
            <ReorderRow key={item.name} item={item} />
          ))}
        </Reorder.Group>
      ) : layout === 'grid' ? (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <CategoryGridCard
              key={item.name}
              item={item}
              onEdit={() => onNavigate({ kind: 'edit-form', type: tab, editing: item })}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <CategoryListRow
              key={item.name}
              item={item}
              onEdit={() => onNavigate({ kind: 'edit-form', type: tab, editing: item })}
              onRemove={() => setConfirmState({ open: true, item })}
            />
          ))}
        </div>
      )}

      {/* Restore hidden defaults */}
      {hiddenForTab.length > 0 && !editingOrder && (
        <div className="mt-5 bg-card border border-border rounded-2xl p-4 space-y-2.5 shadow-card">
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Removed (tap to restore)</h3>
          <div className="flex flex-wrap gap-2">
            {hiddenForTab.map((c) => (
              <button
                key={c}
                onClick={() => restoreDefault(c)}
                className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-secondary/40 text-muted-foreground/70 hover:bg-secondary hover:text-foreground transition-colors line-through"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating add button */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => onNavigate({ kind: 'edit-form', type: tab })}
        className="fixed bottom-24 right-6 md:right-[calc(50%-200px+1.5rem)] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-elevated flex items-center justify-center z-20"
        aria-label="Add category"
      >
        <Plus className="w-6 h-6" />
      </motion.button>

      <ConfirmDialog
        isOpen={confirmState.open}
        title={confirmState.item?.isCustom ? 'Delete category?' : 'Remove category?'}
        message={confirmState.item?.isCustom
          ? `"${confirmState.item?.name}" will be deleted. Existing transactions keep their label.`
          : `"${confirmState.item?.name}" will be removed from defaults. You can restore it later.`}
        confirmLabel={confirmState.item?.isCustom ? 'Delete' : 'Remove'}
        variant={confirmState.item?.isCustom ? 'danger' : 'warning'}
        onConfirm={handleRemove}
        onCancel={() => setConfirmState({ open: false })}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grid card / list row / reorder row
// ---------------------------------------------------------------------------

function CategoryGridCard({ item, onEdit }: { item: CategoryItem; onEdit: () => void }) {
  return (
    <button
      onClick={onEdit}
      className="flex flex-col items-center justify-center gap-2.5 py-6 rounded-2xl bg-card border border-border/60 hover:border-primary/30 transition-colors shadow-card"
    >
      <CategoryIcon name={item.name} type={item.type} isCustom={item.isCustom} icon={item.icon} color={item.color} size={44} />
      <span className="text-[12px] font-semibold text-foreground text-center px-2 leading-tight">{item.name}</span>
    </button>
  )
}

function CategoryListRow({ item, onEdit, onRemove }: { item: CategoryItem; onEdit: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-card border border-border/60 shadow-card group">
      <CategoryIcon name={item.name} type={item.type} isCustom={item.isCustom} icon={item.icon} color={item.color} size={40} />
      <button onClick={onEdit} className="flex-1 text-left">
        <span className="text-[13px] font-semibold text-foreground">{item.name}</span>
      </button>
      {!item.isCustom && (
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground/40 font-semibold">default</span>
      )}
      <button onClick={onRemove} className="opacity-40 hover:opacity-100 hover:text-destructive transition-opacity p-1">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

function ReorderRow({ item }: { item: CategoryItem }) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-card border border-border/60 shadow-card select-none"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground touch-none"
        aria-label={`Reorder ${item.name}`}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <CategoryIcon name={item.name} type={item.type} isCustom={item.isCustom} icon={item.icon} color={item.color} size={36} />
      <span className="flex-1 text-[13px] font-semibold text-foreground">{item.name}</span>
    </Reorder.Item>
  )
}

// ---------------------------------------------------------------------------
// Default category picker
// ---------------------------------------------------------------------------

function DefaultCategoryPicker({ type, onBack }: { type: CategoryType; onBack: () => void }) {
  const { expenseItems, incomeItems } = useCategoryItems()
  const items = type === 'expense' ? expenseItems : incomeItems
  const [selected, setSelected] = useState(() => getDefaultCategory(type) ?? items[0]?.name)

  const handleSelect = (name: string) => {
    setSelected(name)
    setDefaultCategory(type, name)
  }

  return (
    <div className="flex flex-col pb-10">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <div>
          <h1 className="text-lg font-bold tracking-tight capitalize">Default {type} Category</h1>
          <p className="text-[11px] text-muted-foreground">Pre-selected when adding a new {type}.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <button
            key={item.name}
            onClick={() => handleSelect(item.name)}
            className={cn(
              'flex items-center gap-3 px-3.5 py-3 rounded-2xl border transition-colors',
              selected === item.name ? 'bg-primary/10 border-primary/40' : 'bg-card border-border/60 hover:border-border'
            )}
          >
            <CategoryIcon name={item.name} type={item.type} isCustom={item.isCustom} icon={item.icon} color={item.color} size={40} />
            <span className="flex-1 text-left text-[13px] font-semibold text-foreground">{item.name}</span>
            {selected === item.name && <Check className="w-5 h-5 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add / Edit category form — name, type, color palette, icon picker
// ---------------------------------------------------------------------------

function CategoryForm({
  type: initialType,
  editing,
  onBack,
}: {
  type: CategoryType
  editing?: CategoryItem
  onBack: () => void
}) {
  const { showToast } = useToast()
  const isEditing = !!editing

  const initialMeta = editing
    ? resolveCategoryMeta({ name: editing.name, type: editing.type, isCustom: editing.isCustom, icon: editing.icon, color: editing.color })
    : { icon: DEFAULT_ICON_KEY, color: DEFAULT_CATEGORY_COLOR }

  const [name, setName] = useState(editing?.name ?? '')
  const [type, setType] = useState<CategoryType>(editing?.type ?? initialType)
  const [color, setColor] = useState(initialMeta.color)
  const [icon, setIcon] = useState(initialMeta.icon)

  const previewGlyph = React.createElement(getIconComponent(icon), {
    style: { width: 30, height: 30, color },
  })

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      showToast('Enter a category name')
      return
    }

    try {
      if (isEditing && editing) {
        if (editing.isCustom && editing.cat) {
          await db.customCategories.update(editing.cat.id, { name: trimmed, type, color, icon })
        } else {
          // Editing a built-in default: persist its icon/color override and,
          // if the name changed, promote it to a custom category + hide the old default.
          if (trimmed.toLowerCase() === editing.name.toLowerCase() && type === editing.type) {
            setDefaultCategoryMeta(type, trimmed, { icon, color })
          } else {
            await db.customCategories.add({
              id: generateUUID(), name: trimmed, type, color, icon, createdAt: new Date().toISOString(),
            })
            const hidden = getHiddenDefaults()
            if (!hidden.includes(editing.name)) {
              saveHiddenDefaults([...hidden, editing.name])
            }
          }
        }
      } else {
        await db.customCategories.add({
          id: generateUUID(), name: trimmed, type, color, icon, createdAt: new Date().toISOString(),
        })
      }
      onBack()
    } catch (err) {
      console.error('Error saving category:', err)
      showToast('Could not save category')
    }
  }

  return (
    <div className="flex flex-col pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <h1 className="text-lg font-bold tracking-tight">{isEditing ? 'Edit category' : 'Add category'}</h1>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-secondary/60 mb-5">
        {(['expense', 'income'] as CategoryType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-[13px] font-semibold capitalize transition-all',
              type === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Name + live preview */}
      <div className="flex items-center gap-4 mb-7">
        <span
          className="flex items-center justify-center rounded-full flex-shrink-0 w-16 h-16"
          style={{ backgroundColor: `${color}22` }}
        >
          {previewGlyph}
        </span>
        <div className="flex-1">
          <label className="text-[11px] text-muted-foreground">Category name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Groceries"
            autoFocus
            className="w-full bg-transparent border-b border-border focus:border-primary outline-none text-[18px] font-semibold text-foreground py-1 transition-colors"
          />
        </div>
      </div>

      {/* Color palette */}
      <div className="mb-7">
        <h3 className="text-[13px] font-semibold text-muted-foreground mb-3">Category color</h3>
        <div className="grid grid-cols-9 gap-x-2 gap-y-3">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn(
                'relative w-9 h-9 rounded-full flex items-center justify-center transition-transform',
                color === c ? 'scale-110' : 'hover:scale-105'
              )}
              style={{ backgroundColor: color === c ? c : `${c}26` }}
              aria-label={`Color ${c}`}
            >
              {color === c ? (
                <Check className="w-4 h-4 text-white" />
              ) : (
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Icon picker */}
      <div>
        <h3 className="text-[13px] font-semibold text-muted-foreground mb-3">Category icon</h3>
        <div className="space-y-5">
          {ICON_SECTIONS.map((section) => (
            <div key={section.title}>
              <h4 className="text-[13px] font-bold text-foreground mb-3">{section.title}</h4>
              <div className="grid grid-cols-5 gap-3">
                {section.icons.map(({ key, Icon }) => {
                  const active = icon === key
                  return (
                    <button
                      key={key}
                      onClick={() => setIcon(key)}
                      className={cn(
                        'aspect-square rounded-full flex items-center justify-center transition-all',
                        active ? 'ring-2 ring-offset-2 ring-offset-background' : 'bg-secondary/50 hover:bg-secondary'
                      )}
                      style={active ? { backgroundColor: `${color}22`, boxShadow: `0 0 0 2px ${color}` } : undefined}
                      aria-label={key}
                    >
                      <Icon style={{ width: 22, height: 22, color: active ? color : undefined }} className={active ? '' : 'text-muted-foreground'} />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating save button */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={handleSave}
        className="fixed bottom-24 right-6 md:right-[calc(50%-200px+1.5rem)] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-elevated flex items-center justify-center z-20"
        aria-label="Save category"
      >
        <Save className="w-5 h-5" />
      </motion.button>
    </div>
  )
}
