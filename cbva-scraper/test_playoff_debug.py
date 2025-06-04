#!/usr/bin/env python3
"""
Debug playoff scraping for different tournament divisions
"""

import asyncio
from playwright.async_api import async_playwright

async def test_playoff_page(tournament_id: str, division: str):
    """Test accessing playoff page and see what content is available"""
    print(f"\n{'='*60}")
    print(f"Testing tournament: {tournament_id} ({division})")
    print(f"{'='*60}")
    
    url = f"https://cbva.com/t/{tournament_id}/playoffs/bracket"
    print(f"URL: {url}")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            print("Loading playoff page...")
            await page.goto(url, wait_until='networkidle')
            
            # Wait for content
            await page.wait_for_timeout(3000)
            
            # Get page content
            content = await page.evaluate("() => document.body.innerText")
            
            print(f"\nPage content length: {len(content)} characters")
            print(f"\nFirst 500 characters of content:")
            print("-" * 50)
            print(content[:500])
            
            # Look for round indicators
            print(f"\n\nSearching for playoff rounds...")
            lines = content.split('\n')
            round_count = 0
            for i, line in enumerate(lines):
                if 'Round of' in line or 'Quarterfinals' in line or 'Semifinals' in line or 'Finals' in line:
                    round_count += 1
                    print(f"\nFound round at line {i}: {line.strip()}")
                    # Show next 10 lines
                    for j in range(i+1, min(i+11, len(lines))):
                        print(f"  Line {j}: {lines[j].strip()}")
            
            print(f"\n\nTotal rounds found: {round_count}")
            
            # Check if there's a "No playoffs" message
            if "No playoff" in content.lower() or "no bracket" in content.lower():
                print("\n⚠️ Page indicates no playoff data available")
            
        except Exception as e:
            print(f"Error: {e}")
        finally:
            await browser.close()

async def main():
    # Test one Open tournament (successful) and one B tournament (failed)
    await test_playoff_page("19Xt68go", "Men's Open")  # Success case
    await test_playoff_page("ULJufjFU", "Men's B")     # Failure case
    await test_playoff_page("kHEjzOEf", "Women's AA")  # Another failure case

if __name__ == "__main__":
    asyncio.run(main())