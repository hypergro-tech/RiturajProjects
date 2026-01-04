"""AI-powered relevance scoring service using OpenAI"""

import json
from typing import Dict, Optional
from openai import OpenAI
from app.core.config import settings
from app.core.prompts import HYPERGRO_SALES_PROMPT, RELEVANCE_SCORING_PROMPT


class AIRelevanceScoringService:
    """
    Service to score LinkedIn posts for sales lead relevance using OpenAI's GPT models
    """

    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = "gpt-4o-mini"  # Cost-effective model, can upgrade to gpt-4 for better accuracy

    def score_post(
        self,
        keyword: str,
        location: str,
        post_data: Dict
    ) -> Dict:
        """
        Score a LinkedIn post for relevance to Hypergro.ai's ICP

        Args:
            keyword: Search keyword used
            location: Location filter used
            post_data: Dictionary containing post information

        Returns:
            Dictionary containing:
                - relevance_score: float (0.0 to 1.0)
                - explanation: str
                - key_signals: list
                - icp_match: str
                - pain_points_identified: list
        """
        # Build the prompt with context
        prompt = RELEVANCE_SCORING_PROMPT.format(
            context=HYPERGRO_SALES_PROMPT,
            keyword=keyword,
            location=location,
            author=post_data.get("author_name", "Unknown"),
            post_text=post_data.get("post_text", ""),
            post_url=post_data.get("post_url", ""),
            posted_date=post_data.get("posted_date", "Unknown")
        )

        try:
            # Call OpenAI API
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert sales lead qualification assistant. Analyze posts and return structured JSON responses."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.3,  # Lower temperature for more consistent scoring
                response_format={"type": "json_object"}  # Enforce JSON response
            )

            # Parse response
            result = json.loads(response.choices[0].message.content)

            # Validate and normalize the response
            return self._validate_score(result)

        except Exception as e:
            print(f"AI scoring failed: {e}")
            # Return a default low score if AI fails
            return self._get_fallback_score(post_data)

    def _validate_score(self, result: Dict) -> Dict:
        """Validate and normalize AI scoring result"""
        # Ensure all required fields are present
        validated = {
            "relevance_score": float(result.get("relevance_score", 0.0)),
            "explanation": result.get("explanation", "No explanation provided"),
            "key_signals": result.get("key_signals", []),
            "icp_match": result.get("icp_match", "Unknown"),
            "pain_points_identified": result.get("pain_points_identified", [])
        }

        # Clamp score between 0 and 1
        validated["relevance_score"] = max(0.0, min(1.0, validated["relevance_score"]))

        # Ensure lists are actually lists
        if not isinstance(validated["key_signals"], list):
            validated["key_signals"] = []
        if not isinstance(validated["pain_points_identified"], list):
            validated["pain_points_identified"] = []

        return validated

    def _get_fallback_score(self, post_data: Dict) -> Dict:
        """
        Provide a fallback score when AI is unavailable

        Uses simple keyword matching as a basic heuristic
        """
        post_text = (post_data.get("post_text") or "").lower()

        # High-value keywords
        high_value_keywords = [
            "ad fatigue", "creative burnout", "scale video",
            "dead leads", "slow sales", "crm", "marketing automation",
            "ai agent", "autonomous", "martech", "personalization"
        ]

        # Industry keywords
        industry_keywords = [
            "d2c", "e-commerce", "fintech", "gaming", "saas",
            "marketing team", "cmo", "vp marketing"
        ]

        # Count keyword matches
        high_value_matches = sum(1 for kw in high_value_keywords if kw in post_text)
        industry_matches = sum(1 for kw in industry_keywords if kw in post_text)

        # Calculate basic score
        score = min(1.0, (high_value_matches * 0.15) + (industry_matches * 0.1))

        return {
            "relevance_score": score,
            "explanation": "Fallback score based on keyword matching (AI unavailable)",
            "key_signals": ["AI scoring unavailable - using keyword heuristic"],
            "icp_match": "Unknown",
            "pain_points_identified": []
        }

    def batch_score_posts(
        self,
        keyword: str,
        location: str,
        posts: list[Dict]
    ) -> list[Dict]:
        """
        Score multiple posts in batch

        Args:
            keyword: Search keyword
            location: Location filter
            posts: List of post data dictionaries

        Returns:
            List of posts with scoring data added
        """
        scored_posts = []

        for post in posts:
            try:
                score_data = self.score_post(keyword, location, post)

                # Merge score data with post data
                scored_post = {**post, **score_data}
                scored_posts.append(scored_post)

            except Exception as e:
                print(f"Error scoring post {post.get('post_url')}: {e}")
                continue

        return scored_posts


# Example usage
if __name__ == "__main__":
    # Test with mock data
    service = AIRelevanceScoringService()

    test_post = {
        "post_url": "https://linkedin.com/posts/test",
        "author_name": "John Doe",
        "post_text": "Struggling with ad fatigue and our creative team can't keep up with demand for video content!",
        "posted_date": "2026-01-03"
    }

    result = service.score_post("marketing automation", "India", test_post)
    print(json.dumps(result, indent=2))
