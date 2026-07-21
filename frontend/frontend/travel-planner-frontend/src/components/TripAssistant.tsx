import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { TripPlanResponse } from '../types'
import { askTripAssistant } from '../api'
import type { AssistantMessage } from '../api'
import { ChatIcon, CloseIcon, SendIcon } from './icons'

interface TripAssistantProps {
  trip: TripPlanResponse
}

const GREETING =
  "Hi! I'm your trip assistant. Ask me anything about this itinerary — pacing, budget, what to wear, whatever you're wondering about."

export default function TripAssistant({ trip }: TripAssistantProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    const nextMessages: AssistantMessage[] = [...messages, { role: 'user', content: question }]
    setMessages(nextMessages)
    setInput('')
    setError(null)
    setLoading(true)
    try {
      const answer = await askTripAssistant(trip, question, messages)
      setMessages([...nextMessages, { role: 'assistant', content: answer }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="trip-assistant">
      {open && (
        <div className="trip-assistant-panel">
          <div className="trip-assistant-header">
            <span>Trip Assistant</span>
            <button type="button" aria-label="Close assistant" onClick={() => setOpen(false)}>
              <CloseIcon size={16} />
            </button>
          </div>

          <div className="trip-assistant-messages" ref={scrollRef}>
            <div className="trip-assistant-bubble assistant">{GREETING}</div>
            {messages.map((m, i) => (
              <div key={i} className={`trip-assistant-bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="trip-assistant-bubble assistant trip-assistant-typing">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && <div className="trip-assistant-error">{error}</div>}
          </div>

          <form className="trip-assistant-input-row" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Ask about your trip…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" aria-label="Send" disabled={loading || !input.trim()}>
              <SendIcon size={16} />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="trip-assistant-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close trip assistant' : 'Open trip assistant'}
      >
        {open ? <CloseIcon size={22} /> : <ChatIcon size={22} />}
      </button>
    </div>
  )
}
