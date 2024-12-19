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

// Add tab removal cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
    connections.delete(tabId);
}); 