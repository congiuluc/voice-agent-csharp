/**
 * Voice Avatar Module
 * 
 * Handles WebRTC connection for avatar video streaming,
 * WebSocket communication for audio/text, and UI interactions.
 * Based on Azure Voice Live API avatar implementation.
 */

import { 
    showToast, 
    addTranscript, 
    clearTranscripts, 
    addTraceEntry, 
    clearTraceEntries,
    toggleTranscriptPanel,
    toggleTracePanel,
    showSettingsModal,
    hideSettingsModal,
    loadSettings,
    saveSettings,
    updateStatus,
    extractVoiceName,
    generateWelcomeMessage,
    validateModelVoiceCompatibility,
    updateWelcomeMessageInput,
    autoResizeTextarea
} from './ui-utils.js';

import { 
    DEFAULT_SETTINGS, 
    VOICE_MODELS, 
    ITALIAN_VOICES, 
    AUDIO_CONFIG 
} from './config.js';
import { getSavedTheme, applyThemeMode, toggleTheme as themeToggle, listenForExternalChanges } from './theme-sync.js';

class VoiceAvatarApp {
    constructor() {
        // Configuration
        this.config = {
            SAMPLE_RATE: 24000,
            BUFFER_SIZE: 4096,
            MIN_BUFFER_SIZE: 2
        };

        // State
        this.state = {
            sessionId: null,
            websocket: null,
            peerConnection: null,
            mediaStream: null,
            audioContext: null,
            scriptProcessor: null,
            isMuted: false, // Start unmuted usually, but let's check UI
            isAvatarConnected: false,
            isAvatarPaused: false,
            avatarIceServers: [],
            remoteAudioElement: null,
            avatarConnectionId: null,
            playbackQueue: [],
            isPlaying: false,
            currentPlaybackSource: null,
            settings: { ...DEFAULT_SETTINGS }
        };

        // DOM Elements Cache
        this.elements = {};
    }

    /**
     * Initialize the application
     */
    init() {
        this.cacheElements();
        this.loadAppSettings();
        this.populateSettingsUI();
        this.initializeAvatarUI();
        this.setupEventListeners();
        // Apply the saved theme on init and start listening for external changes
        try {
            applyThemeMode(getSavedTheme());
            listenForExternalChanges((mode) => {
                // Ensure the theme is applied when changed in another tab/window
                applyThemeMode(mode);
            });
        } catch (err) {
            // If theme-sync isn't available for some reason, fail silently
            console.warn('Theme sync initialization failed', err);
        }
        // Initial UI state
        this.updateMuteButtonState();
        
        addTraceEntry('system', 'Voice Avatar initialized');
    }

    /**
     * Avatar metadata table used to populate styles, preview and gestures.
     */
    getAvatarCatalog() {
        return {
            harry: {
                displayName: 'Harry',
                styles: {
                    business: { label: 'Business', image: '/media/harry-business.png', gestures: ['wave', 'point'] },
                    casual: { label: 'Casual', image: '/media/harry-casual.png', gestures: ['smile', 'nod'] }
                }
            },
            jeff: {
                displayName: 'Jeff',
                styles: {
                    business: { label: 'Business', image: '/media/jeff-business.png', gestures: ['wave', 'thumbs-up'] },
                    casual: { label: 'Casual', image: '/media/jeff-casual.png', gestures: ['smile'] }
                }
            },
            lisa: {
                displayName: 'Lisa',
                styles: {
                    'casual-sitting': { label: 'Casual Sitting', image: '/media/lisa-casual-sitting.png', gestures: ['smile', 'nod'] },
                    casual: { label: 'Casual', image: '/media/lisa-casual.png', gestures: ['wave'] }
                }
            },
            lori: {
                displayName: 'Lori',
                styles: {
                    casual: { label: 'Casual', image: '/media/lori-casual.png', gestures: ['smile', 'hand-raise'] }
                }
            },
            max: {
                displayName: 'Max',
                styles: {
                    business: { label: 'Business', image: '/media/max-business.png', gestures: ['point'] },
                    casual: { label: 'Casual', image: '/media/max-casual.png', gestures: ['smile'] }
                }
            },
            meg: {
                displayName: 'Meg',
                styles: {
                    business: { label: 'Business', image: '/media/meg-business.png', gestures: ['wave', 'smile'] },
                    casual: { label: 'Casual', image: '/media/meg-casual.png', gestures: ['nod'] }
                }
            }
        };
    }

