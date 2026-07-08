'use client'

import React from 'react'
import { motion } from 'framer-motion'
import {
  Shield, Zap, PieChart, Calendar, Target, Heart,
  Smartphone, Lock, TrendingUp, Sparkles, Wallet, BarChart3
} from 'lucide-react'
import { cn } from '@/lib/utils'

const features = [
  {
    icon: PieChart,
    title: 'Visual Analytics',
    desc: 'Pie charts, bar graphs, and category breakdowns that make your money story clear at a glance.',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  {
    icon: Calendar,
    title: 'Calendar View',
    desc: 'See exactly what happened on any day. Tap a date, see your transactions. That simple.',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  {
    icon: TrendingUp,
    title: 'Smart Insights',
    desc: 'PennyFlow spots your patterns - biggest spends, savings streaks, and habits worth changing.',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: Target,
    title: 'Goals That Stick',
    desc: 'Set savings targets with deadlines. Watch the progress bar fill up as you get closer.',
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
  },
  {
    icon: Heart,
    title: 'Lending Ledger',
    desc: 'Track who owes you and who you owe. Interest calculations built in. No awkward conversations.',
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
  },
  {
    icon: Wallet,
    title: 'Multi-Account',
    desc: 'Cash, bank, crypto, investments - all in one place. Transfer between them in seconds.',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
]

export function AboutApp() {
  return (
    <div className="flex flex-col space-y-6 pb-28">

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center pt-4 space-y-4"
      >
        <div className="mx-auto w-20 h-20 rounded-2xl overflow-hidden shadow-lg shadow-primary/20">
          <img src="/app-assets/pennyflow-logo.png" alt="PennyFlow" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PennyFlow</h1>
          <p className="text-xs text-muted-foreground mt-1">Your money, your rules, your device.</p>
        </div>
      </motion.div>

      {/* Philosophy - not typical AI content, conversational */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-6 space-y-3"
      >
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-bold">Why PennyFlow exists</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Most finance apps want your data on their servers. They show ads. They sell insights about your spending to third parties. We thought that was weird.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          PennyFlow runs entirely on your device. No accounts to create. No servers storing your salary info. Open the app, start tracking. Your financial data never leaves your phone.
        </p>
      </motion.div>

      {/* Core principles */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="grid grid-cols-3 gap-3"
      >
        {[
          { icon: Lock, label: '100% Private', sub: 'Zero cloud sync', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { icon: Zap, label: 'Instant', sub: 'No loading screens', color: 'text-amber-500', bg: 'bg-amber-500/10' },
          { icon: Smartphone, label: 'Offline First', sub: 'Works anywhere', color: 'text-blue-500', bg: 'bg-blue-500/10' },
        ].map((item, i) => (
          <div key={i} className="rounded-2xl bg-card border border-border/50 p-3 text-center space-y-2">
            <div className={cn("w-9 h-9 rounded-xl mx-auto flex items-center justify-center", item.bg)}>
              <item.icon className={cn("w-4 h-4", item.color)} />
            </div>
            <p className="text-[11px] font-bold">{item.label}</p>
            <p className="text-[9px] text-muted-foreground">{item.sub}</p>
          </div>
        ))}
      </motion.div>

      {/* Features */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">What you can do</h3>
        {features.map((feat, idx) => (
          <motion.div
            key={feat.title}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + idx * 0.05 }}
            className="flex items-start gap-3.5 p-4 rounded-2xl bg-card border border-border/50"
          >
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", feat.bg)}>
              <feat.icon className={cn("w-5 h-5", feat.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{feat.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{feat.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* How it works - quick guide */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-3xl bg-card border border-border/50 p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">Quick start guide</h3>
        </div>
        <div className="space-y-3">
          {[
            { step: '1', text: 'Tap the + button to record income, expenses, bills, or assets' },
            { step: '2', text: 'Check Analytics for your spending patterns and savings rate' },
            { step: '3', text: 'Use Calendar view to see day-by-day activity' },
            { step: '4', text: 'Set Goals and watch your progress grow over time' },
            { step: '5', text: 'Export your data anytime from Settings as a backup' },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
                {item.step}
              </span>
              <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">{item.text}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Credits */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="rounded-3xl bg-gradient-to-br from-secondary/60 to-secondary/30 border border-border/50 p-6 space-y-5 text-center"
      >
        {/* Creator spotlight */}
        <div className="space-y-3">
          <div className="w-20 h-20 rounded-full mx-auto overflow-hidden border-2 border-primary/30 shadow-lg shadow-primary/10">
            <img src="/app-assets/sharath-chandra.jpg" alt="K. Sharath Chandra" className="w-full h-full object-cover" />
          </div>
          <div>
            <h3 className="text-base font-bold">K. Sharath Chandra</h3>
            <p className="text-xs text-primary font-semibold mt-0.5">Entrepreneur &amp; AI Enthusiast</p>
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Designed, built, and shipped solo. Every pixel, every feature, every line of code - one person, one vision.
          </p>
          <p className="text-[11px] text-primary/80 font-medium italic">
            "I wanted a finance app that respects your privacy and actually looks good. So I built one."
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary font-semibold">Solo Project</span>
          <span className="text-[10px] px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 font-semibold">Indie Dev</span>
        </div>

        <div className="pt-4 border-t border-border/40 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Built with</p>
          <div className="flex flex-wrap justify-center gap-2">
            {['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'Framer Motion', 'IndexedDB'].map((tech) => (
              <span key={tech} className="text-[10px] px-2.5 py-1 rounded-full bg-card border border-border/50 text-muted-foreground font-medium">
                {tech}
              </span>
            ))}
          </div>
        </div>

        <div className="pt-3 border-t border-border/40">
          <p className="text-[10px] text-muted-foreground">Version 1.0.0</p>
        </div>
      </motion.div>

      {/* Shield badge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-col items-center gap-2 py-4"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-500" />
          <p className="text-[11px] text-muted-foreground font-medium">Your data never leaves this device</p>
        </div>
        <p className="text-[10px] text-muted-foreground/60">by K. Sharath Chandra</p>
      </motion.div>
    </div>
  )
}
