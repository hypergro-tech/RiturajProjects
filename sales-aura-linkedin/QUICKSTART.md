# Quick Start Guide

Get SALES AURA up and running in 5 minutes!

## 1. Get Your OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy it (starts with `sk-...`)

## 2. Configure the Application

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your OpenAI API key
nano .env  # or use your favorite editor
```

Minimum required configuration in `.env`:
```env
OPENAI_API_KEY=sk-your-actual-key-here
```

## 3. Start the Application

### Option A: Using the Quick Start Script (Easiest)

```bash
./start.sh
```

### Option B: Manual Start

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Start the server
cd backend
python -m app.main
```

### Option C: Using Docker

```bash
docker-compose up
```

## 4. Access the Dashboard

Open your browser and go to:
```
http://localhost:8000
```

## 5. Add Your First Search Query

1. Click **"Add Search Query"** button
2. Enter a keyword (e.g., "marketing automation")
3. Enter a location (e.g., "India")
4. Click **"Create"**

## 6. Get Leads!

Click **"Search Now"** to trigger an immediate search, or wait for the hourly scheduler to run.

## What's Happening?

1. **Search**: The agent searches LinkedIn for posts matching your keyword/location
2. **Score**: Each post is analyzed by AI and scored for relevance (0-100%)
3. **Filter**: Only posts above the minimum threshold (60% by default) are saved
4. **Display**: Qualified leads appear in the dashboard with all details

## Common Use Cases

### For Sales Managers

**Keywords to try:**
- "marketing automation"
- "ad fatigue"
- "creative burnout"
- "AI agents"
- "martech stack"
- "sales follow-up"

**Locations:**
- "India"
- "Bangalore"
- "United States"
- "United Kingdom"

### Understanding the Scores

- **80-100%**: High-quality leads with clear pain points matching Hypergro's solutions
- **60-79%**: Medium-quality leads with some relevant signals
- **Below 60%**: Not stored (filtered out)

### Filters

Use the dashboard filters to:
- **Relevance**: Slider to show only high-scoring leads
- **Date Range**: Find recent leads or historical trends
- **ICP Match**: Filter by SMB vs Enterprise profiles

## Tips

1. **Start with 2-3 search queries** - Don't overwhelm the system
2. **Be specific with keywords** - "ad fatigue" works better than "marketing"
3. **Use the explanation** - Read the AI's reasoning for each lead
4. **Check key signals** - These show what pain points were detected
5. **Monitor the stats** - Track how many leads you're getting daily

## Next Steps

- Check the full [README.md](README.md) for advanced configuration
- Explore the API at `http://localhost:8000/docs`
- Set up RapidAPI for production LinkedIn access (see README)

## Troubleshooting

**Problem**: No leads appearing
- **Solution**: Click "Search Now" to trigger immediate search
- **Or**: Lower the `MIN_RELEVANCE_SCORE` in .env to 0.4

**Problem**: "OPENAI_API_KEY not found"
- **Solution**: Make sure you created .env and added your key

**Problem**: Scheduler not running
- **Solution**: It starts automatically. Check status in the dashboard header

## Support

Need help? Check the [README.md](README.md) for detailed documentation.