    /**
     * Initialize avatar UI: populate styles according to current character and update preview.
     */
    initializeAvatarUI() {
        const catalog = this.getAvatarCatalog();
        const charSelect = this.elements.avatarCharacterSelect;
        const styleSelect = this.elements.avatarStyleSelect;

        if (!charSelect || !styleSelect) return;

        // Ensure character list is in sync with catalog (only update styles here)
        const selectedCharacter = charSelect.value || this.state.settings.avatarCharacter || Object.keys(catalog)[0];
        this.populateStylesForCharacter(selectedCharacter);

        // Restore previous selection if available
        const savedStyle = this.state.settings.avatarStyle;
        if (savedStyle) {
            styleSelect.value = savedStyle;
        }

        // Update preview according to current values
        this.updateAvatarPreview(charSelect.value, styleSelect.value);
    }

    /**
     * Populate the avatarStyleSelect with styles for the given character
     */
    populateStylesForCharacter(character) {
        const catalog = this.getAvatarCatalog();
        const styleSelect = this.elements.avatarStyleSelect;
        if (!styleSelect) return;
        styleSelect.innerHTML = '';
        const characterEntry = catalog[character];
        if (!characterEntry) return;
        Object.keys(characterEntry.styles).forEach(styleKey => {
            const style = characterEntry.styles[styleKey];
            const opt = document.createElement('option');
            opt.value = styleKey;
            opt.textContent = style.label || styleKey;
            styleSelect.appendChild(opt);
        });
    }

    /**
     * Update avatar preview image and gestures list for character/style
     */
    updateAvatarPreview(character, style) {
        const catalog = this.getAvatarCatalog();
        const previewImg = document.getElementById('avatarPreviewImage');
        const gesturesList = document.getElementById('avatarGesturesList');
        if (!previewImg || !gesturesList) return;

        const charEntry = catalog[character];
        const styleEntry = charEntry?.styles?.[style];

        const imageUrl = styleEntry?.image || '/media/placeholder.png';
        previewImg.src = imageUrl;
        previewImg.onerror = () => { previewImg.src = '/media/placeholder.png'; };

        // Populate gestures
        gesturesList.innerHTML = '';
        const gestures = styleEntry?.gestures || [];
        if (gestures.length === 0) {
            gesturesList.textContent = 'Nessun gesto disponibile per questa combinazione.';
        } else {
            const ul = document.createElement('ul');
            gestures.forEach(g => {
                const li = document.createElement('li');
                li.textContent = g;
                ul.appendChild(li);
            });
            gesturesList.appendChild(ul);
        }
    }

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            // Avatar Container Elements
            avatarContainer: document.getElementById('avatarContainer'),
            avatarVideo: document.getElementById('avatarVideo'),
            avatarOverlay: document.getElementById('avatarOverlay'),
            avatarPlaceholder: document.getElementById('avatarPlaceholder'),
            avatarLoading: document.getElementById('avatarLoading'),
            avatarStatusDot: document.getElementById('avatarStatusDot'),
            avatarStatusText: document.getElementById('avatarStatusText'),

            // Controls
            startButton: document.getElementById('startButton'),
            stopButton: document.getElementById('stopButton'), // Might need to toggle visibility/state
            muteButton: document.getElementById('muteButton'),
            chatToggle: document.getElementById('chatToggle'),
            traceToggle: document.getElementById('traceToggle'),
            settingsButton: document.getElementById('settingsButton'),
            themeToggleButton: document.getElementById('themeToggleButton'),

            // Panels
            transcriptBox: document.getElementById('transcriptBox'),
            transcriptContent: document.getElementById('transcriptContent'),
            tracePanel: document.getElementById('tracePanel'),
            traceContent: document.getElementById('traceContent'),
            
            // Inputs
            textInput: document.getElementById('textInput'),
            sendTextButton: document.getElementById('sendTextButton'),
            clearChatButton: document.getElementById('clearChatButton'),
            clearTraceButton: document.getElementById('clearTraceButton'),

            // Settings Modal
            settingsModal: document.getElementById('settingsModal'),
            closeSettingsButton: document.getElementById('closeSettingsButton'),
            saveSettingsButton: document.getElementById('saveSettingsButton'),
            
