// Initialize connection status and check Chrome API availability
let isConnected = false;
let chromeAPIAvailable = typeof chrome !== 'undefined' && chrome.runtime && chrome.storage;

// Initialize connection status and port
let port = null;
let reconnectTimeout = null;

// Set up connection when content script loads - only if Chrome API is available
if (chromeAPIAvailable) {
    try {
        chrome.runtime.onConnect.addListener(port => {
            isConnected = true;
            port.onDisconnect.addListener(() => {
                isConnected = false;
                port = null;
                // Try to reconnect after a short delay
                setTimeout(setupConnection, 1000);
            });
        });
    } catch (error) {
        console.log('Error setting up Chrome connection:', error);
        chromeAPIAvailable = false;
    }
}

// Initialize connection
setupConnection();

// Add handler functions
function handleStoreSelection(data) {
    try {
        sessionStorage.setItem('opptics_pending_selection', JSON.stringify(data));
    } catch (error) {
        console.error('Error storing selection:', error);
    }
}

function handleOpenPopup() {
    // Implementation depends on how you want to open the popup
    // This could be a custom UI element or trigger the extension popup
    console.log('Popup open requested');
}

// Add this near the top of the file with other initialization
let widgetVisible = true; // Default state

// Modify the initialization IIFE to check visibility setting
(async function () {
    if (!chromeAPIAvailable) {
        console.log('Chrome API not available, skipping initialization');
        return;
    }

    try {
        // Get both mapping and widget visibility settings
        const { mapping, enabled, widgetVisible: storedVisibility } = 
            await chrome.storage.sync.get(['mapping', 'enabled', 'widgetVisible']);
        
        // Update global visibility state
        widgetVisible = storedVisibility ?? true;

        // Initialize widget with current visibility
        initializeWidget();

        // Apply replacements if enabled
        if (enabled && mapping && Object.keys(mapping).length > 0) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    applyReplacements(mapping);
                });
            } else {
                applyReplacements(mapping);
            }
        }
    } catch (error) {
        console.error('Error initializing content script:', error);
        chromeAPIAvailable = false;
    }
})();

// Add this helper function near the top
function isExtensionValid() {
    try {
        return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    } catch (error) {
        return false;
    }
}

// Add this function to handle widget initialization and re-initialization
function initializeWidget() {
    try {
        // Check if extension is still valid
        if (!isExtensionValid()) {
            console.log('Extension context invalid, attempting recovery...');
            setTimeout(initializeWidget, 1000);
            return;
        }

        // Remove existing widget if present
        const existingWidget = document.querySelector('.opptics-widget');
        if (existingWidget) {
            existingWidget.remove();
        }

        // Create and initialize new widget
        const widget = createWidget();
        initializeWidgetContent(widget);

        // Set initial visibility
        widget.style.display = widgetVisible ? 'block' : 'none';

        // Handle visibility changes with error checking
        const messageListener = (request, sender, sendResponse) => {
            try {
                if (request.action === 'updateWidgetVisibility') {
                    widgetVisible = request.visible;
                    widget.style.display = widgetVisible ? 'block' : 'none';
                }
            } catch (error) {
                console.error('Error in visibility handler:', error);
                // Remove invalid listener
                chrome.runtime.onMessage.removeListener(messageListener);
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);

        // Handle navigation events
        const visibilityHandler = () => {
            if (!document.hidden) {
                try {
                    // Check extension validity before updating
                    if (isExtensionValid()) {
                        widget.style.display = widgetVisible ? 'block' : 'none';
                    } else {
                        // Remove handler if extension is invalid
                        document.removeEventListener('visibilitychange', visibilityHandler);
                    }
                } catch (error) {
                    console.error('Error in visibility change handler:', error);
                }
            }
        };

        document.addEventListener('visibilitychange', visibilityHandler);

    } catch (error) {
        console.error('Error in initializeWidget:', error);
        // Attempt recovery after delay
        setTimeout(initializeWidget, 1000);
    }
}

// Update message listener with error handling - only if Chrome API is available
if (chromeAPIAvailable) {
    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            try {
                if (request.action === 'replaceSelectedText') {
                    const selection = window.getSelection();
                    
                    // Function to safely escape text for regex
                    const escapeRegexStr = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                                                 .replace(/\n/g, '\\n')
                                                 .replace(/\r/g, '\\r');
                    
                    // Function to replace text in a node
                    const replaceTextInNode = (node, range) => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const nodeText = node.textContent;
                            const originalText = request.original;
                            
                            // For exact matches within the selection range
                            if (range && 
                                node === range.startContainer && 
                                node === range.endContainer) {
                                const beforeText = nodeText.substring(0, range.startOffset);
                                const afterText = nodeText.substring(range.endOffset);
                                node.textContent = beforeText + request.replacement + afterText;
                                return true;
                            }
                            
                            // For partial matches or nodes fully within the selection
                            if (nodeText.includes(originalText)) {
                                node.textContent = nodeText.replace(originalText, request.replacement);
                                return true;
                            }
                        }
                        return false;
                    };

                    try {
                        const range = selection.getRangeAt(0);
                        const container = range.commonAncestorContainer;
                        let replaced = false;

                        // If selection is within a single text node
                        if (container.nodeType === Node.TEXT_NODE) {
                            replaced = replaceTextInNode(container, range);
                        } else {
                            // Extract the selected text and verify it matches
                            const selectedText = range.toString();
                            if (selectedText === request.original) {
                                // Replace the entire range content
                                range.deleteContents();
                                const textNode = document.createTextNode(request.replacement);
                                range.insertNode(textNode);
                                replaced = true;
                            }
                        }
                        
                        sendResponse({ success: replaced });
                    } catch (error) {
                        console.error('Error during replacement:', error);
                        sendResponse({ success: false, error: error.message });
                    }
                    
                    return true; // Keep message channel open for async response
                } else if (request.action === 'getSelectedText') {
                    const selection = window.getSelection();
                    const selectedText = selection.toString().trim();
                    if (selectedText) {
                        sendResponse({ 
                            success: true, 
                            text: selectedText,
                            context: getSelectionContext(selection)
                        });
                    } else {
                        sendResponse({ success: false });
                    }
                }
            } catch (error) {
                console.error('Error in message listener:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true;
        });
    } catch (error) {
        console.log('Error setting up message listener:', error);
        chromeAPIAvailable = false;
    }
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
             .replace(/\n/g, '\\n')
             .replace(/\r/g, '\\r');
}

