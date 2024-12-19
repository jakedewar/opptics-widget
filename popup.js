let currentEnabledState = false;

const PRESET_TEMPLATES = {
    retail: {
        "Customer": "Shopper",
        "Order": "Purchase",
        "Product": "Item",
        "Inventory": "Stock",
        "Started Checkout": "Started Purchase",
        "Placed Order": "Completed Purchase",
        "Abandoned Cart": "Abandoned Basket",
        "Added to Cart": "Added to Basket",
        "Viewed Product": "Viewed Item",
        "Customer Lifetime Value": "Shopper Value",
        "Average Order Value": "Average Purchase Value",
        "Joggers": "Active Item Plus",
        "Drawstring": "Casual Item",
        "Cotton Drawstring": "Cotton Item Plus",
        "Hat": "Essential Item",
        "Vest": "Core Item",
        "Tee": "Basic Item",
        "Tote": "Carry Item",
        "Umbrella": "Weather Item",
        "Rain Jacket": "Protection Item Plus",
        "Sweatshirt": "Comfort Item"
    },
    healthcare: {
        "Customer": "Patient",
        "Order": "Appointment",
        "Product": "Treatment",
        "Subscription": "Care Plan",
        "Started Checkout": "Started Booking",
        "Placed Order": "Confirmed Appointment",
        "Abandoned Cart": "Incomplete Booking",
        "Added to Cart": "Selected Treatment",
        "Viewed Product": "Viewed Treatment",
        "Customer Lifetime Value": "Patient Lifetime Value",
        "Average Order Value": "Average Treatment Value",
        "Joggers": "Movement Treatment Plus",
        "Drawstring": "Comfort Treatment",
        "Cotton Drawstring": "Premium Treatment Plus",
        "Hat": "Basic Treatment",
        "Vest": "Core Treatment",
        "Tee": "Essential Treatment",
        "Tote": "Support Treatment",
        "Umbrella": "Protection Treatment",
        "Rain Jacket": "Weather Treatment Plus",
        "Sweatshirt": "Comfort Treatment Plus"
    },
    finance: {
        "Customer": "Client",
        "Order": "Transaction",
        "Product": "Investment",
        "Subscription": "Portfolio",
        "Started Checkout": "Started Transaction",
        "Placed Order": "Completed Transaction",
        "Abandoned Cart": "Abandoned Transaction",
        "Added to Cart": "Added to Portfolio",
        "Viewed Product": "Viewed Investment",
        "Customer Lifetime Value": "Client Lifetime Value",
        "Average Order Value": "Average Transaction Value",
        "Joggers": "Business Casual Pants",
        "Drawstring": "Casual Office Wear",
        "Cotton Drawstring": "Cotton Office Pants",
        "Hat": "Business Cap",
        "Vest": "Business Vest",
        "Tee": "Casual Friday Shirt",
        "Tote": "Business Bag",
        "Umbrella": "Executive Umbrella",
        "Rain Jacket": "Business Rain Coat",
        "Sweatshirt": "Office Sweater"
    },
    wellness: {
        "Customer": "Member",
        "Order": "Session",
        "Product": "Service",
        "Subscription": "Membership",
        "Started Checkout": "Started Booking",
        "Placed Order": "Booked Session",
        "Abandoned Cart": "Incomplete Booking",
        "Added to Cart": "Selected Service",
        "Viewed Product": "Viewed Service",
        "Customer Lifetime Value": "Member Lifetime Value",
        "Average Order Value": "Average Session Value",
        "Sales": "Bookings",
        "Revenue": "Revenue",
        "Purchase": "Booking",
        "Inventory": "Availability",
        "Store": "Location",
        "Checkout": "Book Now",
        "Shopping Cart": "Selected Services",
        "Add to Cart": "Select Service",
        "Buy Now": "Book Now",
        "Payment": "Payment",
        "Shipping": "Location",
        "Delivery": "Service Delivery",
        "Joggers": "Movement Service Plus",
        "Drawstring": "Comfort Service",
        "Cotton Drawstring": "Premium Service Plus",
        "Hat": "Basic Service",
        "Vest": "Core Service",
        "Tee": "Essential Service",
        "Tote": "Support Service",
        "Umbrella": "Protection Service",
        "Rain Jacket": "Weather Service Plus",
        "Sweatshirt": "Comfort Service Plus"
    },
    athletic: {
        "Product": "Activewear",
        "Joggers": "Performance Joggers",
        "Drawstring": "Comfort Drawstring",
        "Cotton Drawstring": "Cotton Comfort Drawstring",
        "Hat": "Performance Cap",
        "Vest": "Training Vest",
        "Tee": "Performance Tee",
        "Tote": "Gym Tote",
        "Umbrella": "All-Weather Umbrella",
        "Rain Jacket": "Weather-Resistant Jacket",
        "Sweatshirt": "Performance Sweatshirt",
        "Store": "Fitness Store",
        "Inventory": "Athletic Gear",
        "Shopping": "Gear Shopping",
        "Customer": "Athlete",
        "Order": "Gear Order"
    },
    custom: {}
};

