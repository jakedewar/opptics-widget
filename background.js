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
            
            // Check if we have an active connection for this tab
            const connection = connections.get(tab.id);
            
            if (connection) {
                // If we have a connection, use it to send the message
                connection.postMessage({
                    action: 'storeSelection',
                    data: selectionData
                });
            } else {
                // If no connection, try to inject the content script first
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    
                    // Wait a bit for the content script to initialize
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Now try to send the message
                    await chrome.tabs.sendMessage(tab.id, {
                        action: 'storeSelection',
                        data: selectionData
                    });
                } catch (error) {
                    console.log('Could not inject or notify content script:', error);
                }
            }
            
            // Try to open popup
            try {
                await chrome.action.openPopup();
            } catch (error) {
                console.log('Could not open popup directly:', error);
                // Try alternative popup opening method
                if (connection) {
                    connection.postMessage({ action: 'openPopup' });
                } else {
                    await chrome.tabs.sendMessage(tab.id, { action: 'openPopup' })
                        .catch(err => console.log('Could not send openPopup message:', err));
                }
            }
        } catch (error) {
            console.error('Error handling context menu click:', error);
        }
    }
});

// Track active connections
const connections = new Map();

// Add the missing handlePortMessage function
function handlePortMessage(message, port, tabId) {
    switch (message.type) {
        case 'contentScriptReady':
            // Handle content script initialization
            chrome.storage.sync.get(['enabled', 'mapping'], (data) => {
                port.postMessage({
                    type: 'stateUpdate',
                    enabled: data.enabled,
                    mapping: data.mapping
                });
            });
            break;

        case 'updateState':
            // Handle state updates from content script
            chrome.storage.sync.set({
                enabled: message.enabled,
                mapping: message.mapping
            });
            break;

        case 'openPopup':
            // Handle popup open requests
            chrome.action.openPopup().catch(error => {
                console.log('Could not open popup:', error);
            });
            break;

        default:
            console.log('Unknown message type:', message.type);
    }
}

chrome.runtime.onConnect.addListener((port) => {
    const tabId = port.sender?.tab?.id;
    if (!tabId) return;

    // Store the connection
    connections.set(tabId, port);

    port.onDisconnect.addListener(() => {
        connections.delete(tabId);
    });

    port.onMessage.addListener((message, port) => {
        try {
            handlePortMessage(message, port, tabId);
        } catch (error) {
            console.error('Error handling port message:', error);
        }
    });
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        const port = connections.get(tabId);
        if (port) {
            try {
                // Resend any necessary state
                chrome.storage.sync.get(['enabled', 'mapping'], (data) => {
                    port.postMessage({
                        type: 'stateUpdate',
                        enabled: data.enabled,
                        mapping: data.mapping
                    });
                });
            } catch (error) {
                console.error('Error sending state update:', error);
                connections.delete(tabId);
            }
        }
    }
});

// Clean up connections when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    const port = connections.get(tabId);
    if (port) {
        try {
            port.disconnect();
        } catch (error) {
            console.error('Error disconnecting port:', error);
        }
        connections.delete(tabId);
    }
}); 