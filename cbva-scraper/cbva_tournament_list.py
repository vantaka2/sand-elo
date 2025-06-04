#!/usr/bin/env python3
"""
CBVA Tournament List Scraper - Fixed Version
Properly extracts tournament IDs, locations, and dates from the CBVA tournaments page

Usage: python cbva_tournament_list_fixed.py [year]
Default year is 2025
"""

import json
import sys
import re
import os
import asyncio
from datetime import datetime
from playwright.async_api import async_playwright, Page


def parse_date(date_str: str) -> str:
    """Convert date string like 'March 8th, 2025' to '2025-03-08'"""
    # Remove ordinal suffixes (st, nd, rd, th)
    date_str = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', date_str)
    
    try:
        # Parse the date
        date_obj = datetime.strptime(date_str, '%B %d, %Y')
        return date_obj.strftime('%Y-%m-%d')
    except ValueError:
        # Try alternate formats
        try:
            # Try without comma
            date_obj = datetime.strptime(date_str.replace(',', ''), '%B %d %Y')
            return date_obj.strftime('%Y-%m-%d')
        except ValueError:
            # Try with day name
            for day in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']:
                if day in date_str:
                    date_str = date_str.replace(day + ',', '').strip()
                    date_str = date_str.replace(day, '').strip()
                    try:
                        date_obj = datetime.strptime(date_str, '%B %d, %Y')
                        return date_obj.strftime('%Y-%m-%d')
                    except:
                        pass
            return date_str


async def wait_for_wasm_content(page: Page, timeout: int = 15000) -> bool:
    """Wait for WASM content to load"""
    try:
        print("  🔄 Waiting for WASM content to load...", file=sys.stderr)
        
        await page.wait_for_function(
            """() => {
                const hasContent = document.body.innerText.length > 500;
                const hasLinks = document.querySelectorAll('a[href*="/t/"]').length > 5;
                return hasContent && hasLinks;
            }""",
            timeout=timeout
        )
        
        await page.wait_for_timeout(2000)
        print("  ✅ WASM content loaded successfully", file=sys.stderr)
        return True
        
    except:
        print("  ⚠️ WASM content may not have loaded completely", file=sys.stderr)
        return False


