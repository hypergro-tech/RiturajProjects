# SALES AURA - LinkedIn Lead Generator

An AI-powered LinkedIn lead generation agent specifically designed for **Hypergro.ai**. This system automatically searches LinkedIn for relevant posts, scores them using AI based on your Ideal Customer Profile (ICP), and presents qualified leads through an intuitive web dashboard.

## Features

- **Automated LinkedIn Searches**: Runs hourly to find relevant posts based on keywords and location
- **AI-Powered Relevance Scoring**: Uses OpenAI GPT models to score each post's relevance (0-100%)
- **ICP Matching**: Identifies whether leads match SMB or Enterprise customer profiles
- **Pain Point Detection**: Automatically identifies pain points mentioned in posts
- **Web Dashboard**: Beautiful, filterable interface to view and manage leads
- **Advanced Filtering**: Filter by date, time, relevance score, and ICP match
- **Real-time Stats**: Track total leads, recent discoveries, and average scores

## Architecture

```
sales-aura-linkedin/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI routes
│   │   ├── core/             # Configuration and prompts
│   │   ├── models/           # Database models
│   │   └── services/         # Business logic
│   │       ├── linkedin_search.py    # LinkedIn search integration
│   │       ├── ai_scoring.py         # OpenAI relevance scoring
│   │       ├── sales_agent.py        # Main orchestrator
│   │       └── scheduler.py          # Automated scheduling
│   └── requirements.txt
├── frontend/                 # Web dashboard
│   ├── index.html
│   └── app.js
└── .env                      # Configuration (create from .env.example)
```

## Installation

### Prerequisites

- Python 3.8+
- OpenAI API key
- (Optional) LinkedIn credentials or RapidAPI key for production

### Step 1: Clone and Setup

```bash
cd sales-aura-linkedin
```

### Step 2: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Step 3: Configure Environment

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Required: OpenAI API Key
OPENAI_API_KEY=sk-your-openai-api-key-here

# For Production: LinkedIn API via RapidAPI (recommended)
RAPIDAPI_KEY=your-rapidapi-key-here

# Or: LinkedIn Direct Credentials (not recommended, against ToS)
LINKEDIN_EMAIL=your_email@example.com
LINKEDIN_PASSWORD=your_password

# Database
DATABASE_URL=sqlite:///./sales_aura.db

# Application Settings
SEARCH_INTERVAL_HOURS=1
MAX_RESULTS_PER_SEARCH=50
MIN_RELEVANCE_SCORE=0.6

# Server
HOST=0.0.0.0
PORT=8000
```

### Step 4: Initialize Database

The database will be automatically initialized when you first run the application.

## Usage

### Running the Application

#### Development Mode

```bash
cd backend
python -m app.main
```

The application will start at `http://localhost:8000`

#### Production Mode

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Or using gunicorn with workers:

