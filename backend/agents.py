import os
from google import genai
from google.genai import types
from schema import FullTripItinerary

# 1. Initialize our AI engine
# Make sure you have your API key set up!
client = genai.Client()

def generate_perfect_trip(destination: str, budget: float, day_configs: dict) -> FullTripItinerary:
    """
    This function acts as our travel engine. It takes your inputs and forces
    Gemini to give us the exact JSON schema we built in step 2.
    """
    
    # We write a clear instruction prompt for the AI
    prompt = f"""
    You are an Expert Travel Vibe Curator and a Strict Budget Inspector combined.
    
    Create a highly customized daily itinerary for a trip to: {destination}.
    The total maximum budget limit is exactly: ₹{budget} INR.
    
    Here is the exact vibe preference for each day:
    {day_configs}
    
    Rules:
    1. Every single day MUST strictly match the theme tag requested (e.g., if Day 4 says 'Adventure', only add high-energy or unique thrilling spots).
    2. The 'actual_calculated_cost' MUST be less than or equal to the total budget limit. Calculate the math carefully!
    3. Provide realistic time blocks and cool local descriptions.
    """

    # We call Gemini and force it to return our exact structured layout
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=FullTripItinerary,
            temperature=0.7
        ),
    )
    
    # This turns the text answer back into a clean Python object!
    return FullTripItinerary.model_validate_json(response.text)