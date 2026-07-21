# GoNext.io

An AI travel planner. Give it a destination, budget, trip length, and vibe — it
builds a real, day-by-day itinerary: specific restaurants and dishes with prices,
geocoded activities on a map, real photos, and a mix of iconic and traditional local
experiences instead of a generic tourist checklist.

## Features

- **AI-generated itineraries** — powered by Gemini, with per-activity cost, timing,
  location, and practical details (what to order, what to expect, what it costs)
- **Real geocoding & maps** — every activity is placed on a real map via OpenStreetMap/Nominatim,
  with day-trip/excursion detection for stops outside the main base
- **Real photos** — fetched live from Wikipedia/Wikimedia Commons per destination and activity
- **Live weather forecast** for the destination
- **Currency conversion** — live exchange rates, budget/costs shown in your currency
- **Voice translator** — record a local speaking, get it transcribed and translated
  into your language, with text-to-speech playback
- **QR export** — scan to get a text copy of the itinerary on your phone
- **Group expense splitting** — add trip members, log shared expenses, get a
  simplified settle-up plan
- **Trip assistant** — a chat assistant that answers questions about your specific itinerary
- **Community feed** — browse and share public trips, trending destinations, top contributors

## Tech stack

- **Backend**: FastAPI (Python), SQLAlchemy + SQLite, Gemini API (`google-genai`)
- **Frontend**: React + TypeScript + Vite
- **External APIs**: Google Gemini, Nominatim (geocoding), Open-Meteo (weather),
  Wikimedia Commons (images), Frankfurter (exchange rates)

## Project structure

```
backend/    FastAPI app (main.py), SQLAlchemy models, auth, Pydantic schemas
frontend/frontend/travel-planner-frontend/   React + Vite app
```

## Setup

### Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then fill in GEMINI_API_KEY and JWT_SECRET
python3 -m uvicorn main:app --port 8000 --reload
```

Required env vars (see `backend/.env.example`):

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | [Get one here](https://aistudio.google.com/apikey) |
| `JWT_SECRET` | yes | Any long random string, used to sign auth tokens |

The SQLite database (`travel_planner.db`) is created automatically on first run.

### Frontend

```bash
cd frontend/frontend/travel-planner-frontend
npm install
cp .env.example .env   # optional — only needed if the backend isn't at the default URL
npm run dev
```

Opens at `http://localhost:5173`, talking to the backend at `http://localhost:8000` by default.
