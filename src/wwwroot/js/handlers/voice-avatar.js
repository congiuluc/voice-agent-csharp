/**
 * Voice Avatar Module
 * 
 * Handles WebRTC connection for avatar video streaming,
 * WebSocket communication for audio/text, and UI interactions.
 * Based on Azure Voice Live API avatar implementation.
 */

import { BaseVoiceApp } from '../core/base-voice-app.js';
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
} from '../ui/ui-utils.js';

import { 
    DEFAULT_SETTINGS, 
    VOICE_MODELS, 
    VOICES, 
    AUDIO_CONFIG 
} from '../core/config.js';
import { getSavedTheme, applyThemeMode, toggleTheme as themeToggle, listenForExternalChanges } from '../ui/theme-sync.js';
import { SettingsManager } from '../modules/settings-manager.js';
import { initHamburgerMenu } from '../ui/hamburger-menu.js';

class VoiceAvatarApp extends BaseVoiceApp {
    constructor() {
        super('VoiceAvatar');

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
            isMuted: false,
            isAvatarConnected: false,
            isAvatarPaused: false,
            avatarIceServers: [],
            remoteAudioElement: null,
            avatarConnectionId: null,
            playbackQueue: [],
            isPlaying: false,
            currentPlaybackSource: null
        };
    }

    /**
     * Initialize the application
     */
    async init() {
        await super.init();
        this.initializeAvatarUI();
        this.updateMuteButtonState();
        addTraceEntry('system', window.APP_RESOURCES?.VoiceAvatarInitialized || 'Voice Avatar initialized');
    }

    /**
     * Avatar metadata table used to populate styles, preview and gestures.
     */
    getAvatarCatalog() {
        return {
            harry: {
                displayName: window.APP_RESOURCES?.AvatarHarry || 'Harry',
                styles: {
                    business: { label: window.APP_RESOURCES?.Business || 'Business', image: '/media/harry-business.png', gestures: ['wave', 'point'] },
                    casual: { label: window.APP_RESOURCES?.Casual || 'Casual', image: '/media/harry-casual.png', gestures: ['smile', 'nod'] }
                }
            },
            jeff: {
                displayName: window.APP_RESOURCES?.AvatarJeff || 'Jeff',
                styles: {
                    business: { label: window.APP_RESOURCES?.Business || 'Business', image: '/media/jeff-business.png', gestures: ['wave', 'thumbs-up'] },
                    casual: { label: window.APP_RESOURCES?.Casual || 'Casual', image: '/media/jeff-casual.png', gestures: ['smile'] }
                }
            },
            lisa: {
                displayName: window.APP_RESOURCES?.AvatarLisa || 'Lisa',
                styles: {
                    'casual-sitting': { label: window.APP_RESOURCES?.CasualSitting || 'Casual Sitting', image: '/media/lisa-casual-sitting.png', gestures: ['smile', 'nod'] },
                    casual: { label: window.APP_RESOURCES?.Casual || 'Casual', image: '/media/lisa-casual.png', gestures: ['wave'] }
                }
            },
            lori: {
                displayName: window.APP_RESOURCES?.AvatarLori || 'Lori',
                styles: {
                    casual: { label: window.APP_RESOURCES?.Casual || 'Casual', image: '/media/lori-casual.png', gestures: ['smile', 'hand-raise'] }
                }
            },
            max: {
                displayName: window.APP_RESOURCES?.AvatarMax || 'Max',
                styles: {
                    business: { label: window.APP_RESOURCES?.Business || 'Business', image: '/media/max-business.png', gestures: ['point'] },
                    casual: { label: window.APP_RESOURCES?.Casual || 'Casual', image: '/media/max-casual.png', gestures: ['smile'] }
                }
            },
            meg: {
                displayName: window.APP_RESOURCES?.AvatarMeg || 'Meg',
                styles: {
                    business: { label: window.APP_RESOURCES?.Business || 'Business', image: '/media/meg-business.png', gestures: ['wave', 'smile'] },
                    casual: { label: window.APP_RESOURCES?.Casual || 'Casual', image: '/media/meg-casual.png', gestures: ['nod'] }
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
        const selectedCharacter = charSelect.value || this.currentSettings.avatarCharacter || Object.keys(catalog)[0];
        this.populateStylesForCharacter(selectedCharacter);

        // Restore previous selection if available
        const savedStyle = this.currentSettings.avatarStyle;
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
            gesturesList.textContent = window.APP_RESOURCES?.NoGesturesAvailable || 'No gestures available for this combination.';
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
     * Initialize DOM element references
     */
    initDOMReferences() {
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
            voiceLiveEndpointFeedback: document.getElementById('voiceLiveEndpointFeedback'),

            // Hamburger Menu
            hamburgerButton: document.getElementById('hamburgerButton'),
            leftPanel: document.getElementById('leftPanel'),
            closeLeftPanel: document.getElementById('closeLeftPanel'),
            lp_startButton: document.getElementById('lp_startButton'),
            lp_muteButton: document.getElementById('lp_muteButton'),
            lp_traceToggle: document.getElementById('lp_traceToggle'),
            lp_settingsButton: document.getElementById('lp_settingsButton'),
            lp_chatToggle: document.getElementById('lp_chatToggle')
        };
        return !!(this.elements.avatarVideo && this.elements.startButton);
    }

    /**
     * Populate settings dropdowns
     */
    async populateSettings() {
        await super.populateSettings();

        // Avatar specific
        if (this.elements.avatarCharacterSelect) this.elements.avatarCharacterSelect.value = this.currentSettings.avatarCharacter || 'lisa';
        if (this.elements.avatarStyleSelect) this.elements.avatarStyleSelect.value = this.currentSettings.avatarStyle || 'casual-sitting';
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        super.setupEventListeners();

        // Chat & Trace specific
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
        addTraceEntry('system', window.APP_RESOURCES?.StartingAvatarSession || 'Starting avatar session...');
        
        // Update UI
        this.showAvatarLoading(true);
        this.updateAvatarStatus('connecting', window.APP_RESOURCES?.Connecting || 'Connecting...');
        if (this.elements.startButton) {
            this.elements.startButton.classList.add('active');
            // Toggle existing SVGs in the shared start button markup instead of replacing innerHTML
            const playIcon = document.getElementById('playIcon');
            const stopIcon = document.getElementById('stopIcon');
            if (playIcon) playIcon.classList.add('icon-hidden');
            if (stopIcon) stopIcon.classList.remove('icon-hidden');
        }

        try {
            await this.connectWebSocket();
            this.sendConfig();
            this.isSessionActive = true;
            addTraceEntry('system', window.APP_RESOURCES?.WaitingForSessionToBeReady || 'Waiting for session to be ready...');
        } catch (error) {
            addTraceEntry('error', (window.APP_RESOURCES?.AvatarStartError || 'Failed to start avatar: {0}').replace('{0}', error.message));
            this.conditionalShowToast(`${window.APP_RESOURCES?.AvatarStartError || 'Avatar start error'}: ` + error.message, 'error');
            this.stopSession();
        }
    }

    /**
     * Stop Session
     */
    stopSession() {
        addTraceEntry('system', window.APP_RESOURCES?.StoppingAvatar || 'Stopping avatar...');

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
        this.isSessionActive = false;

        // Reset UI
        this.showAvatarLoading(false);
        this.elements.avatarOverlay?.classList.remove('hidden');
        this.elements.avatarPlaceholder?.classList.remove('hidden');
        this.elements.avatarLoading?.classList.add('hidden');
        this.updateAvatarStatus('disconnected', window.APP_RESOURCES?.Disconnected || 'Disconnected');

        if (this.elements.startButton) {
            this.elements.startButton.classList.remove('active');
            // Toggle back to existing SVGs
            const playIcon = document.getElementById('playIcon');
            const stopIcon = document.getElementById('stopIcon');
            if (playIcon) playIcon.classList.remove('icon-hidden');
            if (stopIcon) stopIcon.classList.add('icon-hidden');
        }

        addTraceEntry('system', window.APP_RESOURCES?.AvatarStopped || 'Avatar stopped');
        showToast(window.APP_RESOURCES?.SessionEnded || 'Session ended', 'info');
    }

    /**
     * Connect WebSocket
     */
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const host = window.location.host;
            const wsUrl = `${protocol}://${host}/avatar/ws`;

            addTraceEntry('system', (window.APP_RESOURCES?.ConnectingTo || 'Connecting to {0}').replace('{0}', wsUrl));

            this.state.websocket = new WebSocket(wsUrl);
            this.state.websocket.binaryType = 'arraybuffer';

            this.state.websocket.onopen = () => {
                addTraceEntry('system', window.APP_RESOURCES?.WebSocketConnected || 'WebSocket connected');
                resolve();
            };

            this.state.websocket.onclose = (event) => {
                addTraceEntry('system', (window.APP_RESOURCES?.WebSocketClosed || 'WebSocket closed: {0}').replace('{0}', event.code));
                this.handleDisconnect();
            };

            this.state.websocket.onerror = (error) => {
                addTraceEntry('error', window.APP_RESOURCES?.WebSocketError || 'WebSocket error');
                reject(new Error(window.APP_RESOURCES?.WebSocketConnectionFailed || 'WebSocket connection failed'));
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
                addTraceEntry('error', (window.APP_RESOURCES?.FailedToParseMessage || 'Failed to parse message: {0}').replace('{0}', e.message));
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
                addTraceEntry('system', (window.APP_RESOURCES?.ReceivedKind || 'Received: {0}').replace('{0}', kind));
        }
    }

    /**
     * Handle Session Event
     */
    handleSessionEvent(message) {
        const eventType = message.Event || message.event;
        const payload = message.Payload || message.payload;

        addTraceEntry('system', (window.APP_RESOURCES?.SessionEvent || 'Session event: {0}').replace('{0}', eventType));

        switch (eventType) {
            case 'SessionConnected':
                addTraceEntry('system', window.APP_RESOURCES?.SessionConnected || 'Session connected');
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
                this.updateAvatarStatus('connected', window.APP_RESOURCES?.Connected || 'Connected');
                break;
            case 'SessionDisconnected':
            case 'SessionClosed':
            case 'SessionEnded':
            case 'Disconnected':
                this.updateAvatarStatus('disconnected', window.APP_RESOURCES?.Disconnected || 'Disconnected');
                break;
            case 'ResponseDone':
                this.updateAvatarStatus('connected', window.APP_RESOURCES?.Connected || 'Connected');
                break;
            case 'SpeechStarted':
                this.updateAvatarStatus('speaking', window.APP_RESOURCES?.Speaking || 'Speaking...');
                break;
            case 'SpeechStopped':
                this.updateAvatarStatus('connected', window.APP_RESOURCES?.Connected || 'Connected');
                break;
            case 'Error':
                const errorMsg = payload?.Message || payload?.message || window.APP_RESOURCES?.UnknownError || 'Unknown error';
                addTraceEntry('error', (window.APP_RESOURCES?.SessionError || 'Session error: {0}').replace('{0}', errorMsg));
                this.conditionalShowToast(errorMsg, 'error');
                break;
        }
    }

    /**
     * Start WebRTC
     */
    async startAvatarWebRTC() {
        addTraceEntry('system', window.APP_RESOURCES?.StartingWebRtc || 'Starting WebRTC connection...');

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
                    addTraceEntry('system', window.APP_RESOURCES?.UsingDefaultStun || 'Using default STUN server');
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
                addTraceEntry('system', (window.APP_RESOURCES?.WebRtcState || 'WebRTC state: {0}').replace('{0}', this.state.peerConnection.connectionState));
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
            if (!localSdp) throw new Error(window.APP_RESOURCES?.FailedToObtainLocalSdp || 'Failed to obtain local SDP');

            // Send SDP via WebSocket
            if (this.state.websocket && this.state.websocket.readyState === WebSocket.OPEN) {
                this.state.websocket.send(JSON.stringify({
                    Kind: 'AvatarConnect',
                    Sdp: localSdp
                }));
                addTraceEntry('system', window.APP_RESOURCES?.SentSdpOffer || 'Sent SDP offer via WebSocket');
            }

        } catch (error) {
            addTraceEntry('error', (window.APP_RESOURCES?.WebRtcError || 'WebRTC error: {0}').replace('{0}', error.message));
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
            addTraceEntry('system', window.APP_RESOURCES?.WebRtcHandshakeCompleted || 'WebRTC handshake completed');
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
        this.updateAvatarStatus('connected', window.APP_RESOURCES?.Connected || 'Connected');
        this.elements.avatarOverlay?.classList.add('hidden');
        this.startMicrophone();
        this.conditionalShowToast(window.APP_RESOURCES?.AvatarConnected || 'Avatar connected', 'success');
    }

    /**
     * Audio Only Mode
     */
    onAvatarAudioOnlyMode() {
        addTraceEntry('system', window.APP_RESOURCES?.EnteringAudioOnlyMode || 'Entering audio-only mode');
        this.showAvatarLoading(false);
        this.updateAvatarStatus('connected', window.APP_RESOURCES?.AudioOnly || 'Audio Only');
        if (this.elements.avatarPlaceholder) {
            this.elements.avatarPlaceholder.innerHTML = `<p>${window.APP_RESOURCES?.AudioOnlyMode || 'Audio Only Mode'}</p>`;
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
            addTraceEntry('system', window.APP_RESOURCES?.MicrophoneStarted || 'Microphone started');

        } catch (error) {
            addTraceEntry('error', (window.APP_RESOURCES?.MicrophoneError || 'Microphone error: {0}').replace('{0}', error.message));
            this.conditionalShowToast(window.APP_RESOURCES?.MicrophoneError || 'Microphone error', 'error');
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

            addTraceEntry('system', window.APP_RESOURCES?.MicrophoneStopped || 'Microphone stopped');
        } catch (error) {
            addTraceEntry('error', (window.APP_RESOURCES?.ErrorStoppingMicrophone || 'Error stopping microphone: {0}').replace('{0}', error.message));
        }
    }

    /**
     * Toggle Mute
     */
    toggleMute() {
        this.state.isMuted = !this.state.isMuted;
        this.updateMuteButtonState();
        addTraceEntry('system', this.state.isMuted ? (window.APP_RESOURCES?.MicrophoneMuted || 'Microphone muted') : (window.APP_RESOURCES?.MicrophoneUnmuted || 'Microphone unmuted'));
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
            VoiceModel: this.currentSettings.voiceModel,
            Voice: this.currentSettings.voice,
            VoiceLiveEndpoint: this.currentSettings.voiceLiveEndpoint,
            VoiceLiveApiKey: this.currentSettings.voiceLiveApiKey,
            VoiceModelInstructions: this.currentSettings.modelInstructions,
            AvatarCharacter: this.currentSettings.avatarCharacter,
            AvatarStyle: this.currentSettings.avatarStyle,
            Locale: document.documentElement.lang || 'en-US'
        };
        this.state.websocket.send(JSON.stringify(config));
        addTraceEntry('system', window.APP_RESOURCES?.ConfigurationSent || 'Configuration sent');
    }

    /**
     * Send Text Message
     */
    sendTextMessage() {
        const text = this.elements.textInput?.value?.trim();
        if (!text) return;

        if (!this.state.websocket || this.state.websocket.readyState !== WebSocket.OPEN) {
            this.conditionalShowToast(window.APP_RESOURCES?.NotConnected || 'Not connected', 'error');
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
            addTraceEntry('system', window.APP_RESOURCES?.DisconnectedFromServer || 'Disconnected from server');
            this.stopSession();
        }
    }

    /**
     * Handle Error
     */
    handleError(message) {
        const errorText = message.Message || message.message || window.APP_RESOURCES?.UnknownError || 'Unknown error';
        addTraceEntry('error', errorText);
        this.conditionalShowToast(errorText, 'error');
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
    saveSettingsFromModal() {
        const newSettings = {
            voiceModel: this.elements.voiceModelSelect?.value,
            voice: this.elements.voiceSelect?.value,
            welcomeMessage: this.elements.welcomeMessageInput?.value,
            modelInstructions: this.elements.modelInstructionsInput?.value,
            voiceLiveEndpoint: this.elements.voiceLiveEndpointInput?.value,
            voiceLiveApiKey: this.elements.voiceLiveApiKeyInput?.value,
            avatarCharacter: this.elements.avatarCharacterSelect?.value,
            avatarStyle: this.elements.avatarStyleSelect?.value,
            showToastNotifications: this.elements.toastNotificationsToggle?.checked
        };

        const validation = validateModelVoiceCompatibility(newSettings.voiceModel, newSettings.voice);
        if (!validation.valid) {
            this.conditionalShowToast(validation.message, 'error');
            return;
        }

        if (saveSettings(newSettings, this.pageName)) {
            this.currentSettings = newSettings;
            addTraceEntry('system', window.APP_RESOURCES?.SettingsSaved || 'Settings saved');
            this.conditionalShowToast(window.APP_RESOURCES?.SettingsSaved || 'Settings saved', 'success');
            hideSettingsModal();
            if (this.state.sessionId || this.state.isAvatarConnected) {
                this.conditionalShowToast(window.APP_RESOURCES?.RestartSessionForChanges || 'Restart the session to apply changes', 'info');
            }
        }
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const app = new VoiceAvatarApp();
    app.init();
    window.voiceAvatarApp = app;
    
    // Cleanup event listeners on unload
    window.addEventListener('beforeunload', () => {
        app.cleanup();
    });
});