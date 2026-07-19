'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Heart, Shield, Smartphone, Database, Zap, Wallet, BarChart3, Receipt, Users, Lock, Cloud, Lightbulb, PieChart, Tag, ArrowLeftRight, Github, Linkedin, Globe } from 'lucide-react'

export function AboutApp() {
  return (
    <div className="flex flex-col space-y-6 pb-6">
      {/* Hero Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center pt-4"
      >
        <div className="relative mb-4">
          <img
            src="/Favicon assets/android-chrome-192x192.png"
            alt="PennyFlow"
            className="w-20 h-20 rounded-3xl shadow-lg"
          />
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
            <span className="text-white text-[10px]">✓</span>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">PennyFlow</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Smart Personal Finance Tracker</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-[10px] font-semibold text-emerald-600">v1.0.0</span>
          <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-[10px] font-semibold text-purple-600">PWA</span>
          <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-[10px] font-semibold text-blue-600">Offline</span>
        </div>
      </motion.div>

      {/* Description */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 border border-purple-200/30 dark:border-purple-500/20 rounded-2xl p-5"
      >
        <p className="text-[13px] text-foreground leading-relaxed">
          PennyFlow is a <span className="font-semibold">privacy-first</span> personal finance app that helps you track expenses, manage budgets, set savings goals, and understand your spending habits - all without sending your data to any server.
        </p>
      </motion.div>

      {/* Key Features - 2x2 Grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-3"
      >
        <h3 className="text-[15px] font-bold text-foreground px-1">Why PennyFlow?</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Shield, label: '100% Private', desc: 'Your data never leaves your device', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-200/50 dark:border-emerald-500/20' },
            { icon: Zap, label: 'Lightning Fast', desc: '2-tap expense logging', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-200/50 dark:border-amber-500/20' },
            { icon: Database, label: 'Works Offline', desc: 'No internet required', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-200/50 dark:border-blue-500/20' },
            { icon: Smartphone, label: 'Install Anywhere', desc: 'PWA - works like native app', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-200/50 dark:border-purple-500/20' },
          ].map((feature) => (
            <div key={feature.label} className={`bg-card border ${feature.border} rounded-2xl p-4`}>
              <div className={`w-10 h-10 rounded-xl ${feature.bg} flex items-center justify-center mb-3`}>
                <feature.icon className={`w-5 h-5 ${feature.color}`} />
              </div>
              <p className="text-[13px] font-semibold text-foreground">{feature.label}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* What's Included - Attractive Grid */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-card border border-border rounded-2xl p-5 space-y-4"
      >
        <h3 className="text-[15px] font-bold text-foreground">Everything You Need</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Wallet, text: 'Expense & Income tracking', color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { icon: BarChart3, text: 'Budget with smart alerts', color: 'text-purple-500', bg: 'bg-purple-500/10' },
            { icon: Lightbulb, text: 'Goals & auto-contribution', color: 'text-amber-500', bg: 'bg-amber-500/10' },
            { icon: Receipt, text: 'Bills & subscriptions', color: 'text-rose-500', bg: 'bg-rose-500/10' },
            { icon: PieChart, text: 'Debt payoff planner', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
            { icon: Heart, text: 'Lending tracker', color: 'text-pink-500', bg: 'bg-pink-500/10' },
            { icon: BarChart3, text: 'Investment portfolio', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            { icon: Receipt, text: 'Receipt photo storage', color: 'text-orange-500', bg: 'bg-orange-500/10' },
            { icon: Users, text: 'Split expenses', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
            { icon: Database, text: 'CSV & Excel import/export', color: 'text-teal-500', bg: 'bg-teal-500/10' },
            { icon: Lock, text: 'Biometric lock', color: 'text-red-500', bg: 'bg-red-500/10' },
            { icon: Cloud, text: 'Cloud sync backup', color: 'text-sky-500', bg: 'bg-sky-500/10' },
            { icon: Zap, text: 'Spending insights', color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
            { icon: PieChart, text: 'Analytics & charts', color: 'text-violet-500', bg: 'bg-violet-500/10' },
            { icon: Tag, text: 'Custom categories', color: 'text-lime-600', bg: 'bg-lime-500/10' },
            { icon: ArrowLeftRight, text: 'Account transfers', color: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-xl">
              <div className={`w-7 h-7 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0`}>
                <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
              </div>
              <p className="text-[11px] font-medium text-foreground leading-tight">{item.text}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Privacy & Technology */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl p-5 space-y-3"
      >
        <h3 className="text-[15px] font-bold text-foreground">Privacy & Technology</h3>
        <div className="space-y-2.5">
          {[
            { label: 'Data storage', value: 'On your device only', highlight: false },
            { label: 'Cloud sync', value: 'Optional & encrypted', highlight: false },
            { label: 'Analytics/tracking', value: 'None - zero telemetry', highlight: true },
            { label: 'Framework', value: 'Next.js + React', highlight: false },
            { label: 'Database', value: 'Dexie.js (IndexedDB)', highlight: false },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
              <span className="text-[12px] text-muted-foreground">{item.label}</span>
              <span className={`text-[12px] font-semibold ${item.highlight ? 'text-emerald-500' : 'text-foreground'}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Built With */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="bg-card border border-border rounded-2xl p-5 space-y-3"
      >
        <h3 className="text-[15px] font-bold text-foreground">Built With</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'Next.js', color: 'hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black' },
            { name: 'React', color: 'hover:bg-cyan-500/20 hover:text-cyan-600' },
            { name: 'TypeScript', color: 'hover:bg-blue-500/20 hover:text-blue-600' },
            { name: 'Tailwind CSS', color: 'hover:bg-sky-500/20 hover:text-sky-600' },
            { name: 'Framer Motion', color: 'hover:bg-purple-500/20 hover:text-purple-600' },
            { name: 'Supabase', color: 'hover:bg-emerald-500/20 hover:text-emerald-600' },
          ].map(tech => (
            <span key={tech.name} className={`px-3 py-1.5 rounded-full bg-secondary text-[11px] font-medium text-muted-foreground cursor-default transition-all duration-200 ${tech.color}`}>
              {tech.name}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Creator Section */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-gradient-to-br from-purple-500/5 to-indigo-500/5 border border-purple-200/30 dark:border-purple-500/20 rounded-2xl p-5 space-y-4"
      >
        <h3 className="text-[15px] font-bold text-foreground">About the Creator</h3>
        <div className="flex items-center gap-4">
          <img
            src="/app-assets/sharath-chandra.jpg"
            alt="Sharath Chandra"
            className="w-16 h-16 rounded-2xl object-cover shadow-md"
          />
          <div>
            <h4 className="text-[15px] font-bold text-foreground">Sharath Chandra</h4>
            <p className="text-[12px] text-muted-foreground mt-0.5">Full Stack Developer & Designer</p>
            <p className="text-[11px] text-muted-foreground mt-1">Building products that solve real problems</p>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Every line of code, every interface, every button, and every user interaction in PennyFlow was crafted from scratch. It's a product built with precision, attention to detail, and the belief that personal finance software should be private, fast, and beautifully simple.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <a href="https://github.com/sharathchandra03" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors">
            <Github className="w-3.5 h-3.5 text-foreground" />
            <span className="text-[11px] font-medium text-foreground">GitHub</span>
          </a>
          <a href="https://www.linkedin.com/in/sharath-chandra-kotta-59a536212/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors">
            <Linkedin className="w-3.5 h-3.5 text-foreground" />
            <span className="text-[11px] font-medium text-foreground">LinkedIn</span>
          </a>
          <a href="https://scale-forge-website.vercel.app/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors">
            <Globe className="w-3.5 h-3.5 text-foreground" />
            <span className="text-[11px] font-medium text-foreground">Portfolio</span>
          </a>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="flex flex-col items-center text-center pt-2 pb-4"
      >
        <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <span>Made with</span>
          <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          <span>for better finances</span>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-1.5">
          Your money. Your data. Your control.
        </p>
        <p className="text-[10px] text-muted-foreground/40 mt-3">
          © 2026 PennyFlow. All rights reserved.
        </p>
      </motion.div>
    </div>
  )
}