function applyReplacements(mapping) {
    // Validate mapping
    if (!mapping || Object.keys(mapping).length === 0) return;

    console.log('Starting replacements with mapping:', mapping);

    // Cache the compiled regexes - removed \b word boundaries, added handling for newlines
    const replacements = Object.entries(mapping).map(([original, replacement]) => ({
        regex: new RegExp(escapeRegex(original), 'g'),
        replacement
    }));

    // Batch process nodes for better performance
    const batchSize = 100;
    let pendingNodes = [];

    // Track replacement usage
    async function trackReplacement(original, replacement, context) {
        const stats = await chrome.storage.sync.get('replacementStats') || {};
        const key = `${original}:${replacement}`;
        
        if (!stats[key]) {
            stats[key] = {
                useCount: 0,
                contexts: [],
                lastUsed: null,
                effectiveness: null
            };
        }

        stats[key].useCount++;
        stats[key].lastUsed = new Date().toISOString();
        stats[key].contexts.push({
            url: window.location.href,
            context: context.substring(0, 100),
            timestamp: new Date().toISOString()
        });

        await chrome.storage.sync.set({ replacementStats: stats });
    }

    function processTextNode(node) {
        pendingNodes.push(node);
        if (pendingNodes.length >= batchSize) {
            processBatch();
        }
    }

    function processBatch() {
        pendingNodes.forEach(node => {
            const originalText = node.nodeValue;
            let newText = originalText;
            let changed = false;

            for (const { regex, replacement } of replacements) {
                if (regex.test(newText)) {
                    regex.lastIndex = 0;
                    if (newText !== originalText) {
                        trackReplacement(regex.source, replacement, originalText);
                    }
                    newText = newText.replace(regex, replacement);
                    changed = true;
                }
            }

            if (changed) {
                node.nodeValue = newText;
            }
        });
        pendingNodes = [];
    }

    function processNode(node) {
        if (!node) return;

        // Skip if node is in an excluded element
        if (node.nodeType === Node.ELEMENT_NODE &&
            (node.tagName === 'SCRIPT' ||
                node.tagName === 'STYLE' ||
                node.tagName === 'INPUT' ||
                node.tagName === 'TEXTAREA' ||
                node.isContentEditable)) {
            return;
        }

        // Process text nodes
        if (node.nodeType === Node.TEXT_NODE) {
            processTextNode(node);
            return;
        }

        // Recursively process child nodes
        const children = Array.from(node.childNodes);
        for (const child of children) {
            processNode(child);
        }
    }

    // Initial processing
    processNode(document.body);

    // Set up observer for dynamic content
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Process new nodes
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    processNode(node);
                });
            }
            // Process changed text
            else if (mutation.type === 'characterData') {
                processTextNode(mutation.target);
            }
        }
    });

    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