            // Settings Inputs
            voiceModelSelect: document.getElementById('voiceModelSelect'),
            voiceSelect: document.getElementById('voiceSelect'),
            welcomeMessageInput: document.getElementById('welcomeMessageInput'),
            modelInstructionsInput: document.getElementById('modelInstructionsInput'),
            voiceLiveEndpointInput: document.getElementById('voiceLiveEndpointInput'),
            voiceLiveApiKeyInput: document.getElementById('voiceLiveApiKeyInput'),
            avatarCharacterSelect: document.getElementById('avatarCharacterSelect'),
            avatarStyleSelect: document.getElementById('avatarStyleSelect'),
            toastNotificationsToggle: document.getElementById('toastNotificationsToggle'),
            
            // Endpoint Test
            voiceLiveEndpointTest: document.getElementById('voiceLiveEndpointTest'),
            voiceLiveEndpointCopy: document.getElementById('voiceLiveEndpointCopy'),
            voiceLiveEndpointFeedback: document.getElementById('voiceLiveEndpointFeedback')
        };
    }

    /**
     * Load settings
     */
    loadAppSettings() {
        this.state.settings = loadSettings('VoiceAvatar');
    }

    /**
     * Populate settings dropdowns
     */
    populateSettingsUI() {
        // Populate Voice Models
        if (this.elements.voiceModelSelect) {
            this.elements.voiceModelSelect.innerHTML = '';
            VOICE_MODELS.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.textContent = model.name;
                option.title = model.description;
                if (model.id === this.state.settings.voiceModel) {
                    option.selected = true;
                }
                this.elements.voiceModelSelect.appendChild(option);
            });
        }

        // Populate Voices
        if (this.elements.voiceSelect) {
            this.elements.voiceSelect.innerHTML = '';
            ITALIAN_VOICES.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.id;
                option.textContent = voice.displayName;
                option.title = voice.description;
                if (voice.id === this.state.settings.voice) {
                    option.selected = true;
                }
                this.elements.voiceSelect.appendChild(option);
            });
        }

        // Set other inputs
        if (this.elements.welcomeMessageInput) this.elements.welcomeMessageInput.value = this.state.settings.welcomeMessage || '';
        if (this.elements.modelInstructionsInput) this.elements.modelInstructionsInput.value = this.state.settings.modelInstructions || '';
        if (this.elements.voiceLiveEndpointInput) this.elements.voiceLiveEndpointInput.value = this.state.settings.voiceLiveEndpoint || '';
        if (this.elements.voiceLiveApiKeyInput) this.elements.voiceLiveApiKeyInput.value = this.state.settings.voiceLiveApiKey || '';
        if (this.elements.avatarCharacterSelect) this.elements.avatarCharacterSelect.value = this.state.settings.avatarCharacter || 'lisa';
        if (this.elements.avatarStyleSelect) this.elements.avatarStyleSelect.value = this.state.settings.avatarStyle || 'casual-sitting';
        if (this.elements.toastNotificationsToggle) this.elements.toastNotificationsToggle.checked = this.state.settings.showToastNotifications;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Main Controls
        this.elements.startButton?.addEventListener('click', () => this.toggleSession());
        this.elements.muteButton?.addEventListener('click', () => this.toggleMute());
        this.elements.chatToggle?.addEventListener('click', () => toggleTranscriptPanel());
        this.elements.traceToggle?.addEventListener('click', () => toggleTracePanel());
        this.elements.settingsButton?.addEventListener('click', () => showSettingsModal());
        this.elements.themeToggleButton?.addEventListener('click', () => this.toggleTheme());

        // Chat & Trace
        this.elements.sendTextButton?.addEventListener('click', () => this.sendTextMessage());
        this.elements.textInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendTextMessage();
            }
        });
        this.elements.textInput?.addEventListener('input', () => autoResizeTextarea(this.elements.textInput));
        this.elements.clearChatButton?.addEventListener('click', () => clearTranscripts());
        this.elements.clearTraceButton?.addEventListener('click', () => clearTraceEntries());

        // Settings Modal
        this.elements.closeSettingsButton?.addEventListener('click', () => hideSettingsModal());
        this.elements.saveSettingsButton?.addEventListener('click', () => this.saveAppSettings());
        
        // Settings Logic
        this.elements.voiceSelect?.addEventListener('change', (e) => {
            updateWelcomeMessageInput(e.target.value, this.elements.welcomeMessageInput);
        });

        // Avatar selection changes
        this.elements.avatarCharacterSelect?.addEventListener('change', (e) => {
            const char = e.target.value;
            this.populateStylesForCharacter(char);
            // After repopulating styles, select first style by default
            const styleSelect = this.elements.avatarStyleSelect;
            if (styleSelect && styleSelect.options.length > 0) {
                styleSelect.selectedIndex = 0;
                this.updateAvatarPreview(char, styleSelect.value);
            }
        });

        this.elements.avatarStyleSelect?.addEventListener('change', (e) => {
            const style = e.target.value;
            const char = this.elements.avatarCharacterSelect?.value;
            this.updateAvatarPreview(char, style);
        });

        // Close modal on outside click
        this.elements.settingsModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                hideSettingsModal();
            }
        });
    }

    /**
     * Toggle Theme
     */
    toggleTheme() {
        // Delegate theme toggle to centralized theme-sync module
        try {
            themeToggle();
        } catch (err) {
            // Fallback: toggle data-theme attribute and localStorage if theme-sync fails
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        }
    }

    /**
     * Toggle Session (Start/Stop)
     */
    toggleSession() {
        if (this.state.sessionId || this.state.isAvatarConnected) {
            this.stopSession();
        } else {
            this.startSession();
        }
    }

    /**
     * Start Session
     */
    async startSession() {
        addTraceEntry('system', 'Starting avatar session...');
        
        // Update UI
        this.showAvatarLoading(true);
        this.updateAvatarStatus('connecting', 'Connessione...');
        if (this.elements.startButton) {
            this.elements.startButton.classList.add('active');
            this.elements.startButton.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="4" width="4" height="16"></rect>
                    <rect x="14" y="4" width="4" height="16"></rect>
                </svg>
            `; // Change to Stop icon
        }

        try {
            await this.connectWebSocket();
            this.sendConfig();
            addTraceEntry('system', 'Waiting for session to be ready...');
        } catch (error) {
            addTraceEntry('error', 'Failed to start avatar: ' + error.message);
            showToast('Errore avvio avatar: ' + error.message, 'error');
            this.stopSession();
        }
    }

    /**
     * Stop Session
     */
    stopSession() {
        addTraceEntry('system', 'Stopping avatar...');

        // Close WebRTC
        if (this.state.peerConnection) {
            this.state.peerConnection.close();
            this.state.peerConnection = null;
        }

        // Close WebSocket
        if (this.state.websocket) {
            this.state.websocket.close();
            this.state.websocket = null;
        }

        // Stop Microphone
        this.stopMicrophone();

        // Stop Remote Audio
        if (this.state.remoteAudioElement) {
            this.state.remoteAudioElement.pause();
            this.state.remoteAudioElement.srcObject = null;
            this.state.remoteAudioElement.remove();
            this.state.remoteAudioElement = null;
        }

        // Clear Video
        if (this.elements.avatarVideo) {
            this.elements.avatarVideo.srcObject = null;
        }

        // Reset State
        this.state.sessionId = null;
        this.state.isAvatarConnected = false;
        this.state.avatarConnectionId = null;
        this.state.avatarIceServers = [];

        // Reset UI
        this.showAvatarLoading(false);
        this.elements.avatarOverlay?.classList.remove('hidden');
        this.elements.avatarPlaceholder?.classList.remove('hidden');
        this.elements.avatarLoading?.classList.add('hidden');
        this.updateAvatarStatus('disconnected', 'Non connesso');

        if (this.elements.startButton) {
            this.elements.startButton.classList.remove('active');
            this.elements.startButton.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            `; // Change back to Play icon
        }

        addTraceEntry('system', 'Avatar stopped');
        showToast('Sessione terminata', 'info');
    }

    /**
     * Connect WebSocket
     */
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const host = window.location.host;
            const wsUrl = `${protocol}://${host}/avatar/ws`;

            addTraceEntry('system', `Connecting to ${wsUrl}`);

            this.state.websocket = new WebSocket(wsUrl);
            this.state.websocket.binaryType = 'arraybuffer';

            this.state.websocket.onopen = () => {
                addTraceEntry('system', 'WebSocket connected');
                resolve();
            };

            this.state.websocket.onclose = (event) => {
                addTraceEntry('system', `WebSocket closed: ${event.code}`);
                this.handleDisconnect();
            };

            this.state.websocket.onerror = (error) => {
                addTraceEntry('error', 'WebSocket error');
                reject(new Error('WebSocket connection failed'));
            };

            this.state.websocket.onmessage = (e) => this.handleWebSocketMessage(e);
        });
    }

    /**
     * Handle WebSocket Message
     */
    handleWebSocketMessage(event) {
        if (event.data instanceof ArrayBuffer) {
            this.handleAudioData(event.data);
        } else {
            try {
                const message = JSON.parse(event.data);
                this.handleJsonMessage(message);
            } catch (e) {
                addTraceEntry('error', 'Failed to parse message: ' + e.message);
            }
        }
    }

    /**
     * Handle JSON Message
     */
    handleJsonMessage(message) {
        const kind = message.Kind || message.kind;

        switch (kind) {
            case 'SessionEvent':
                this.handleSessionEvent(message);
                break;
            case 'Transcription':
                this.handleTranscription(message);
                break;
            case 'StopAudio':
                this.stopAudioPlayback();
                break;
            case 'IceServers':
                this.handleIceServers(message);
                break;
            case 'SdpAnswer':
                this.handleSdpAnswer(message);
                break;
            case 'Error':
                this.handleError(message);
                break;
            default:
                addTraceEntry('system', `Received: ${kind}`);
        }
    }

    /**
     * Handle Session Event
     */
    handleSessionEvent(message) {
        const eventType = message.Event || message.event;
        const payload = message.Payload || message.payload;

        addTraceEntry('system', `Session event: ${eventType}`);

        switch (eventType) {
            case 'SessionConnected':
                addTraceEntry('system', 'Session connected');
                if (payload?.IceServers && Array.isArray(payload.IceServers)) {
                    this.state.avatarIceServers = payload.IceServers.map(server => ({
                        urls: server.urls,
                        username: server.username,
                        credential: server.credential
                    })).filter(s => s.urls);
                }
                this.startAvatarWebRTC();
                break;
            case 'AvatarConnectionId':
                this.state.avatarConnectionId = payload?.ConnectionId || payload?.connectionId;
                break;
            case 'SessionCreated':
                this.state.sessionId = payload?.SessionId || payload?.sessionId;
                this.updateAvatarStatus('connected', 'Connesso');
                break;
            case 'SessionDisconnected':
            case 'SessionClosed':
            case 'SessionEnded':
            case 'Disconnected':
                this.updateAvatarStatus('disconnected', 'Disconnesso');
                break;
            case 'ResponseDone':
                this.updateAvatarStatus('connected', 'Connesso');
                break;
            case 'SpeechStarted':
                this.updateAvatarStatus('speaking', 'Parlando...');
                break;
            case 'SpeechStopped':
                this.updateAvatarStatus('connected', 'Connesso');
                break;
            case 'Error':
                const errorMsg = payload?.Message || payload?.message || 'Unknown error';
                addTraceEntry('error', `Session error: ${errorMsg}`);
                showToast(errorMsg, 'error');
                break;
        }
    }

    /**
     * Start WebRTC
     */
    async startAvatarWebRTC() {
        addTraceEntry('system', 'Starting WebRTC connection...');

        try {
            let iceServersConfig = this.state.avatarIceServers.length > 0 ? this.state.avatarIceServers : [
                { urls: 'stun:stun.l.google.com:19302' }
            ];

            // Fetch ICE if needed (simplified logic from original)
            if (this.state.avatarIceServers.length === 0) {
                try {
                    const iceResponse = await fetch('/avatar/ice');
                    if (iceResponse.ok) {
                        const iceData = await iceResponse.json();
                        if (iceData.iceServers || iceData.Urls) {
                             if (Array.isArray(iceData.iceServers)) {
                                iceServersConfig = iceData.iceServers;
                            } else if (iceData.Urls) {
                                iceServersConfig = [{
                                    urls: Array.isArray(iceData.Urls) ? iceData.Urls : [iceData.Urls],
                                    username: iceData.Username,
                                    credential: iceData.Credential
                                }];
                            }
                        }
                    }
                } catch (e) {
                    addTraceEntry('system', 'Using default STUN server');
                }
            }

            const rtcConfig = {
                bundlePolicy: 'max-bundle',
                iceServers: iceServersConfig
            };

            this.state.peerConnection = new RTCPeerConnection(rtcConfig);
            this.state.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
            this.state.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

            this.state.peerConnection.ontrack = (e) => this.handleTrack(e);
            this.state.peerConnection.onconnectionstatechange = () => {
                addTraceEntry('system', `WebRTC state: ${this.state.peerConnection.connectionState}`);
                if (this.state.peerConnection.connectionState === 'connected') {
                    this.onAvatarConnected();
                } else if (this.state.peerConnection.connectionState === 'failed') {
                    this.onAvatarAudioOnlyMode();
                }
            };

            const offer = await this.state.peerConnection.createOffer();
            await this.state.peerConnection.setLocalDescription(offer);

            // Wait for ICE gathering (simplified)
            await new Promise(resolve => setTimeout(resolve, 1000));

            const localSdp = this.state.peerConnection.localDescription?.sdp;
            if (!localSdp) throw new Error('Failed to obtain local SDP');

            // Send SDP via WebSocket
            if (this.state.websocket && this.state.websocket.readyState === WebSocket.OPEN) {
                this.state.websocket.send(JSON.stringify({
                    Kind: 'AvatarConnect',
                    Sdp: localSdp
                }));
                addTraceEntry('system', 'Sent SDP offer via WebSocket');
            }

        } catch (error) {
            addTraceEntry('error', 'WebRTC error: ' + error.message);
            this.onAvatarAudioOnlyMode();
        }
    }

    /**
     * Handle SDP Answer
     */
    async handleSdpAnswer(message) {
        const sdp = message.Sdp || message.sdp;
        if (sdp && this.state.peerConnection) {
            await this.state.peerConnection.setRemoteDescription({ type: 'answer', sdp });
            addTraceEntry('system', 'WebRTC handshake completed');
        }
    }

    /**
     * Handle Track
     */
    handleTrack(event) {
        const [stream] = event.streams;
        if (!stream) return;

        if (event.track.kind === 'video' && this.elements.avatarVideo) {
            this.elements.avatarVideo.srcObject = stream;
            this.elements.avatarVideo.play().catch(() => {});
        }

        if (event.track.kind === 'audio') {
            if (!this.state.remoteAudioElement) {
                this.state.remoteAudioElement = document.createElement('audio');
                this.state.remoteAudioElement.autoplay = true;
                this.state.remoteAudioElement.style.display = 'none';
                document.body.appendChild(this.state.remoteAudioElement);
            }
            this.state.remoteAudioElement.srcObject = stream;
            this.state.remoteAudioElement.play().catch(() => {});
        }
    }

    /**
     * On Avatar Connected
     */
    onAvatarConnected() {
        this.state.isAvatarConnected = true;
        this.showAvatarLoading(false);
        this.updateAvatarStatus('connected', 'Connesso');
        this.elements.avatarOverlay?.classList.add('hidden');
        this.startMicrophone();
        showToast('Avatar connesso', 'success');
    }

    /**
     * Audio Only Mode
     */
    onAvatarAudioOnlyMode() {
        addTraceEntry('system', 'Entering audio-only mode');
        this.showAvatarLoading(false);
        this.updateAvatarStatus('connected', 'Solo Audio');
        if (this.elements.avatarPlaceholder) {
            this.elements.avatarPlaceholder.innerHTML = '<p>Modalità Solo Audio</p>';
        }
        this.startMicrophone();
    }

    /**
     * Start Microphone
     */
    async startMicrophone() {
        try {
            this.state.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.config.SAMPLE_RATE
            });
            
            this.state.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: this.config.SAMPLE_RATE
                }
            });

            const micSource = this.state.audioContext.createMediaStreamSource(this.state.mediaStream);
            this.state.scriptProcessor = this.state.audioContext.createScriptProcessor(this.config.BUFFER_SIZE, 1, 1);

            this.state.scriptProcessor.onaudioprocess = (event) => {
                if (this.state.isMuted) return;
                const inputData = event.inputBuffer.getChannelData(0);
                const pcm16 = this.float32ToInt16(inputData);
                if (this.state.websocket && this.state.websocket.readyState === WebSocket.OPEN) {
                    this.state.websocket.send(pcm16.buffer);
                }
            };

            micSource.connect(this.state.scriptProcessor);
            this.state.scriptProcessor.connect(this.state.audioContext.destination);
            
            this.state.isMuted = false;
            this.updateMuteButtonState();
            addTraceEntry('system', 'Microphone started');

        } catch (error) {
            addTraceEntry('error', 'Microphone error: ' + error.message);
            showToast('Errore microfono', 'error');
        }
    }

    /**
     * Stop Microphone
     */
    stopMicrophone() {
        try {
            // Stop all tracks in media stream
            if (this.state.mediaStream) {
                this.state.mediaStream.getTracks().forEach(track => {
                    track.stop();
                });
                this.state.mediaStream = null;
            }

            // Disconnect and close script processor
            if (this.state.scriptProcessor) {
                this.state.scriptProcessor.disconnect();
                this.state.scriptProcessor = null;
            }

            // Close audio context
            if (this.state.audioContext && this.state.audioContext.state !== 'closed') {
                this.state.audioContext.close();
                this.state.audioContext = null;
            }

            addTraceEntry('system', 'Microphone stopped');
        } catch (error) {
            addTraceEntry('error', 'Error stopping microphone: ' + error.message);
        }
    }

    /**
     * Toggle Mute
     */
    toggleMute() {
        this.state.isMuted = !this.state.isMuted;
        this.updateMuteButtonState();
        addTraceEntry('system', this.state.isMuted ? 'Microphone muted' : 'Microphone unmuted');
    }

    /**
     * Update Mute Button UI
     */
    updateMuteButtonState() {
        if (this.elements.muteButton) {
            if (this.state.isMuted) {
                this.elements.muteButton.classList.add('muted');
                this.elements.muteButton.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                `;
            } else {
                this.elements.muteButton.classList.remove('muted');
                this.elements.muteButton.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                    </svg>
                `;
            }
        }
    }

    /**
     * Send Config
     */
    sendConfig() {
        if (!this.state.websocket) return;
        const config = {
            Kind: 'Config',
            SessionType: 'Avatar',
            VoiceModel: this.state.settings.voiceModel,
            Voice: this.state.settings.voice,
            VoiceLiveEndpoint: this.state.settings.voiceLiveEndpoint,
            VoiceLiveApiKey: this.state.settings.voiceLiveApiKey,
            VoiceModelInstructions: this.state.settings.modelInstructions,
            AvatarCharacter: this.state.settings.avatarCharacter,
            AvatarStyle: this.state.settings.avatarStyle,
            Locale: 'it-IT'
        };
        this.state.websocket.send(JSON.stringify(config));
        addTraceEntry('system', 'Configuration sent');
    }

    /**
     * Send Text Message
     */
    sendTextMessage() {
        const text = this.elements.textInput?.value?.trim();
        if (!text) return;

        if (!this.state.websocket || this.state.websocket.readyState !== WebSocket.OPEN) {
            showToast('Non connesso', 'error');
            return;
        }

        this.state.websocket.send(JSON.stringify({ Kind: 'Message', Text: text }));
        addTranscript('user', text);
        if (this.elements.textInput) {
            this.elements.textInput.value = '';
            autoResizeTextarea(this.elements.textInput);
        }
    }

    /**
     * Handle Transcription
     */
    handleTranscription(message) {
        const text = message.Text || message.text;
        const role = message.Role || message.role || 'agent';
        if (text) addTranscript(role, text);
    }

    /**
     * Handle Audio Data (for playback when avatar not connected)
     */
    handleAudioData(arrayBuffer) {
        if (!this.state.isAvatarConnected) {
            this.queueAudio(arrayBuffer);
        }
    }

    /**
     * Queue Audio
     */
    async queueAudio(arrayBuffer) {
        this.state.playbackQueue.push(arrayBuffer);
        if (!this.state.isPlaying && this.state.playbackQueue.length >= this.config.MIN_BUFFER_SIZE) {
            this.playNextAudio();
        }
    }

    /**
     * Play Next Audio
     */
    async playNextAudio() {
        if (this.state.playbackQueue.length === 0) {
            this.state.isPlaying = false;
            return;
        }
        this.state.isPlaying = true;
        const arrayBuffer = this.state.playbackQueue.shift();

        try {
            if (!this.state.audioContext) {
                this.state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            const audioBuffer = await this.resampleAudio(arrayBuffer);
            const source = this.state.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.state.audioContext.destination);
            source.onended = () => {
                if (this.state.currentPlaybackSource === source) {
                    this.state.currentPlaybackSource = null;
                    this.playNextAudio();
                }
            };
            this.state.currentPlaybackSource = source;
            source.start(0);
        } catch (e) {
            this.state.isPlaying = false;
        }
    }

    /**
     * Resample Audio
     */
    async resampleAudio(pcm16Buffer) {
        const int16Array = new Int16Array(pcm16Buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
        }
        const offlineContext = new OfflineAudioContext(1, float32Array.length, this.config.SAMPLE_RATE);
        const inputBuffer = offlineContext.createBuffer(1, float32Array.length, this.config.SAMPLE_RATE);
        inputBuffer.getChannelData(0).set(float32Array);
        const source = offlineContext.createBufferSource();
        source.buffer = inputBuffer;
        source.connect(offlineContext.destination);
        source.start(0);
        return await offlineContext.startRendering();
    }

    /**
     * Stop Audio Playback
     */
    stopAudioPlayback() {
        this.state.playbackQueue = [];
        if (this.state.currentPlaybackSource) {
            try { this.state.currentPlaybackSource.stop(); } catch (e) {}
            this.state.currentPlaybackSource = null;
        }
        this.state.isPlaying = false;
    }

    /**
     * Helper: Float32 to Int16
     */
    float32ToInt16(float32Array) {
        const int16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const sample = Math.max(-1, Math.min(1, float32Array[i]));
            int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        return int16;
    }

    /**
     * Handle Disconnect
     */
    handleDisconnect() {
        if (this.state.isAvatarConnected) {
            addTraceEntry('system', 'Disconnected from server');
            this.stopSession();
        }
    }

    /**
     * Handle Error
     */
    handleError(message) {
        const errorText = message.Message || message.message || 'Unknown error';
        addTraceEntry('error', errorText);
        showToast(errorText, 'error');
    }

    /**
     * Handle ICE Servers
     */
    handleIceServers(message) {
        if (message.Servers) {
            this.state.avatarIceServers = message.Servers;
        }
    }

    /**
     * Show/Hide Avatar Loading
     */
    showAvatarLoading(show) {
        if (show) {
            this.elements.avatarPlaceholder?.classList.add('hidden');
            this.elements.avatarLoading?.classList.remove('hidden');
        } else {
            this.elements.avatarPlaceholder?.classList.remove('hidden');
            this.elements.avatarLoading?.classList.add('hidden');
        }
    }

    /**
     * Update Avatar Status
     */
    updateAvatarStatus(state, text) {
        if (this.elements.avatarStatusDot) {
            this.elements.avatarStatusDot.className = 'status-dot';
            if (state === 'connected' || state === 'speaking') {
                this.elements.avatarStatusDot.classList.add('connected');
            } else {
                this.elements.avatarStatusDot.classList.add('disconnected');
            }
        }
        if (this.elements.avatarStatusText) {
            this.elements.avatarStatusText.textContent = text;
        }
    }

    /**
     * Save Settings
     */
    saveAppSettings() {
        this.state.settings.voiceModel = this.elements.voiceModelSelect?.value;
        this.state.settings.voice = this.elements.voiceSelect?.value;
        this.state.settings.welcomeMessage = this.elements.welcomeMessageInput?.value;
        this.state.settings.modelInstructions = this.elements.modelInstructionsInput?.value;
        this.state.settings.voiceLiveEndpoint = this.elements.voiceLiveEndpointInput?.value;
        this.state.settings.voiceLiveApiKey = this.elements.voiceLiveApiKeyInput?.value;
        this.state.settings.avatarCharacter = this.elements.avatarCharacterSelect?.value;
        this.state.settings.avatarStyle = this.elements.avatarStyleSelect?.value;
        this.state.settings.showToastNotifications = this.elements.toastNotificationsToggle?.checked;

        if (saveSettings(this.state.settings, 'VoiceAvatar')) {
            showToast('Impostazioni salvate', 'success');
            hideSettingsModal();
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const app = new VoiceAvatarApp();
    app.init();
});
