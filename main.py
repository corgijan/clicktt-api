import requests
import json
from typing import Dict
import time
from datetime import datetime


def get_scores_for_all_matches(url: str) -> Dict[str, int]:
    # Extract the meeting ID from the URL
    meeting_id = url.split('show/')[-1].rstrip('/')  # Gets 14646700

    # Define the API endpoint
    base_url = "https://www.mytischtennis.de"
    api_url = f"{base_url}/clicktt/livescoring-api/get-all-matches"

    # Setup headers to mimic a browser request
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': url,
        'Origin': base_url
    }

    # Prepare the payload exactly as in the JavaScript code
    payload = {
        "meetingId": meeting_id,
        "allMatchKeys": True
    }

    try:
        # Make the POST request
        response = requests.post(
            api_url,
            data={"theJSON": json.dumps(payload)},
            headers=headers
        )

        if response.ok:
            print(f"Response: {response.text}")

    except Exception as e:
        print(f"Error fetching scores: {str(e)}")

    return {
        "heim": 0,
        "gast": 0
    }


def main():
    url = "https://www.mytischtennis.de/clicktt/WTTV/livescoring/show/14646700/"

    print(f"Starting score monitoring for: {url}")
    print(f"Current user: corgijan")

    result = get_scores_for_all_matches(url)


if __name__ == "__main__":
    main()