// Add selection handling with persistent storage
document.addEventListener('mouseup', async () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText) {
        try {
            // Keep only the storage functionality
            const range = selection.getRangeAt(0);
            const selectionData = {
                text: selectedText,
                position: {
                    top: window.scrollY + range.getBoundingClientRect().top,
                    left: window.scrollX + range.getBoundingClientRect().left
                },
                timestamp: Date.now()
            };
            
            // Store in session storage
            sessionStorage.setItem('opptics_selection', JSON.stringify(selectionData));
            
            // Store in extension storage if available
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                try {
                    await chrome.storage.local.set({
                        lastSelection: selectionData
                    });
                } catch (error) {
                    console.log('Error storing in extension storage:', error);
                }
            }
        } catch (error) {
            console.error('Error handling selection:', error);
        }
    }
});

// Restore context menu click handler
document.addEventListener('contextmenu', async (e) => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText) {
        try {
            // Store the selection data regardless of where we'll show it
            const selectionData = {
                text: selectedText,
                context: getSelectionContext(selection),
                timestamp: Date.now()
            };

            // Check if chrome.storage API is available
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                await chrome.storage.local.set({
                    pendingSelection: selectionData
                });

                // Check widget visibility setting
                const { widgetVisible } = await chrome.storage.sync.get('widgetVisible');
                
                if (widgetVisible) {
                    // Show widget with mapping panel open
                    const widget = document.querySelector('.opptics-widget');
                    if (widget) {
                        const bar = widget.querySelector('.opptics-widget-bar');
                        const mappingPanel = widget.querySelector('.widget-mapping-panel');
                        const addMappingBtn = widget.querySelector('.add-mapping-btn');
                        
                        // Update input fields with selection
                        const [originalField] = widget.querySelectorAll('.mapping-field:not([readonly])');
                        if (originalField) {
                            originalField.value = selectedText;
                        }
                        
                        // Show widget and mapping panel
                        bar.classList.remove('hidden');
                        mappingPanel.classList.remove('hidden');
                        
                        // Update add mapping button state
                        const buttonText = addMappingBtn.querySelector('.button-text');
                        const addIcon = addMappingBtn.querySelector('.add-icon');
                        const hideIcon = addMappingBtn.querySelector('.hide-icon');
                        
                        buttonText.textContent = 'Hide Mappings';
                        addIcon.classList.add('hidden');
                        hideIcon.classList.remove('hidden');
                    }
                } else {
                    // Open extension popup to AI Analysis tab
                    chrome.runtime.sendMessage({
                        action: 'openExtension',
                        tab: 'analyze'
                    });
                }
            }
        } catch (error) {
            console.error('Error handling context menu selection:', error);
        }
    }
});

// Add message listener with error recovery
function setupMessageListener() {
    const listener = async (request, sender, sendResponse) => {
        if (request.action === 'replaceSelectedText') {
            try {
                // Try to get selection from session storage if needed
                const selection = window.getSelection();
                if (!selection.rangeCount) {
                    const stored = sessionStorage.getItem('opptics_selection');
                    if (stored) {
                        const data = JSON.parse(stored);
                        // Only use stored selection if it's recent (within last 5 seconds)
                        if (Date.now() - data.timestamp < 5000) {
                            const range = document.createRange();
                            const node = document.createTextNode(data.text);
                            range.selectNode(node);
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    }
                }

                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const newText = document.createTextNode(request.replacement);
                    range.deleteContents();
                    range.insertNode(newText);
                    sendResponse({ success: true });
                }
            } catch (error) {
                console.error('Error replacing text:', error);
                sendResponse({ success: false, error: error.message });
            }
        }
        return true;
    };

    // Only set up Chrome message listener if API is available
    if (chrome?.runtime?.onMessage) {
        try {
            chrome.runtime.onMessage.removeListener(listener);
            chrome.runtime.onMessage.addListener(listener);
        } catch (error) {
            console.error('Error setting up message listener:', error);
        }
    }
}

// Initialize message listener
setupMessageListener();

// Add auto-reconnection logic with availability check
let reconnectInterval = null;
function setupReconnection() {
    if (reconnectInterval) {
        clearInterval(reconnectInterval);
    }
    
    reconnectInterval = setInterval(() => {
        if (chrome?.runtime?.id) {
            setupMessageListener();
            clearInterval(reconnectInterval);
            reconnectInterval = null;
        }
    }, 1000);
}

// Start reconnection process
setupReconnection();

// Add helper function to get context around selection
function getSelectionContext(selection) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    // Get surrounding text (up to 100 chars before and after)
    let context = '';
    if (container.nodeType === Node.TEXT_NODE) {
        const fullText = container.textContent;
        const start = Math.max(0, range.startOffset - 100);
        const end = Math.min(fullText.length, range.endOffset + 100);
        context = fullText.substring(start, end);
    }
    
    return context;
}

