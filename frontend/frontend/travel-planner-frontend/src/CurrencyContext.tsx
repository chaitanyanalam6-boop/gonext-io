import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import * as api from './api'

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'] as const

const CURRENCY_LOCALES: Record<string, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  INR: 'en-IN',
  JPY: 'ja-JP',
  AUD: 'en-AU',
  CAD: 'en-CA',
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  AUD: '$',
  CAD: '$',
}

const EUROZONE = new Set([
  'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT', 'LV', 'LT',
  'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES', 'HR',
])
const REGION_CURRENCY: Record<string, string> = {
  IN: 'INR',
  GB: 'GBP',
  JP: 'JPY',
  AU: 'AUD',
  CA: 'CAD',
  US: 'USD',
}

/** Best-effort guess at the visitor's currency from their browser/OS locale (e.g.
 * "en-IN" -> INR) — used only as the very first default, before anyone has picked
 * a currency of their own. Falls back to USD for anything unrecognized, same as
 * before this existed. */
function detectCurrency(): string {
  for (const locale of navigator.languages ?? [navigator.language]) {
    const region = locale.split('-')[1]?.toUpperCase()
    if (!region) continue
    if (REGION_CURRENCY[region]) return REGION_CURRENCY[region]
    if (EUROZONE.has(region)) return 'EUR'
  }
  return 'USD'
}

interface CurrencyContextValue {
  currency: string
  setCurrency: (code: string) => void
  formatPrice: (usdAmount: number, decimals?: number) => string
  /** USD -> selected currency, as a raw number (for editable inputs, not display strings). */
  toDisplayAmount: (usdAmount: number) => number
  /** selected currency -> USD, as a raw number — the inverse of toDisplayAmount. */
  toUsdAmount: (displayAmount: number) => number
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

const CURRENCY_KEY = 'travel-planner-currency'

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<string>(() => localStorage.getItem(CURRENCY_KEY) || detectCurrency())
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 })

  useEffect(() => {
    api
      .getExchangeRates()
      .then((res) => setRates(res.rates))
      .catch(() => {})
  }, [])

  function setCurrency(code: string) {
    setCurrencyState(code)
    localStorage.setItem(CURRENCY_KEY, code)
  }

  // Every price in the app is estimated/stored in USD (that's what Gemini is prompted
  // in, and what's saved to the database) — this only converts how it's *displayed*.
  // The budget input on the plan form stays explicitly labeled USD rather than being
  // silently reinterpreted in another currency.
  function formatPrice(usdAmount: number, decimals = 0) {
    const rate = rates[currency] ?? 1
    const converted = usdAmount * rate
    const locale = CURRENCY_LOCALES[currency] ?? 'en-US'
    try {
      return converted.toLocaleString(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    } catch {
      return `${currency} ${converted.toFixed(decimals)}`
    }
  }

  function toDisplayAmount(usdAmount: number) {
    return usdAmount * (rates[currency] ?? 1)
  }

  function toUsdAmount(displayAmount: number) {
    return displayAmount / (rates[currency] ?? 1)
  }

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatPrice, toDisplayAmount, toUsdAmount }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider')
  return ctx
}
