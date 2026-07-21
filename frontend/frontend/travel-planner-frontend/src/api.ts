import type {
  AuthResponse,
  CommunityComment,
  CommunityTripCard,
  CommunityTripDetail,
  Contributor,
  Expense,
  TrendingDestination,
  TripBalances,
  TripDetail,
  TripMember,
  TripPlanResponse,
  TripRequest,
  TripSummary,
  User,
  VoiceTranslateResponse,
  WeatherResponse,
} from './types'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function handle<T>(res: Response, errorPrefix: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `${errorPrefix} (${res.status})`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function askTripAssistant(
  trip: TripPlanResponse,
  question: string,
  history: AssistantMessage[],
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/trip-assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trip, question, history }),
  })
  const data = await handle<{ answer: string }>(res, 'The trip assistant could not respond')
  return data.answer
}

export async function generateTrip(request: TripRequest): Promise<TripPlanResponse> {
  const res = await fetch(`${API_BASE}/api/generate-trip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return handle(res, 'Trip generation failed')
}

export interface InspirationDestination {
  name: string
  blurb: string
  img: string
}

export interface InspirationResponse {
  season: string
  destinations: InspirationDestination[]
}

export async function getInspiration(): Promise<InspirationResponse> {
  const res = await fetch(`${API_BASE}/api/inspiration`)
  return handle(res, 'Could not load popular destinations')
}

export interface HeroImageResponse {
  destination: string | null
  image: string | null
}

export async function getHeroImage(): Promise<HeroImageResponse> {
  const res = await fetch(`${API_BASE}/api/hero-image`)
  if (!res.ok) return { destination: null, image: null }
  return res.json()
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handle(res, 'Sign up failed')
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handle(res, 'Login failed')
}

export async function googleLogin(idToken: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: idToken }),
  })
  return handle(res, 'Google sign-in failed')
}

export async function fetchMe(token: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: authHeaders(token),
  })
  return handle(res, 'Could not verify session')
}

export interface ProfileUpdate {
  name?: string
  phone?: string
  email?: string
}

export async function updateProfile(token: string, update: ProfileUpdate): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(update),
  })
  return handle(res, 'Could not update profile')
}

export async function changePassword(token: string, currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  await handle(res, 'Could not change password')
}

export async function saveTrip(token: string, trip: TripPlanResponse, notes: string): Promise<TripSummary> {
  const res = await fetch(`${API_BASE}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ trip, notes }),
  })
  return handle(res, 'Saving trip failed')
}

export async function updateTrip(
  token: string,
  id: number,
  trip: TripPlanResponse,
  notes: string,
): Promise<TripSummary> {
  const res = await fetch(`${API_BASE}/api/trips/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ trip, notes }),
  })
  return handle(res, 'Could not update saved trip')
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/reverse-geocode?lat=${lat}&lon=${lon}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.city ?? null
}

export async function getWeather(lat: number, lon: number): Promise<WeatherResponse> {
  const res = await fetch(`${API_BASE}/api/weather?lat=${lat}&lon=${lon}`)
  if (!res.ok) return { available: false }
  return res.json()
}

export async function translateVoice(audio: Blob, targetLanguage: string): Promise<VoiceTranslateResponse> {
  const formData = new FormData()
  formData.append('audio', audio, 'clip.webm')
  formData.append('targetLanguage', targetLanguage)
  const res = await fetch(`${API_BASE}/api/translate-voice`, {
    method: 'POST',
    body: formData,
  })
  return handle(res, 'Translation failed')
}

export interface ExchangeRatesResponse {
  base: string
  rates: Record<string, number>
}

export async function getExchangeRates(): Promise<ExchangeRatesResponse> {
  const res = await fetch(`${API_BASE}/api/exchange-rates`)
  if (!res.ok) return { base: 'USD', rates: { USD: 1 } }
  return res.json()
}

export async function listTrips(token: string): Promise<TripSummary[]> {
  const res = await fetch(`${API_BASE}/api/trips`, {
    headers: authHeaders(token),
  })
  return handle(res, 'Could not load saved trips')
}

export async function getTrip(token: string, id: number): Promise<TripDetail> {
  const res = await fetch(`${API_BASE}/api/trips/${id}`, {
    headers: authHeaders(token),
  })
  return handle(res, 'Could not load trip')
}

export async function deleteTrip(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/trips/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  await handle(res, 'Could not delete trip')
}

export async function setTripVisibility(token: string, id: number, isPublic: boolean): Promise<TripSummary> {
  const res = await fetch(`${API_BASE}/api/trips/${id}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ isPublic }),
  })
  return handle(res, 'Could not update sharing')
}

