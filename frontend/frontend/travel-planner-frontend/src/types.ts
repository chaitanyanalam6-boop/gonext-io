export interface Activity {
  id: string
  type: string
  title: string
  time: string
  location: string
  notes: string
  duration: string
  lat: number
  lon: number
  cost: number
  image?: string | null
  details?: string | null
  distanceFromBaseKm?: number | null
}

export interface Day {
  id: string
  date: string
  label: string
  theme: string
  totalCost: number
  activities: Activity[]
}

export interface Recommendation {
  name: string
  stat: string
  img: string
}

export interface DestinationToolkit {
  localPayments: string
  survivalApps: string[]
  advisory: string
}

export interface TripPlanResponse {
  name: string
  destination: string
  coverImage: string
  budget: number
  totalCost: number
  recommendations: Recommendation[]
  days: Day[]
  toolkit?: DestinationToolkit | null
  destinationLat?: number | null
  destinationLon?: number | null
}

export interface DailyWeather {
  date: string
  high: number | null
  low: number | null
  icon: string
  label: string
}

export interface WeatherResponse {
  available: boolean
  currentTempC?: number
  currentLabel?: string
  currentIcon?: string
  daily?: DailyWeather[]
}

export interface VoiceTranslateResponse {
  detectedLanguage: string
  transcript: string
  translation: string
}

export interface TripRequest {
  destination: string
  days: number
  budget: number
  dayThemes?: string[]
  tripType?: string
  travelers?: number
}

export const TRIP_TYPE_OPTIONS = ['Solo', 'Couple', 'Family', 'Friends'] as const

export const DAY_THEME_OPTIONS = [
  'No preference',
  'Adventure',
  'Relaxation',
  'Culture & History',
  'Food & Nightlife',
  'Nature & Outdoors',
  'Shopping',
  'Family-friendly',
] as const

export interface User {
  id: number
  email: string
  name?: string | null
  phone?: string | null
}

export interface AuthResponse {
  token: string
  user: User
}

export interface TripSummary {
  id: number
  name: string
  destination: string
  coverImage: string
  daysCount: number
  budget: number
  totalCost: number
  isPublic: boolean
  createdAt: string
}

export interface TripDetail extends TripSummary {
  notes: string
  trip: TripPlanResponse
}

export interface TripMember {
  id: number
  name: string
}

export interface ExpenseSplit {
  memberId: number
  memberName: string
  shareAmount: number
}

export interface Expense {
  id: number
  description: string
  amount: number
  category: string
  paidByMemberId: number
  paidByName: string
  createdAt: string
  splits: ExpenseSplit[]
}

export interface Balance {
  memberId: number
  memberName: string
  netBalance: number
}

export interface Settlement {
  fromMemberId: number
  fromMemberName: string
  toMemberId: number
  toMemberName: string
  amount: number
}

export interface TripBalances {
  balances: Balance[]
  settlements: Settlement[]
}

export const EXPENSE_CATEGORIES = ['food', 'transport', 'lodging', 'activities', 'shopping', 'other'] as const

export interface CommunityTripCard {
  id: number
  name: string
  destination: string
  images: string[]
  ownerId: number
  ownerName: string
  likeCount: number
  commentCount: number
  likedByMe: boolean
  savedByMe: boolean
  createdAt: string
}

export interface CommunityTripDetail {
  id: number
  name: string
  destination: string
  daysCount: number
  budget: number
  totalCost: number
  ownerId: number
  ownerName: string
  likeCount: number
  commentCount: number
  likedByMe: boolean
  savedByMe: boolean
  createdAt: string
  trip: TripPlanResponse
}

export interface CommunityComment {
  id: number
  body: string
  authorName: string
  createdAt: string
}

export interface TrendingDestination {
  destination: string
  tripCount: number
  image: string
}

export interface Contributor {
  name: string
  tripCount: number
}
