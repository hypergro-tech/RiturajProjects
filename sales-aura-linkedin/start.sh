#!/bin/bash

# Sales AURA - Quick Start Script

echo "================================================"
echo "  SALES AURA - LinkedIn Lead Generator"
echo "  Starting application..."
echo "================================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your API keys:"
    echo "   - OPENAI_API_KEY (required)"
    echo "   - RAPIDAPI_KEY (optional, for production)"
    echo ""
    echo "Run this script again after configuring .env"
    exit 1
fi

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r backend/requirements.txt -q

# Check if OPENAI_API_KEY is set
if ! grep -q "OPENAI_API_KEY=sk-" .env; then
    echo "⚠️  Warning: OPENAI_API_KEY not configured in .env"
    echo "   Please add your OpenAI API key to continue"
    exit 1
fi

# Start the application
echo ""
echo "================================================"
echo "✅ Starting Sales AURA..."
echo "================================================"
echo ""
echo "🌐 Web Dashboard: http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
echo "❤️  Health Check: http://localhost:8000/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

cd backend && python -m app.main
