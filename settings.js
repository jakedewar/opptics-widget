document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('save-key');
    const apiKeyInput = document.getElementById('api-key');
    const statusMessage = document.getElementById('status-message');

    saveButton.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            statusMessage.textContent = 'Please enter an API key';
            return;
        }

        try {
            await SecureConfig.setApiKey(key);
            statusMessage.textContent = 'API key saved successfully';
            apiKeyInput.value = '';
        } catch (error) {
            statusMessage.textContent = 'Error saving API key';
            console.error(error);
        }
    });
}); 