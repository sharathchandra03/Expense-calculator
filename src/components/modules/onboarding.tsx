'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Plus, TrendingUp, Settings, Heart, Zap, CheckCircle, ArrowRight
} from 'lucide-react'

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: React.ReactNode
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to PennyFlow',
    description: 'Your personal finance tracker. Track money, understand patterns, and make better decisions.',
    icon: <img src="/Favicon assets/android-chrome-192x192.png" alt="PennyFlow" className="w-16 h-16 rounded-2xl object-contain" />,
  },
  {
    id: 'add-transaction',
    title: 'Add Your First Transaction',
    description: 'Tap the + button to quickly record expenses, income, bills, and more. Track every rupee that matters.',
    icon: <Plus className="w-12 h-12" />,
  },
  {
    id: 'insights',
    title: 'Get Spending Insights',
    description: 'View your spending patterns, category breakdown, and recurring expenses. Understand where your money goes.',
    icon: <TrendingUp className="w-12 h-12" />,
  },
  {
    id: 'lending',
    title: 'Track Lending & Interest',
    description: 'Record money you lent or borrowed. Automatically calculate interest and get payment reminders.',
    icon: <Heart className="w-12 h-12" />,
  },
  {
    id: 'search',
    title: 'Smart Search (Cmd+K)',
    description: 'Press Cmd+K to instantly search transactions, bills, goals, and get quick insights. Fast navigation.',
    icon: <Zap className="w-12 h-12" />,
  },
  {
    id: 'settings',
    title: 'Personalize Your Experience',
    description: 'Set your profile, currency preference, theme, and backup your data. All stored locally on your device.',
    icon: <Settings className="w-12 h-12" />,
  },
]

interface OnboardingProps {
  isFirstTime: boolean
  onComplete: () => void
}

function shouldShowOnboarding(): boolean {
  if (typeof window === 'undefined') return false

  const done = localStorage.getItem('finance-os-onboarding-done')
  if (!done) return true // Never completed - always show

  // After completing once, show max once per day as a reminder
  const lastShown = localStorage.getItem('finance-os-onboarding-last-shown')
  if (!lastShown) return false

  const lastDate = new Date(lastShown).toDateString()
  const today = new Date().toDateString()

  // If already shown today, don't show again
  return lastDate !== today ? false : false
}

export function Onboarding({ isFirstTime, onComplete }: OnboardingProps) {
  const [isOpen, setIsOpen] = useState(() => {
    // Only show if user has never completed onboarding
    if (isFirstTime) return true
    return false
  })
  const [currentStep, setCurrentStep] = useState(0)

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = () => {
    localStorage.setItem('finance-os-onboarding-done', 'true')
    localStorage.setItem('finance-os-onboarding-last-shown', new Date().toISOString())
    setIsOpen(false)
    onComplete()
  }

  const step = onboardingSteps[currentStep]
  const progress = ((currentStep + 1) / onboardingSteps.length) * 100

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleComplete() }}>
      <DialogContent className="max-w-md">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-6 pt-2"
        >
          {/* Icon */}
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary"
          >
            {step.icon}
          </motion.div>

          {/* Content */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">{step.title}</h2>
            <p className="text-sm text-muted-foreground">{step.description}</p>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-gradient-to-r from-primary to-primary/60"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Step {currentStep + 1} of {onboardingSteps.length}
            </p>
          </div>

          {/* Navigation */}
          <div className="flex gap-3">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={handlePrevious}
                className="flex-1"
              >
                Back
              </Button>
            )}
            <Button
              onClick={handleNext}
              className={currentStep === 0 ? 'w-full' : 'flex-1'}
            >
              {currentStep === onboardingSteps.length - 1 ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>

          {/* Skip Option */}
          <button
            onClick={handleComplete}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip Tutorial
          </button>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
