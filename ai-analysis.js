document.getElementById('analyze-site').addEventListener('click', async () => {
    const urlInput = document.getElementById('website-url');
    const resultsContainer = document.getElementById('analysis-results');
    const analyzeButton = document.getElementById('analyze-site');
    const url = urlInput.value.trim();

    // Reset any previous error states
    urlInput.classList.remove('error');

    if (!url) {
        urlInput.classList.add('error');
        resultsContainer.innerHTML = `
            <div class="error-message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                Please enter a valid website URL
            </div>
        `;
        return;
    }

    try {
        // Disable button and show loading state
        analyzeButton.disabled = true;
        analyzeButton.innerHTML = `
            <div class="loading-spinner"></div>
            Analyzing...
        `;

        resultsContainer.innerHTML = `
            <div class="analysis-status">
                <div class="progress-steps">
                    <div class="step active">Fetching website content...</div>
                    <div class="step">Analyzing content</div>
                    <div class="step">Generating suggestions</div>
                </div>
            </div>
        `;

        // Fetch website content
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch website (${response.status} ${response.statusText})`);
        }
        const html = await response.text();

        // Update progress
        document.querySelector('.step:nth-child(1)').classList.add('completed');
        document.querySelector('.step:nth-child(2)').classList.add('active');

        // Extract and analyze content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const content = {
            title: doc.title,
            metaDescription: doc.querySelector('meta[name="description"]')?.content || '',
            metaKeywords: doc.querySelector('meta[name="keywords"]')?.content || '',
            h1: Array.from(doc.querySelectorAll('h1')).map(h => h.textContent).join(' '),
            mainContent: doc.querySelector('main')?.textContent || doc.body.textContent
        };

        // Update progress
        document.querySelector('.step:nth-child(2)').classList.add('completed');
        document.querySelector('.step:nth-child(3)').classList.add('active');

        // Analyze with OpenAI
        const analysis = await analyzeWithOpenAI(content);

        // Complete progress and display results
        document.querySelector('.step:nth-child(3)').classList.add('completed');
        displayAnalysisResults(analysis, resultsContainer);

    } catch (error) {
        resultsContainer.innerHTML = `
            <div class="error-message">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                ${error.message}
            </div>
            <button class="retry-button" onclick="location.reload()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                Try Again
            </button>
        `;
    } finally {
        // Reset button state
        analyzeButton.disabled = false;
        analyzeButton.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
            </svg>
            Analyze Website
        `;
    }
});