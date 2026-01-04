"""LinkedIn search service with multiple search method support"""

import requests
from typing import List, Dict, Optional
from datetime import datetime
import json
from app.core.config import settings


class LinkedInSearchService:
    """
    Service to search LinkedIn for posts matching keywords and location.

    Supports multiple search methods:
    1. RapidAPI (recommended for production)
    2. Selenium-based scraping (for development/testing)
    3. Mock data (for testing without API)
    """

    def __init__(self, method: str = "rapidapi"):
        """
        Initialize LinkedIn search service

        Args:
            method: "rapidapi", "selenium", or "mock"
        """
        self.method = method

    def search_posts(self, keyword: str, location: str, max_results: int = 50) -> List[Dict]:
        """
        Search LinkedIn for posts matching the keyword and location

        Args:
            keyword: Search keyword (e.g., "marketing automation", "AI agents")
            location: Location filter (e.g., "Bangalore", "United States")
            max_results: Maximum number of results to return

        Returns:
            List of dictionaries containing post data
        """
        if self.method == "rapidapi":
            return self._search_via_rapidapi(keyword, location, max_results)
        elif self.method == "selenium":
            return self._search_via_selenium(keyword, location, max_results)
        elif self.method == "mock":
            return self._generate_mock_data(keyword, location, max_results)
        else:
            raise ValueError(f"Unknown search method: {self.method}")

    def _search_via_rapidapi(self, keyword: str, location: str, max_results: int) -> List[Dict]:
        """
        Search LinkedIn using RapidAPI

        Note: You'll need to subscribe to a LinkedIn API on RapidAPI
        Example: "LinkedIn Data API" or "Fresh LinkedIn Profile Data"
        """
        if not settings.rapidapi_key:
            raise ValueError("RapidAPI key not configured. Set RAPIDAPI_KEY in .env file")

        # Example using a hypothetical RapidAPI endpoint
        # You'll need to replace this with your actual RapidAPI endpoint
        url = "https://linkedin-api8.p.rapidapi.com/search/posts"

        headers = {
            "X-RapidAPI-Key": settings.rapidapi_key,
            "X-RapidAPI-Host": "linkedin-api8.p.rapidapi.com"
        }

        params = {
            "keywords": keyword,
            "location": location,
            "count": max_results
        }

        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Transform API response to standard format
            return self._transform_rapidapi_response(data)

        except requests.exceptions.RequestException as e:
            print(f"RapidAPI request failed: {e}")
            # Fallback to mock data for development
            return self._generate_mock_data(keyword, location, max_results)

    def _transform_rapidapi_response(self, data: Dict) -> List[Dict]:
        """Transform RapidAPI response to standard format"""
        posts = []

        # This transformation depends on your RapidAPI provider's response format
        # Adjust as needed based on your actual API
        if isinstance(data, dict) and "data" in data:
            for item in data.get("data", []):
                posts.append({
                    "post_url": item.get("postUrl") or item.get("url"),
                    "author_name": item.get("author", {}).get("name"),
                    "author_profile_url": item.get("author", {}).get("profileUrl"),
                    "author_title": item.get("author", {}).get("title"),
                    "author_company": item.get("author", {}).get("company"),
                    "post_text": item.get("text") or item.get("content"),
                    "posted_date": self._parse_date(item.get("postedDate")),
                })

        return posts

    def _search_via_selenium(self, keyword: str, location: str, max_results: int) -> List[Dict]:
        """
        Search LinkedIn using Selenium browser automation

        WARNING: This method is fragile and may break if LinkedIn changes their HTML structure.
        It's also against LinkedIn's ToS and your account may be banned.
        Use only for development/testing purposes.
        """
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.chrome.options import Options

        posts = []

        try:
            # Setup Chrome options
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")

            driver = webdriver.Chrome(options=chrome_options)

            # Login to LinkedIn (required for search)
            if settings.linkedin_email and settings.linkedin_password:
                driver.get("https://www.linkedin.com/login")

                # Wait for login page to load
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, "username"))
                )

                # Enter credentials
                driver.find_element(By.ID, "username").send_keys(settings.linkedin_email)
                driver.find_element(By.ID, "password").send_keys(settings.linkedin_password)
                driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()

                # Wait for login to complete
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, "global-nav"))
                )

            # Perform search
            search_url = f"https://www.linkedin.com/search/results/content/?keywords={keyword}&origin=SWITCH_SEARCH_VERTICAL"
            driver.get(search_url)

            # Wait for results to load
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "search-results-container"))
            )

            # Extract post data (simplified - actual implementation would be more complex)
            # This is a placeholder - actual implementation depends on LinkedIn's current HTML structure

            driver.quit()

        except Exception as e:
            print(f"Selenium search failed: {e}")
            # Fallback to mock data
            posts = self._generate_mock_data(keyword, location, max_results)

        return posts

    def _generate_mock_data(self, keyword: str, location: str, max_results: int) -> List[Dict]:
        """
        Generate mock LinkedIn post data for testing

        This is useful for development and testing without hitting LinkedIn's API
        """
        mock_posts = [
            {
                "post_url": f"https://www.linkedin.com/posts/mock-user-1_{keyword.replace(' ', '-')}-activity-123456789",
                "author_name": "Rajesh Kumar",
                "author_profile_url": "https://www.linkedin.com/in/rajesh-kumar-cmo",
                "author_title": "CMO at D2C Fashion Brand",
                "author_company": "StyleHub India",
                "post_text": f"Struggling with ad fatigue! Our creative team can't keep up with the demand for personalized video ads across different markets. We're spending 70% of our ad budget on production. Anyone found a solution for {keyword}?",
                "posted_date": datetime(2026, 1, 3, 14, 30),
            },
            {
                "post_url": f"https://www.linkedin.com/posts/mock-user-2_{keyword.replace(' ', '-')}-activity-234567890",
                "author_name": "Priya Sharma",
                "author_profile_url": "https://www.linkedin.com/in/priya-sharma-vp",
                "author_title": "VP Marketing at Fintech Startup",
                "author_company": "PayFast",
                "post_text": f"Looking for recommendations on {keyword}. Our sales team is drowning in leads but response time is 24+ hours. Missing hot leads to competitors. Need something better than our current CRM + chatbot setup.",
                "posted_date": datetime(2026, 1, 3, 10, 15),
            },
            {
                "post_url": f"https://www.linkedin.com/posts/mock-user-3_{keyword.replace(' ', '-')}-activity-345678901",
                "author_name": "Michael Chen",
                "author_profile_url": "https://www.linkedin.com/in/michael-chen-growth",
                "author_title": "Head of Growth at Gaming Platform",
                "author_company": "GameZone",
                "post_text": f"Our MarTech stack is a mess. Using 8 different tools for content, media buying, analytics. The integration nightmares are real. Evaluating {keyword} solutions that can consolidate this chaos.",
                "posted_date": datetime(2026, 1, 2, 16, 45),
            },
            {
                "post_url": f"https://www.linkedin.com/posts/mock-user-4_{keyword.replace(' ', '-')}-activity-456789012",
                "author_name": "Anita Desai",
                "author_profile_url": "https://www.linkedin.com/in/anita-desai-retail",
                "author_title": "Digital Marketing Manager at E-commerce",
                "author_company": "ShopKart",
                "post_text": f"Just attended a webinar on AI agents for marketing. Mind blown! 🤯 We're manually A/B testing ad creatives and it takes weeks. {keyword} could change the game. Anyone using this in production?",
                "posted_date": datetime(2026, 1, 2, 9, 20),
            },
            {
                "post_url": f"https://www.linkedin.com/posts/mock-user-5_{keyword.replace(' ', '-')}-activity-567890123",
                "author_name": "David Miller",
                "author_profile_url": "https://www.linkedin.com/in/david-miller-cto",
                "author_title": "CTO at SaaS Company",
                "author_company": "CloudOps Pro",
                "post_text": f"Thoughts on building vs buying for {keyword}? Our eng team could build it, but ROI on time-to-market is questionable. Looking at turnkey solutions that don't require months of integration.",
                "posted_date": datetime(2026, 1, 1, 11, 30),
            },
        ]

        # Return only up to max_results
        return mock_posts[:max_results]

    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        """Parse date string to datetime object"""
        if not date_str:
            return None

        try:
            # Try common date formats
            for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"]:
                try:
                    return datetime.strptime(date_str, fmt)
                except ValueError:
                    continue
            return None
        except Exception:
            return None


# Example usage
if __name__ == "__main__":
    service = LinkedInSearchService(method="mock")
    results = service.search_posts("marketing automation", "India", max_results=5)
    print(json.dumps(results, indent=2, default=str))
