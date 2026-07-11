'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownUp, RefreshCw, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

const CACHE_KEY = 'pennyflow-exchange-rates'
const CACHE_EXPIRY_KEY = 'pennyflow-exchange-rates-expiry'

const CURRENCIES = [
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' },
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
]

export function CurrencyConverter() {
  const [fromCurrency, setFromCurrency] = useState('INR')
  const [toCurrency, setToCurrency] = useState('USD')
  const [amount, setAmount] = useState('')
  const [rates, setRates] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  // Load cached rates or fetch fresh
  useEffect(() => {
    loadRates()
  }, [])

  const loadRates = useCallback(async () => {
    // Check cache first
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(CACHE_KEY)
      const expiry = localStorage.getItem(CACHE_EXPIRY_KEY)

      if (cached && expiry && Date.now() < parseInt(expiry)) {
        setRates(JSON.parse(cached))
        setLastUpdated(new Date(parseInt(expiry) - 86400000).toLocaleDateString())
        return
      }
    }

    await fetchRates()
  }, [])

  const fetchRates = async () => {
    setLoading(true)
    try {
      const res = await fetch('https://api.frankfurter.app/latest?from=INR')
      if (res.ok) {
        const data = await res.json()
        const ratesWithBase = { ...data.rates, INR: 1 }
        setRates(ratesWithBase)
        setLastUpdated(data.date)

        // Cache for 24 hours
        if (typeof window !== 'undefined') {
          localStorage.setItem(CACHE_KEY, JSON.stringify(ratesWithBase))
          localStorage.setItem(CACHE_EXPIRY_KEY, (Date.now() + 86400000).toString())
        }
      }
    } catch (err) {
      console.error('Failed to fetch exchange rates:', err)
    } finally {
      setLoading(false)
    }
  }

  const convertedAmount = (() => {
    if (!rates || !amount || isNaN(Number(amount))) return null
    const amountNum = parseFloat(amount)

    // Convert: fromCurrency → INR → toCurrency
    const fromRate = rates[fromCurrency] || 1
    const toRate = rates[toCurrency] || 1

    // rates are from INR base, so:
    // amountInINR = amount / fromRate (if from is not INR)
    // result = amountInINR * toRate
    const inINR = fromCurrency === 'INR' ? amountNum : amountNum / fromRate
    const result = toCurrency === 'INR' ? inINR : inINR * toRate

    return result
  })()

  const swapCurrencies = () => {
    setFromCurrency(toCurrency)
    setToCurrency(fromCurrency)
  }

  const getSymbol = (code: string) => CURRENCIES.find(c => c.code === code)?.symbol || code

  return (
    <div className="flex flex-col space-y-5 pb-28">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Currency Converter</h1>
        <p className="text-xs text-muted-foreground">Convert between 24 currencies with live rates</p>
      </div>

      {/* Converter Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-3xl bg-card border border-border/50 space-y-4"
      >
        {/* From */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">From</label>
          <div className="flex gap-2">
            <select
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value)}
              className="h-11 px-3 rounded-xl bg-secondary border border-border/50 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 appearance-none"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                {getSymbol(fromCurrency)}
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-11 pl-8 pr-3 rounded-xl bg-secondary border border-border/50 text-lg font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
              />
            </div>
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center">
          <motion.button
            whileTap={{ rotate: 180 }}
            onClick={swapCurrencies}
            className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
          >
            <ArrowDownUp className="w-4 h-4" />
          </motion.button>
        </div>

        {/* To */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">To</label>
          <div className="flex gap-2">
            <select
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value)}
              className="h-11 px-3 rounded-xl bg-secondary border border-border/50 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 appearance-none"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
            <div className="flex-1 h-11 px-4 rounded-xl bg-primary/5 border border-primary/20 flex items-center">
              <span className="text-sm text-muted-foreground mr-1">{getSymbol(toCurrency)}</span>
              <span className="text-lg font-bold text-foreground">
                {convertedAmount !== null ? convertedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Rate info */}
        {rates && amount && convertedAmount !== null && (
          <div className="pt-3 border-t border-border/30 flex justify-between items-center">
            <p className="text-[10px] text-muted-foreground">
              1 {fromCurrency} = {((convertedAmount / parseFloat(amount)) || 0).toFixed(4)} {toCurrency}
            </p>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Globe className="w-3 h-3" />
              {lastUpdated && <span>Updated {lastUpdated}</span>}
            </div>
          </div>
        )}
      </motion.div>

      {/* Refresh */}
      <button
        onClick={fetchRates}
        disabled={loading}
        className="flex items-center justify-center gap-2 p-3 rounded-xl bg-secondary border border-border/50 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
      >
        <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        {loading ? 'Fetching rates...' : 'Refresh Rates'}
      </button>

      {/* Quick Reference Table */}
      {rates && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Quick Reference (1 INR =)</p>
          <div className="grid grid-cols-2 gap-2">
            {['USD', 'EUR', 'GBP', 'AED', 'SGD', 'JPY'].map(code => (
              <div key={code} className="flex justify-between items-center p-2.5 rounded-xl bg-secondary/50 border border-border/30">
                <span className="text-xs font-medium text-muted-foreground">{code}</span>
                <span className="text-xs font-bold text-foreground">
                  {rates[code] ? rates[code].toFixed(4) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
