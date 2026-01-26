import { showToast } from './ui-utils.js';

/**
 * Handles the Incoming Call Settings modal on the home page.
 */
export function initIncomingCallSettings() {
    const modal = document.getElementById('incomingCallSettingsModal');
    const btn = document.getElementById('incomingCallSettingsButton');
    const closeBtn = document.getElementById('closeIncomingCallSettings');
    const saveBtn = document.getElementById('saveIncomingCallSettings');

    const localeInput = document.getElementById('incomingLocale');
    const voiceInput = document.getElementById('incomingVoice');
    const instructionsInput = document.getElementById('incomingInstructions');
    const welcomeMessageInput = document.getElementById('incomingWelcomeMessage');
    const projectInput = document.getElementById('incomingFoundryProject');
    const assistantInput = document.getElementById('incomingFoundryAssistant');

    let defaultVoices = [];

    if (!modal || !btn) return;

    // Open modal and load settings
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await loadSettings();
        modal.classList.add('visible');
    });

    // Update voice when locale changes
    localeInput.addEventListener('change', () => {
        const selectedLocale = localeInput.value;
        const mapping = defaultVoices.find(m => m.locale === selectedLocale);
        if (mapping) {
            voiceInput.value = mapping.voice;
        }
    });

    // Close modal
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('visible');
    });

    // Close on outside click
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.classList.remove('visible');
        }
    });

    // Save settings
    saveBtn.addEventListener('click', async () => {
        const settings = {
            locale: localeInput.value,
            voice: voiceInput.value,
            instructions: instructionsInput.value,
            welcomeMessage: welcomeMessageInput.value,
            foundryProjectName: projectInput.value,
            foundryAssistantId: assistantInput.value
        };

        try {
            const response = await fetch('/api/IncomingCallSettings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            if (response.ok) {
                showToast('Settings saved successfully', 'success');
                modal.classList.remove('visible');
            } else {
                showToast('Failed to save settings', 'error');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showToast('Error saving settings', 'error');
        }
    });

    async function loadSettings() {
        try {
            const response = await fetch('/api/IncomingCallSettings');
            if (response.ok) {
                const settings = await response.json();
                localeInput.value = settings.locale || 'en-US';
                voiceInput.value = settings.voice || '';
                instructionsInput.value = settings.instructions || '';
                welcomeMessageInput.value = settings.welcomeMessage || '';
                projectInput.value = settings.foundryProjectName || '';
                assistantInput.value = settings.foundryAssistantId || '';
                defaultVoices = settings.defaultVoices || [];
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }
}
