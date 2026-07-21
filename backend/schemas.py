from typing import Dict, List, Optional

from pydantic import BaseModel, EmailStr

class Activity(BaseModel):
    id: str
    type: str
    title: str
    time: str
    location: str
    notes: str
    duration: str
    lat: float
    lon: float
    cost: float
    image: Optional[str] = None
    details: Optional[str] = None
    distanceFromBaseKm: Optional[float] = None

class Day(BaseModel):
    id: str
    date: str
    label: str
    theme: str
    totalCost: float
    activities: List[Activity]

class Recommendation(BaseModel):
    name: str
    stat: str
    img: str

class DestinationToolkit(BaseModel):
    localPayments: str
    survivalApps: List[str]
    advisory: str

class TripPlanResponse(BaseModel):
    name: str
    destination: str
    coverImage: str
    budget: float
    totalCost: float
    recommendations: List[Recommendation]
    days: List[Day]
    toolkit: Optional[DestinationToolkit] = None
    destinationLat: Optional[float] = None
    destinationLon: Optional[float] = None

class AssistantMessage(BaseModel):
    role: str
    content: str

class AssistantRequest(BaseModel):
    trip: TripPlanResponse
    question: str
    history: List[AssistantMessage] = []

class AssistantResponse(BaseModel):
    answer: str

class TripRequest(BaseModel):
    destination: str
    days: int
    budget: float
    dayThemes: Optional[List[str]] = None
    tripType: Optional[str] = None
    travelers: Optional[int] = None

# --- Auth ---

class SignupRequest(BaseModel):
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class VoiceTranslateResponse(BaseModel):
    detectedLanguage: str
    transcript: str
    translation: str

class UserOut(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    phone: Optional[str] = None

class TokenResponse(BaseModel):
    token: str
    user: UserOut

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None

class PasswordChangeRequest(BaseModel):
    currentPassword: str
    newPassword: str

# --- Saved trips ---

class TripSaveRequest(BaseModel):
    trip: TripPlanResponse
    notes: str = ""

class TripSummary(BaseModel):
    id: int
    name: str
    destination: str
    coverImage: str
    daysCount: int
    budget: float
    totalCost: float
    isPublic: bool
    createdAt: str

class TripDetail(TripSummary):
    notes: str
    trip: TripPlanResponse

class TripVisibilityUpdate(BaseModel):
    isPublic: bool

# --- Group expense ledger ---

class TripMemberCreate(BaseModel):
    name: str

class TripMemberOut(BaseModel):
    id: int
    name: str

class ExpenseSplitOut(BaseModel):
    memberId: int
    memberName: str
    shareAmount: float

class ExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str = "other"
    paidByMemberId: int
    splitBetweenMemberIds: List[int]
    splitType: str = "equal"
    customSplits: Optional[Dict[int, float]] = None

class ExpenseOut(BaseModel):
    id: int
    description: str
    amount: float
    category: str
    paidByMemberId: int
    paidByName: str
    createdAt: str
    splits: List[ExpenseSplitOut]

class BalanceOut(BaseModel):
    memberId: int
    memberName: str
    netBalance: float

class SettlementOut(BaseModel):
    fromMemberId: int
    fromMemberName: str
    toMemberId: int
    toMemberName: str
    amount: float

class TripBalancesResponse(BaseModel):
    balances: List[BalanceOut]
    settlements: List[SettlementOut]

# --- Community ---

class CommunityTripCard(BaseModel):
    id: int
    name: str
    destination: str
    images: List[str]
    ownerId: int
    ownerName: str
    likeCount: int
    commentCount: int
    likedByMe: bool
    savedByMe: bool
    createdAt: str

class CommunityTripDetail(BaseModel):
    id: int
    name: str
    destination: str
    daysCount: int
    budget: float
    totalCost: float
    ownerId: int
    ownerName: str
    likeCount: int
    commentCount: int
    likedByMe: bool
    savedByMe: bool
    createdAt: str
    trip: TripPlanResponse

class CommentCreate(BaseModel):
    body: str

class CommentOut(BaseModel):
    id: int
    body: str
    authorName: str
    createdAt: str

class TrendingDestination(BaseModel):
    destination: str
    tripCount: int
    image: str

class ContributorOut(BaseModel):
    name: str
    tripCount: int

class AppStats(BaseModel):
    tripsPlanned: int
    destinationsPlanned: int
    likesGiven: int
    commentsPosted: int