```bash
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Accessing the Dashboard

Open your browser and navigate to:
- **Web Dashboard**: `http://localhost:8000`
- **API Documentation**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`

### Adding Search Queries

1. Click **"Add Search Query"** in the dashboard
2. Enter a keyword (e.g., "marketing automation", "AI agents")
3. Enter a location (e.g., "India", "United States", "Bangalore")
4. Click **"Create"**

The scheduler will automatically execute this search every hour.

### Manual Search Trigger

Click **"Search Now"** to trigger an immediate search for all active queries.

## API Endpoints

### Search Queries

- `POST /api/search-queries` - Create new search query
- `GET /api/search-queries` - List all search queries
- `DELETE /api/search-queries/{id}` - Deactivate search query
- `POST /api/search-queries/{id}/execute` - Execute specific query

### Leads

- `GET /api/leads` - Get leads with filters
  - Query params: `min_score`, `max_score`, `start_date`, `end_date`, `keyword`, `location`, `icp_match`
- `GET /api/leads/{id}` - Get specific lead
- `GET /api/leads/stats/summary` - Get statistics

### Scheduler

- `POST /api/scheduler/start` - Start scheduler
- `POST /api/scheduler/stop` - Stop scheduler
- `GET /api/scheduler/status` - Get scheduler status
- `POST /api/scheduler/trigger` - Trigger immediate search

## LinkedIn Search Methods

The system supports three search methods:

### 1. Mock Data (Default - for Testing)

Uses generated sample data. Perfect for development and testing.

```python
# In sales_agent.py
agent = SalesAuraAgent(db, search_method="mock")
```

### 2. RapidAPI (Recommended for Production)

Uses a third-party LinkedIn API from RapidAPI. This is the most reliable method.

**Setup:**
1. Sign up at [RapidAPI](https://rapidapi.com/)
2. Subscribe to a LinkedIn API (e.g., "LinkedIn Data API")
3. Add your API key to `.env`
4. Update the code:

```python
# In sales_agent.py
agent = SalesAuraAgent(db, search_method="rapidapi")
```

### 3. Selenium (Not Recommended)

Uses browser automation. **Warning**: This violates LinkedIn's Terms of Service and may result in account bans.

```python
# In sales_agent.py
agent = SalesAuraAgent(db, search_method="selenium")
```

## Customization

### Adjusting the System Prompt

Edit `backend/app/core/prompts.py` to customize:
- Lead qualification criteria
- ICP definitions
- Scoring logic
- Pain point detection

### Changing Search Frequency

Edit `.env`:
```env
SEARCH_INTERVAL_HOURS=2  # Run every 2 hours instead of 1
```

### Adjusting Relevance Threshold

Edit `.env`:
```env
MIN_RELEVANCE_SCORE=0.7  # Only store leads with 70%+ relevance
```

## Database Schema

### SearchQuery Table
- `id`: Primary key
- `keyword`: Search keyword
- `location`: Location filter
- `created_at`: Creation timestamp
- `last_executed`: Last execution time
- `is_active`: Active status

### Lead Table
- `id`: Primary key
- `search_query_id`: Foreign key to SearchQuery
- `post_url`: LinkedIn post URL (unique)
- `author_name`, `author_title`, `author_company`: Author details
- `post_text`: Post content
- `posted_date`: When post was created
- `relevance_score`: AI-calculated score (0-1)
- `explanation`: AI explanation
- `key_signals`: Identified signals (JSON)
- `icp_match`: "SMB", "Enterprise", or "Unknown"
- `pain_points_identified`: Detected pain points (JSON)
- `discovered_at`: When lead was discovered

## Troubleshooting

### Issue: "OPENAI_API_KEY not found"

**Solution**: Make sure you've created a `.env` file with your OpenAI API key.

### Issue: "RapidAPI request failed"

**Solution**:
1. Verify your RapidAPI key is correct
2. Check you've subscribed to a LinkedIn API
3. Ensure you have available quota
4. Fallback: The system will use mock data automatically

### Issue: Scheduler not running

**Solution**: Check `/api/scheduler/status` endpoint. If stopped, call `/api/scheduler/start`

### Issue: No leads appearing

**Solution**:
1. Check if any search queries are active: `/api/search-queries`
2. Manually trigger a search: Click "Search Now" in dashboard
3. Lower the `MIN_RELEVANCE_SCORE` in `.env`
4. Check logs for errors

## Production Deployment

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY .env .

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:

```bash
docker build -t sales-aura .
docker run -p 8000:8000 --env-file .env sales-aura
```

### Using PostgreSQL

For production, switch from SQLite to PostgreSQL:

1. Update `.env`:
```env
DATABASE_URL=postgresql://user:password@localhost/sales_aura
```

2. Install PostgreSQL driver:
```bash
pip install psycopg2-binary
```

## Security Notes

- Never commit `.env` file to version control
- Use environment variables for all secrets
- In production, restrict CORS origins in `main.py`
- Use HTTPS in production
- Implement authentication for the API endpoints
- Be aware that LinkedIn scraping violates their ToS

## License

Proprietary - Hypergro.ai

## Support

For issues or questions, contact the development team.

## Roadmap

- [ ] Email notifications for high-quality leads
- [ ] CRM integration (Salesforce, HubSpot)
- [ ] Lead enrichment with additional data sources
- [ ] Multi-platform support (Twitter, Reddit)
- [ ] Advanced analytics and reporting
- [ ] Lead scoring model training based on conversions