function createMappingNode(original = '', replacement = '') {
    const node = document.createElement('div');
    node.className = 'mapping-node';
    node.innerHTML = `
        <div class="mapping-fields">
            <input type="text" class="mapping-input original" value="${original}" placeholder="Original">
            <span class="mapping-arrow">→</span>
            <input type="text" class="mapping-input replacement" value="${replacement}" placeholder="Replacement">
            <button class="delete-mapping" title="Delete mapping">✕</button>
        </div>
    `;

    // Add delete functionality
    node.querySelector('.delete-mapping').addEventListener('click', () => {
        node.remove();
        updateMappingState();
    });

    // Add input change listeners
    node.querySelectorAll('.mapping-input').forEach(input => {
        input.addEventListener('input', updateMappingState);
    });

    return node;
}

async function initializeUI() {
    try {
        const { mapping, enabled } = await chrome.storage.sync.get(['mapping', 'enabled']);
        const { pendingSelection } = await chrome.storage.local.get('pendingSelection');
        
        currentEnabledState = !!enabled;
        loadMappings(mapping || {});
        updateUI();
        initializeTemplateSelect();
        initializeTabs();
        
        // Handle pending selection
        if (pendingSelection && Date.now() - pendingSelection.timestamp < 5000) {
            await handlePendingSelection(pendingSelection);
        }
    } catch (error) {
        console.error('Error initializing UI:', error);
    }
}