async def scrape_tournaments(year: int = 2025) -> list:
    """Scrape tournament list from CBVA website"""
    url = f"https://cbva.com/t?d=O%2CAAA%2CAA%2CA%2CB%2CU&g=M%2CW&y={year}"
    tournaments = []
    
    print(f"Scraping CBVA tournaments for year {year}...", file=sys.stderr)
    print(f"URL: {url}", file=sys.stderr)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await page.goto(url, wait_until='networkidle')
            await wait_for_wasm_content(page)
            
            # Screenshot and page text files removed - not used in data extraction
            
            # Extract tournament data with a completely new approach
            tournament_data = await page.evaluate("""
                () => {
                    const tournaments = [];
                    let currentLocation = '';
                    let currentDate = '';
                    
                    // Debug: Log the page structure
                    console.log('Page HTML structure sample:', document.body.innerHTML.substring(0, 1000));
                    
                    // Try to find tournament groups by looking for patterns in the DOM
                    // Based on the screenshot, tournaments are grouped by location/date
                    
                    // Strategy 1: Look for all text nodes and process them sequentially
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    
                    const textNodes = [];
                    let node;
                    while (node = walker.nextNode()) {
                        const text = node.textContent.trim();
                        if (text) {
                            textNodes.push({
                                text: text,
                                element: node.parentElement
                            });
                        }
                    }
                    
                    // Process text nodes to find patterns
                    for (let i = 0; i < textNodes.length; i++) {
                        const text = textNodes[i].text;
                        const element = textNodes[i].element;
                        
                        // Check if this is a date
                        const datePattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s*(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{4}/i;
                        const dateMatch = text.match(datePattern);
                        
                        if (dateMatch) {
                            currentDate = dateMatch[0];
                            
                            // Look for location in the previous text node
                            if (i > 0) {
                                const prevText = textNodes[i-1].text;
                                // Check if it looks like a location
                                if (prevText.includes('Beach') || prevText.includes('Pier') || 
                                    prevText.includes('Park') || prevText.includes(',')) {
                                    currentLocation = prevText;
                                }
                            }
                            
                            console.log('Found date:', currentDate, 'Location:', currentLocation);
                        }
                        
                        // Check if this element or its parent is a tournament link
                        const link = element.tagName === 'A' ? element : element.closest('a');
                        if (link && link.href && link.href.includes('/t/')) {
                            const href = link.getAttribute('href');
                            const idMatch = href.match(/\\/t\\/([a-zA-Z0-9]+)$/);
                            
                            if (idMatch && currentLocation && currentDate) {
                                tournaments.push({
                                    id: idMatch[1],
                                    location: currentLocation,
                                    date: currentDate,
                                    division: text
                                });
                            }
                        }
                    }
                    
                    // Strategy 2: Look for specific container patterns
                    if (tournaments.length < 10) {
                        console.log('Using container-based strategy...');
                        
                        // Look for all elements that might be tournament containers
                        const allElements = document.querySelectorAll('*');
                        let lastLocationDate = { location: '', date: '' };
                        
                        allElements.forEach(element => {
                            const text = element.textContent || '';
                            
                            // Check if this element contains a location and date pattern
                            const hasLocation = text.match(/([^\\n]+(?:Beach|Pier|Park)[^\\n]*)/i);
                            const datePattern = /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\\s*(January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{4}/i;
                            const hasDate = text.match(datePattern);
                            
                            // If we found both location and date in this element's text
                            if (hasLocation && hasDate) {
                                // Extract just this element's text (not children)
                                const ownText = Array.from(element.childNodes)
                                    .filter(node => node.nodeType === Node.TEXT_NODE)
                                    .map(node => node.textContent.trim())
                                    .join(' ');
                                
                                // Check if the location and date are in the element's own text
                                if (ownText.includes(hasLocation[1]) || ownText.includes(hasDate[0])) {
                                    lastLocationDate.location = hasLocation[1].trim();
                                    lastLocationDate.date = hasDate[0];
                                    console.log('Found location/date container:', lastLocationDate);
                                }
                            }
                            
                            // Check if this element is a tournament link
                            if (element.tagName === 'A' && element.href && element.href.includes('/t/')) {
                                const href = element.getAttribute('href');
                                const idMatch = href.match(/\\/t\\/([a-zA-Z0-9]+)$/);
                                
                                if (idMatch && lastLocationDate.location && lastLocationDate.date) {
                                    tournaments.push({
                                        id: idMatch[1],
                                        location: lastLocationDate.location,
                                        date: lastLocationDate.date,
                                        division: element.textContent.trim()
                                    });
                                }
                            }
                        });
                    }
                    
                    console.log('Total tournaments found:', tournaments.length);
                    return tournaments;
                }
            """)
            
            # Deduplicate and clean up tournaments
            tournament_map = {}
            
            for t in tournament_data:
                tournament_id = t['id']
                
                if tournament_id not in tournament_map:
                    # Parse and clean the date
                    date_str = parse_date(t['date']) if t['date'] else ''
                    
                    # Clean location
                    location = t['location']
                    if location:
                        # Remove date from location if present
                        if t['date'] and t['date'] in location:
                            location = location.replace(t['date'], '').strip()
                        # Remove trailing commas
                        location = location.rstrip(',').strip()
                    
                    # Parse gender and division from division text
                    division_text = t.get('division', '')
                    gender = ''
                    division = ''
                    
                    if division_text:
                        # Extract gender and division from text like "Women's Open", "Men's AA", etc.
                        if division_text.startswith("Women's "):
                            gender = 'Women'
                            division = division_text.replace("Women's ", "")
                        elif division_text.startswith("Men's "):
                            gender = 'Men'
                            division = division_text.replace("Men's ", "")
                        elif 'Women' in division_text:
                            gender = 'Women'
                            # Try to extract division after Women
                            parts = division_text.split()
                            for i, part in enumerate(parts):
                                if 'Women' in part and i + 1 < len(parts):
                                    division = parts[i + 1]
                                    break
                        elif 'Men' in division_text:
                            gender = 'Men'
                            # Try to extract division after Men
                            parts = division_text.split()
                            for i, part in enumerate(parts):
                                if 'Men' in part and i + 1 < len(parts):
                                    division = parts[i + 1]
                                    break
                        else:
                            # Fallback - use the whole text as division
                            division = division_text
                        
                        # Clean up division text (remove common prefixes/suffixes)
                        if division:
                            # Remove common tournament prefixes
                            prefixes_to_remove = [
                                'Mich Ultra Premier Tour: $2,000 ',
                                'Cal Cup ',
                                'Surf City Days ',
                                'Surf City Days $2,000 ',
                                'Campsurf '
                            ]
                            
                            for prefix in prefixes_to_remove:
                                if division.startswith(prefix):
                                    division = division.replace(prefix, '')
                                    break
                            
                            # Ensure division matches expected values
                            division_mapping = {
                                'Open': 'Open',
                                'AAA': 'AAA', 
                                'AA': 'AA',
                                'A': 'A',
                                'B': 'B',
                                'Unrated': 'Unrated'
                            }
                            
                            # Check if division matches any of our expected values
                            for expected, mapped in division_mapping.items():
                                if expected in division:
                                    division = mapped
                                    break
                    
                    tournament_map[tournament_id] = {
                        'id': tournament_id,
                        'location': location,
                        'date': date_str,
                        'division': division,
                        'gender': gender,
                        'original_division_text': division_text  # Keep original for debugging
                    }
            
            tournaments = list(tournament_map.values())
            print(f"  Found {len(tournaments)} unique tournaments", file=sys.stderr)
            
            # Check diversity of locations and dates
            unique_locations = set(t['location'] for t in tournaments if t['location'])
            unique_dates = set(t['date'] for t in tournaments if t['date'])
            
            print(f"\n  📊 Data diversity check:", file=sys.stderr)
            print(f"    Unique locations: {len(unique_locations)}", file=sys.stderr)
            print(f"    Unique dates: {len(unique_dates)}", file=sys.stderr)
            
            if len(unique_locations) <= 1 or len(unique_dates) <= 1:
                print("  ⚠️  Warning: Low diversity in locations/dates. The page structure might be challenging to parse.", file=sys.stderr)
                print("  💡 Consider manually reviewing the page text file for patterns.", file=sys.stderr)
            
            # Log some examples
            print("\n  Sample extracted data:", file=sys.stderr)
            for i, t in enumerate(tournaments[:10]):
                print(f"    {i+1}. ID: {t['id']}, Location: {t['location']}, Date: {t['date']}, Gender: {t.get('gender', '')}, Division: {t.get('division', '')}", file=sys.stderr)
            
        finally:
            await browser.close()
    
    return tournaments