// Set up connection when content script loads
function setupConnection() {
    // Clear any existing reconnect timeout
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    // Don't try to connect if we're already connected
    if (isConnected && port) {
        return;
    }

    try {
        // Check if extension is valid before attempting connection
        if (!isExtensionValid()) {
            console.log('Extension context invalid, will retry connection...');
            reconnectTimeout = setTimeout(setupConnection, 1000);
            return;
        }

        port = chrome.runtime.connect({ name: 'opptics-content' });
        
        port.onDisconnect.addListener(() => {
            const error = chrome.runtime.lastError;
            isConnected = false;
            port = null;

            if (error) {
                console.log('Port disconnected due to error:', error.message);
            }

            // Only attempt reconnection if the page is visible and extension is valid
            if (document.visibilityState === 'visible' && isExtensionValid()) {
                reconnectTimeout = setTimeout(setupConnection, 1000);
            }
        });

        // Set up message handling
        port.onMessage.addListener((message) => {
            try {
                handlePortMessage(message);
            } catch (error) {
                console.error('Error handling port message:', error);
            }
        });

        isConnected = true;
        
        // Notify that we're connected
        port.postMessage({ type: 'contentScriptReady' });

    } catch (error) {
        console.error('Error setting up connection:', error);
        isConnected = false;
        port = null;

        // Attempt reconnection if extension is still valid
        if (isExtensionValid()) {
            reconnectTimeout = setTimeout(setupConnection, 1000);
        }
    }
}

// Add visibility change handler
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Page is visible again, attempt to reconnect if needed
        if (!isConnected || !port) {
            setupConnection();
        }
    } else {
        // Page is hidden, clean up connection
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        if (port) {
            port.disconnect();
            port = null;
        }
        isConnected = false;
    }
});

// Handle page unload
window.addEventListener('unload', () => {
    if (port) {
        port.disconnect();
        port = null;
    }
    isConnected = false;
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
});

// Separate message handling logic
function handlePortMessage(message) {
    switch (message.type) {
        case 'updateWidgetVisibility':
            updateWidgetVisibility(message.visible);
            break;
        case 'applyReplacements':
            applyReplacements(message.mapping);
            break;
        // Add other message handlers as needed
    }
}

// Initialize connection when script loads
setupConnection();

// Add this near the top with other constants
const DEFAULT_TEMPLATES = {
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
        "Average Order Value": "Average Purchase Value"
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
        "Average Order Value": "Average Treatment Value"
    },
    athletic: {
        "Product": "Activewear",
        "Joggers": "Performance Joggers",
        "Drawstring": "Comfort Drawstring",
        "Cotton Drawstring": "Cotton Comfort Drawstring",
        "Hat": "Performance Cap",
        "Vest": "Training Vest",
        "Tee": "Performance Tee",
        "Store": "Fitness Store",
        "Inventory": "Athletic Gear",
        "Shopping": "Gear Shopping",
        "Customer": "Athlete",
        "Order": "Gear Order"
    }
};

