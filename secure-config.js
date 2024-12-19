// Secure configuration handler
class SecureConfig {
    static async getApiKey() {
        try {
            // First try to get from chrome.storage
            const { apiKey } = await chrome.storage.sync.get('apiKey');
            if (apiKey) return apiKey;

            // If no key found, use default (development only)
            if (process.env.NODE_ENV === 'development') {
                return config.OPENAI_API_KEY;
            }
            
            return null;
        } catch (error) {
            console.error('Error getting API key:', error);
            return null;
        }
    }

    static async setApiKey(key) {
        await chrome.storage.sync.set({ apiKey: key });
    }
} 