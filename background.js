// Basic background script to handle extension events
chrome.runtime.onInstalled.addListener(() => {
    console.log('Opptics extension installed');
    
    // Create the context menu item
    chrome.contextMenus.create({
        id: "addToOpptics",
        title: "Add to Opptics",
        contexts: ["selection"]
    });
});

// Handle context menu clicks with persistent storage
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "addToOpptics") {
        try {
            // Store in both local and session storage
            const selectionData = {
                text: info.selectionText,
                timestamp: Date.now()
            };
            
            await chrome.storage.local.set({ 
                pendingSelection: selectionData
            });
            
            // Send message to content script to store in session storage
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'storeSelection',
                    data: selectionData
                });
            } catch (error) {
                console.log('Could not notify content script');
            }
            
            // Try to open popup
            try {
                await chrome.action.openPopup();
            } catch (error) {
                console.log('Could not open popup');
                // Trigger popup open via content script
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'openPopup'
                });
            }
        } catch (error) {
            console.error('Error handling context menu click:', error);
        }
    }
});

// Add persistent connection handling
let connections = new Map();

chrome.runtime.onConnect.addListener(port => {
    const tabId = port.sender?.tab?.id;
    if (tabId) {
        connections.set(tabId, port);
        
        port.onDisconnect.addListener(() => {
            connections.delete(tabId);
        });
        
        port.onMessage.addListener(async (msg) => {
            if (msg.type === 'ready') {
                const { pendingSelection } = await chrome.storage.local.get('pendingSelection');
                if (pendingSelection && Date.now() - pendingSelection.timestamp < 5000) {
                    port.postMessage({ 
                        type: 'restoreSelection',
                        selection: pendingSelection
                    });
                }
            }
        });
    }
}); 