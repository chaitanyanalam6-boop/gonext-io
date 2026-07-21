import asyncio
import json
import math
import os
import random
import re
import unicodedata
from datetime import datetime, timedelta, timezone

import httpx
from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from typing import List, Optional
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token as google_id_token

from db import Base, engine, get_db
from models import Comment, Expense, ExpenseSplit, Like, SavedTrip, Trip, TripMember, User

from auth import (
    create_access_token,
    get_current_user,
    get_current_user_optional,
    hash_password,
    verify_password,
)
from schemas import (
    AppStats,
    AssistantRequest,
    AssistantResponse,
    BalanceOut,
    CommentCreate,
    CommentOut,
    CommunityTripCard,
    CommunityTripDetail,
    ContributorOut,
    ExpenseCreate,
    ExpenseOut,
    ExpenseSplitOut,
    GoogleAuthRequest,
    LoginRequest,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    SettlementOut,
    SignupRequest,
    TokenResponse,
    TrendingDestination,
    TripBalancesResponse,
    TripDetail,
    TripMemberCreate,
    TripMemberOut,
    TripPlanResponse,
    TripRequest,
    TripSaveRequest,
    TripSummary,
    TripVisibilityUpdate,
    UserOut,
    VoiceTranslateResponse,
)

Base.metadata.create_all(bind=engine)

# Lightweight migration: create_all() only adds missing tables, it won't add
# columns to a table that already exists from before this column was introduced.
NEW_COLUMNS = {
    "trips": [("is_public", "BOOLEAN NOT NULL DEFAULT 0")],
    "users": [("name", "VARCHAR"), ("phone", "VARCHAR")],
}
with engine.connect() as _conn:
    _inspector = inspect(engine)
    for _table, _columns in NEW_COLUMNS.items():
        if _table not in _inspector.get_table_names():
            continue
        _existing_cols = {c["name"] for c in _inspector.get_columns(_table)}
        for _col_name, _col_def in _columns:
            if _col_name not in _existing_cols:
                _conn.execute(text(f"ALTER TABLE {_table} ADD COLUMN {_col_name} {_col_def}"))
                _conn.commit()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Auth routes ---

def user_out(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email, name=user.name, phone=user.phone)

