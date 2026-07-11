'use client'

import React, { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { formatCurrency, cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Trophy, Flame, Target, Star, Zap, Shield, TrendingUp, Calendar, Award } from 'lucide-react'

interface Achievement {
  id: string
  title: string
  description: string
  icon: React.ElementType
  color: string
  bg: string
  unlocked: boolean
  progress: number // 0-100
  requirement: string
}

/**
 * Phase 2.8: Expense Streaks & Gamification
 * Tracks achievements, daily streaks, and motivational progress
 */
export function Achievements() {
  const transactions = useLiveQuery(() => db.transactions.toArray()) ?? []
  const budgets = useLiveQuery(() => db.budgets.toArray()) ?? []
  const goals = useLiveQuery(() => db.goals.toArray()) ?? []
  const accounts = useLiveQuery(() => db.accounts.toArray()) ?? []

  const safeTx = Array.isArray(transactions) ? transactions : []
  const safeBudgets = Array.isArray(budgets) ? budgets : []
  const safeGoals = Array.isArray(goals) ? goals : []

  // Calculate streak: consecutive days with spending under average
  const streak = useMemo(() => {
    const activeBudgets = safeBudgets.filter(b => b.isActive && b.period === 'monthly')
    if (activeBudgets.length === 0) return 0

    const totalLimit = activeBudgets.reduce((sum, b) => sum + b.limit, 0)
    const dailyLimit = totalLimit / 30

    let consecutiveDays = 0
    const today = new Date()

    for (let i = 0; i < 60; i++) {
      const checkDate = new Date(today)
      checkDate.setDate(today.getDate() - i)
      const dateStr = checkDate.toISOString().split('T')[0]

      const daySpent = safeTx
        .filter(tx => tx.type === 'expense' && tx.date === dateStr)
        .reduce((sum, tx) => sum + tx.amount, 0)

      if (daySpent <= dailyLimit || daySpent === 0) {
        consecutiveDays++
      } else {
        break
      }
    }

    return consecutiveDays
  }, [safeTx, safeBudgets])

  // Streak calendar (last 28 days)
  const streakCalendar = useMemo(() => {
    const activeBudgets = safeBudgets.filter(b => b.isActive && b.period === 'monthly')
    const totalLimit = activeBudgets.reduce((sum, b) => sum + b.limit, 0)
    const dailyLimit = totalLimit > 0 ? totalLimit / 30 : Infinity

    const days: Array<{ date: string; spent: number; underBudget: boolean }> = []
    const today = new Date()

    for (let i = 27; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]

      const spent = safeTx
        .filter(tx => tx.type === 'expense' && tx.date === dateStr)
        .reduce((sum, tx) => sum + tx.amount, 0)

      days.push({ date: dateStr, spent, underBudget: spent <= dailyLimit })
    }

    return days
  }, [safeTx, safeBudgets])

  // Achievement definitions
  const achievements: Achievement[] = useMemo(() => {
    const txCount = safeTx.length
    const hasbudget = safeBudgets.some(b => b.isActive)
    const hasGoal = safeGoals.length > 0
    const goalCompleted = safeGoals.some(g => g.currentAmount >= g.targetAmount)
    const expenseCount = safeTx.filter(tx => tx.type === 'expense').length

    return [
      {
        id: 'first-tx',
        title: 'First Step',
        description: 'Log your first transaction',
        icon: Star,
        color: 'text-amber-500',
        bg: 'bg-amber-500/10',
        unlocked: txCount >= 1,
        progress: Math.min(100, txCount > 0 ? 100 : 0),
        requirement: '1 transaction',
      },
      {
        id: 'ten-tx',
        title: 'Getting Started',
        description: 'Log 10 transactions',
        icon: Zap,
        color: 'text-blue-500',
        bg: 'bg-blue-500/10',
        unlocked: txCount >= 10,
        progress: Math.min(100, (txCount / 10) * 100),
        requirement: '10 transactions',
      },
      {
        id: 'fifty-tx',
        title: 'Committed',
        description: 'Log 50 transactions',
        icon: Shield,
        color: 'text-purple-500',
        bg: 'bg-purple-500/10',
        unlocked: txCount >= 50,
        progress: Math.min(100, (txCount / 50) * 100),
        requirement: '50 transactions',
      },
      {
        id: 'hundred-tx',
        title: 'Centurion',
        description: 'Log 100 transactions',
        icon: Trophy,
        color: 'text-amber-600',
        bg: 'bg-amber-600/10',
        unlocked: txCount >= 100,
        progress: Math.min(100, (txCount / 100) * 100),
        requirement: '100 transactions',
      },
      {
        id: 'first-budget',
        title: 'Budget Conscious',
        description: 'Set your first budget',
        icon: Target,
        color: 'text-emerald-500',
        bg: 'bg-emerald-500/10',
        unlocked: hasbudget,
        progress: hasbudget ? 100 : 0,
        requirement: '1 active budget',
      },
      {
        id: 'first-goal',
        title: 'Goal Setter',
        description: 'Create a savings goal',
        icon: TrendingUp,
        color: 'text-indigo-500',
        bg: 'bg-indigo-500/10',
        unlocked: hasGoal,
        progress: hasGoal ? 100 : 0,
        requirement: '1 goal created',
      },
      {
        id: 'goal-achieved',
        title: 'Goal Crusher',
        description: 'Complete a savings goal',
        icon: Award,
        color: 'text-pink-500',
        bg: 'bg-pink-500/10',
        unlocked: goalCompleted,
        progress: goalCompleted ? 100 : 0,
        requirement: '1 goal completed',
      },
      {
        id: 'streak-7',
        title: 'Week Warrior',
        description: 'Stay under budget for 7 days',
        icon: Flame,
        color: 'text-orange-500',
        bg: 'bg-orange-500/10',
        unlocked: streak >= 7,
        progress: Math.min(100, (streak / 7) * 100),
        requirement: '7-day streak',
      },
      {
        id: 'streak-30',
        title: 'Monthly Master',
        description: 'Stay under budget for 30 days',
        icon: Calendar,
        color: 'text-rose-500',
        bg: 'bg-rose-500/10',
        unlocked: streak >= 30,
        progress: Math.min(100, (streak / 30) * 100),
        requirement: '30-day streak',
      },
    ]
  }, [safeTx, safeBudgets, safeGoals, streak])

  const unlockedCount = achievements.filter(a => a.unlocked).length

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Achievements</h1>
        <p className="text-xs text-muted-foreground">Track your progress and streaks</p>
      </div>

      {/* Streak Card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-3xl bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Current Streak</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-3xl font-bold text-foreground">{streak}</span>
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {streak >= 7 ? 'Incredible consistency!' : streak >= 3 ? 'Keep it going!' : 'Start your streak today'}
            </p>
          </div>
          <Flame className={cn("w-10 h-10", streak >= 7 ? "text-orange-500" : "text-muted-foreground/30")} />
        </div>

        {/* Streak Calendar (28 days) */}
        <div className="grid grid-cols-7 gap-1">
          {streakCalendar.map((day, i) => (
            <div
              key={i}
              title={`${day.date}: ₹${day.spent.toLocaleString()}`}
              className={cn(
                "w-full aspect-square rounded-md transition-colors",
                day.spent === 0
                  ? "bg-secondary/50"
                  : day.underBudget
                    ? "bg-emerald-500/60"
                    : "bg-red-500/60"
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 mt-2 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/60" /> Under budget</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/60" /> Over budget</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-secondary/50" /> No spending</span>
        </div>
      </motion.div>

      {/* Achievement Progress */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Badges ({unlockedCount}/{achievements.length})
        </p>
      </div>

      {/* Achievements Grid */}
      <div className="space-y-3">
        {achievements.map((achievement, i) => {
          const Icon = achievement.icon
          return (
            <motion.div
              key={achievement.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={cn(
                "flex items-center gap-3 p-3 rounded-2xl border transition-all",
                achievement.unlocked
                  ? "bg-card border-border/50"
                  : "bg-secondary/20 border-border/30 opacity-60"
              )}
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", achievement.bg)}>
                <Icon className={cn("w-5 h-5", achievement.unlocked ? achievement.color : "text-muted-foreground/40")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn("text-xs font-bold", achievement.unlocked ? "text-foreground" : "text-muted-foreground")}>
                    {achievement.title}
                  </p>
                  {achievement.unlocked && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">UNLOCKED</span>}
                </div>
                <p className="text-[10px] text-muted-foreground">{achievement.description}</p>
                {!achievement.unlocked && (
                  <div className="mt-1.5 w-full h-1 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${achievement.progress}%` }} />
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
