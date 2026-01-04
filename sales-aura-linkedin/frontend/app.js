// API Base URL
const API_BASE = '/api';

// State
let allLeads = [];
let currentFilters = {
    minScore: 0.6,
    startDate: null,
    endDate: null,
    icpMatch: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadLeads();
    loadSchedulerStatus();
    setupMinScoreSlider();

    // Refresh data every 30 seconds
    setInterval(() => {
        loadStats();
        loadSchedulerStatus();
    }, 30000);

    // Refresh leads every 60 seconds
    setInterval(loadLeads, 60000);
});

// Setup min score slider
function setupMinScoreSlider() {
    const slider = document.getElementById('minScore');
    const display = document.getElementById('minScoreValue');

    slider.addEventListener('input', (e) => {
        display.textContent = e.target.value;
    });
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/leads/stats/summary`);
        const stats = await response.json();

        document.getElementById('totalLeads').textContent = stats.total_leads;
        document.getElementById('recentLeads').textContent = stats.leads_last_24h;
        document.getElementById('avgScore').textContent = stats.average_relevance_score.toFixed(2);

        // Load active search queries count
        const searchesResponse = await fetch(`${API_BASE}/search-queries?active_only=true`);
        const searches = await searchesResponse.json();
        document.getElementById('activeSearches').textContent = searches.length;

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load scheduler status
async function loadSchedulerStatus() {
    try {
        const response = await fetch(`${API_BASE}/scheduler/status`);
        const status = await response.json();

        const statusEl = document.getElementById('schedulerStatus');
        if (status.is_running) {
            statusEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i> Running';
            statusEl.className = 'text-lg font-semibold text-green-300';
        } else {
            statusEl.innerHTML = '<i class="fas fa-times-circle mr-1"></i> Stopped';
            statusEl.className = 'text-lg font-semibold text-red-300';
        }
    } catch (error) {
        console.error('Error loading scheduler status:', error);
    }
}

// Load leads with filters
async function loadLeads() {
    try {
        // Show loading indicator
        document.getElementById('loadingIndicator').classList.remove('hidden');
        document.getElementById('leadsContainer').classList.add('hidden');
        document.getElementById('noLeadsMessage').classList.add('hidden');

        // Build query parameters
        const params = new URLSearchParams();
        params.append('limit', '100');

        if (currentFilters.minScore) {
            params.append('min_score', currentFilters.minScore);
        }
        if (currentFilters.startDate) {
            params.append('start_date', new Date(currentFilters.startDate).toISOString());
        }
        if (currentFilters.endDate) {
            params.append('end_date', new Date(currentFilters.endDate).toISOString());
        }
        if (currentFilters.icpMatch) {
            params.append('icp_match', currentFilters.icpMatch);
        }

        const response = await fetch(`${API_BASE}/leads?${params}`);
        allLeads = await response.json();

        // Hide loading, show content
        document.getElementById('loadingIndicator').classList.add('hidden');

        if (allLeads.length === 0) {
            document.getElementById('noLeadsMessage').classList.remove('hidden');
        } else {
            document.getElementById('leadsContainer').classList.remove('hidden');
            renderLeads();
        }

        document.getElementById('leadCount').textContent = `(${allLeads.length} leads)`;

    } catch (error) {
        console.error('Error loading leads:', error);
        document.getElementById('loadingIndicator').classList.add('hidden');
        document.getElementById('noLeadsMessage').classList.remove('hidden');
    }
}

// Render leads
function renderLeads() {
    const container = document.getElementById('leadsContainer');
    container.innerHTML = '';

    allLeads.forEach(lead => {
        const card = createLeadCard(lead);
        container.appendChild(card);
    });
}

// Create lead card
function createLeadCard(lead) {
    const card = document.createElement('div');
    card.className = 'lead-card bg-gray-50 border border-gray-200 rounded-lg p-6';

    const scoreClass = lead.relevance_score >= 0.8 ? 'score-high' :
                       lead.relevance_score >= 0.6 ? 'score-medium' : 'score-low';

    const scorePercent = (lead.relevance_score * 100).toFixed(0);

    const postedDate = lead.posted_date ?
        new Date(lead.posted_date).toLocaleDateString() : 'Unknown';
    const discoveredDate = new Date(lead.discovered_at).toLocaleDateString();

    card.innerHTML = `
        <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
                <div class="flex items-center gap-3 mb-2">
                    <h3 class="text-lg font-semibold text-gray-800">
                        ${lead.author_name || 'Unknown Author'}
                    </h3>
                    <span class="px-3 py-1 rounded-full text-xs font-medium ${getICPBadgeClass(lead.icp_match)}">
                        ${lead.icp_match || 'Unknown'}
                    </span>
                </div>
                ${lead.author_title || lead.author_company ? `
                    <p class="text-sm text-gray-600">
                        ${lead.author_title || ''} ${lead.author_title && lead.author_company ? 'at' : ''} ${lead.author_company || ''}
                    </p>
                ` : ''}
            </div>
            <div class="text-right">
                <div class="text-2xl font-bold ${scoreClass}">
                    ${scorePercent}%
                </div>
                <div class="text-xs text-gray-500">Relevance</div>
            </div>
        </div>

        ${lead.post_text ? `
            <div class="bg-white border border-gray-200 rounded p-4 mb-4">
                <p class="text-gray-700 text-sm leading-relaxed">
                    ${truncateText(lead.post_text, 300)}
                </p>
            </div>
        ` : ''}

        ${lead.explanation ? `
            <div class="mb-4">
                <p class="text-sm text-gray-600">
                    <i class="fas fa-lightbulb text-yellow-500 mr-2"></i>
                    ${lead.explanation}
                </p>
            </div>
        ` : ''}

        ${lead.key_signals && lead.key_signals.length > 0 ? `
            <div class="mb-4">
                <div class="text-xs font-medium text-gray-500 mb-2">KEY SIGNALS</div>
                <div class="flex flex-wrap gap-2">
                    ${lead.key_signals.map(signal => `
                        <span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                            ${signal}
                        </span>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${lead.pain_points_identified && lead.pain_points_identified.length > 0 ? `
            <div class="mb-4">
                <div class="text-xs font-medium text-gray-500 mb-2">PAIN POINTS</div>
                <div class="flex flex-wrap gap-2">
                    ${lead.pain_points_identified.map(pain => `
                        <span class="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                            ${pain}
                        </span>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <div class="flex items-center justify-between text-sm">
            <div class="text-gray-500">
                <i class="fas fa-calendar mr-1"></i>
                Posted: ${postedDate} | Discovered: ${discoveredDate}
            </div>
            <a href="${lead.post_url}" target="_blank"
               class="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium inline-flex items-center">
                View on LinkedIn
                <i class="fas fa-external-link-alt ml-2"></i>
            </a>
        </div>

        ${lead.author_profile_url ? `
            <div class="mt-3 pt-3 border-t border-gray-200">
                <a href="${lead.author_profile_url}" target="_blank"
                   class="text-sm text-purple-600 hover:text-purple-800">
                    <i class="fab fa-linkedin mr-1"></i>
                    View Author Profile
                </a>
            </div>
        ` : ''}
    `;

    return card;
}

// Get ICP badge class
function getICPBadgeClass(icp) {
    switch (icp) {
        case 'SMB':
            return 'bg-green-100 text-green-800';
        case 'Enterprise':
            return 'bg-blue-100 text-blue-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

// Truncate text
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Update filters
function updateFilters() {
    currentFilters.minScore = parseFloat(document.getElementById('minScore').value);
    currentFilters.startDate = document.getElementById('startDate').value || null;
    currentFilters.endDate = document.getElementById('endDate').value || null;
    currentFilters.icpMatch = document.getElementById('icpFilter').value || null;

    loadLeads();
}

// Reset filters
function resetFilters() {
    document.getElementById('minScore').value = 0.6;
    document.getElementById('minScoreValue').textContent = '0.6';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('icpFilter').value = '';

    currentFilters = {
        minScore: 0.6,
        startDate: null,
        endDate: null,
        icpMatch: null
    };

    loadLeads();
}

// Modal functions
function showAddSearchModal() {
    document.getElementById('addSearchModal').classList.remove('hidden');
    document.getElementById('addSearchModal').classList.add('flex');
}

function hideAddSearchModal() {
    document.getElementById('addSearchModal').classList.add('hidden');
    document.getElementById('addSearchModal').classList.remove('flex');
    document.getElementById('newKeyword').value = '';
    document.getElementById('newLocation').value = '';
}

// Create search query
async function createSearchQuery() {
    const keyword = document.getElementById('newKeyword').value.trim();
    const location = document.getElementById('newLocation').value.trim();

    if (!keyword || !location) {
        alert('Please fill in both keyword and location');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/search-queries`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ keyword, location })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create search query');
        }

        alert(`Search query created successfully!\nKeyword: ${keyword}\nLocation: ${location}\n\nThe scheduler will execute this search on the next run.`);
        hideAddSearchModal();
        loadStats();

    } catch (error) {
        console.error('Error creating search query:', error);
        alert(`Error: ${error.message}`);
    }
}

// Trigger immediate search
async function triggerImmediateSearch() {
    if (!confirm('This will trigger an immediate search for all active queries. Continue?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/scheduler/trigger`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Failed to trigger search');
        }

        alert('Search triggered! Results will appear in a few moments.');

        // Reload data after a delay
        setTimeout(() => {
            loadStats();
            loadLeads();
        }, 5000);

    } catch (error) {
        console.error('Error triggering search:', error);
        alert(`Error: ${error.message}`);
    }
}
