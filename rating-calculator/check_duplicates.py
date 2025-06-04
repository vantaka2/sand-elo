#!/usr/bin/env python3
import os
import requests
from dotenv import load_dotenv

load_dotenv()
base_url = os.getenv('SUPABASE_URL', 'http://127.0.0.1:54321')
service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU')

headers = {
    'apikey': service_key,
    'Authorization': f'Bearer {service_key}',
    'Content-Type': 'application/json'
}

# Check for duplicates in player_match_stats view
url = f'{base_url}/rest/v1/player_match_stats'
response = requests.get(url, headers=headers, params={
    'match_type': 'eq.mens',
    'select': 'player_id'
})

if response.status_code == 200:
    data = response.json()
    player_ids = [row['player_id'] for row in data]
    unique_ids = set(player_ids)
    
    print(f'Total mens records: {len(player_ids)}')
    print(f'Unique player IDs: {len(unique_ids)}')
    print(f'Duplicates found: {len(player_ids) - len(unique_ids)}')
    
    if len(player_ids) != len(unique_ids):
        from collections import Counter
        duplicates = [pid for pid, count in Counter(player_ids).items() if count > 1]
        print(f'First few duplicate IDs: {duplicates[:3]}')
        
        # Check if fa2817f8-a8ca-4851-b77a-869dff6f34c2 is one of them
        problem_id = 'fa2817f8-a8ca-4851-b77a-869dff6f34c2'
        if problem_id in duplicates:
            count = Counter(player_ids)[problem_id]
            print(f'Found the problematic ID {problem_id} with {count} occurrences')
else:
    print(f'Error: {response.status_code}')