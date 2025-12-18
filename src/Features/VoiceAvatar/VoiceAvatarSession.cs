using Azure;
using Azure.AI.VoiceLive;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using VoiceAgentCSharp.Features.Shared;

namespace VoiceAgentCSharp.Features.VoiceAvatar;

/// <summary>
/// Voice Avatar Session for avatar-based conversations.
/// Connects to Azure Voice Live API with video/avatar support via WebRTC.
/// Uses Azure Speech Avatar service for real-time talking avatar rendering.
/// Avatar WebRTC negotiation is done via Voice Live WebSocket protocol.
/// Based on the Python implementation from MSFT-Innovation-Hub-India/VoiceAgent-Avatar-Retail.
/// </summary>
public class VoiceAvatarSession : VoiceSessionBase
{
    #region Fields

    private string? _avatarSdpAnswer;
    private TaskCompletionSource<string?>? _avatarSdpTcs;
    
    // Raw WebSocket client for avatar-specific communication
    private VoiceLiveRawWebSocketClient? _rawWebSocketClient;
    private List<IceServerConfig> _iceServers = new();
    private bool _useRawWebSocket;
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true
    };

    #endregion

    #region Properties

    /// <summary>
    /// Gets the session type identifier.
    /// </summary>
    public override string SessionType => "Avatar";

    /// <summary>
    /// Gets or sets the avatar character name (e.g., "lisa", "harry").
    /// </summary>
    public string AvatarCharacter => _config.AvatarCharacter ?? "lisa";

    /// <summary>
    /// Gets or sets the avatar style (e.g., "casual-sitting", "business-standing").
    /// </summary>
    public string AvatarStyle => _config.AvatarStyle ?? "casual-sitting";

    #endregion

    #region Events

    /// <summary>
    /// Raised when avatar SDP answer is received.
    /// </summary>
    public event Func<string, Task>? OnAvatarSdpAnswer;

    /// <summary>
    /// Raised when ICE servers are received for WebRTC connection.
    /// </summary>
    public event Func<object[], Task>? OnIceServers;

    /// <summary>
    /// Gets the list of ICE servers received from the session.
    /// </summary>
    public IReadOnlyList<IceServerConfig> IceServers => _iceServers.AsReadOnly();

    #endregion

    #region Constructor

    /// <summary>
    /// Initializes a new instance of the VoiceAvatarSession class.
    /// </summary>
    /// <param name="client">The VoiceLive client instance.</param>
    /// <param name="config">The session configuration.</param>
    /// <param name="logger">The logger instance.</param>
    /// <param name="useRawWebSocket">Whether to use raw WebSocket for avatar support (recommended for avatar WebRTC).</param>
    /// <param name="httpClient">Optional HttpClient for tool execution.</param>
    public VoiceAvatarSession(VoiceLiveClient client, VoiceSessionConfig config, ILogger logger, bool useRawWebSocket = true, HttpClient? httpClient = null)
        : base(client, config, logger, httpClient)
    {
        _useRawWebSocket = useRawWebSocket;
    }

    #endregion

    #region Public Methods

    /// <summary>
    /// Starts the Voice Avatar session with the configured model.
    /// Avatar sessions support video/WebRTC in addition to audio.
    /// Uses raw WebSocket for avatar WebRTC negotiation (recommended).
    /// </summary>
    /// <param name="cancellationToken">Cancellation token for the operation.</param>
    public override async Task StartAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation(
                "Starting Voice Avatar session - Model: {Model}, Character: {Character}, Style: {Style}, UseRawWebSocket: {UseRaw}",
                _config.Model, AvatarCharacter, AvatarStyle, _useRawWebSocket);

            if (_useRawWebSocket)
            {
                await StartWithRawWebSocketAsync(cancellationToken).ConfigureAwait(false);
            }
            else
            {
                await StartWithSdkAsync(cancellationToken).ConfigureAwait(false);
            }

            _logger.LogInformation("Voice Avatar ready and listening");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting Voice Avatar session");
            await DisposeAsync();
            throw;
        }
    }

    /// <summary>
    /// Starts the avatar session using raw WebSocket for full avatar support.
    /// This approach supports avatar WebRTC negotiation via session.avatar.connect.
    /// Waits for session.updated to receive ICE servers before returning.
    /// </summary>
    private async Task StartWithRawWebSocketAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Starting avatar session with raw WebSocket (recommended for avatar WebRTC)");

        // TaskCompletionSource to wait for session.updated with ICE servers
        var sessionReadyTcs = new TaskCompletionSource<bool>();

        // Create raw WebSocket client
        _rawWebSocketClient = new VoiceLiveRawWebSocketClient(
            _config.Endpoint!,
            _config.Model!,
            _config.ApiKey,
            _logger,
            "2025-05-01-preview",
            _config.ManagedIdentityClientId);

        // Wire up events
        _rawWebSocketClient.OnAudioDelta += async (data) =>
        {
            await base.OnAudioDeltaAsync(data).ConfigureAwait(false);
        };

        _rawWebSocketClient.OnTranscription += async (text) =>
        {
            await base.OnTranscriptionAsync(text).ConfigureAwait(false);
        };

        _rawWebSocketClient.OnUserTranscription += async (text) =>
        {
            await base.OnUserTranscriptionAsync(text).ConfigureAwait(false);
        };

        _rawWebSocketClient.OnSpeechStarted += async () =>
        {
            await base.OnSpeechStartedAsync().ConfigureAwait(false);
        };

        _rawWebSocketClient.OnError += async (message) =>
        {
            await base.OnErrorAsync(message).ConfigureAwait(false);
        };

        _rawWebSocketClient.OnIceServers += async (iceServers) =>
        {
            _iceServers = iceServers;
            _logger.LogInformation("Received {Count} ICE servers for avatar WebRTC", iceServers.Count);
            
            if (OnIceServers != null)
            {
                // Convert to object array for compatibility
                var iceServerObjects = iceServers.Select(s => new
                {
                    urls = s.Urls,
                    username = s.Username,
                    credential = s.Credential
                }).ToArray<object>();
                await OnIceServers(iceServerObjects).ConfigureAwait(false);
            }

            await EmitSessionEventAsync("IceServersReceived", new { Count = iceServers.Count, Servers = iceServers })
                .ConfigureAwait(false);
        };

        _rawWebSocketClient.OnSessionCreated += async (root) =>
        {
            _logger.LogInformation("Avatar session created via raw WebSocket");
            await EmitSessionEventAsync("SessionCreated", new { Character = AvatarCharacter, Style = AvatarStyle })
                .ConfigureAwait(false);
        };

        _rawWebSocketClient.OnSessionUpdated += async (root) =>
        {
            _logger.LogInformation("Avatar session updated via raw WebSocket");
            await EmitSessionEventAsync("SessionUpdated", new { Character = AvatarCharacter, Style = AvatarStyle })
                .ConfigureAwait(false);
            
            // Signal that session is ready (we have ICE servers)
            sessionReadyTcs.TrySetResult(true);
        };

        _rawWebSocketClient.OnAvatarConnecting += async (sdpAnswer) =>
        {
            _logger.LogInformation("Avatar connecting - SDP answer received");
            await EmitSessionEventAsync("AvatarConnecting", new { SdpLength = sdpAnswer?.Length ?? 0 })
                .ConfigureAwait(false);
        };

        _rawWebSocketClient.OnAudioTimestampDelta += async (payload) =>
        {
            _logger.LogDebug("Audio timestamp delta received: offset={OffsetMs}ms, duration={DurationMs}ms, text='{Text}'",
                payload.AudioOffsetMs, payload.AudioDurationMs, payload.Text);
            await EmitSessionEventAsync("AudioTimestampDelta", new
            {
                ResponseId = payload.ResponseId,
                ItemId = payload.ItemId,
                OutputIndex = payload.OutputIndex,
                ContentIndex = payload.ContentIndex,
                AudioOffsetMs = payload.AudioOffsetMs,
                AudioDurationMs = payload.AudioDurationMs,
                Text = payload.Text,
                TimestampType = payload.TimestampType
            }).ConfigureAwait(false);
        };

        // Build avatar session configuration
        var sessionConfig = BuildAvatarSessionConfig();

        // Connect with avatar configuration
        await _rawWebSocketClient.ConnectAsync(sessionConfig, cancellationToken).ConfigureAwait(false);

        // Wait for session.updated to receive ICE servers (with timeout)
        // This ensures ICE servers are available before returning to caller
        _logger.LogInformation("Waiting for session.updated with ICE servers...");
        try
        {
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeoutCts.CancelAfter(TimeSpan.FromSeconds(10));
            
            await sessionReadyTcs.Task.WaitAsync(timeoutCts.Token).ConfigureAwait(false);
            _logger.LogInformation("Session ready - ICE servers available ({Count} servers)", _iceServers.Count);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Timeout waiting for session.updated - continuing without ICE servers from Azure");
        }

        _logger.LogInformation("Avatar session started successfully with raw WebSocket");
    }

    /// <summary>
    /// Starts the avatar session using the SDK (limited avatar support).
    /// </summary>
    private async Task StartWithSdkAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("Starting avatar session with SDK (limited avatar WebRTC support)");

        // Start session with specified model
        _session = await _client.StartSessionAsync(_config.Model, cancellationToken).ConfigureAwait(false);
        
        _logger.LogInformation("Voice Avatar session started successfully");

        // Configure session with voice, instructions, and avatar-specific settings
        await UpdateSessionAsync(
            _config.Model,
            _config.Voice,
            _config.WelcomeMessage,
            _config.ModelInstructions,
            _config.Tools,
            _config.Locale,
            cancellationToken).ConfigureAwait(false);

        // Start processing events in the background
        // Use the base class cancellation token source for proper cleanup
        var token = _cancellationTokenSource?.Token ?? cancellationToken;
        _eventProcessingTask = Task.Run(
            () => ProcessEventsAsync(token), 
            token);
    }

    /// <summary>
    /// Builds the avatar session configuration with modalities and avatar settings.
    /// </summary>
    private VoiceLiveSessionConfig BuildAvatarSessionConfig()
    {
        var avatarConfig = new AvatarConfig
        {
            Character = AvatarCharacter,
            Style = !string.IsNullOrEmpty(AvatarStyle) ? AvatarStyle : null,
            Customized = false,
            Video = new AvatarVideoConfig
            {
                Resolution = new VoiceAgentCSharp.Features.Shared.VideoResolution
                {
                    Width = _config.AvatarVideoWidth,
                    Height = _config.AvatarVideoHeight
                },
                Bitrate = _config.AvatarVideoBitrate * 1000 // Convert Kbps to bps
            }
        };

        // Add ICE servers if configured
        if (_config.CustomIceServerUrls != null && _config.CustomIceServerUrls.Count > 0)
        {
            avatarConfig.IceServers = new List<IceServerConfig>
            {
                new IceServerConfig { Urls = _config.CustomIceServerUrls }
            };
        }

        var sessionConfig = new VoiceLiveSessionConfig
        {
            Modalities = new List<string> { "text", "audio", "avatar", "animation" },
            InputAudioSamplingRate = 24000,
            Instructions = _config.ModelInstructions ?? 
                "You are a helpful AI avatar assistant. Be conversational and friendly.",
            TurnDetection = new TurnDetectionConfig
            {
                Type = "server_vad",
                Threshold = 0.5,
                PrefixPaddingMs = 300,
                SilenceDurationMs = 500
            },
            InputAudioNoiseReduction = new NoiseReductionConfig
            {
                Type = "azure_deep_noise_suppression"
            },
            InputAudioEchoCancellation = new EchoCancellationConfig
            {
                Type = "server_echo_cancellation"
            },
            Voice = new VoiceConfig
            {
                Name = _config.Voice ?? "en-US-AvaNeural",
                Type = "azure-standard",
                Temperature = 0.8
            },
            InputAudioTranscription = new TranscriptionConfig
            {
                Model = "whisper-1"
            },
            //OutputAudioTimestamps = true, // Enable word-level audio timestamps for streaming text
            Avatar = avatarConfig,
            Animation = new AnimationConfig
            {
                ModelName = "default",
                Outputs = new List<string> { "blendshapes", "viseme_id" }
            }
        };

        // Add tools
        sessionConfig.Tools = new List<object>();
        
        // Add configured tools if any
        if (_config.Tools != null)
        {
            foreach (var tool in _config.Tools)
            {
                if (tool is VoiceLiveFunctionDefinition funcTool)
                {
                    sessionConfig.Tools.Add(new
                    {
                        type = "function",
                        name = funcTool.Name,
                        description = funcTool.Description,
                        parameters = funcTool.Parameters.ToObjectFromJson<object>()
                    });
                }
            }
        }

        // Add common tools
        foreach (var tool in _toolHandler.GetTools())
        {
            if (tool is VoiceLiveFunctionDefinition funcTool)
            {
                sessionConfig.Tools.Add(new
                {
                    type = "function",
                    name = funcTool.Name,
                    description = funcTool.Description,
                    parameters = funcTool.Parameters.ToObjectFromJson<object>()
                });
            }
        }

        return sessionConfig;
    }


    /// <summary>
    /// Sends audio data to the Voice Live API.
    /// </summary>
    public async override Task SendAudioAsync(byte[] audioData)
    {
        _logger.LogDebug("Sending audio data of length {Length} bytes", audioData.Length);

        if (_useRawWebSocket && _rawWebSocketClient != null)
        {
            try
            {
                await _rawWebSocketClient.SendAudioAsync(audioData).ConfigureAwait(false);
                _logger.LogDebug("Audio data sent successfully via raw WebSocket");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending audio data via raw WebSocket");
                throw;
            }
        }
        else if (_session != null)
        {
            try
            {
                await _session.SendInputAudioAsync(BinaryData.FromBytes(audioData), default).ConfigureAwait(false);
                _logger.LogDebug("Audio data sent successfully via SDK");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending audio data");
                throw;
            }
        }
        else
        {
            _logger.LogWarning("Cannot send audio: session not initialized");
        }
    }

    /// <summary>
    /// Sends text message to the Voice Live API.
    /// </summary>
    public async override Task SendTextAsync(string text)
    {
        _logger.LogDebug("Sending text message: {Text}", text);

        if (_useRawWebSocket && _rawWebSocketClient != null)
        {
            try
            {
                await _rawWebSocketClient.SendUserMessageAsync(text).ConfigureAwait(false);
                _logger.LogDebug("Text message sent successfully via raw WebSocket");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending text message via raw WebSocket");
                throw;
            }
        }
        else if (_session != null)
        {
            try
            {
                await _session.AddItemAsync(new UserMessageItem(text)).ConfigureAwait(false);
                await _session.StartResponseAsync().ConfigureAwait(false);
                _logger.LogDebug("Text message sent successfully via SDK");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending text message");
                throw;
            }
        }
        else
        {
            _logger.LogWarning("Cannot send text: session not initialized");
        }
    }

    /// <summary>
    /// Connects the avatar WebRTC stream by exchanging SDP offer/answer.
    /// Sends the client's SDP offer to Azure Voice Live and returns the server's SDP answer.
    /// The avatar video stream is delivered via WebRTC using TURN servers provided by Azure.
    /// </summary>
    /// <param name="clientSdp">The client's SDP offer string.</param>
    /// <returns>The server's SDP answer string, or null if connection fails.</returns>
    public async Task<string?> ConnectAvatarAsync(string clientSdp)
    {
        if (string.IsNullOrEmpty(clientSdp))
        {
            _logger.LogWarning("Cannot connect avatar: empty SDP offer");
            return null;
        }

        try
        {
            _logger.LogInformation("Initiating avatar WebRTC connection...");
            _logger.LogDebug("Client SDP offer length: {Length} characters", clientSdp.Length);

            if (_useRawWebSocket && _rawWebSocketClient != null)
            {
                // Use raw WebSocket for proper avatar WebRTC negotiation
                return await ConnectAvatarViaRawWebSocketAsync(clientSdp).ConfigureAwait(false);
            }
            else
            {
                // Fall back to SDK-based approach (limited support)
                return await ConnectAvatarViaSdkAsync(clientSdp).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error connecting avatar WebRTC");
            await EmitSessionEventAsync("AvatarConnectionError", new { Error = ex.Message })
                .ConfigureAwait(false);
            return null;
        }
    }

    /// <summary>
    /// Connects avatar via raw WebSocket with proper SDP encoding/decoding.
    /// This is the recommended approach based on the Python reference implementation.
    /// </summary>
    private async Task<string?> ConnectAvatarViaRawWebSocketAsync(string clientSdp)
    {
        if (_rawWebSocketClient == null)
        {
            throw new InvalidOperationException("Raw WebSocket client not initialized");
        }

        _logger.LogInformation("Connecting avatar via raw WebSocket (recommended)");

        await EmitSessionEventAsync("AvatarConnecting", new 
        { 
            Character = AvatarCharacter,
            Style = AvatarStyle,
            Method = "RawWebSocket"
        }).ConfigureAwait(false);

        try
        {
            // Use the raw WebSocket client's ConnectAvatarAsync which handles
            // SDP encoding, sending session.avatar.connect, and decoding the response
            var serverSdp = await _rawWebSocketClient.ConnectAvatarAsync(clientSdp).ConfigureAwait(false);

            if (!string.IsNullOrEmpty(serverSdp))
            {
                _logger.LogInformation("Avatar WebRTC connected successfully via raw WebSocket");
                _avatarSdpAnswer = serverSdp;

                await EmitSessionEventAsync("AvatarConnected", new
                {
                    Character = AvatarCharacter,
                    Style = AvatarStyle,
                    SdpAnswerLength = serverSdp.Length
                }).ConfigureAwait(false);

                // Notify via event
                if (OnAvatarSdpAnswer != null)
                {
                    await OnAvatarSdpAnswer(serverSdp).ConfigureAwait(false);
                }

                return serverSdp;
            }
            else
            {
                _logger.LogWarning("Received empty SDP answer from avatar service");
                return null;
            }
        }
        catch (TimeoutException ex)
        {
            _logger.LogError(ex, "Timeout connecting avatar WebRTC");
            await EmitSessionEventAsync("AvatarConnectionTimeout", new
            {
                Character = AvatarCharacter,
                Style = AvatarStyle,
                Message = "Avatar WebRTC connection timed out"
            }).ConfigureAwait(false);
            return null;
        }
    }

    /// <summary>
    /// Attempts to connect avatar via SDK (limited support).
    /// </summary>
    private async Task<string?> ConnectAvatarViaSdkAsync(string clientSdp)
    {
        if (_session == null)
        {
            _logger.LogWarning("Cannot connect avatar: session not initialized");
            return null;
        }

        _logger.LogWarning(
            "Connecting avatar via SDK. Note: Avatar WebRTC support may be limited. " +
            "Consider using raw WebSocket mode for full avatar support.");

        // Create a TaskCompletionSource to wait for the SDP answer
        _avatarSdpTcs = new TaskCompletionSource<string?>();

        await EmitSessionEventAsync("AvatarConnecting", new 
        { 
            Character = AvatarCharacter,
            Style = AvatarStyle,
            Method = "SDK",
            Warning = "Limited avatar WebRTC support via SDK"
        }).ConfigureAwait(false);

        // Note: The SDK may not fully support avatar WebRTC negotiation
        // This is kept for backward compatibility
        _logger.LogWarning(
            "Avatar WebRTC via SDK is not fully supported. " +
            "The session.avatar.connect message requires raw WebSocket access.");

        // Simulate timeout since SDK doesn't expose avatar connect
        await Task.Delay(500).ConfigureAwait(false);
        _avatarSdpTcs.TrySetResult(null);

        return null;
    }

    /// <summary>
    /// Sets the SDP answer received from the avatar service.
    /// Called when an SDP answer is received through session events.
    /// </summary>
    /// <param name="sdpAnswer">The SDP answer from the service.</param>
    public void SetAvatarSdpAnswer(string sdpAnswer)
    {
        if (string.IsNullOrEmpty(sdpAnswer))
        {
            _logger.LogWarning("Received empty SDP answer");
            _avatarSdpTcs?.TrySetResult(null);
            return;
        }

        _logger.LogInformation("Setting avatar SDP answer (length: {Length})", sdpAnswer.Length);
        _avatarSdpAnswer = sdpAnswer;
        _avatarSdpTcs?.TrySetResult(sdpAnswer);
    }

    /// <summary>
    /// Updates the Voice Avatar session configuration.
    /// Avatar sessions support model, voice, instructions, tools, and avatar-specific configuration.
    /// </summary>
    /// <param name="voiceModel">The voice model to use (e.g., "gpt-4o-mini").</param>
    /// <param name="voice">The Azure TTS voice (e.g., "en-US-AvaNeural").</param>
    /// <param name="welcomeMessage">Optional welcome message.</param>
    /// <param name="modelInstructions">System instructions for the model.</param>
    /// <param name="toolDefinitions">Optional tool definitions.</param>
    /// <param name="locale">The locale for the session (e.g., "en-US", "it-IT").</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async override Task UpdateSessionAsync(
        string? voiceModel = null,
        string? voice = null,
        string? welcomeMessage = null,
        string? modelInstructions = null,
        List<VoiceLiveToolDefinition>? toolDefinitions = null,
        string? locale = null,
        CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("Updating Voice Avatar session configuration");

        if (_useRawWebSocket && _rawWebSocketClient != null)
        {
            // For raw WebSocket, session update is handled through the initial configuration
            // Additional updates would require sending session.update messages
            _logger.LogInformation(
                "Session using raw WebSocket. Configuration was set during connection. " +
                "Dynamic updates may require reconnection.");
            
            await EmitSessionEventAsync("SessionUpdateInfo", new
            {
                Message = "Raw WebSocket mode: session configuration is fixed at connection time",
                Voice = voice ?? _config.Voice,
                Model = voiceModel ?? _config.Model
            }).ConfigureAwait(false);
            
            return;
        }

        if (_session == null)
        {
            _logger.LogWarning("Cannot update session: session not initialized");
            return;
        }

        // Configure voice settings
        var azureVoice = new AzureStandardVoice(voice ?? "en-US-AvaNeural")
        {
            Temperature = 0.7f,
            Locale = locale ?? "en-US"
        };

        // Configure turn detection for natural conversation flow
        var turnDetectionConfig = new ServerVadTurnDetection
        {
            Threshold = 0.3f,
            PrefixPadding = TimeSpan.FromMilliseconds(200),
            SilenceDuration = TimeSpan.FromMilliseconds(300)
        };

        // Build instructions with optional welcome message
        var baseInstructions = modelInstructions ?? _config.ModelInstructions ?? 
            "You are a helpful AI avatar assistant. Be conversational and friendly.";
        var instructions = !string.IsNullOrEmpty(welcomeMessage)
            ? $"{baseInstructions}\n\nIMPORTANT: When the session starts and the user hasn't spoken yet, immediately greet them with: \"{welcomeMessage}\""
            : baseInstructions;

        // Build session options with avatar support
        var sessionOptions = new VoiceLiveSessionOptions
        {
            Model = voiceModel ?? _config.Model,
            Instructions = instructions,
            Voice = azureVoice,
            InputAudioEchoCancellation = new AudioEchoCancellation(),
            InputAudioNoiseReduction = new AudioNoiseReduction(AudioNoiseReductionType.NearField),
            TurnDetection = turnDetectionConfig
        };

        // Configure modalities for avatar session
        // Avatar sessions typically support text and audio; video is handled via WebRTC
        sessionOptions.Modalities.Clear();
        sessionOptions.Modalities.Add(InteractionModality.Text);
        sessionOptions.Modalities.Add(InteractionModality.Audio);

        // Add tools if provided
        sessionOptions.Tools.Clear();
        if (toolDefinitions != null)
        {
            foreach (var toolDefinition in toolDefinitions)
            {
                sessionOptions.Tools.Add(toolDefinition);
            }
        }

        // Add common tools (GetDateTime, GetWeather)
        foreach (var tool in _toolHandler.GetTools())
        {
            sessionOptions.Tools.Add(tool);
        }

        try
        {
            await _session.ConfigureSessionAsync(sessionOptions, cancellationToken).ConfigureAwait(false);
            _logger.LogInformation(
                "Avatar session configuration updated - Voice: {Voice}, Locale: {Locale}",
                voice ?? "en-US-AvaNeural", locale ?? "en-US");

            // Trigger welcome message if provided
            if (!string.IsNullOrEmpty(welcomeMessage))
            {
                _logger.LogInformation("Triggering welcome message for avatar session");
                await _session.StartResponseAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating avatar session configuration");
            throw;
        }
    }

    #endregion

    #region Private Methods

    /// <summary>
    /// Processes events from the Voice Live session.
    /// Handles both standard voice events and avatar-specific events.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    protected async override Task ProcessEventsAsync(CancellationToken cancellationToken)
    {
        if (_session == null)
        {
            _logger.LogError("Cannot process events: session not initialized");
            return;
        }

        try
        {
            await foreach (var update in _session.GetUpdatesAsync(cancellationToken).ConfigureAwait(false))
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogDebug("Event processing cancelled by token");
                    break;
                }
                
                await HandleSessionUpdateAsync(update, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogDebug("Avatar event processing cancelled");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in avatar event processing");
            await base.OnErrorAsync($"Event processing error: {ex.Message}").ConfigureAwait(false);
        }
    }

    /// <summary>
    /// Handles individual session update events.
    /// Processes both standard voice events and avatar-specific events like SDP answers.
    /// </summary>
    /// <param name="update">The session update event.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    private async Task HandleSessionUpdateAsync(SessionUpdate update, CancellationToken cancellationToken)
    {
        try
        {
            switch (update)
            {
                case SessionUpdateSessionCreated sessionCreated:
                    _logger.LogInformation("Avatar session created: {SessionId}", sessionCreated.Session?.Id);
                    await base.EmitSessionEventAsync("SessionCreated", new 
                    { 
                        SessionId = sessionCreated.Session?.Id,
                        Character = AvatarCharacter,
                        Style = AvatarStyle
                    });
                    break;

                case SessionUpdateSessionUpdated sessionUpdated:
                    _logger.LogInformation("Avatar session updated");
                    // Check for avatar-specific data in the update (ICE servers, SDP, etc.)
                    await HandleSessionUpdatedAsync(sessionUpdated);
                    break;

                case SessionUpdateInputAudioBufferSpeechStarted:
                    _logger.LogInformation("User started speaking");
                    await base.OnSpeechStartedAsync();
                    await base.EmitSessionEventAsync("SpeechStarted", null);
                    break;

                case SessionUpdateInputAudioBufferSpeechStopped:
                    _logger.LogInformation("User stopped speaking");
                    await base.EmitSessionEventAsync("SpeechStopped", null);
                    break;

                case SessionUpdateConversationItemInputAudioTranscriptionCompleted transcriptionCompleted:
                    _logger.LogInformation("User transcription: {Transcript}", transcriptionCompleted.Transcript);
                    await base.OnUserTranscriptionAsync(transcriptionCompleted.Transcript);
                    break;

                case SessionUpdateResponseAudioTranscriptDone transcriptDone:
                    _logger.LogInformation("Avatar transcription: {Transcript}", transcriptDone.Transcript);
                    await base.OnTranscriptionAsync(transcriptDone.Transcript);
                    break;

                case SessionUpdateResponseAudioDelta audioDelta:
                    // For avatar sessions, audio may come via WebRTC, but we still forward for fallback
                    if (audioDelta.Delta != null)
                    {
                        byte[] audioData = audioDelta.Delta.ToArray();
                        _logger.LogDebug("Avatar audio delta: {Bytes} bytes", audioData.Length);
                        await base.EmitSessionEventAsync("ResponseAudioDelta", new { 
                            ResponseId = audioDelta.ResponseId,
                            AudioLength = audioData.Length
                        });
                        await base.OnAudioDeltaAsync(audioData);
                    }
                    break;

                case SessionUpdateResponseAudioDone audioDone:
                    _logger.LogDebug("Avatar response audio done");
                    await base.EmitSessionEventAsync("ResponseAudioDone", new { 
                        ResponseId = audioDone.ResponseId,
                        ItemId = audioDone.ItemId
                    });
                    break;

                case SessionUpdateResponseDone responseDone:
                    _logger.LogInformation("Avatar response complete");
                    var usageData = responseDone.Response?.Usage;
                    await base.EmitSessionEventAsync("ResponseDone", new {
                        ResponseId = responseDone.Response?.Id,
                        Status = responseDone.Response?.Status?.ToString(),
                        Usage = usageData != null ? new {
                            InputTokens = usageData.InputTokens,
                            OutputTokens = usageData.OutputTokens,
                            TotalTokens = usageData.TotalTokens,
                            InputTokenDetails = usageData.InputTokenDetails != null ? new {
                                CachedTokens = usageData.InputTokenDetails.CachedTokens,
                                TextTokens = usageData.InputTokenDetails.TextTokens,
                                AudioTokens = usageData.InputTokenDetails.AudioTokens
                            } : null,
                            OutputTokenDetails = usageData.OutputTokenDetails != null ? new {
                                TextTokens = usageData.OutputTokenDetails.TextTokens,
                                AudioTokens = usageData.OutputTokenDetails.AudioTokens
                            } : null
                        } : null
                    });
                    break;

                case SessionUpdateResponseFunctionCallArgumentsDone functionCallArgs:
                    await HandleFunctionCallAsync(functionCallArgs);
                    break;

                case SessionUpdateError errorEvent:
                    _logger.LogError("Avatar session error: {ErrorMessage}", errorEvent.Error?.Message);
                    await base.OnErrorAsync(errorEvent.Error?.Message ?? "Unknown error");
                    await base.EmitSessionEventAsync("Error", new { Message = errorEvent.Error?.Message });
                    break;

                default:
                    _logger.LogDebug("Unhandled avatar event: {EventType}", update.GetType().Name);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling avatar session update: {UpdateType}", update.GetType().Name);
        }
    }

    /// <summary>
    /// Handles session updated events, extracting avatar-specific data like ICE servers.
    /// </summary>
    /// <param name="sessionUpdated">The session updated event.</param>
    private async Task HandleSessionUpdatedAsync(SessionUpdateSessionUpdated sessionUpdated)
    {
        try
        {
            _logger.LogDebug("Processing session updated event for avatar");
            
            // Emit the session updated event
            // In a full implementation, this would extract ICE servers and SDP answer from the event
            await base.EmitSessionEventAsync("SessionUpdated", new
            {
                Character = AvatarCharacter,
                Style = AvatarStyle
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error processing session updated event");
        }
    }

    /// <summary>
    /// Handles function call requests from the Voice Live API.
    /// </summary>
    /// <param name="args">The function call arguments.</param>
    protected async override Task HandleFunctionCallAsync(SessionUpdateResponseFunctionCallArgumentsDone args)
    {
        _logger.LogInformation("Avatar handling function call: {Name} with args {Args}", args.Name, args.Arguments);
        await base.HandleFunctionCallAsync(args);
    }

    #endregion

    #region IAsyncDisposable

    /// <summary>
    /// Disposes of the session resources including SDK session and raw WebSocket client.
    /// </summary>
    public override async ValueTask DisposeAsync()
    {
        _logger.LogDebug("Disposing VoiceAvatarSession...");

        // Dispose raw WebSocket client if used (before base disposes the session)
        if (_rawWebSocketClient != null)
        {
            try
            {
                await _rawWebSocketClient.DisposeAsync().ConfigureAwait(false);
                _logger.LogDebug("Raw WebSocket client disposed");
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Exception disposing raw WebSocket client");
            }
        }

        // Call base class disposal which handles cancellation, event processing task, session, and tool handler
        await base.DisposeAsync();

        _logger.LogDebug("VoiceAvatarSession disposed");
    }

    #endregion
}
