import { useRef, useState } from 'react'
import * as api from '../api'
import type { VoiceTranslateResponse } from '../types'

// Speech Synthesis needs a BCP-47 locale code, not a plain language name.
const LANGUAGES: { name: string; speechCode: string }[] = [
  { name: 'English', speechCode: 'en-US' },
  { name: 'Spanish', speechCode: 'es-ES' },
  { name: 'French', speechCode: 'fr-FR' },
  { name: 'German', speechCode: 'de-DE' },
  { name: 'Italian', speechCode: 'it-IT' },
  { name: 'Portuguese', speechCode: 'pt-PT' },
  { name: 'Japanese', speechCode: 'ja-JP' },
  { name: 'Korean', speechCode: 'ko-KR' },
  { name: 'Mandarin Chinese', speechCode: 'zh-CN' },
  { name: 'Hindi', speechCode: 'hi-IN' },
  { name: 'Telugu', speechCode: 'te-IN' },
  { name: 'Arabic', speechCode: 'ar-SA' },
  { name: 'Russian', speechCode: 'ru-RU' },
  { name: 'Thai', speechCode: 'th-TH' },
  { name: 'Vietnamese', speechCode: 'vi-VN' },
  { name: 'Indonesian', speechCode: 'id-ID' },
]

type Status = 'idle' | 'recording' | 'translating' | 'error'

export default function VoiceTranslator() {
  const [targetLanguage, setTargetLanguage] = useState('English')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<VoiceTranslateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  async function startRecording() {
    setError(null)
    setResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = handleRecordingStop
      recorderRef.current = recorder
      recorder.start()
      setStatus('recording')
    } catch {
      setError("Couldn't access the microphone — check your browser's permission settings.")
      setStatus('error')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
  }

  async function handleRecordingStop() {
    // Release the mic only now that the recorder has actually flushed its final chunk —
    // stopping tracks in the same tick as recorder.stop() can cut that last chunk off
    // before 'ondataavailable' fires for it, silently truncating the end of the clip.
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setStatus('translating')
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' })
    try {
      const translated = await api.translateVoice(blob, targetLanguage)
      if (!translated.transcript) {
        setError("Didn't catch any speech in that clip — try again a bit closer to the mic.")
        setStatus('error')
        return
      }
      setResult(translated)
      setStatus('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Translation failed.')
      setStatus('error')
    }
  }

  function playTranslation() {
    if (!result || !('speechSynthesis' in window)) return
    const lang = LANGUAGES.find((l) => l.name === targetLanguage)?.speechCode ?? 'en-US'
    const utterance = new SpeechSynthesisUtterance(result.translation)
    utterance.lang = lang
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div className="toolkit-card toolkit-card-wide">
      <h3>Voice translator</h3>
      <p className="toolkit-card-hint">
        Hand your phone over, hit record while they speak, and see it translated into your language.
      </p>

      <div className="voice-translator-controls">
        <select
          aria-label="Translate into"
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
          disabled={status === 'recording' || status === 'translating'}
        >
          {LANGUAGES.map((l) => (
            <option key={l.name} value={l.name}>
              Translate into: {l.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`voice-record-btn ${status === 'recording' ? 'recording' : ''}`}
          onClick={status === 'recording' ? stopRecording : startRecording}
          disabled={status === 'translating'}
        >
          {status === 'recording' ? '⏹ Stop' : status === 'translating' ? 'Translating…' : '🎙 Record'}
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {result && (
        <div className="voice-translator-result">
          <div className="voice-translator-block">
            <span className="voice-translator-label">They said ({result.detectedLanguage})</span>
            <p>{result.transcript}</p>
          </div>
          <div className="voice-translator-block voice-translator-translation">
            <span className="voice-translator-label">Translation</span>
            <p>{result.translation}</p>
            <button type="button" className="voice-play-btn" onClick={playTranslation}>
              🔊 Play
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
