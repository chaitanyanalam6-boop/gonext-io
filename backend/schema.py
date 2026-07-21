from pydantic import BaseModel
from typing import List

# This is a single fun activity box
class Activity(BaseModel):
    time_block: str         # Like "9:00 AM - 11:00 AM"
    activity_name: str      # Like "Surfing at the Beach!"
    description: str       # What we will do there
    estimated_cost_inr: float

# This is a box for one whole day
class DayItinerary(BaseModel):
    day_number: int
    theme_tag: str          # Like "Adventure" or "Movie"
    activities: List[Activity]
    total_day_cost_inr: float

# This is the big master box for the whole trip!
class FullTripItinerary(BaseModel):
    destination: str
    total_budget_limit: float
    actual_calculated_cost: float
    days: List[DayItinerary]