async def main():
    # Get year from command line argument or default to 2025
    year = 2025
    if len(sys.argv) > 1:
        try:
            year = int(sys.argv[1])
        except ValueError:
            print(f"Invalid year: {sys.argv[1]}", file=sys.stderr)
            sys.exit(1)
    
    # Create output directory
    os.makedirs("data", exist_ok=True)
    os.makedirs("data/tournaments", exist_ok=True)
    
    # Scrape tournaments
    tournaments = await scrape_tournaments(year)
    
    # Sort by date
    tournaments.sort(key=lambda t: t['date'] if t['date'] else '9999-12-31')
    
    # Save to JSON file
    output_file = f"data/tournaments/{year}.json"
    with open(output_file, 'w') as f:
        json.dump(tournaments, f, indent=2)
    
    # Print summary
    print(f"\n✅ Scraped {len(tournaments)} tournaments for {year}")
    print(f"📁 Saved to: {output_file}")
    
    # Count how many have complete data
    complete = sum(1 for t in tournaments if t['location'] and t['date'] and t['gender'] and t['division'])
    print(f"📊 Complete records (with location, date, gender & division): {complete}/{len(tournaments)}")
    
    # Show diversity
    unique_locations = set(t['location'] for t in tournaments if t['location'])
    unique_dates = set(t['date'] for t in tournaments if t['date'])
    unique_genders = set(t['gender'] for t in tournaments if t['gender'])
    unique_divisions = set(t['division'] for t in tournaments if t['division'])
    print(f"🌍 Unique locations: {len(unique_locations)}")
    print(f"📅 Unique dates: {len(unique_dates)}")
    print(f"⚧ Unique genders: {len(unique_genders)} - {', '.join(sorted(unique_genders))}")
    print(f"🏆 Unique divisions: {len(unique_divisions)} - {', '.join(sorted(unique_divisions))}")
    
    # Show first few tournaments
    print("\n📋 First 10 tournaments:")
    for tournament in tournaments[:10]:
        print(f"  - {tournament['id']}: {tournament['location']} ({tournament['date']}) - {tournament.get('gender', '')}'s {tournament.get('division', '')}")
    
    # Also output to stdout for piping
    print("\n" + json.dumps(tournaments, indent=2))


if __name__ == "__main__":
    asyncio.run(main())