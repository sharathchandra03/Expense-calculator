'use client'

import React from 'react'
import { RefreshCw, Home } from 'lucide-react'

interface Props {
  children: React.ReactNode
  /** Called when the user taps "Back to home". */
  onReset?: () => void
}

interface State {
  error: Error | null
}

/**
 * Wraps the active module area so any unexpected render error shows a
 * friendly recovery screen instead of a blank white page.
 *
 * React class components are still the only way to implement error boundaries
 * (as of React 19). The `onReset` prop lets page.tsx wire up tab navigation
 * so the user can go back to the dashboard without a full reload.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface to the console so developers can still see the full trace.
    console.error('[ErrorBoundary] Uncaught render error:', error, info)
  }

  reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-destructive/20 blur-2xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-card border border-border/60 shadow-elevated text-3xl select-none">
              😕
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-[17px] font-bold text-foreground">Something went wrong</h2>
            <p className="text-[13px] text-muted-foreground leading-snug">
              A part of the app ran into an unexpected problem. Your data is safe — tap below to recover.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 w-full max-w-[260px]">
            <button
              onClick={this.reset}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground text-[14px] font-bold hover:opacity-90 transition-opacity"
            >
              <Home className="h-4 w-4" />
              Back to home
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-foreground text-[14px] font-semibold hover:bg-secondary/70 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Reload app
            </button>
          </div>

          {/* Developer detail — hidden in prod unless the user wants it */}
          <details className="w-full max-w-[320px] text-left">
            <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground/60 hover:text-muted-foreground">
              Technical details
            </summary>
            <pre className="mt-2 max-h-[160px] overflow-auto rounded-xl bg-secondary/60 p-3 text-[10px] text-muted-foreground leading-relaxed whitespace-pre-wrap break-all">
              {this.state.error.message}
            </pre>
          </details>
        </div>
      )
    }

    return this.props.children
  }
}