@app.post("/api/auth/signup", response_model=TokenResponse)
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    user = User(email=request.email, hashed_password=hash_password(request.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(token=token, user=user_out(user))

@app.post("/api/auth/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email).first()
    # user.hashed_password is None for accounts created via Google sign-in — verify_password
    # would crash on a None hash, so treat "no password set" the same as "wrong password".
    if not user or not user.hashed_password or not verify_password(request.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    token = create_access_token(user.id)
    return TokenResponse(token=token, user=user_out(user))

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")

@app.post("/api/auth/google", response_model=TokenResponse)
def google_auth(request: GoogleAuthRequest, db: Session = Depends(get_db)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Google sign-in is not configured")

    try:
        idinfo = google_id_token.verify_oauth2_token(
            request.token, google_auth_requests.Request(), GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google sign-in token")

    email = idinfo.get("email")
    if not email or not idinfo.get("email_verified"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account has no verified email")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        # hashed_password stays None — this account can only ever sign in via Google
        # unless the user later sets a password from Settings.
        user = User(email=email, name=idinfo.get("name"))
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(token=token, user=user_out(user))

@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user_out(user)

@app.patch("/api/auth/me", response_model=UserOut)
def update_profile(
    request: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if request.email is not None and request.email != user.email:
        existing = db.query(User).filter(User.email == request.email).first()
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
        user.email = request.email

    if request.name is not None:
        user.name = request.name.strip() or None
    if request.phone is not None:
        user.phone = request.phone.strip() or None

    db.commit()
    db.refresh(user)
    return user_out(user)

@app.post("/api/auth/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    request: PasswordChangeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(request.currentPassword, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")
    if len(request.newPassword) < 6:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "New password must be at least 6 characters")

    user.hashed_password = hash_password(request.newPassword)
    db.commit()

# --- Saved trip routes ---

@app.post("/api/trips", response_model=TripSummary)
def save_trip(
    request: TripSaveRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip_data = request.trip.model_dump()
    trip = Trip(
        user_id=user.id,
        name=request.trip.name,
        destination=request.trip.destination,
        cover_image=request.trip.coverImage,
        days_count=len(request.trip.days),
        budget=request.trip.budget,
        total_cost=request.trip.totalCost,
        notes=request.notes,
        data=trip_data,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    return TripSummary(
        id=trip.id,
        name=trip.name,
        destination=trip.destination,
        coverImage=trip.cover_image,
        daysCount=trip.days_count,
        budget=trip.budget,
        totalCost=trip.total_cost,
        isPublic=trip.is_public,
        createdAt=trip.created_at.isoformat(),
    )

@app.put("/api/trips/{trip_id}", response_model=TripSummary)
def update_trip(
    trip_id: int,
    request: TripSaveRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-saving an already-saved trip (e.g. after editing notes) should overwrite that
    same row rather than create a duplicate — see save_trip, which is only for the
    first save."""
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user.id).first()
    if trip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")

    trip.name = request.trip.name
    trip.destination = request.trip.destination
    trip.cover_image = request.trip.coverImage
    trip.days_count = len(request.trip.days)
    trip.budget = request.trip.budget
    trip.total_cost = request.trip.totalCost
    trip.notes = request.notes
    trip.data = request.trip.model_dump()
    db.commit()
    db.refresh(trip)

    return TripSummary(
        id=trip.id,
        name=trip.name,
        destination=trip.destination,
        coverImage=trip.cover_image,
        daysCount=trip.days_count,
        budget=trip.budget,
        totalCost=trip.total_cost,
        isPublic=trip.is_public,
        createdAt=trip.created_at.isoformat(),
    )

@app.get("/api/trips", response_model=List[TripSummary])
def list_trips(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    trips = (
        db.query(Trip)
        .filter(Trip.user_id == user.id)
        .order_by(Trip.created_at.desc())
        .all()
    )
    return [
        TripSummary(
            id=t.id,
            name=t.name,
            destination=t.destination,
            coverImage=t.cover_image,
            daysCount=t.days_count,
            budget=t.budget,
            totalCost=t.total_cost,
            isPublic=t.is_public,
            createdAt=t.created_at.isoformat(),
        )
        for t in trips
    ]

@app.get("/api/trips/{trip_id}", response_model=TripDetail)
def get_trip(trip_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user.id).first()
    if trip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")

    return TripDetail(
        id=trip.id,
        name=trip.name,
        destination=trip.destination,
        coverImage=trip.cover_image,
        daysCount=trip.days_count,
        budget=trip.budget,
        totalCost=trip.total_cost,
        isPublic=trip.is_public,
        createdAt=trip.created_at.isoformat(),
        notes=trip.notes or "",
        trip=trip.data,
    )

@app.patch("/api/trips/{trip_id}/visibility", response_model=TripSummary)
def update_trip_visibility(
    trip_id: int,
    request: TripVisibilityUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user.id).first()
    if trip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")

    trip.is_public = request.isPublic
    db.commit()
    db.refresh(trip)

    return TripSummary(
        id=trip.id,
        name=trip.name,
        destination=trip.destination,
        coverImage=trip.cover_image,
        daysCount=trip.days_count,
        budget=trip.budget,
        totalCost=trip.total_cost,
        isPublic=trip.is_public,
        createdAt=trip.created_at.isoformat(),
    )

@app.delete("/api/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(trip_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user.id).first()
    if trip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    db.delete(trip)
    db.commit()

# --- Group expense ledger ---

def _get_owned_trip(trip_id: int, user: User, db: Session) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.user_id == user.id).first()
    if trip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    return trip

def _expense_out(expense: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=expense.id,
        description=expense.description,
        amount=expense.amount,
        category=expense.category,
        paidByMemberId=expense.paid_by_member_id,
        paidByName=expense.paid_by.name,
        createdAt=expense.created_at.isoformat(),
        splits=[
            ExpenseSplitOut(memberId=s.member_id, memberName=s.member.name, shareAmount=s.share_amount)
            for s in expense.splits
        ],
    )

def _simplify_settlements(balances: List[BalanceOut]) -> List[SettlementOut]:
    """Greedily match the largest debtor against the largest creditor each round —
    the standard practical approach for minimizing the number of settle-up payments."""
    creditors = [{"id": b.memberId, "name": b.memberName, "amount": b.netBalance} for b in balances if b.netBalance > 0.01]
    debtors = [{"id": b.memberId, "name": b.memberName, "amount": -b.netBalance} for b in balances if b.netBalance < -0.01]
    creditors.sort(key=lambda c: -c["amount"])
    debtors.sort(key=lambda d: -d["amount"])

    settlements = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        pay = min(debtors[i]["amount"], creditors[j]["amount"])
        if pay > 0.01:
            settlements.append(SettlementOut(
                fromMemberId=debtors[i]["id"],
                fromMemberName=debtors[i]["name"],
                toMemberId=creditors[j]["id"],
                toMemberName=creditors[j]["name"],
                amount=round(pay, 2),
            ))
        debtors[i]["amount"] -= pay
        creditors[j]["amount"] -= pay
        if debtors[i]["amount"] <= 0.01:
            i += 1
        if creditors[j]["amount"] <= 0.01:
            j += 1
    return settlements

@app.get("/api/trips/{trip_id}/members", response_model=List[TripMemberOut])
def list_trip_members(trip_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    trip = _get_owned_trip(trip_id, user, db)
    return [TripMemberOut(id=m.id, name=m.name) for m in trip.members]

@app.post("/api/trips/{trip_id}/members", response_model=TripMemberOut)
def add_trip_member(
    trip_id: int,
    request: TripMemberCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _get_owned_trip(trip_id, user, db)
    name = request.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required")
    member = TripMember(trip_id=trip.id, name=name)
    db.add(member)
    db.commit()
    db.refresh(member)
    return TripMemberOut(id=member.id, name=member.name)

@app.delete("/api/trips/{trip_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip_member(
    trip_id: int,
    member_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _get_owned_trip(trip_id, user, db)
    member = db.query(TripMember).filter(TripMember.id == member_id, TripMember.trip_id == trip.id).first()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    involved = (
        db.query(Expense).filter(Expense.paid_by_member_id == member.id).first()
        or db.query(ExpenseSplit).filter(ExpenseSplit.member_id == member.id).first()
    )
    if involved:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This person is part of an existing expense — remove or reassign those expenses first",
        )
    db.delete(member)
    db.commit()

@app.get("/api/trips/{trip_id}/expenses", response_model=List[ExpenseOut])
def list_expenses(trip_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    trip = _get_owned_trip(trip_id, user, db)
    expenses = (
        db.query(Expense)
        .filter(Expense.trip_id == trip.id)
        .order_by(Expense.created_at.desc())
        .all()
    )
    return [_expense_out(e) for e in expenses]

def _validate_and_compute_shares(trip: Trip, request: ExpenseCreate) -> Dict[int, float]:
    if request.amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Amount must be greater than zero")
    if not request.splitBetweenMemberIds:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select at least one person to split with")

    member_ids = {m.id for m in trip.members}
    if request.paidByMemberId not in member_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payer is not a member of this trip")
    if not set(request.splitBetweenMemberIds) <= member_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Split includes someone who isn't a member of this trip")

    if request.splitType == "custom":
        if not request.customSplits:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Custom split amounts are required")
        if set(request.customSplits.keys()) != set(request.splitBetweenMemberIds):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Custom split amounts must match exactly the selected people")
        if abs(sum(request.customSplits.values()) - request.amount) > 0.01:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Custom split amounts must add up to the total")
        return dict(request.customSplits)

    n = len(request.splitBetweenMemberIds)
    base_share = round(request.amount / n, 2)
    shares = {mid: base_share for mid in request.splitBetweenMemberIds}
    # Equal division rarely divides evenly to the cent — hand the leftover to
    # whoever's first rather than silently losing/gaining a cent off the total.
    rounding_diff = round(request.amount - sum(shares.values()), 2)
    first_id = request.splitBetweenMemberIds[0]
    shares[first_id] = round(shares[first_id] + rounding_diff, 2)
    return shares

@app.post("/api/trips/{trip_id}/expenses", response_model=ExpenseOut)
def create_expense(
    trip_id: int,
    request: ExpenseCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _get_owned_trip(trip_id, user, db)
    shares = _validate_and_compute_shares(trip, request)

    expense = Expense(
        trip_id=trip.id,
        description=request.description.strip() or "Expense",
        amount=request.amount,
        category=request.category or "other",
        paid_by_member_id=request.paidByMemberId,
    )
    db.add(expense)
    db.flush()

    for member_id, share in shares.items():
        db.add(ExpenseSplit(expense_id=expense.id, member_id=member_id, share_amount=share))

    db.commit()
    db.refresh(expense)
    return _expense_out(expense)

@app.put("/api/trips/{trip_id}/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(
    trip_id: int,
    expense_id: int,
    request: ExpenseCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _get_owned_trip(trip_id, user, db)
    expense = db.query(Expense).filter(Expense.id == expense_id, Expense.trip_id == trip.id).first()
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")

    shares = _validate_and_compute_shares(trip, request)

    expense.description = request.description.strip() or "Expense"
    expense.amount = request.amount
    expense.category = request.category or "other"
    expense.paid_by_member_id = request.paidByMemberId

    db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense.id).delete()
    db.flush()
    for member_id, share in shares.items():
        db.add(ExpenseSplit(expense_id=expense.id, member_id=member_id, share_amount=share))

    db.commit()
    db.refresh(expense)
    return _expense_out(expense)

@app.delete("/api/trips/{trip_id}/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    trip_id: int,
    expense_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _get_owned_trip(trip_id, user, db)
    expense = db.query(Expense).filter(Expense.id == expense_id, Expense.trip_id == trip.id).first()
    if expense is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    db.delete(expense)
    db.commit()

@app.get("/api/trips/{trip_id}/balances", response_model=TripBalancesResponse)
def get_trip_balances(trip_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    trip = _get_owned_trip(trip_id, user, db)

    net: dict = {m.id: 0.0 for m in trip.members}
    names = {m.id: m.name for m in trip.members}

    for expense in trip.expenses:
        net[expense.paid_by_member_id] = net.get(expense.paid_by_member_id, 0.0) + expense.amount
        for split in expense.splits:
            net[split.member_id] = net.get(split.member_id, 0.0) - split.share_amount

    balances = [BalanceOut(memberId=mid, memberName=names[mid], netBalance=round(bal, 2)) for mid, bal in net.items()]
    settlements = _simplify_settlements(balances)

    return TripBalancesResponse(balances=balances, settlements=settlements)

# --- Community routes ---

def display_name(user: User) -> str:
    return user.name or user.email.split("@")[0]

def trip_card_images(trip: Trip) -> List[str]:
    images = [trip.cover_image]
    recs = (trip.data or {}).get("recommendations", [])
    for rec in recs[:2]:
        img = rec.get("img")
        if img:
            images.append(img)
    return images

def build_trip_card(trip: Trip, db: Session, current_user_id: Optional[int]) -> CommunityTripCard:
    like_count = db.query(Like).filter(Like.trip_id == trip.id).count()
    comment_count = db.query(Comment).filter(Comment.trip_id == trip.id).count()
    liked_by_me = False
    saved_by_me = False
    if current_user_id is not None:
        liked_by_me = (
            db.query(Like)
            .filter(Like.trip_id == trip.id, Like.user_id == current_user_id)
            .first()
            is not None
        )
        saved_by_me = (
            db.query(SavedTrip)
            .filter(SavedTrip.trip_id == trip.id, SavedTrip.user_id == current_user_id)
            .first()
            is not None
        )

    return CommunityTripCard(
        id=trip.id,
        name=trip.name,
        destination=trip.destination,
        images=trip_card_images(trip),
        ownerId=trip.user_id,
        ownerName=display_name(trip.owner),
        likeCount=like_count,
        commentCount=comment_count,
        likedByMe=liked_by_me,
        savedByMe=saved_by_me,
        createdAt=trip.created_at.isoformat(),
    )

@app.get("/api/community/feed", response_model=List[CommunityTripCard])
def get_community_feed(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    trips = (
        db.query(Trip)
        .filter(Trip.is_public == True)  # noqa: E712
        .order_by(Trip.created_at.desc())
        .limit(30)
        .all()
    )
    current_user_id = user.id if user else None
    return [build_trip_card(t, db, current_user_id) for t in trips]

@app.get("/api/community/trips/{trip_id}", response_model=CommunityTripDetail)
def get_community_trip(
    trip_id: int,
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.is_public == True).first()  # noqa: E712
    if trip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")

    current_user_id = user.id if user else None
    card = build_trip_card(trip, db, current_user_id)

    return CommunityTripDetail(
        id=trip.id,
        name=trip.name,
        destination=trip.destination,
        daysCount=trip.days_count,
        budget=trip.budget,
        totalCost=trip.total_cost,
        ownerId=card.ownerId,
        ownerName=card.ownerName,
        likeCount=card.likeCount,
        commentCount=card.commentCount,
        likedByMe=card.likedByMe,
        savedByMe=card.savedByMe,
        createdAt=card.createdAt,
        trip=trip.data,
    )

def _require_public_trip(trip_id: int, db: Session) -> Trip:
    trip = db.query(Trip).filter(Trip.id == trip_id, Trip.is_public == True).first()  # noqa: E712
    if trip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    return trip

@app.post("/api/community/trips/{trip_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def like_trip(trip_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_public_trip(trip_id, db)
    exists = db.query(Like).filter(Like.trip_id == trip_id, Like.user_id == user.id).first()
    if not exists:
        db.add(Like(trip_id=trip_id, user_id=user.id))
        db.commit()

@app.delete("/api/community/trips/{trip_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def unlike_trip(trip_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    like = db.query(Like).filter(Like.trip_id == trip_id, Like.user_id == user.id).first()
    if like:
        db.delete(like)
        db.commit()

@app.post("/api/community/trips/{trip_id}/save", status_code=status.HTTP_204_NO_CONTENT)
def bookmark_trip(trip_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_public_trip(trip_id, db)
    exists = db.query(SavedTrip).filter(SavedTrip.trip_id == trip_id, SavedTrip.user_id == user.id).first()
    if not exists:
        db.add(SavedTrip(trip_id=trip_id, user_id=user.id))
        db.commit()

@app.delete("/api/community/trips/{trip_id}/save", status_code=status.HTTP_204_NO_CONTENT)
def unbookmark_trip(trip_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bookmark = db.query(SavedTrip).filter(SavedTrip.trip_id == trip_id, SavedTrip.user_id == user.id).first()
    if bookmark:
        db.delete(bookmark)
        db.commit()

@app.get("/api/community/trips/{trip_id}/comments", response_model=List[CommentOut])
def list_comments(trip_id: int, db: Session = Depends(get_db)):
    _require_public_trip(trip_id, db)
    comments = (
        db.query(Comment)
        .filter(Comment.trip_id == trip_id)
        .order_by(Comment.created_at.asc())
        .all()
    )
    return [
        CommentOut(
            id=c.id,
            body=c.body,
            authorName=display_name(c.author),
            createdAt=c.created_at.isoformat(),
        )
        for c in comments
    ]

@app.post("/api/community/trips/{trip_id}/comments", response_model=CommentOut)
def add_comment(
    trip_id: int,
    request: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_public_trip(trip_id, db)
    body = request.body.strip()
    if not body:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Comment can't be empty")

    comment = Comment(trip_id=trip_id, user_id=user.id, body=body)
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return CommentOut(
        id=comment.id,
        body=comment.body,
        authorName=display_name(user),
        createdAt=comment.created_at.isoformat(),
    )

@app.get("/api/community/trending", response_model=List[TrendingDestination])
def get_trending_destinations(db: Session = Depends(get_db)):
    public_trips = db.query(Trip).filter(Trip.is_public == True).all()  # noqa: E712

    counts: dict[str, int] = {}
    images: dict[str, str] = {}
    for t in public_trips:
        counts[t.destination] = counts.get(t.destination, 0) + 1
        images.setdefault(t.destination, t.cover_image)

    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:8]
    return [
        TrendingDestination(destination=dest, tripCount=count, image=images[dest])
        for dest, count in ranked
    ]

@app.get("/api/community/contributors", response_model=List[ContributorOut])
def get_top_contributors(db: Session = Depends(get_db)):
    public_trips = db.query(Trip).filter(Trip.is_public == True).all()  # noqa: E712

    counts: dict[int, int] = {}
    for t in public_trips:
        counts[t.user_id] = counts.get(t.user_id, 0) + 1

    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:5]
    result = []
    for user_id, count in ranked:
        owner = db.query(User).filter(User.id == user_id).first()
        if owner:
            result.append(ContributorOut(name=display_name(owner), tripCount=count))
    return result

@app.get("/api/community/stats", response_model=AppStats)
def get_app_stats(db: Session = Depends(get_db)):
    all_trips = db.query(Trip).all()
    return AppStats(
        tripsPlanned=len(all_trips),
        destinationsPlanned=len({t.destination for t in all_trips}),
        likesGiven=db.query(Like).count(),
        commentsPosted=db.query(Comment).count(),
    )

# --- Trip generation (Gemini) ---

WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php"
WIKIPEDIA_HEADERS = {"User-Agent": "travel-planner-app/1.0 (contact: chaitanyanalam6@gmail.com)"}

NON_PHOTO_KEYWORDS = (
    ".svg",
    "locator",
    "location_map",
    "_map_",
    "marker",
    "flag_of",
    "coat_of_arms",
    "seal_of",
    ".gif",
    "_aster",  # NASA ASTER satellite imagery — real but not a scenic ground photo
    "iss0",  # ISS-0xx: International Space Station orbital photos (e.g. "Bora_Bora_ISS006.jpg")
    "iss-",  # ISS-45, ISS-32, etc. — same, alternate filename pattern
)

def _looks_like_non_photo(url: str) -> bool:
    lowered = url.lower()
    return any(keyword in lowered for keyword in NON_PHOTO_KEYWORDS)

# Words too generic to count as evidence a Wikipedia hit is actually about our
# query (e.g. "Hotel Check-in" sharing "hotel" with an unrelated article titled
# "Hotel California" proves nothing).
_IMAGE_MATCH_STOPWORDS = {
    "hotel", "near", "tour", "check", "stay", "trip", "visit", "local", "city",
    "travel", "airport", "station", "restaurant", "cafe", "day", "morning",
    "afternoon", "evening", "arrival", "departure", "transfer",
    # Generic place-type words (square/street/etc, in several languages common in
    # travel itineraries) match across completely unrelated locations — e.g. every
    # "Piazza ___" in Rome shares "piazza", so it proves nothing on its own.
    "piazza", "via", "viale", "corso", "square", "plaza", "street", "avenue",
    "boulevard", "road", "rue", "platz", "strasse", "place",
    # Generic building/landmark-type words repeat across countless unrelated
    # places (every city has a "basilica" and a "museum"), so on their own they
    # prove nothing — e.g. "St. Peter's Basilica" once matched "St Mark's
    # Basilica" in Venice, and "Vatican Museums" once matched the unrelated
    # "Capitoline Museums", purely on these shared generic words.
    "basilica", "cathedral", "church", "chapel", "temple", "museum", "museums",
    "palace", "castle", "tower", "bridge", "gate", "garden", "gardens",
    "market", "entrance", "dining", "area", "breakfast", "lunch", "dinner",
}

def _strip_accents(text: str) -> str:
    """"Reykjavík" -> "Reykjavik", "Zürich" -> "Zurich". Without this, the ASCII-only
    word regex below truncates any accented word at the first non-ASCII character
    ("Reykjavík" -> just "Reykjav"), so a plain-ASCII query for the same place shares
    no words with the (correct!) accented title and gets wrongly rejected."""
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))

def _is_relevant_match(relevance_terms: str, page_title: str) -> bool:
    """Wikipedia's full-text search happily returns confidently-wrong results for
    generic phrases (an activity called "Arrival & Hotel Check-in" once matched a
    war film because both mention "arrival"; a vague location like "Rome city center"
    matched the generic "Rome" article and slapped its Trevi Fountain lead photo onto
    a hotel-stay activity). Require the matched article's title to share at least one
    substantive word with the specific thing we're actually looking for — otherwise
    we'd rather show no image than a wrong or misleadingly-generic one."""
    query_words = {w.lower() for w in re.findall(r"[A-Za-z]{4,}", _strip_accents(relevance_terms))} - _IMAGE_MATCH_STOPWORDS
    if not query_words:
        return False
    title_words = {w.lower() for w in re.findall(r"[A-Za-z]{4,}", _strip_accents(page_title))}
    return bool(query_words & title_words)

async def fetch_real_image(
    client: httpx.AsyncClient, query: str, relevance_terms: Optional[str] = None, thumbsize: int = 800
) -> Optional[str]:
    """Look up a real, working thumbnail for a place via Wikipedia's fuzzy search —
    exact-title lookups fail for anything that isn't a literal article title
    (e.g. "Kovvur, Andhra Pradesh, India"), so we search instead of guessing the title.

    `relevance_terms` (defaults to `query`) is what the matched article's title must
    overlap with. Pass the specific place name here (not the full "X, destination"
    search string) when the destination's own name being a coincidental match
    shouldn't be enough — see `_is_relevant_match`.

    `thumbsize` is the requested pixel width. The default (800) is plenty for small
    cards, but a full-bleed hero background stretched across a wide desktop viewport
    needs a much larger source image or it visibly pixelates — callers rendering large
    should pass a bigger value."""
    if relevance_terms is None:
        relevance_terms = query
    try:
        resp = await client.get(
            WIKIPEDIA_API_URL,
            params={
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "generator": "search",
                "gsrsearch": query,
                "gsrlimit": 6,
                "gsrnamespace": 0,
                "prop": "pageimages",
                "piprop": "thumbnail",
                "pithumbsize": thumbsize,
            },
            headers=WIKIPEDIA_HEADERS,
            timeout=8.0,
        )
        if resp.status_code == 200:
            pages = resp.json().get("query", {}).get("pages", [])
            exact_candidates = []
            candidates = []
            relevance_norm = _strip_accents(relevance_terms.strip().lower())
            for page in pages:
                thumbnail = page.get("thumbnail") or {}
                source = thumbnail.get("source")
                if not source or _looks_like_non_photo(source):
                    continue
                title = page.get("title", "")
                # An exact title match (e.g. relevance_terms "Palatine Hill" landing on
                # the actual "Palatine Hill" article) beats generic word-overlap ranking
                # order every time — an earlier same-generic-word hit like "Aventine
                # Hill" ("hill" overlaps too) is a different landmark entirely. But it
                # still has to clear the same JPG-preference bar below (a real article's
                # *current* lead image can occasionally be something odd and off-topic,
                # e.g. a WEBP news photo instead of a scenic JPG), so collect it as a
                # top-priority candidate rather than returning it unconditionally.
                if _strip_accents(title.strip().lower()) == relevance_norm:
                    exact_candidates.append(source)
                # Search hits are ranked by relevance, so pages[0] is usually the best
                # match — but locator maps/flags/coats of arms are near-always SVGs (or
                # SVG-rendered thumbnails) with these keywords, never real photos, so
                # skip those and fall through to the next-best result. Also reject hits
                # whose article title has no real word overlap with the query — Wikipedia's
                # fuzzy search sometimes "matches" on nothing but common filler words.
                elif _is_relevant_match(relevance_terms, title):
                    candidates.append(source)

            # Real photographs on Commons are almost always JPG; maps, diagrams, and
            # graphics that slip past the keyword filter are almost always PNG (often
            # with transparency, which looks broken as a full-bleed background). Prefer
            # a JPG candidate when one exists, in relevance order — exact title matches
            # first, then generic word-overlap matches.
            for source in (exact_candidates + candidates):
                if source.lower().endswith((".jpg", ".jpeg")):
                    return source
            if exact_candidates:
                return exact_candidates[0]
            if candidates:
                return candidates[0]
    except httpx.HTTPError:
        pass
    return None

async def attach_real_images(trip: dict, destination: str) -> None:
    # Same concurrency cap as attach_activity_images/get_inspiration — without it,
    # this batch plus the activity-image batch running alongside it can push Wikipedia
    # request concurrency high enough that some quietly time out and come back blank.
    semaphore = asyncio.Semaphore(5)

    async def fetch_one(client: httpx.AsyncClient, query: str, thumbsize: int = 800) -> Optional[str]:
        async with semaphore:
            return await fetch_real_image(client, query, thumbsize=thumbsize)

    async with httpx.AsyncClient() as client:
        # The cover image is shown as a large full-bleed hero (workspace overview +
        # hero carousel), so it needs a much higher-res source than the small
        # recommendation cards to avoid looking pixelated when stretched to fit.
        tasks = [fetch_one(client, destination, thumbsize=1920)]
        for rec in trip.get("recommendations", []):
            tasks.append(fetch_one(client, f"{rec['name']} {destination}"))

        results = await asyncio.gather(*tasks)

    cover_image = results[0]
    if cover_image:
        trip["coverImage"] = cover_image

    for rec, image in zip(trip.get("recommendations", []), results[1:]):
        if image:
            rec["img"] = image

SEASONAL_DESTINATIONS = {
    "winter": [
        {"name": "Aspen, Colorado", "blurb": "World-class ski slopes and cozy mountain lodges"},
        {"name": "Zermatt, Switzerland", "blurb": "Car-free alpine village under the Matterhorn"},
        {"name": "Reykjavik, Iceland", "blurb": "Northern lights and geothermal hot springs"},
        {"name": "Sapporo, Japan", "blurb": "Powder snow, hot springs, and winter festivals"},
        {"name": "Rovaniemi, Finland", "blurb": "Arctic Circle magic and reindeer sleigh rides"},
        {"name": "Queenstown, New Zealand", "blurb": "Southern-hemisphere ski capital"},
        {"name": "Banff, Canada", "blurb": "Frozen lakes ringed by the Rockies"},
        {"name": "Hokkaido, Japan", "blurb": "Legendary powder and steaming onsen"},
    ],
    "spring": [
        {"name": "Kyoto, Japan", "blurb": "Cherry blossoms over centuries-old temples"},
        {"name": "Amsterdam, Netherlands", "blurb": "Canals lined with blooming tulip markets"},
        {"name": "Provence, France", "blurb": "Lavender fields and sun-soaked villages"},
        {"name": "Washington, D.C.", "blurb": "Cherry blossoms around the National Mall"},
        {"name": "Cape Town, South Africa", "blurb": "Mild weather, table mountain, and coastline"},
        {"name": "Marrakech, Morocco", "blurb": "Vibrant souks and desert-edge gardens"},
        {"name": "Lisbon, Portugal", "blurb": "Pastel streets and mild coastal breezes"},
        {"name": "Seoul, South Korea", "blurb": "Cherry blossoms along the Han River"},
    ],
    "summer": [
        {"name": "Santorini, Greece", "blurb": "Whitewashed cliffs over the Aegean Sea"},
        {"name": "Ubud, Bali", "blurb": "Rice terraces, surf, and island temples"},
        {"name": "Amalfi Coast, Italy", "blurb": "Cliffside towns and turquoise water"},
        {"name": "Barcelona, Spain", "blurb": "Gaudi architecture and beachfront energy"},
        {"name": "Dubrovnik, Croatia", "blurb": "Adriatic old town within medieval walls"},
        {"name": "Vancouver, Canada", "blurb": "Mountains, coastline, and mild summer days"},
        {"name": "Lake Como, Italy", "blurb": "Grand villas along alpine-blue water"},
        {"name": "Reykjavik, Iceland", "blurb": "Midnight sun and dramatic coastline"},
    ],
    "autumn": [
        {"name": "Quebec City, Canada", "blurb": "Cobblestone streets under fall foliage"},
        {"name": "Tuscany, Italy", "blurb": "Golden vineyards and harvest season"},
        {"name": "Bavaria, Germany", "blurb": "Oktoberfest and fairy-tale castles"},
        {"name": "Seoul, South Korea", "blurb": "Crisp air, palaces, and autumn leaves"},
        {"name": "Vermont, USA", "blurb": "Iconic New England fall colors"},
        {"name": "Patagonia, Argentina", "blurb": "Spring-into-summer trekking season"},
        {"name": "Kyoto, Japan", "blurb": "Maple leaves over ancient temples"},
        {"name": "Cape Town, South Africa", "blurb": "Spring blooms in the southern hemisphere"},
    ],
}

def season_for_month(month: int) -> str:
    if month in (12, 1, 2):
        return "winter"
    if month in (3, 4, 5):
        return "spring"
    if month in (6, 7, 8):
        return "summer"
    return "autumn"

@app.get("/api/inspiration")
async def get_inspiration():
    season = season_for_month(datetime.now().month)
    destinations = SEASONAL_DESTINATIONS[season]

    # Firing all 8 destinations' image requests at once caused some to time out under
    # the concurrent burst and silently come back blank (worse now that these request
    # large 1920px thumbnails) — same fix as attach_activity_images: cap concurrency.
    semaphore = asyncio.Semaphore(5)

    async def fetch_one(client: httpx.AsyncClient, name: str) -> Optional[str]:
        async with semaphore:
            return await fetch_real_image(client, name, thumbsize=1920)

    async with httpx.AsyncClient() as client:
        # These double as the plan page's full-bleed hero background (the first
        # destination) and the popular-destinations carousel cards — request
        # high-res source images so the hero doesn't look pixelated when stretched
        # across a wide viewport.
        images = await asyncio.gather(*[fetch_one(client, d["name"]) for d in destinations])

    return {
        "season": season,
        "destinations": [
            {"name": d["name"], "blurb": d["blurb"], "img": img or ""}
            for d, img in zip(destinations, images)
        ],
    }

# A curated pool of famous, reliably well-photographed destinations for the plan
# page's hero banner — separate from the seasonal inspiration carousel so the hero
# isn't stuck showing the same single photo every visit. Each of these is well-known
# enough that Wikipedia's search reliably finds a real, high-quality photo for it.
HERO_DESTINATIONS = [
    # Santorini deliberately excluded — its real photo is a hazy, pale-gold sunset
    # shot that reads as washed-out once the readability overlay is layered on top
    # of a full-bleed hero (fine as a small carousel card, not as the big background).
    "Machu Picchu, Peru",
    "Kyoto, Japan",
    "Banff National Park, Canada",
    "Petra, Jordan",
    "Zermatt, Switzerland",
    "Dubrovnik, Croatia",
    "Great Barrier Reef, Australia",
    "Amalfi Coast, Italy",
    "Vancouver, Canada",
    "Lake Como, Italy",
    "Reykjavik, Iceland",
    "Uluwatu Temple, Bali",
]

_HERO_IMAGE_CACHE_TTL = timedelta(hours=24)
_hero_image_cache: dict = {}

@app.get("/api/hero-image")
async def get_hero_image():
    now = datetime.now(timezone.utc)
    choices = random.sample(HERO_DESTINATIONS, len(HERO_DESTINATIONS))

    # Serve straight from cache if any of the sampled destinations already resolved
    # a photo recently — this is what makes repeat page loads near-instant instead
    # of paying a fresh Wikipedia round-trip (sometimes several, if a candidate's
    # top result fails the relevance check) on every single visit.
    for destination in choices:
        cached = _hero_image_cache.get(destination)
        if cached and now - cached["fetched_at"] < _HERO_IMAGE_CACHE_TTL:
            return {"destination": destination, "image": cached["image"]}

    async with httpx.AsyncClient() as client:
        for destination in choices[:3]:
            image = await fetch_real_image(client, destination, thumbsize=1920)
            if image:
                _hero_image_cache[destination] = {"image": image, "fetched_at": now}
                return {"destination": destination, "image": image}
    return {"destination": None, "image": None}

@app.get("/api/reverse-geocode")
async def reverse_geocode(lat: float, lon: float):
    """Turn browser geolocation coordinates into a human-readable city name, so the
    Overview page can pre-fill "flights from <your city>" without the user typing it in.
    Routed through the backend (rather than called from the browser) so we can send
    Nominatim's requested identifying User-Agent header, which fetch() can't set."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "json", "zoom": 10},
                headers=WIKIPEDIA_HEADERS,
                timeout=5.0,
            )
            if resp.status_code == 200:
                address = resp.json().get("address", {})
                city = (
                    address.get("city")
                    or address.get("town")
                    or address.get("village")
                    or address.get("county")
                )
                label = ", ".join(part for part in [city, address.get("country")] if part)
                if label:
                    return {"city": label}
        except httpx.HTTPError:
            pass
    return {"city": None}

_WEATHER_CODE_INFO = {
    0: ("Clear sky", "☀️"),
    1: ("Mainly clear", "🌤️"),
    2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Fog", "🌫️"),
    48: ("Depositing rime fog", "🌫️"),
    51: ("Light drizzle", "🌦️"),
    53: ("Moderate drizzle", "🌦️"),
    55: ("Dense drizzle", "🌧️"),
    56: ("Light freezing drizzle", "🌧️"),
    57: ("Dense freezing drizzle", "🌧️"),
    61: ("Slight rain", "🌦️"),
    63: ("Moderate rain", "🌧️"),
    65: ("Heavy rain", "🌧️"),
    66: ("Light freezing rain", "🌧️"),
    67: ("Heavy freezing rain", "🌧️"),
    71: ("Slight snow", "🌨️"),
    73: ("Moderate snow", "🌨️"),
    75: ("Heavy snow", "❄️"),
    77: ("Snow grains", "❄️"),
    80: ("Slight rain showers", "🌦️"),
    81: ("Moderate rain showers", "🌧️"),
    82: ("Violent rain showers", "⛈️"),
    85: ("Slight snow showers", "🌨️"),
    86: ("Heavy snow showers", "❄️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm with slight hail", "⛈️"),
    99: ("Thunderstorm with heavy hail", "⛈️"),
}

def _weather_label(code) -> tuple:
    return _WEATHER_CODE_INFO.get(code, ("Unknown", "🌡️"))

@app.get("/api/weather")
async def get_weather(lat: float, lon: float):
    """Live forecast via Open-Meteo — free, no API key required."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,weather_code",
                    "daily": "temperature_2m_max,temperature_2m_min,weather_code",
                    "timezone": "auto",
                    "forecast_days": 4,
                },
                timeout=6.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                current = data.get("current", {})
                daily = data.get("daily", {})
                current_label, current_icon = _weather_label(current.get("weather_code"))

                daily_codes = daily.get("weather_code", [])
                daily_highs = daily.get("temperature_2m_max", [])
                daily_lows = daily.get("temperature_2m_min", [])
                days = []
                for i, date in enumerate(daily.get("time", [])):
                    label, icon = _weather_label(daily_codes[i] if i < len(daily_codes) else None)
                    days.append({
                        "date": date,
                        "high": daily_highs[i] if i < len(daily_highs) else None,
                        "low": daily_lows[i] if i < len(daily_lows) else None,
                        "icon": icon,
                        "label": label,
                    })

                return {
                    "available": True,
                    "currentTempC": current.get("temperature_2m"),
                    "currentLabel": current_label,
                    "currentIcon": current_icon,
                    "daily": days,
                }
        except httpx.HTTPError:
            pass
    return {"available": False}

SUPPORTED_CURRENCIES = ["EUR", "GBP", "INR", "JPY", "AUD", "CAD"]
_EXCHANGE_RATE_CACHE_TTL = timedelta(hours=6)
_exchange_rate_cache: dict = {"rates": None, "fetched_at": None}

@app.get("/api/exchange-rates")
async def get_exchange_rates():
    """Live USD conversion rates (European Central Bank data via Frankfurter, free,
    no API key). Cached in memory for a few hours — rates don't move fast enough to
    justify hitting the upstream API on every page load."""
    now = datetime.now(timezone.utc)
    cached_at = _exchange_rate_cache["fetched_at"]
    if _exchange_rate_cache["rates"] and cached_at and now - cached_at < _EXCHANGE_RATE_CACHE_TTL:
        return {"base": "USD", "rates": _exchange_rate_cache["rates"]}

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                "https://api.frankfurter.dev/v1/latest",
                params={"from": "USD", "to": ",".join(SUPPORTED_CURRENCIES)},
                timeout=6.0,
            )
            if resp.status_code == 200:
                rates = resp.json().get("rates", {})
                rates["USD"] = 1.0
                _exchange_rate_cache["rates"] = rates
                _exchange_rate_cache["fetched_at"] = now
                return {"base": "USD", "rates": rates}
        except httpx.HTTPError:
            pass

    # Upstream failed — serve stale cached rates rather than nothing if we have them.
    if _exchange_rate_cache["rates"]:
        return {"base": "USD", "rates": _exchange_rate_cache["rates"]}
    return {"base": "USD", "rates": {"USD": 1.0}}

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

async def geocode_location(client: httpx.AsyncClient, query: str) -> Optional[tuple]:
    """Look up the real coordinates of an address via Nominatim (OpenStreetMap's
    free geocoder — same provider as our map tiles). Gemini's own lat/lon guesses
    are frequently wrong or duplicated across activities; this replaces them with
    coordinates actually resolved from the activity's address text."""
    try:
        resp = await client.get(
            NOMINATIM_URL,
            params={"q": query, "format": "json", "limit": 1},
            headers=WIKIPEDIA_HEADERS,
            timeout=5.0,
        )
        if resp.status_code == 200:
            results = resp.json()
            if results:
                return float(results[0]["lat"]), float(results[0]["lon"])
    except (httpx.HTTPError, ValueError, KeyError):
        pass
    return None

def _degrees_apart(a: tuple, b: tuple) -> float:
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))

def _haversine_km(a: tuple, b: tuple) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))

async def geocode_activities(trip: dict, destination: str) -> None:
    """Nominatim's usage policy caps the free public instance at 1 request/second
    with no concurrency, so these run strictly sequentially."""
    async with httpx.AsyncClient() as client:
        # Vague location text (e.g. "Near Hotel") can make Nominatim match some
        # unrelated place on the other side of the world. Geocode the destination
        # itself first as a sanity anchor, and discard any activity result that
        # lands implausibly far from it (~2 degrees is roughly a large metro area).
        anchor = await geocode_location(client, destination)
        if anchor:
            trip["destinationLat"], trip["destinationLon"] = anchor
        await asyncio.sleep(1.0)

        for day in trip.get("days", []):
            for activity in day.get("activities", []):
                location = activity.get("location", "").strip()
                if location:
                    coords = await geocode_location(client, f"{location}, {destination}")
                    if coords is None:
                        coords = await geocode_location(client, location)
                    if coords and (anchor is None or _degrees_apart(coords, anchor) <= 2):
                        activity["lat"], activity["lon"] = coords
                    await asyncio.sleep(1.0)

                # A geocoded pin can be perfectly accurate and still be a genuinely
                # different town/city than the trip's destination (e.g. a real day-trip
                # suggestion) — that's not a bug, but showing it on the map with zero
                # explanation reads as one. Surface the distance so the UI can label it
                # instead of silently placing an unexplained pin far from home base.
                if anchor:
                    km = _haversine_km((activity["lat"], activity["lon"]), anchor)
                    activity["distanceFromBaseKm"] = round(km, 1)

_VAGUE_LOCATION_PREFIXES = ("near ", "close to ", "next to ", "around ")
_GENERIC_LOCATION_WORDS = {
    "city", "centre", "center", "downtown", "area", "district", "neighborhood",
    "neighbourhood", "region", "central",
}

def _is_vague_location(location: str, destination: str) -> bool:
    """A location like "Rome city center" carries no information beyond the
    destination itself — searching for it just re-finds the generic destination
    article (see `_is_relevant_match`), so there's no specific subject to photograph."""
    location = location.strip().lower()
    if not location or location.startswith(_VAGUE_LOCATION_PREFIXES):
        return True
    dest_words = {w.lower() for w in re.findall(r"[A-Za-z]{3,}", destination)}
    loc_words = {w.lower() for w in re.findall(r"[A-Za-z]{3,}", location)}
    return not (loc_words - dest_words - _GENERIC_LOCATION_WORDS)

def _place_name(activity: dict) -> str:
    """Gemini's `location` field is sometimes a short place name ("Colosseum") and
    sometimes a full postal address ("Colosseum, Piazza del Colosseo, 1, 00184 RM,
    Italy"). Wikipedia's search ranking gets thrown off by postal codes and address
    numbers, so use just the first comma-segment — in practice always the actual
    venue/landmark name Gemini meant, regardless of how much address detail follows."""
    raw = activity.get("location") or activity["title"]
    return raw.split(",")[0].strip()

def _has_photographable_location(activity: dict, destination: str) -> bool:
    # Transport/logistics activities ("Taxi to hotel") have no single coherent photo
    # subject. And a location like "Near Colosseum" describes an unnamed cafe relative
    # to a landmark — fetching a "Colosseum" photo for it would misrepresent a breakfast
    # stop as the landmark itself, so we skip rather than show a misleading image.
    if activity.get("type", "").lower() == "transport":
        return False
    return not _is_vague_location(_place_name(activity), destination)

async def attach_activity_images(trip: dict, destination: str) -> None:
    activities = [
        a
        for day in trip.get("days", [])
        for a in day.get("activities", [])
        if _has_photographable_location(a, destination)
    ]
    # A multi-day trip can have 20+ activities; firing that many concurrent Wikipedia
    # requests at once caused some to time out and silently fall back to no image, so
    # cap how many are in flight together.
    semaphore = asyncio.Semaphore(5)

    async def fetch_one(client: httpx.AsyncClient, activity: dict) -> Optional[str]:
        async with semaphore:
            # Include the (often-English) title alongside the (often-Italian/
            # local-language) place name to help Wikipedia's ranking prefer the
            # actual landmark article over same-named-but-different things (e.g.
            # "Piazza del Colosseo" alone once matched the Colosseo metro station
            # instead of the Colosseum itself).
            return await fetch_real_image(
                client,
                f"{_place_name(activity)} {activity['title']}, {destination}",
                relevance_terms=_place_name(activity),
            )

    async with httpx.AsyncClient() as client:
        images = await asyncio.gather(*[fetch_one(client, a) for a in activities])
    for activity, image in zip(activities, images):
        activity["image"] = image

def recompute_costs(trip: dict, budget: float) -> None:
    """Trust the LLM's per-activity costs, but sum them ourselves rather than
    trust its arithmetic for day/trip totals."""
    total_cost = 0.0
    for day in trip.get("days", []):
        day_cost = sum(activity.get("cost", 0) or 0 for activity in day.get("activities", []))
        day["totalCost"] = round(day_cost, 2)
        total_cost += day_cost

    trip["totalCost"] = round(total_cost, 2)
    trip["budget"] = budget

@app.post("/api/generate-trip", response_model=TripPlanResponse)
async def generate_trip(request: TripRequest):
    client = genai.Client()

    theme_lines = ""
    if request.dayThemes:
        labeled = [
            f"Day {i + 1}: {theme.strip()}"
            for i, theme in enumerate(request.dayThemes)
            if theme and theme.strip()
        ]
        if labeled:
            theme_lines = (
                "The traveler has requested a specific vibe for some days — honor these themes "
                "strictly when choosing activities for that day, and set each day's `theme` field "
                "to match:\n    " + "\n    ".join(labeled)
            )

    traveler_lines = []
    if request.tripType:
        traveler_lines.append(f"Trip type: {request.tripType} — tailor activity pacing and picks to suit this.")
    if request.travelers and request.travelers > 1:
        traveler_lines.append(f"There are {request.travelers} travelers — favor activities that work well for a group that size.")
    traveler_context = "\n    ".join(traveler_lines)

    prompt = f"""
    Create a highly detailed travel itinerary for a trip to: {request.destination} for {request.days} days.
    Provide popular landmark recommendations with Unsplash image URLs fitting the locations.
    Include exact latitude (lat) and longitude (lon) coordinates for every single activity and landmark.

    Plan this the way a knowledgeable LOCAL would guide a first-time visitor, not the way a
    generic "top 10 things to do" list would. Mix must-see iconic landmarks with authentic,
    traditional experiences a local would actually recommend — a neighborhood eatery, a
    traditional market, a custom or ritual worth witnessing, a spot locals go that isn't in
    every guidebook. Every meal, shop, or venue must be a specific, real, named place — never
    a vague placeholder like "a local restaurant" or "a nearby cafe". If you're not confident
    of an exact real establishment name for a given meal, name the specific neighborhood/market
    and the specific traditional dish instead, but always be concrete, never generic.

    For every activity, also fill the `details` field with 1-3 sentences of genuinely useful,
    specific context tailored to that activity's type — not a restatement of `notes`:
    - Meals: name the specific dish(es) worth ordering there and their typical price (e.g.
      "Try the mutton biryani, ~$4-6") — not just "try the local cuisine".
    - Paid tours/activities/rides (boat rides, shows, classes, etc.): typical price range and the
      different options/tiers usually available (e.g. group size, duration, or class options).
    - Landmarks/sightseeing: one non-obvious practical tip (best time to avoid crowds, what's
      easy to miss, ticket-booking advice).
    - Transport/logistics: leave `details` empty — there's nothing extra worth adding.

    The traveler's total budget for the whole trip is ${request.budget} USD. Estimate a realistic
    cost in USD for every single activity (meals, tickets, transport, etc.) via the `cost` field,
    and keep the sum of all activity costs at or below the total budget. Free activities should
    have a cost of 0.

    {theme_lines}
    If no theme is specified for a day, pick a sensible, varied theme yourself and describe it in
    that day's `theme` field (e.g. "Adventure", "Relaxation", "Culture & History", "Food & Nightlife").

    {traveler_context}

    Also fill the `toolkit` field with practical, destination-specific local knowledge —
    genuinely useful facts a first-time visitor to {request.destination} wouldn't know,
    not generic travel advice that could apply anywhere:
    - `localPayments`: how people actually pay day-to-day here in a few words (e.g. a
      dominant mobile payment system, whether cash is still king, typical card acceptance).
    - `survivalApps`: 3-5 real, specific app names locals actually use for ride-hailing,
      food delivery, or local transit in this destination (not generic examples).
    - `advisory`: one genuinely useful practical heads-up about this destination —
      typical climate/season patterns, a common tourist pitfall, or a cultural norm
      worth knowing. Do not invent or reference specific dates — this trip's exact
      travel dates aren't known.

    Return the data matching the requested JSON schema structure perfectly.
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=TripPlanResponse,
                temperature=0.7,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
    except genai_errors.ClientError as e:
        if e.code == 429:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "The trip-generation API is rate-limited right now (free-tier quota). Please wait a bit and try again.",
            )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Trip generation failed. Please try again.")
    except genai_errors.ServerError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The trip-generation API is temporarily unavailable. Please try again in a moment.")

    trip = json.loads(response.text)
    recompute_costs(trip, request.budget)

    # Geocoding is rate-limited to 1 req/sec and image-fetching hits a different
    # service entirely, so run them concurrently with each other.
    await asyncio.gather(
        geocode_activities(trip, request.destination),
        attach_activity_images(trip, request.destination),
        attach_real_images(trip, request.destination),
    )

    return trip

def _summarize_trip_for_assistant(trip: TripPlanResponse) -> str:
    """Condense the trip into plain text for the assistant prompt — cheaper and more
    digestible for the model than dumping the raw JSON structure."""
    lines = [
        f"Trip name: {trip.name}",
        f"Destination: {trip.destination}",
        f"Budget: ${trip.budget:.0f} (estimated total cost: ${trip.totalCost:.0f})",
    ]
    for day in trip.days:
        theme = f" — {day.theme}" if day.theme else ""
        lines.append(f"\n{day.label} ({day.date}){theme}:")
        for activity in day.activities:
            cost = f" (${activity.cost:.0f})" if activity.cost else ""
            lines.append(
                f"  - {activity.time} {activity.title} @ {activity.location}, "
                f"{activity.duration}{cost}: {activity.notes}"
            )
    return "\n".join(lines)

@app.post("/api/trip-assistant", response_model=AssistantResponse)
def trip_assistant(request: AssistantRequest):
    client = genai.Client()

    trip_summary = _summarize_trip_for_assistant(request.trip)
    history_lines = "\n".join(
        f"{'Traveler' if m.role == 'user' else 'Assistant'}: {m.content}"
        for m in request.history[-8:]
    )

    prompt = f"""
    You are a friendly, concise travel assistant helping a traveler with questions about
    the specific trip itinerary below. Answer using this itinerary and general travel
    knowledge only — if asked for real-time info you can't actually know (current prices,
    live availability, today's weather), say so plainly instead of guessing or making
    something up. Keep answers short (2-4 sentences) unless the question clearly needs
    more detail. If the question has nothing to do with this trip or travel, politely
    steer the conversation back to trip planning. Respond with only your answer text —
    no "Assistant:" prefix or role labels.

    TRIP ITINERARY:
    {trip_summary}

    {"CONVERSATION SO FAR:\n" + history_lines if history_lines else ""}

    Traveler's new question: {request.question}
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.4,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
    except genai_errors.ClientError as e:
        if e.code == 429:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "The assistant is rate-limited right now (free-tier quota). Please try again shortly.",
            )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The assistant couldn't respond. Please try again.")
    except genai_errors.ServerError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The assistant is temporarily unavailable. Please try again in a moment.")

    answer = (response.text or "").strip()
    answer = re.sub(r"^(assistant|ai)\s*:\s*", "", answer, flags=re.IGNORECASE)
    return AssistantResponse(answer=answer)

@app.post("/api/translate-voice", response_model=VoiceTranslateResponse)
async def translate_voice(audio: UploadFile = File(...), targetLanguage: str = Form(...)):
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No audio received")

    client = genai.Client()
    prompt = f"""
    You are a live speech translator for a traveler abroad. You'll be given a short audio
    clip of someone speaking, most likely a local person the traveler is talking to.

    1. Identify the language being spoken.
    2. Transcribe exactly what was said, in that original language.
    3. Translate it into {targetLanguage} for the traveler.

    Only transcribe speech you can actually make out. Never invent, guess, or fill in
    plausible-sounding content for audio that is silent, too quiet, cut off, or otherwise
    unclear — a wrong invented transcript is worse than admitting you couldn't hear it. If
    you are not genuinely confident in what was said, set "transcript" and "translation" to
    empty strings and "detectedLanguage" to "unknown" rather than guessing. Respond with
    only the JSON matching the requested schema — no extra commentary.
    """

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type=audio.content_type or "audio/webm"),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=VoiceTranslateResponse,
                temperature=0.2,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
    except genai_errors.ClientError as e:
        if e.code == 429:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Translation is rate-limited right now (free-tier quota). Please try again shortly.",
            )
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn't translate that audio. Please try again.")
    except genai_errors.ServerError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Translation is temporarily unavailable. Please try again in a moment.")

    return json.loads(response.text)