function createWidget() {
    const widget = document.createElement('div');
    widget.className = 'opptics-widget';
    
    widget.innerHTML = `
        <div class="opptics-widget-button">
            <div class="widget-status-indicator"></div>
            <img src="${chrome.runtime.getURL('assets/icon48.png')}" alt="Opptics Widget" width="32" height="32">
        </div>
        <div class="opptics-widget-bar hidden">
            <div class="widget-mapping-panel hidden">
                <div class="mapping-header">
                    <div class="mapping-header-row">
                        <div class="mapping-description">
                            Replace text across the page in real-time. Changes apply automatically.
                        </div>
                        <select class="template-select">
                            <option value="">Templates</option>
                            <option value="retail">Retail</option>
                            <option value="healthcare">Healthcare</option>
                            <option value="athletic">Athletic</option>
                        </select>
                    </div>
                </div>
                <div class="mapping-content">
                    <div class="mapping-list"></div>
                    <div class="mapping-input-container">
                        <div class="mapping-input-row">
                            <input type="text" class="mapping-field" placeholder="Original text">
                            <span class="mapping-arrow">→</span>
                            <input type="text" class="mapping-field" placeholder="Replacement">
                            <button class="add-mapping-confirm" title="Add Mapping">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 6v12m-6-6h12" stroke-linecap="round"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="widget-bar-content">
                <div class="widget-bar-left">
                    <img src="${chrome.runtime.getURL('assets/icon32.png')}" alt="Opptics" width="20" height="20">
                    <span class="widget-bar-title">Opptics</span>
                </div>
                <div class="widget-bar-divider"></div>
                <div class="widget-bar-actions">
                    <button class="widget-action-btn add-mapping-btn" title="Add Mapping">
                        <svg class="add-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 6v12m-6-6h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <svg class="hide-icon hidden" width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <span class="button-text">Add Mapping</span>
                    </button>
                    <button class="widget-action-btn ai-analysis-btn" title="AI Analysis">
                        <svg class="action-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M12 6v12M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        AI Analysis
                        <span class="coming-soon-badge">Coming Soon</span>
                    </button>
                    <button class="widget-action-btn toggle-btn" title="Toggle replacements"></button>
                    <button class="widget-action-btn close-btn" title="Close">
                        <svg class="action-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(widget);

    // Add widget styles
    const styles = document.createElement('style');
    styles.textContent = `
        .opptics-widget {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .opptics-widget-button {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            transition: all 0.2s ease;
            border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .opptics-widget-button:hover {
            transform: scale(1.05);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
        }

        .opptics-widget-bar {
            position: absolute;
            bottom: 0;
            right: 0;
            background: white;
            border-radius: 16px;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
            border: 1px solid rgba(0, 0, 0, 0.08);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 1;
            transform: translateY(0);
            overflow: hidden;
            width: auto;
            white-space: nowrap;
            backdrop-filter: blur(8px);
        }

        .opptics-widget-bar.hidden {
            opacity: 0;
            transform: translateY(10px) scale(0.95);
            pointer-events: none;
        }

        .widget-bar-content {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            height: 52px;
            gap: 16px;
            min-width: max-content;
        }

        .widget-bar-left {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 4px;
            flex-shrink: 0;
        }

        .widget-bar-title {
            font-size: 13px;
            font-weight: 600;
            color: #1f2937;
            letter-spacing: -0.01em;
        }

        .widget-bar-divider {
            width: 1px;
            height: 28px;
            background: #e5e7eb;
            flex-shrink: 0;
            align-self: center;
        }

        .widget-bar-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 0 4px;
            margin-right: 4px;
        }

        .widget-action-btn {
            position: relative;
            overflow: visible;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 0 12px;
            height: 36px;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            background: white;
            color: #4b5563;
            letter-spacing: -0.01em;
            position: relative;
        }

        .widget-action-btn:hover {
            background: #f9fafb;
            border-color: #d1d5db;
            color: #111827;
        }

        .widget-action-btn .action-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 14px;
            height: 14px;
            opacity: 0.8;
        }

        .widget-action-btn:hover .action-icon {
            opacity: 1;
        }

        .widget-action-btn.primary-btn {
            background: #4f46e5;
            color: white;
            border: 1px solid #4338ca;
        }

        .widget-action-btn.primary-btn:hover {
            background: #4338ca;
            border-color: #3730a3;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(79, 70, 229, 0.1);
        }

        .widget-action-btn.close-btn {
            width: 36px;
            padding: 0;
            color: #6b7280;
        }

        .widget-action-btn.close-btn:hover {
            background: #fee2e2;
            border-color: #fecaca;
            color: #dc2626;
        }

        .action-icon {
            stroke: currentColor;
            stroke-width: 2;
        }

        .coming-soon-badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 500;
            background: #818cf8;
            color: white;
            margin-left: 6px;
            letter-spacing: -0.01em;
        }

        .ai-analysis-btn .action-icon,
        .add-mapping-btn .action-icon {
            color: var(--primary-color, #4f46e5);
        }

        .widget-mapping-panel {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease, padding 0.3s ease;
            width: 100%;
            background: white;
            border-bottom: 1px solid #e5e7eb;
            border-radius: 16px 16px 0 0;
        }

        .widget-mapping-panel:not(.hidden) {
            max-height: 300px;
            padding: 16px;
            border-top: 1px solid #e5e7eb;
            border-radius: 16px 16px 0 0;
        }

        .mapping-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 16px;
            max-height: 200px;
            overflow-y: auto;
            padding-right: 4px;
        }

        .mapping-list::-webkit-scrollbar {
            width: 6px;
        }

        .mapping-list::-webkit-scrollbar-track {
            background: transparent;
        }

        .mapping-list::-webkit-scrollbar-thumb {
            background: #e5e7eb;
            border-radius: 3px;
        }

        .mapping-list::-webkit-scrollbar-thumb:hover {
            background: #d1d5db;
        }

        .mapping-item {
            background: white;
            border-radius: 8px;
            transition: all 0.2s ease;
        }

        .mapping-input-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px;
            width: 100%;
        }

        .mapping-field {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            font-size: 13px;
            transition: all 0.2s ease;
            background: #f9fafb;
            color: #374151;
            font-weight: 450;
            letter-spacing: -0.01em;
        }

        .mapping-field:hover {
            border-color: #d1d5db;
        }

        .mapping-field:focus {
            outline: none;
            border-color: #4f46e5;
            background: white;
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }

        .mapping-field[readonly] {
            background: #f9fafb;
            cursor: default;
            user-select: text;
        }

        .mapping-field[readonly]:focus {
            outline: none;
            border-color: #e5e7eb;
            box-shadow: none;
        }

        .mapping-arrow {
            color: #94a3b8;
            font-size: 13px;
            font-weight: 500;
            flex-shrink: 0;
            padding: 0 4px;
        }

        .add-mapping-confirm {
            padding: 8px;
            background: #4f46e5;
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            width: 36px;
            height: 36px;
        }

        .add-mapping-confirm:hover {
            background: #4338ca;
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(79, 70, 229, 0.1);
        }

        .delete-mapping {
            padding: 8px;
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            border-radius: 6px;
            flex-shrink: 0;
            width: 32px;
            height: 32px;
        }

        .delete-mapping:hover {
            color: #ef4444;
            background: #fee2e2;
        }

        .add-mapping-btn svg {
            transition: all 0.2s ease;
        }

        .add-mapping-btn .hidden {
            display: none;
        }

        .add-mapping-btn .button-text {
            transition: all 0.2s ease;
        }

        .mapping-header {
            padding: 0 8px 12px 8px;
            border-bottom: 1px solid #e5e7eb;
            margin-bottom: 12px;
        }

        .mapping-description {
            font-size: 12px;
            color: #6b7280;
            line-height: 1.4;
        }

        .template-select {
            padding: 6px 10px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            font-size: 13px;
            color: #4b5563;
            background: white;
            cursor: pointer;
            transition: all 0.2s ease;
            min-width: 130px;
            font-weight: 500;
            appearance: none;
            background-image: url('data:image/svg+xml;charset=US-ASCII,<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9L12 15L18 9" stroke="%236B7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>');
            background-repeat: no-repeat;
            background-position: right 10px center;
            padding-right: 28px;
        }

        .template-select:hover {
            border-color: #d1d5db;
            background-color: #f9fafb;
            color: #111827;
        }

        .template-select:focus {
            outline: none;
            border-color: #4f46e5;
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
        }

        .template-select option {
            padding: 8px;
            font-size: 13px;
            color: #374151;
        }

        .mapping-header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
        }

        .mapping-description {
            font-size: 13px;
            color: #6b7280;
            line-height: 1.4;
            flex: 1;
        }

        .mapping-content {
            display: flex;
            flex-direction: column;
            height: 100%;
            max-height: 300px;
        }

        .mapping-list {
            flex: 1;
            overflow-y: auto;
            min-height: 50px;
            max-height: 400px;
            margin-bottom: 12px;
            padding-bottom: 8px;
        }

        .mapping-input-container {
            position: sticky;
            bottom: 0;
            background: white;
            border-top: 1px solid #e5e7eb;
            margin: 0 -16px;
            padding: 12px 16px;
            z-index: 1;
        }

        .widget-mapping-panel:not(.hidden) {
            display: flex;
            flex-direction: column;
            max-height: 500px;
            overflow: hidden;
        }

        .mapping-list {
            scroll-behavior: smooth;
        }

        .mapping-list::-webkit-scrollbar {
            width: 6px;
        }

        .mapping-list::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 3px;
        }

        .mapping-list::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 3px;
        }

        .mapping-list::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }

        .widget-status-indicator {
            position: absolute;
            top: -2px;
            right: -2px;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            border: 2px solid white;
            background: #4f46e5;
            opacity: 0;
            transition: all 0.3s ease;
        }

        .widget-status-indicator.active {
            opacity: 1;
            box-shadow: 0 0 8px 2px rgba(79, 70, 229, 0.25);
        }
    `;
    document.head.appendChild(styles);

    // Add event listeners
    const button = widget.querySelector('.opptics-widget-button');
    const bar = widget.querySelector('.opptics-widget-bar');
    const closeBtn = widget.querySelector('.close-btn');
    const toggleBtn = widget.querySelector('.toggle-btn');

    button.addEventListener('click', () => {
        bar.classList.toggle('hidden');
    });

    closeBtn.addEventListener('click', () => {
        bar.classList.add('hidden');
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!widget.contains(e.target)) {
            bar.classList.add('hidden');
        }
    });

    // Initialize toggle button state
    chrome.storage.sync.get('enabled', ({ enabled }) => {
        updateToggleButton(toggleBtn, enabled);
    });

    // Update toggle button click handler with reload functionality
    toggleBtn.addEventListener('click', async () => {
        try {
            const { enabled } = await chrome.storage.sync.get('enabled');
            const newState = !enabled;
            
            // Update UI immediately for better responsiveness
            updateToggleButton(toggleBtn, newState);
            
            // Start all async operations concurrently
            const promises = [
                // Update storage
                chrome.storage.sync.set({ enabled: newState }),
                
                // Update icon
                chrome.runtime.sendMessage({
                    type: 'updateIcon',
                    enabled: newState
                }).catch(err => console.log('Error updating icon:', err))
            ];
            
            // Wait for storage and icon updates
            await Promise.all(promises);
            
            // Reload the current page
            window.location.reload();
            
        } catch (error) {
            console.error('Error in toggle button handler:', error);
            // Revert UI if there was an error
            updateToggleButton(toggleBtn, !newState);
        }
    });

    // Update the status indicator based on current state
    chrome.storage.sync.get(['enabled'], ({ enabled }) => {
        const indicator = widget.querySelector('.widget-status-indicator');
        if (indicator) {
            indicator.classList.toggle('active', enabled);
        }
    });

    // Listen for enabled state changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.enabled) {
            const indicator = widget.querySelector('.widget-status-indicator');
            if (indicator) {
                indicator.classList.toggle('active', changes.enabled.newValue);
            }
        }
    });

    return widget;
}

function updateToggleButton(button, enabled) {
    button.classList.toggle('active', enabled);
    button.textContent = enabled ? 'Disable & Reload' : 'Enable & Reload';
    
    // Get mapping count to determine if there are active mappings
    chrome.storage.sync.get('mapping', ({ mapping = {} }) => {
        const hasMappings = mapping && Object.keys(mapping).length > 0;
        
        if (enabled) {
            // Destructive state - red secondary button
            button.classList.add('active');
            button.style.backgroundColor = '#fee2e2'; // Light red background
            button.style.color = '#dc2626'; // Red text
            button.style.border = '1px solid #dc2626'; // Red border
            button.style.fontWeight = '500';
            button.style.cursor = 'pointer';
        } else if (hasMappings) {
            // Primary state - blue/purple button
            button.classList.remove('active');
            button.style.backgroundColor = '#4f46e5'; // Primary color
            button.style.color = '#ffffff';
            button.style.border = '1px solid #4f46e5';
            button.style.fontWeight = '500';
            button.style.cursor = 'pointer';
        } else {
            // Disabled state - gray button
            button.classList.remove('active');
            button.style.backgroundColor = '#e5e7eb';
            button.style.color = '#9ca3af'; // Lighter text for disabled state
            button.style.border = '1px solid #d1d5db';
            button.style.fontWeight = '400';
            button.style.cursor = 'not-allowed';
        }
    });
}

function showMappingPanel(widget) {
    const mappingPanel = widget.querySelector('.widget-mapping-panel');
    if (!mappingPanel) return;
    
    // Toggle panel visibility
    mappingPanel.classList.toggle('hidden');
    
    // Load existing mappings
    if (!mappingPanel.classList.contains('hidden')) {
        loadExistingMappings(widget);
    }
}

async function loadExistingMappings(widget) {
    const mappingList = widget.querySelector('.mapping-list');
    const { mapping } = await chrome.storage.sync.get('mapping');
    
    mappingList.innerHTML = '';
    
    if (mapping && Object.keys(mapping).length > 0) {
        Object.entries(mapping).forEach(([original, replacement]) => {
            const mappingItem = createMappingItem(original, replacement);
            mappingList.appendChild(mappingItem);
        });
    }
}

function createMappingItem(original, replacement) {
    const item = document.createElement('div');
    item.className = 'mapping-item';
    item.innerHTML = `
        <div class="mapping-input-row">
            <input type="text" class="mapping-field" value="${original}" readonly>
            <span class="mapping-arrow">→</span>
            <input type="text" class="mapping-field" value="${replacement}" readonly>
            <button class="delete-mapping" title="Delete mapping">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
    `;
    
    // Add delete functionality with reload
    item.querySelector('.delete-mapping').addEventListener('click', async () => {
        const { mapping } = await chrome.storage.sync.get('mapping');
        delete mapping[original];
        await chrome.storage.sync.set({ mapping });
        item.remove();

        // If enabled, reapply remaining mappings
        const { enabled } = await chrome.storage.sync.get('enabled');
        if (enabled) {
            applyReplacements(mapping);
        }
    });
    
    return item;
}

async function initializeWidgetContent(widget) {
    try {
        const { mapping, enabled } = await chrome.storage.sync.get(['mapping', 'enabled']);
        
        // Initialize toggle button state
        const toggleBtn = widget.querySelector('.toggle-btn');
        updateToggleButton(toggleBtn, enabled);

        // Add mapping confirmation handler with reload trigger
        const addMappingConfirm = widget.querySelector('.add-mapping-confirm');
        addMappingConfirm.addEventListener('click', async () => {
            const [originalField, replacementField] = widget.querySelectorAll('.mapping-field:not([readonly])');
            const original = originalField.value.trim();
            const replacement = replacementField.value.trim();
            
            if (original && replacement) {
                const { mapping = {} } = await chrome.storage.sync.get('mapping');
                const updatedMapping = { ...mapping, [original]: replacement };
                await chrome.storage.sync.set({ mapping: updatedMapping });
                
                // Add new mapping to list
                const mappingList = widget.querySelector('.mapping-list');
                const mappingItem = createMappingItem(original, replacement);
                mappingList.appendChild(mappingItem);
                
                // Clear input fields
                originalField.value = '';
                replacementField.value = '';

                // If enabled, apply the new mapping immediately
                const { enabled } = await chrome.storage.sync.get('enabled');
                if (enabled) {
                    applyReplacements(updatedMapping);
                }
            }
        });

        // Update delete mapping handler to trigger reload
        const deleteMappingHandler = async (original) => {
            const { mapping } = await chrome.storage.sync.get('mapping');
            delete mapping[original];
            await chrome.storage.sync.set({ mapping });
            
            // If enabled, reapply all mappings
            const { enabled } = await chrome.storage.sync.get('enabled');
            if (enabled) {
                applyReplacements(mapping);
            }
        };

        // Listen for mapping changes from extension popup
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                if (changes.mapping) {
                    loadExistingMappings(widget);
                    
                    // If enabled, apply updated mappings
                    chrome.storage.sync.get('enabled', ({ enabled }) => {
                        if (enabled) {
                            applyReplacements(changes.mapping.newValue);
                        }
                        // Update toggle button state when mappings change
                        const toggleBtn = widget.querySelector('.toggle-btn');
                        if (toggleBtn) {
                            updateToggleButton(toggleBtn, enabled);
                        }
                    });
                }
            }
        });

        // Move the Add Mapping button click handler here
        const addMappingBtn = widget.querySelector('.add-mapping-btn');
        addMappingBtn.addEventListener('click', () => {
            const mappingPanel = widget.querySelector('.widget-mapping-panel');
            const buttonText = addMappingBtn.querySelector('.button-text');
            const addIcon = addMappingBtn.querySelector('.add-icon');
            const hideIcon = addMappingBtn.querySelector('.hide-icon');
            
            // Only toggle if it's currently hidden
            if (mappingPanel.classList.contains('hidden')) {
                mappingPanel.classList.remove('hidden');
                buttonText.textContent = 'Hide Mappings';
                addIcon.classList.add('hidden');
                hideIcon.classList.remove('hidden');
                loadExistingMappings(widget);
            } else {
                mappingPanel.classList.add('hidden');
                buttonText.textContent = 'Add Mapping';
                addIcon.classList.remove('hidden');
                hideIcon.classList.add('hidden');
            }
        });

        // AI Analysis button handler
        const aiAnalysisBtn = widget.querySelector('.ai-analysis-btn');
        aiAnalysisBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({
                action: 'openExtension',
                tab: 'analyze'
            });
        });

        // Listen for enabled state changes from extension popup
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync' && changes.enabled) {
                updateToggleButton(toggleBtn, changes.enabled.newValue);
                
                // Reload the page if the change came from the popup
                if (!changes.enabled.fromWidget) {
                    window.location.reload();
                }
            }
        });

        // Modify the template selection handler
        const templateSelect = widget.querySelector('.template-select');
        templateSelect.addEventListener('change', async () => {
            const selectedTemplate = templateSelect.value;
            
            if (selectedTemplate) {
                // Get current mappings
                const { mapping = {} } = await chrome.storage.sync.get('mapping');
                
                // Merge template mappings with existing custom mappings
                const templateMappings = DEFAULT_TEMPLATES[selectedTemplate] || {};
                const updatedMappings = {
                    ...mapping,
                    ...templateMappings
                };
                
                // Update storage and UI
                await chrome.storage.sync.set({ mapping: updatedMappings });
                
                // Ensure mapping panel is visible and load mappings
                const mappingPanel = widget.querySelector('.widget-mapping-panel');
                const buttonText = addMappingBtn.querySelector('.button-text');
                const addIcon = addMappingBtn.querySelector('.add-icon');
                const hideIcon = addMappingBtn.querySelector('.hide-icon');
                
                mappingPanel.classList.remove('hidden');
                buttonText.textContent = 'Hide Mappings';
                addIcon.classList.add('hidden');
                hideIcon.classList.remove('hidden');
                
                loadExistingMappings(widget);
                
                // Apply mappings if enabled
                const { enabled } = await chrome.storage.sync.get('enabled');
                if (enabled) {
                    applyReplacements(updatedMappings);
                }
            }
        });

    } catch (error) {
        console.error('Error initializing widget content:', error);
    }
}