async function handlePendingSelection(pendingSelection) {
    try {
        // Clear the pending selection
        await chrome.storage.local.remove('pendingSelection');
        
        // Switch to Templates tab first
        switchToTab('templates');
        
        const container = document.getElementById('mapping-nodes');
        if (container) {
            const emptyState = container.querySelector('.empty-state');
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            
            const newNode = createMappingNode(pendingSelection.text, '');
            newNode.classList.add('new-mapping-node');
            container.appendChild(newNode);
            
            const replacementInput = newNode.querySelector('.replacement');
            if (replacementInput) {
                replacementInput.focus();
            }
            
            await updateMappingState();
        }
    } catch (error) {
        console.error('Error handling pending selection:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI components
    initializeUI();

    // Add new mapping button functionality
    const addMappingButton = document.getElementById('add-mapping');
    if (addMappingButton) {
        addMappingButton.addEventListener('click', () => {
            const container = document.getElementById('mapping-nodes');
            if (container) {
                // Clear the empty state if it exists
                const emptyState = container.querySelector('.empty-state');
                if (emptyState) {
                    emptyState.style.display = 'none';
                }
                
                // Add new mapping node with animation
                const newNode = createMappingNode();
                newNode.classList.add('new-mapping-node');
                container.appendChild(newNode);
                
                // Focus the first input
                const firstInput = newNode.querySelector('input');
                if (firstInput) {
                    firstInput.focus();
                }
                
                updateMappingState();
            }
        });
    }

    // Add analyze-url event listener
    const analyzeUrlButton = document.getElementById('analyze-url');
    if (analyzeUrlButton) {
        analyzeUrlButton.addEventListener('click', async () => {
            const urlInput = document.getElementById('website-url');
            const resultsContainer = document.getElementById('analysis-results');
            const url = urlInput.value.trim();

            if (!url) {
                resultsContainer.innerHTML = `
                    <div class="error-message">
                        Please enter a valid website URL
                    </div>
                `;
                return;
            }

            try {
                resultsContainer.innerHTML = `
                    <div class="analysis-status">
                        <div class="loading-spinner"></div>
                        <div>Analyzing website content...</div>
                    </div>
                `;

                // Fetch website content
                const response = await fetch(url);
                const html = await response.text();

                // Extract relevant content using DOM parser
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const content = {
                    title: doc.title,
                    metaDescription: doc.querySelector('meta[name="description"]')?.content || '',
                    metaKeywords: doc.querySelector('meta[name="keywords"]')?.content || '',
                    h1: Array.from(doc.querySelectorAll('h1')).map(h => h.textContent).join(' '),
                    mainContent: doc.querySelector('main')?.textContent || doc.body.textContent
                };

                // Analyze with OpenAI
                const analysis = await analyzeWithOpenAI(content, resultsContainer);

                // Display results
                resultsContainer.innerHTML = `
                    <div class="suggestions-container">
                        <h3>Suggested Mappings</h3>
                        <div class="suggested-mappings">
                            ${Object.entries(analysis.mappings)
                                .map(([original, replacement]) => `
                                    <div class="suggestion-item">
                                        <input type="checkbox" checked>
                                        <span class="original">${original}</span>
                                        <span class="arrow">→</span>
                                        <span class="replacement">${replacement}</span>
                                    </div>
                                `).join('')}
                        </div>
                        <button id="apply-suggestions" class="analyze-button">
                            Apply Selected Mappings
                        </button>
                    </div>
                `;

                // Add event listener for applying suggestions
                document.getElementById('apply-suggestions').addEventListener('click', () => {
                    const selectedMappings = {};
                    document.querySelectorAll('.suggestion-item input:checked').forEach(checkbox => {
                        const item = checkbox.closest('.suggestion-item');
                        const original = item.querySelector('.original').textContent;
                        const replacement = item.querySelector('.replacement').textContent;
                        selectedMappings[original] = replacement;
                    });

                    loadMappings(selectedMappings);
                    resultsContainer.innerHTML = '<div class="success-message">Mappings applied successfully!</div>';
                });

            } catch (error) {
                resultsContainer.innerHTML = `
                    <div class="error-message">
                        Error analyzing website: ${error.message}
                    </div>
                `;
            }
        });
    }

    // Add template-select event listener
    const templateSelect = document.getElementById('template-select');
    if (templateSelect) {
        templateSelect.addEventListener('change', (e) => {
            const selected = e.target.value;
            if (selected && PRESET_TEMPLATES[selected]) {
                loadMappings(PRESET_TEMPLATES[selected]);
                updateMappingState();
            }
        });
    }

    // Add enable toggle functionality
    const toggle = document.getElementById('enable-toggle');
    if (toggle) {
        toggle.addEventListener('change', async (e) => {
            currentEnabledState = e.target.checked;
            await chrome.storage.sync.set({ enabled: currentEnabledState });
            
            // Send message to background script to update icon
            chrome.runtime.sendMessage({
                type: 'updateIcon',
                enabled: currentEnabledState
            });
        });
    }

    // Add toggle button click handler
    const toggleButton = document.getElementById('toggle');
    if (toggleButton) {
        toggleButton.addEventListener('click', async () => {
            try {
                // Update UI immediately for better responsiveness
                currentEnabledState = !currentEnabledState;
                updateUI();
                
                // Start all async operations concurrently
                const promises = [
                    // Update storage
                    chrome.storage.sync.set({ enabled: currentEnabledState }),
                    
                    // Update icon
                    chrome.runtime.sendMessage({
                        type: 'updateIcon',
                        enabled: currentEnabledState
                    }).catch(err => console.log('Error updating icon:', err)),
                    
                    // Get active tab
                    chrome.tabs.query({ active: true, currentWindow: true })
                        .then(([tab]) => {
                            if (tab?.id) {
                                // Don't wait for message response
                                chrome.tabs.sendMessage(tab.id, {
                                    action: 'runReplacementsNow'
                                }).catch(() => {});
                                
                                // Reload the tab
                                return chrome.tabs.reload(tab.id);
                            }
                        })
                ];
                
                // Wait for all operations to complete
                await Promise.all(promises);
                
            } catch (error) {
                console.error('Error in toggle button handler:', error);
                // Revert UI state if there was an error
                currentEnabledState = !currentEnabledState;
                updateUI();
            }
        });
    }

    // Add quick replacement functionality
    initializeQuickReplace();
});

function updateUI() {
    const status = document.getElementById('status');
    const toggleButton = document.getElementById('toggle');
    const toggle = document.getElementById('enable-toggle');

    if (currentEnabledState) {
        status.innerHTML = `
            <div class="active-status">
                <div class="status-text">
                    <span class="status-dot active"></span>
                    Replacements Active
                </div>
                <span class="status-hint">Changes apply automatically</span>
            </div>
        `;
        if (toggleButton) {
            toggleButton.textContent = "Disable & Reload";
            toggleButton.classList.add('active');
        }
    } else {
        status.innerHTML = `
            <div class="inactive-status">
                <div class="status-text">
                    <span class="status-dot inactive"></span>
                    Replacements Inactive
                </div>
                <span class="status-hint">Enable to start replacing text</span>
            </div>
        `;
        if (toggleButton) {
            toggleButton.textContent = "Enable & Reload";
            toggleButton.classList.remove('active');
        }
    }

    const templateSelector = document.getElementById('template-select');
    templateSelector.innerHTML = `
        <option value="">Select Industry Template</option>
        ${Object.keys(PRESET_TEMPLATES).map(industry =>
        `<option value="${industry}">${industry.charAt(0).toUpperCase() + industry.slice(1)}</option>`
    ).join('')}
    `;

    // Add analytics summary if available
    const statsContainer = document.createElement('div');
    statsContainer.className = 'analytics-summary';
    chrome.storage.sync.get('replacementStats', ({ replacementStats }) => {
        if (replacementStats) {
            const mostUsed = Object.entries(replacementStats)
                .sort((a, b) => b[1].useCount - a[1].useCount)
                .slice(0, 5);

            statsContainer.innerHTML = `
                <div class="analytics-card">
                    <h3>Top Replacements</h3>
                    <div class="stats-grid">
                        ${mostUsed.map(([key, stats]) => `
                            <div class="stat-item">
                                <div class="stat-value">${stats.useCount}</div>
                                <div class="stat-label">${key.split(':')[0]} → ${key.split(':')[1]}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    });

    if (toggle) {
        toggle.checked = currentEnabledState;
    }
}

async function loadMappings(mappings) {
    const container = document.getElementById('mapping-nodes');
    if (!container) return;

    // Clear existing mappings
    container.innerHTML = '';

    // Check if there are any mappings
    if (!mappings || Object.keys(mappings).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>No Current Mappings</span>
            </div>
        `;
        return;
    }

    // Add mapping nodes for each mapping
    Object.entries(mappings).forEach(([original, replacement]) => {
        const node = createMappingNode(original, replacement);
        container.appendChild(node);
    });

    // Save to storage and update UI
    await chrome.storage.sync.set({ mapping: mappings });
    updateUI();
}

function updateMappingState() {
    const mappings = {};
    document.querySelectorAll('.mapping-node').forEach(node => {
        const original = node.querySelector('.original').value.trim();
        const replacement = node.querySelector('.replacement').value.trim();
        if (original && replacement) {
            mappings[original] = replacement;
        }
    });
    
    chrome.storage.sync.set({ mapping: mappings });
}

async function analyzeWithOpenAI(content, resultsContainer) {
    const SYSTEM_PROMPT = `You are a JSON-only response API for analyzing websites and generating personalized demo mappings.
    Return a JSON object in this format:
    {
        "industry": "string",
        "mappings": {
            "original": "replacement"
        }
    }`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: SYSTEM_PROMPT
                    },
                    {
                        role: "user",
                        content: `Return a JSON object analyzing this website content:\n\n${content}`
                    }
                ],
                temperature: 0.3
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`OpenAI API Error: ${response.status}`);
        }

        const data = await response.json();
        let analysis;
        
        try {
            analysis = JSON.parse(data.choices[0].message.content.trim());
        } catch (parseError) {
            console.error('Parse error:', data.choices[0].message.content);
            analysis = {
                industry: "unknown",
                mappings: {}
            };
        }

        return analysis;

    } catch (error) {
        console.error('Analysis error:', error);
        throw error;
    }
}

function initializeTemplateSelect() {
    const templateSelect = document.getElementById('template-select');
    templateSelect.innerHTML = `
        <option value="">Select a template</option>
        ${Object.keys(PRESET_TEMPLATES).map(template => `
            <option value="${template}">${template.charAt(0).toUpperCase() + template.slice(1)}</option>
        `).join('')}
    `;
}

function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and content
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.add('hidden'));

            // Add active class to clicked button and show corresponding content
            button.classList.add('active');
            const tabId = `${button.dataset.tab}-tab`;
            document.getElementById(tabId).classList.remove('hidden');
        });
    });
}

function saveCustomTemplate(name, mappings) {
    const customTemplates = {
        ...PRESET_TEMPLATES.custom,
        [name]: mappings
    };
    
    chrome.storage.sync.set({ 
        customTemplates,
        lastUsedTemplate: name 
    });
}

// Add quick replacement functionality
function initializeQuickReplace() {
    const quickReplaceContainer = document.createElement('div');
    quickReplaceContainer.className = 'quick-replace-container hidden';
    quickReplaceContainer.innerHTML = `
        <div class="quick-replace-header">
            <h3>Quick Replace</h3>
            <button class="close-quick-replace">✕</button>
        </div>
        <div class="quick-replace-content">
            <div class="selected-text"></div>
            <input type="text" class="quick-replace-input" placeholder="Replace with...">
            <div class="quick-replace-suggestions"></div>
            <button class="quick-replace-button">Replace</button>
        </div>
    `;
    document.body.appendChild(quickReplaceContainer);

    // Handle close button
    quickReplaceContainer.querySelector('.close-quick-replace').addEventListener('click', () => {
        quickReplaceContainer.classList.add('hidden');
    });

    // Handle quick replace button
    quickReplaceContainer.querySelector('.quick-replace-button').addEventListener('click', async () => {
        const selectedText = quickReplaceContainer.querySelector('.selected-text').textContent;
        const replacement = quickReplaceContainer.querySelector('.quick-replace-input').value;

        if (replacement) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'replaceSelectedText',
                    original: selectedText,
                    replacement: replacement
                });

                // Add to mappings if not exists
                const mappings = await chrome.storage.sync.get('mapping');
                const updatedMappings = {
                    ...mappings.mapping,
                    [selectedText]: replacement
                };
                await chrome.storage.sync.set({ mapping: updatedMappings });
                
                // Update UI
                loadMappings(updatedMappings);
                quickReplaceContainer.classList.add('hidden');
            }
        }
    });

    return quickReplaceContainer;
}

// Listen for text selection messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'textSelected') {
        const quickReplaceContainer = document.querySelector('.quick-replace-container');
        if (quickReplaceContainer) {
            quickReplaceContainer.querySelector('.selected-text').textContent = message.text;
            quickReplaceContainer.classList.remove('hidden');
            
            // Show suggestions based on existing mappings
            const suggestionsContainer = quickReplaceContainer.querySelector('.quick-replace-suggestions');
            suggestionsContainer.innerHTML = '';
            
            // Find similar mappings
            chrome.storage.sync.get('mapping', ({ mapping }) => {
                if (mapping) {
                    const suggestions = Object.entries(mapping)
                        .filter(([original]) => 
                            original.toLowerCase().includes(message.text.toLowerCase()) ||
                            message.text.toLowerCase().includes(original.toLowerCase()))
                        .slice(0, 3);
                    
                    if (suggestions.length > 0) {
                        suggestions.forEach(([original, replacement]) => {
                            const suggestionBtn = document.createElement('button');
                            suggestionBtn.className = 'suggestion-button';
                            suggestionBtn.textContent = `${original} → ${replacement}`;
                            suggestionBtn.addEventListener('click', () => {
                                quickReplaceContainer.querySelector('.quick-replace-input').value = replacement;
                            });
                            suggestionsContainer.appendChild(suggestionBtn);
                        });
                    }
                }
            });
        }
    } else if (message.type === 'selectedTextForAnalysis') {
        handleSelectedTextAnalysis(message.text, message.context);
    } else if (message.action === 'openExtension') {
        // Switch to the AI Analysis tab
        switchToTab('analyze');
    }
});

// Add a helper function to switch tabs
function switchToTab(tabId) {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Remove active class and hide all tabs
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.add('hidden'));
    
    // Activate the requested tab
    const targetButton = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
    const targetContent = document.getElementById(`${tabId}-tab`);
    
    if (targetButton && targetContent) {
        targetButton.classList.add('active');
        targetContent.classList.remove('hidden');
    }
}

// Simplified function to handle selected text
async function handleSelectedTextAnalysis(selectedText, context) {
    const analyzeTab = document.getElementById('analyze-tab');
    const selectedTextContainer = document.getElementById('selected-text-container');
    const selectedTextDisplay = document.getElementById('selected-text');
    
    // Show the analyze tab
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    analyzeTab.classList.remove('hidden');
    
    // Display selected text
    selectedTextContainer.classList.remove('hidden');
    selectedTextDisplay.textContent = selectedText;
    
    // Add click handler for adding to mappings
    document.getElementById('add-to-mappings').addEventListener('click', async () => {
        // Create a new mapping node
        const container = document.getElementById('mapping-nodes');
        if (container) {
            const emptyState = container.querySelector('.empty-state');
            if (emptyState) {
                emptyState.style.display = 'none';
            }
            
            const newNode = createMappingNode(selectedText, '');
            newNode.classList.add('new-mapping-node');
            container.appendChild(newNode);
            
            // Focus the replacement input
            const replacementInput = newNode.querySelector('.replacement');
            if (replacementInput) {
                replacementInput.focus();
            }
            
            // Switch to Templates tab
            switchToTab('templates');
        }
    });
}

// Helper function to display analysis results
function displayAnalysisResults(analysis, selectedText, resultsContainer) {
    resultsContainer.innerHTML = `
        <div class="suggestions-container">
            <h4>AI Suggestions</h4>
            <div class="suggested-mappings">
                ${analysis.suggestions.map(suggestion => `
                    <div class="suggestion-item">
                        <input type="checkbox" checked>
                        <span class="original">${selectedText}</span>
                        <span class="arrow">→</span>
                        <span class="replacement">${suggestion}</span>
                    </div>
                `).join('')}
            </div>
            <button id="apply-suggestions" class="primary-button">
                Apply Selected Suggestion
            </button>
        </div>
    `;
    
    // Add handler for applying suggestions
    document.getElementById('apply-suggestions').addEventListener('click', async () => {
        const selectedSuggestion = document.querySelector('.suggestion-item input:checked');
        if (selectedSuggestion) {
            const replacement = selectedSuggestion.closest('.suggestion-item')
                .querySelector('.replacement').textContent;
            
            // Get current mappings and update
            const { mapping = {} } = await chrome.storage.sync.get('mapping');
            const updatedMappings = {
                ...mapping,
                [selectedText]: replacement
            };
            
            // Save and update UI
            await chrome.storage.sync.set({ mapping: updatedMappings });
            await chrome.storage.local.remove('analysisState');
            
            // Update UI with new mappings
            loadMappings(updatedMappings);
            resultsContainer.innerHTML = '<div class="success-message">Mapping added successfully!</div>';
        }
    });
}


