"""Main Sales AURA agent that orchestrates LinkedIn search and lead scoring"""

from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from datetime import datetime

from app.services.linkedin_search import LinkedInSearchService
from app.services.ai_scoring import AIRelevanceScoringService
from app.models.lead import Lead, SearchQuery
from app.core.config import settings


class SalesAuraAgent:
    """
    Main agent that orchestrates the lead generation process:
    1. Search LinkedIn for posts
    2. Score posts for relevance
    3. Store qualified leads in database
    """

    def __init__(
        self,
        db: Session,
        search_method: str = "mock"  # "mock", "rapidapi", or "selenium"
    ):
        self.db = db
        self.linkedin_service = LinkedInSearchService(method=search_method)
        self.ai_service = AIRelevanceScoringService()

    def execute_search(
        self,
        keyword: str,
        location: str,
        max_results: Optional[int] = None
    ) -> Dict:
        """
        Execute a complete search cycle:
        1. Search LinkedIn
        2. Score results
        3. Store qualified leads

        Args:
            keyword: Search keyword
            location: Location filter
            max_results: Maximum results to fetch (uses config default if None)

        Returns:
            Dictionary with execution summary
        """
        max_results = max_results or settings.max_results_per_search

        print(f"Starting search: keyword='{keyword}', location='{location}'")

        # Step 1: Get or create search query record
        search_query = self._get_or_create_search_query(keyword, location)

        # Step 2: Search LinkedIn
        print(f"Searching LinkedIn for {max_results} posts...")
        raw_posts = self.linkedin_service.search_posts(keyword, location, max_results)
        print(f"Found {len(raw_posts)} posts")

        # Step 3: Score posts with AI
        print("Scoring posts with AI...")
        scored_posts = self.ai_service.batch_score_posts(keyword, location, raw_posts)

        # Step 4: Filter by minimum relevance score
        qualified_posts = [
            post for post in scored_posts
            if post.get("relevance_score", 0) >= settings.min_relevance_score
        ]
        print(f"Qualified {len(qualified_posts)} posts (score >= {settings.min_relevance_score})")

        # Step 5: Store leads in database
        new_leads = self._store_leads(search_query, qualified_posts)
        print(f"Stored {new_leads} new leads")

        # Step 6: Update search query execution time
        search_query.last_executed = datetime.utcnow()
        self.db.commit()

        return {
            "search_query_id": search_query.id,
            "keyword": keyword,
            "location": location,
            "posts_found": len(raw_posts),
            "posts_qualified": len(qualified_posts),
            "new_leads_stored": new_leads,
            "executed_at": datetime.utcnow().isoformat()
        }

    def _get_or_create_search_query(self, keyword: str, location: str) -> SearchQuery:
        """Get existing search query or create new one"""
        search_query = self.db.query(SearchQuery).filter(
            SearchQuery.keyword == keyword,
            SearchQuery.location == location
        ).first()

        if not search_query:
            search_query = SearchQuery(
                keyword=keyword,
                location=location
            )
            self.db.add(search_query)
            self.db.commit()
            self.db.refresh(search_query)

        return search_query

    def _store_leads(self, search_query: SearchQuery, scored_posts: List[Dict]) -> int:
        """
        Store qualified leads in database

        Args:
            search_query: SearchQuery object
            scored_posts: List of scored post dictionaries

        Returns:
            Number of new leads stored
        """
        new_leads_count = 0

        for post in scored_posts:
            # Check if lead already exists
            existing_lead = self.db.query(Lead).filter(
                Lead.post_url == post.get("post_url")
            ).first()

            if existing_lead:
                # Update existing lead if score has changed
                if existing_lead.relevance_score != post.get("relevance_score"):
                    existing_lead.relevance_score = post.get("relevance_score")
                    existing_lead.explanation = post.get("explanation")
                    existing_lead.key_signals = post.get("key_signals")
                    existing_lead.icp_match = post.get("icp_match")
                    existing_lead.pain_points_identified = post.get("pain_points_identified")
                    existing_lead.last_updated = datetime.utcnow()
                continue

            # Create new lead
            lead = Lead(
                search_query_id=search_query.id,
                post_url=post.get("post_url"),
                author_name=post.get("author_name"),
                author_profile_url=post.get("author_profile_url"),
                author_title=post.get("author_title"),
                author_company=post.get("author_company"),
                post_text=post.get("post_text"),
                posted_date=post.get("posted_date"),
                relevance_score=post.get("relevance_score"),
                explanation=post.get("explanation"),
                key_signals=post.get("key_signals"),
                icp_match=post.get("icp_match"),
                pain_points_identified=post.get("pain_points_identified")
            )

            self.db.add(lead)
            new_leads_count += 1

        self.db.commit()
        return new_leads_count

    def get_all_active_search_queries(self) -> List[SearchQuery]:
        """Get all active search queries that should be executed"""
        return self.db.query(SearchQuery).filter(
            SearchQuery.is_active == 1
        ).all()

    def execute_all_active_searches(self) -> List[Dict]:
        """
        Execute all active search queries

        Returns:
            List of execution summaries
        """
        active_queries = self.get_all_active_search_queries()
        results = []

        for query in active_queries:
            try:
                result = self.execute_search(query.keyword, query.location)
                results.append(result)
            except Exception as e:
                print(f"Error executing search for {query.keyword}/{query.location}: {e}")
                results.append({
                    "keyword": query.keyword,
                    "location": query.location,
                    "error": str(e),
                    "executed_at": datetime.utcnow().isoformat()
                })

        return results
