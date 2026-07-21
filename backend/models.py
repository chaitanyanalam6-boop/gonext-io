from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from db import Base

def utcnow():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    trips = relationship("Trip", back_populates="owner", cascade="all, delete-orphan")

class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    cover_image = Column(String, nullable=False)
    days_count = Column(Integer, nullable=False)
    budget = Column(Float, nullable=False)
    total_cost = Column(Float, nullable=False)
    notes = Column(Text, default="")
    data = Column(JSON, nullable=False)
    is_public = Column(Boolean, default=False, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow)

    owner = relationship("User", back_populates="trips")
    likes = relationship("Like", back_populates="trip", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="trip", cascade="all, delete-orphan")
    members = relationship("TripMember", back_populates="trip", cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="trip", cascade="all, delete-orphan")

class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (UniqueConstraint("user_id", "trip_id", name="uq_like_user_trip"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow)

    trip = relationship("Trip", back_populates="likes")

class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    trip = relationship("Trip", back_populates="comments")
    author = relationship("User")

class TripMember(Base):
    """A person on the trip's expense ledger — a lightweight name, not a full user
    account, so splitting a bill doesn't require every traveler to sign up."""
    __tablename__ = "trip_members"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    trip = relationship("Trip", back_populates="members")
    splits = relationship("ExpenseSplit", back_populates="member", cascade="all, delete-orphan")
    expenses_paid = relationship("Expense", back_populates="paid_by", foreign_keys="Expense.paid_by_member_id")

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False, index=True)
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String, default="other", nullable=False)
    paid_by_member_id = Column(Integer, ForeignKey("trip_members.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    trip = relationship("Trip", back_populates="expenses")
    paid_by = relationship("TripMember", back_populates="expenses_paid", foreign_keys=[paid_by_member_id])
    splits = relationship("ExpenseSplit", back_populates="expense", cascade="all, delete-orphan")

class ExpenseSplit(Base):
    __tablename__ = "expense_splits"

    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("expenses.id"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("trip_members.id"), nullable=False, index=True)
    share_amount = Column(Float, nullable=False)

    expense = relationship("Expense", back_populates="splits")
    member = relationship("TripMember", back_populates="splits")

class SavedTrip(Base):
    """A bookmark: a user saving someone else's public trip to their own list."""
    __tablename__ = "saved_trips"
    __table_args__ = (UniqueConstraint("user_id", "trip_id", name="uq_bookmark_user_trip"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow)
