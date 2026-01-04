"""Scheduler service for automated LinkedIn searches"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime
from sqlalchemy.orm import Session

from app.models.database import SessionLocal
from app.services.sales_agent import SalesAuraAgent
from app.core.config import settings


class SearchScheduler:
    """
    Background scheduler that runs LinkedIn searches at regular intervals
    """

    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.is_running = False

    def start(self):
        """Start the scheduler"""
        if self.is_running:
            print("Scheduler is already running")
            return

        # Schedule the search job
        self.scheduler.add_job(
            func=self._execute_searches,
            trigger=IntervalTrigger(hours=settings.search_interval_hours),
            id='linkedin_search_job',
            name='Execute LinkedIn searches',
            replace_existing=True
        )

        self.scheduler.start()
        self.is_running = True
        print(f"Scheduler started. Will run searches every {settings.search_interval_hours} hour(s)")

        # Execute immediately on startup
        self._execute_searches()

    def stop(self):
        """Stop the scheduler"""
        if not self.is_running:
            print("Scheduler is not running")
            return

        self.scheduler.shutdown()
        self.is_running = False
        print("Scheduler stopped")

    def _execute_searches(self):
        """Execute all active search queries"""
        print(f"\n{'='*60}")
        print(f"SCHEDULED SEARCH EXECUTION - {datetime.utcnow().isoformat()}")
        print(f"{'='*60}\n")

        db: Session = SessionLocal()

        try:
            agent = SalesAuraAgent(db, search_method="mock")  # Change to "rapidapi" for production
            results = agent.execute_all_active_searches()

            print(f"\n{'='*60}")
            print("EXECUTION SUMMARY")
            print(f"{'='*60}")
            for result in results:
                if "error" in result:
                    print(f"❌ {result['keyword']} / {result['location']}: ERROR - {result['error']}")
                else:
                    print(f"✅ {result['keyword']} / {result['location']}: "
                          f"{result['posts_found']} found, "
                          f"{result['posts_qualified']} qualified, "
                          f"{result['new_leads_stored']} new")
            print(f"{'='*60}\n")

        except Exception as e:
            print(f"Error during scheduled search execution: {e}")

        finally:
            db.close()

    def get_next_run_time(self) -> str:
        """Get the next scheduled run time"""
        if not self.is_running:
            return "Scheduler not running"

        job = self.scheduler.get_job('linkedin_search_job')
        if job and job.next_run_time:
            return job.next_run_time.isoformat()
        return "Unknown"

    def trigger_immediate_search(self):
        """Trigger an immediate search execution (outside schedule)"""
        print("Triggering immediate search...")
        self._execute_searches()


# Global scheduler instance
scheduler = SearchScheduler()
