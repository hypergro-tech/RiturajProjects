"""API routes for the Sales AURA application"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from app.models.database import get_db
from app.models.lead import Lead, SearchQuery
from app.services.sales_agent import SalesAuraAgent
from app.services.scheduler import scheduler
from pydantic import BaseModel


router = APIRouter()


# Pydantic models for request/response
class SearchQueryCreate(BaseModel):
    keyword: str
    location: str


class SearchQueryResponse(BaseModel):
    id: int
    keyword: str
    location: str
    created_at: datetime
    last_executed: Optional[datetime]
    is_active: bool

    class Config:
        from_attributes = True


class LeadResponse(BaseModel):
    id: int
    post_url: str
    author_name: Optional[str]
    author_profile_url: Optional[str]
    author_title: Optional[str]
    author_company: Optional[str]
    post_text: Optional[str]
    posted_date: Optional[datetime]
    relevance_score: float
    explanation: Optional[str]
    key_signals: Optional[List[str]]
    icp_match: Optional[str]
    pain_points_identified: Optional[List[str]]
    discovered_at: datetime
    search_keyword: Optional[str]
    search_location: Optional[str]


class ExecutionSummary(BaseModel):
    keyword: str
    location: str
    posts_found: int
    posts_qualified: int
    new_leads_stored: int
    executed_at: str


# ============================================================================
# SEARCH QUERY ENDPOINTS
# ============================================================================

@router.post("/search-queries", response_model=SearchQueryResponse)
def create_search_query(
    query: SearchQueryCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new search query that will be executed on schedule

    The query will be added to the active search list and executed
    during the next scheduled run.
    """
    # Check if query already exists
    existing = db.query(SearchQuery).filter(
        SearchQuery.keyword == query.keyword,
        SearchQuery.location == query.location
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Search query already exists")

    # Create new query
    search_query = SearchQuery(
        keyword=query.keyword,
        location=query.location,
        is_active=1
    )
    db.add(search_query)
    db.commit()
    db.refresh(search_query)

    return search_query


@router.get("/search-queries", response_model=List[SearchQueryResponse])
def get_search_queries(
    active_only: bool = True,
    db: Session = Depends(get_db)
):
    """Get all search queries"""
    query = db.query(SearchQuery)
    if active_only:
        query = query.filter(SearchQuery.is_active == 1)
    return query.all()


@router.delete("/search-queries/{query_id}")
def delete_search_query(query_id: int, db: Session = Depends(get_db)):
    """Delete a search query (or mark as inactive)"""
    query = db.query(SearchQuery).filter(SearchQuery.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Search query not found")

    # Mark as inactive instead of deleting (preserves historical data)
    query.is_active = 0
    db.commit()

    return {"message": "Search query deactivated"}


@router.post("/search-queries/{query_id}/execute")
def execute_search_query(query_id: int, db: Session = Depends(get_db)):
    """Execute a specific search query immediately"""
    query = db.query(SearchQuery).filter(SearchQuery.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Search query not found")

    agent = SalesAuraAgent(db, search_method="mock")
    result = agent.execute_search(query.keyword, query.location)

    return result


# ============================================================================
# LEADS ENDPOINTS
# ============================================================================

@router.get("/leads", response_model=List[LeadResponse])
def get_leads(
    min_score: Optional[float] = Query(None, ge=0.0, le=1.0),
    max_score: Optional[float] = Query(None, ge=0.0, le=1.0),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    keyword: Optional[str] = None,
    location: Optional[str] = None,
    icp_match: Optional[str] = None,
    limit: int = Query(100, le=1000),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    Get leads with filtering options

    Filters:
    - min_score: Minimum relevance score (0.0 to 1.0)
    - max_score: Maximum relevance score (0.0 to 1.0)
    - start_date: Filter leads discovered after this date
    - end_date: Filter leads discovered before this date
    - keyword: Filter by search keyword
    - location: Filter by search location
    - icp_match: Filter by ICP type ("SMB", "Enterprise", "Unknown")
    - limit: Maximum number of results (default 100, max 1000)
    - offset: Number of results to skip (for pagination)
    """
    query = db.query(Lead).join(SearchQuery)

    # Apply filters
    if min_score is not None:
        query = query.filter(Lead.relevance_score >= min_score)

    if max_score is not None:
        query = query.filter(Lead.relevance_score <= max_score)

    if start_date:
        query = query.filter(Lead.discovered_at >= start_date)

    if end_date:
        query = query.filter(Lead.discovered_at <= end_date)

    if keyword:
        query = query.filter(SearchQuery.keyword.ilike(f"%{keyword}%"))

    if location:
        query = query.filter(SearchQuery.location.ilike(f"%{location}%"))

    if icp_match:
        query = query.filter(Lead.icp_match == icp_match)

    # Order by relevance score (highest first) and discovery date (newest first)
    query = query.order_by(Lead.relevance_score.desc(), Lead.discovered_at.desc())

    # Apply pagination
    leads = query.offset(offset).limit(limit).all()

    # Convert to response format
    return [
        LeadResponse(
            id=lead.id,
            post_url=lead.post_url,
            author_name=lead.author_name,
            author_profile_url=lead.author_profile_url,
            author_title=lead.author_title,
            author_company=lead.author_company,
            post_text=lead.post_text,
            posted_date=lead.posted_date,
            relevance_score=lead.relevance_score,
            explanation=lead.explanation,
            key_signals=lead.key_signals,
            icp_match=lead.icp_match,
            pain_points_identified=lead.pain_points_identified,
            discovered_at=lead.discovered_at,
            search_keyword=lead.search_query.keyword if lead.search_query else None,
            search_location=lead.search_query.location if lead.search_query else None,
        )
        for lead in leads
    ]


@router.get("/leads/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    """Get a specific lead by ID"""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    return LeadResponse(
        id=lead.id,
        post_url=lead.post_url,
        author_name=lead.author_name,
        author_profile_url=lead.author_profile_url,
        author_title=lead.author_title,
        author_company=lead.author_company,
        post_text=lead.post_text,
        posted_date=lead.posted_date,
        relevance_score=lead.relevance_score,
        explanation=lead.explanation,
        key_signals=lead.key_signals,
        icp_match=lead.icp_match,
        pain_points_identified=lead.pain_points_identified,
        discovered_at=lead.discovered_at,
        search_keyword=lead.search_query.keyword if lead.search_query else None,
        search_location=lead.search_query.location if lead.search_query else None,
    )


@router.get("/leads/stats/summary")
def get_leads_summary(db: Session = Depends(get_db)):
    """Get summary statistics about leads"""
    total_leads = db.query(Lead).count()

    # Leads by ICP
    smb_count = db.query(Lead).filter(Lead.icp_match == "SMB").count()
    enterprise_count = db.query(Lead).filter(Lead.icp_match == "Enterprise").count()
    unknown_count = db.query(Lead).filter(Lead.icp_match == "Unknown").count()

    # Leads in last 24 hours
    yesterday = datetime.utcnow() - timedelta(days=1)
    recent_leads = db.query(Lead).filter(Lead.discovered_at >= yesterday).count()

    # Average relevance score
    avg_score = db.query(Lead).with_entities(
        db.func.avg(Lead.relevance_score)
    ).scalar() or 0.0

    return {
        "total_leads": total_leads,
        "leads_by_icp": {
            "SMB": smb_count,
            "Enterprise": enterprise_count,
            "Unknown": unknown_count
        },
        "leads_last_24h": recent_leads,
        "average_relevance_score": round(float(avg_score), 2)
    }


# ============================================================================
# SCHEDULER ENDPOINTS
# ============================================================================

@router.post("/scheduler/start")
def start_scheduler():
    """Start the automated search scheduler"""
    scheduler.start()
    return {"message": "Scheduler started", "next_run": scheduler.get_next_run_time()}


@router.post("/scheduler/stop")
def stop_scheduler():
    """Stop the automated search scheduler"""
    scheduler.stop()
    return {"message": "Scheduler stopped"}


@router.get("/scheduler/status")
def get_scheduler_status():
    """Get scheduler status and next run time"""
    return {
        "is_running": scheduler.is_running,
        "next_run_time": scheduler.get_next_run_time()
    }


@router.post("/scheduler/trigger")
def trigger_immediate_search():
    """Trigger an immediate search execution (outside of schedule)"""
    scheduler.trigger_immediate_search()
    return {"message": "Immediate search triggered"}
