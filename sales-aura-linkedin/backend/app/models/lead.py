from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.models.database import Base


class SearchQuery(Base):
    """Stores search queries and their execution history"""
    __tablename__ = "search_queries"

    id = Column(Integer, primary_key=True, index=True)
    keyword = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_executed = Column(DateTime, nullable=True)
    is_active = Column(Integer, default=1)  # 1 = active, 0 = inactive

    # Relationship to leads
    leads = relationship("Lead", back_populates="search_query")

    def __repr__(self):
        return f"<SearchQuery(keyword='{self.keyword}', location='{self.location}')>"


class Lead(Base):
    """Stores LinkedIn leads with relevance scores"""
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    search_query_id = Column(Integer, ForeignKey("search_queries.id"), nullable=False)

    # LinkedIn Post Data
    post_url = Column(String(500), unique=True, nullable=False, index=True)
    author_name = Column(String(255), nullable=True)
    author_profile_url = Column(String(500), nullable=True)
    author_title = Column(String(255), nullable=True)
    author_company = Column(String(255), nullable=True)
    post_text = Column(Text, nullable=True)
    posted_date = Column(DateTime, nullable=True)

    # AI Analysis
    relevance_score = Column(Float, nullable=False, index=True)
    explanation = Column(Text, nullable=True)
    key_signals = Column(JSON, nullable=True)  # List of identified signals
    icp_match = Column(String(50), nullable=True)  # "SMB", "Enterprise", "Unknown"
    pain_points_identified = Column(JSON, nullable=True)  # List of pain points

    # Metadata
    discovered_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to search query
    search_query = relationship("SearchQuery", back_populates="leads")

    def __repr__(self):
        return f"<Lead(author='{self.author_name}', score={self.relevance_score})>"

    def to_dict(self):
        """Convert lead to dictionary for API responses"""
        return {
            "id": self.id,
            "post_url": self.post_url,
            "author_name": self.author_name,
            "author_profile_url": self.author_profile_url,
            "author_title": self.author_title,
            "author_company": self.author_company,
            "post_text": self.post_text,
            "posted_date": self.posted_date.isoformat() if self.posted_date else None,
            "relevance_score": self.relevance_score,
            "explanation": self.explanation,
            "key_signals": self.key_signals,
            "icp_match": self.icp_match,
            "pain_points_identified": self.pain_points_identified,
            "discovered_at": self.discovered_at.isoformat() if self.discovered_at else None,
            "search_keyword": self.search_query.keyword if self.search_query else None,
            "search_location": self.search_query.location if self.search_query else None,
        }