// --- Group expense ledger ---

export async function listTripMembers(token: string, tripId: number): Promise<TripMember[]> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/members`, { headers: authHeaders(token) })
  return handle(res, 'Could not load trip members')
}

export async function addTripMember(token: string, tripId: number, name: string): Promise<TripMember> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ name }),
  })
  return handle(res, 'Could not add member')
}

export async function deleteTripMember(token: string, tripId: number, memberId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/members/${memberId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  await handle(res, 'Could not remove member')
}

export async function listExpenses(token: string, tripId: number): Promise<Expense[]> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/expenses`, { headers: authHeaders(token) })
  return handle(res, 'Could not load expenses')
}

export interface ExpenseCreateRequest {
  description: string
  amount: number
  category: string
  paidByMemberId: number
  splitBetweenMemberIds: number[]
  splitType: 'equal' | 'custom'
  customSplits?: Record<number, number>
}

export async function addExpense(token: string, tripId: number, request: ExpenseCreateRequest): Promise<Expense> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/expenses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(request),
  })
  return handle(res, 'Could not add expense')
}

export async function updateExpense(
  token: string,
  tripId: number,
  expenseId: number,
  request: ExpenseCreateRequest,
): Promise<Expense> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/expenses/${expenseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(request),
  })
  return handle(res, 'Could not update expense')
}

export async function deleteExpense(token: string, tripId: number, expenseId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/expenses/${expenseId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  await handle(res, 'Could not delete expense')
}

export async function getTripBalances(token: string, tripId: number): Promise<TripBalances> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/balances`, { headers: authHeaders(token) })
  return handle(res, 'Could not load balances')
}

export async function getCommunityFeed(token: string | null): Promise<CommunityTripCard[]> {
  const res = await fetch(`${API_BASE}/api/community/feed`, { headers: authHeaders(token) })
  return handle(res, 'Could not load community feed')
}

export async function getCommunityTrip(token: string | null, id: number): Promise<CommunityTripDetail> {
  const res = await fetch(`${API_BASE}/api/community/trips/${id}`, { headers: authHeaders(token) })
  return handle(res, 'Could not load trip')
}

export async function likeTrip(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/community/trips/${id}/like`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  await handle(res, 'Could not like trip')
}

export async function unlikeTrip(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/community/trips/${id}/like`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  await handle(res, 'Could not unlike trip')
}

export async function bookmarkTrip(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/community/trips/${id}/save`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  await handle(res, 'Could not save trip')
}

export async function unbookmarkTrip(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/community/trips/${id}/save`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  await handle(res, 'Could not remove saved trip')
}

export async function getComments(id: number): Promise<CommunityComment[]> {
  const res = await fetch(`${API_BASE}/api/community/trips/${id}/comments`)
  return handle(res, 'Could not load comments')
}

export async function addComment(token: string, id: number, body: string): Promise<CommunityComment> {
  const res = await fetch(`${API_BASE}/api/community/trips/${id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ body }),
  })
  return handle(res, 'Could not post comment')
}

export async function getTrendingDestinations(): Promise<TrendingDestination[]> {
  const res = await fetch(`${API_BASE}/api/community/trending`)
  return handle(res, 'Could not load trending destinations')
}

export async function getTopContributors(): Promise<Contributor[]> {
  const res = await fetch(`${API_BASE}/api/community/contributors`)
  return handle(res, 'Could not load top contributors')
}

export interface AppStats {
  tripsPlanned: number
  destinationsPlanned: number
  likesGiven: number
  commentsPosted: number
}

export async function getAppStats(): Promise<AppStats> {
  const res = await fetch(`${API_BASE}/api/community/stats`)
  return handle(res, 'Could not load app stats')
}
