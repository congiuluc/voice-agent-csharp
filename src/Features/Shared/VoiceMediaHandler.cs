using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using VoiceAgentCSharp.Features.VoiceAgent;
using VoiceAgentCSharp.Features.VoiceAvatar;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Handles media streaming between client and Azure Voice Live API via WebSocket.
/// Supports Voice Agent, Voice Assistant, and Voice Avatar sessions through the factory pattern.
/// Avatar sessions include WebRTC video streaming support.
/// </summary>
public class VoiceMediaHandler
{
    #region Fields

    private readonly ILogger<VoiceMediaHandler> _logger;
    private readonly IConfiguration _configuration;
    private readonly VoiceSessionFactory _sessionFactory;
    private WebSocket? _clientWebSocket;
    private IVoiceSession? _voiceSession;
    private VoiceAvatarSession? _avatarSession;

    /// <summary>
    /// Static dictionary to store avatar sessions by connection ID for SDP exchange.
    /// This allows the REST endpoint to access the WebSocket session.
    /// </summary>
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, VoiceAvatarSession>
        _activeAvatarSessions = new();

    private string? _avatarConnectionId;

    private readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private bool _isRawAudio;

    // Values optionally provided by the web client via Config message
    private string? _clientProvidedEndpoint;
    private string? _clientProvidedApiKey;
    private string? _clientProvidedModel;
    private string? _clientProvidedVoice;
    private string? _clientProvidedWelcomeMessage;
    private string? _clientProvidedModelInstructions;
    private string? _clientProvidedLocale;
    // Foundry Agent Service parameters
    private string? _clientProvidedFoundryAgentId;
    private string? _clientProvidedFoundryProjectName;
    // Avatar-specific parameters
    private string? _clientProvidedAvatarCharacter;
    private string? _clientProvidedAvatarStyle;

    #endregion

    #region Constructor

    /// <summary>
    /// Initializes a new instance of the VoiceMediaHandler class.
    /// </summary>
    /// <param name="configuration">Application configuration.</param>
    /// <param name="logger">Logger instance.</param>
    /// <param name="sessionFactory">Factory for creating voice sessions.</param>
    public VoiceMediaHandler(IConfiguration configuration, ILogger<VoiceMediaHandler> logger, VoiceSessionFactory sessionFactory)
    {
        _configuration = configuration;
        _logger = logger;
        _sessionFactory = sessionFactory ?? throw new ArgumentNullException(nameof(sessionFactory));
    }

    #endregion

    #region Public Methods - WebSocket Handlers

    /// <summary>
    /// Handles Voice WebSocket connection (expects Voice audio format).
    /// </summary>
    /// <param name="webSocket">The WebSocket connection.</param>
    public async Task HandleVoiceWebSocketAsync(WebSocket webSocket)
    {
        _clientWebSocket = webSocket;
        _isRawAudio = false;

        _logger.LogInformation("Initializing Voice WebSocket handler. RawAudio={IsRaw}", _isRawAudio);

        _clientProvidedModelInstructions = _configuration["AzureVoiceLive:CallInstructions"] ?? "You are a helpful virtual assistant.";
        
        await InitializeVoiceLiveConnectionAsync();
        var session = _voiceSession;
        if (session != null)
        {
            var initCallMessage = _configuration["AzureVoiceLive:CallInitMessage"]??"Hello";
            await session.SendTextAsync(initCallMessage).ConfigureAwait(false);
        }
        await ReceiveMessagesAsync(ProcessVoiceMessageAsync);
    }

    /// <summary>
    /// Handles Web client WebSocket connection (expects raw PCM16 audio).
    /// Supports both incoming calls (ACS) and regular web clients.
    /// For incoming calls, proceeds with server config if no Config message received.
    /// </summary>
    /// <param name="webSocket">The WebSocket connection.</param>
    public async Task HandleWebWebSocketAsync(WebSocket webSocket)
    {
        _clientWebSocket = webSocket;
        _isRawAudio = true;

        _logger.LogInformation("Initializing WebSocket handler for web client. RawAudio={IsRaw}", _isRawAudio);

        // Wait briefly for initial Config from the client (so client can supply endpoint/apiKey)
        // For incoming calls (ACS), this will timeout and use server config - this is expected
        await WaitForInitialConfigAsync();

        // Initialize VoiceLive connection (will use client-provided values if present, or server config)
        await InitializeVoiceLiveConnectionAsync();

        // Start receiving messages
        await ReceiveMessagesAsync(ProcessWebMessageAsync);
    }

    /// <summary>
    /// Handles Avatar WebSocket connection for WebRTC-based avatar sessions.
    /// This creates a session that supports both audio streaming and avatar video via WebRTC.
    /// </summary>
    /// <param name="webSocket">The WebSocket connection.</param>
    public async Task HandleAvatarWebSocketAsync(WebSocket webSocket)
    {
        _clientWebSocket = webSocket;
        _isRawAudio = true;
        _avatarConnectionId = Guid.NewGuid().ToString();

        _logger.LogInformation("Initializing Avatar WebSocket handler. ConnectionId={ConnectionId}", _avatarConnectionId);

        try
        {
            // Wait for initial Config from the client
            await WaitForInitialConfigAsync();

            // Initialize Avatar session
            await InitializeAvatarConnectionAsync();

            // Register the avatar session for SDP exchange access
            if (_avatarSession != null && _avatarConnectionId != null)
            {
                _activeAvatarSessions[_avatarConnectionId] = _avatarSession;
                _logger.LogDebug("Registered avatar session: {ConnectionId}", _avatarConnectionId);

                // Send the connection ID to the client so it can use it for SDP exchange
                var connectionInfo = new
                {
                    Kind = "SessionEvent",
                    Event = "AvatarConnectionId",
                    Payload = new { ConnectionId = _avatarConnectionId }
                };
                await SendToClientAsync(JsonSerializer.Serialize(connectionInfo, _jsonOptions));
            }

            // Start receiving messages
            await ReceiveMessagesAsync(ProcessWebMessageAsync);
        }
        finally
        {
            // Cleanup: remove session from active sessions
            if (_avatarConnectionId != null)
            {
                _activeAvatarSessions.TryRemove(_avatarConnectionId, out _);
                _logger.LogDebug("Unregistered avatar session: {ConnectionId}", _avatarConnectionId);
            }
        }
    }

    #endregion

    #region Public Methods - Avatar SDP

    /// <summary>
    /// Processes SDP offer from client and returns SDP answer from avatar service.
    /// This method is called from the REST endpoint for WebRTC negotiation.
    /// </summary>
    /// <param name="clientSdp">The client's SDP offer.</param>
    /// <returns>The SDP answer from the avatar service, or null if failed.</returns>
    public async Task<string?> ProcessAvatarOfferAsync(string clientSdp)
    {
        // Try to use the instance's avatar session first
        if (_avatarSession != null)
        {
            _logger.LogDebug("Processing avatar offer using instance session");
            try
            {
                var answerSdp = await _avatarSession.ConnectAvatarAsync(clientSdp);
                return answerSdp;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing avatar SDP offer with instance session");
                return null;
            }
        }

        _logger.LogWarning("Cannot process avatar offer: avatar session not initialized. " +
            "Ensure WebSocket connection is established before sending SDP offer.");
        return null;
    }

    /// <summary>
    /// Processes SDP offer using a specific connection ID.
    /// This allows the REST endpoint to route to the correct WebSocket session.
    /// </summary>
    /// <param name="connectionId">The avatar connection ID.</param>
    /// <param name="clientSdp">The client's SDP offer.</param>
    /// <returns>The SDP answer from the avatar service, or null if failed.</returns>
    public static async Task<string?> ProcessAvatarOfferByConnectionIdAsync(string connectionId, string clientSdp)
    {
        if (_activeAvatarSessions.TryGetValue(connectionId, out var session))
        {
            return await session.ConnectAvatarAsync(clientSdp);
        }

        return null;
    }

    /// <summary>
    /// Gets the list of active avatar connection IDs.
    /// </summary>
    /// <returns>Array of active connection IDs.</returns>
    public static string[] GetActiveAvatarConnections()
    {
        return _activeAvatarSessions.Keys.ToArray();
    }

    #endregion

    #region Private Methods - Session Initialization

    /// <summary>
    /// Initializes connection to Azure Voice Live API for Avatar sessions with WebRTC support.
    /// Avatar sessions combine audio streaming with video avatar rendering.
    /// </summary>
    private async Task InitializeAvatarConnectionAsync()
    {
        // Prefer client-provided settings; fall back to app configuration
        var endpoint = !string.IsNullOrWhiteSpace(_clientProvidedEndpoint)
            ? _clientProvidedEndpoint
            : _configuration["AzureVoiceLive:Endpoint"];

        if (string.IsNullOrWhiteSpace(endpoint))
        {
            throw new InvalidOperationException("Voice Live endpoint not configured (either server config or client Config message required)");
        }

        var apiKey = !string.IsNullOrWhiteSpace(_clientProvidedApiKey)
            ? _clientProvidedApiKey
            : _configuration["AzureVoiceLive:ApiKey"];

        var model = !string.IsNullOrWhiteSpace(_clientProvidedModel)
            ? _clientProvidedModel
            : _configuration["AzureVoiceLive:Model"] ?? "gpt-4o";

        var avatarCharacter = !string.IsNullOrWhiteSpace(_clientProvidedAvatarCharacter)
            ? _clientProvidedAvatarCharacter
            : _configuration["AzureVoiceLive:AvatarCharacter"] ?? "lisa";

        var avatarStyle = !string.IsNullOrWhiteSpace(_clientProvidedAvatarStyle)
            ? _clientProvidedAvatarStyle
            : _configuration["AzureVoiceLive:AvatarStyle"] ?? "casual-sitting";

        var voice = !string.IsNullOrWhiteSpace(_clientProvidedVoice)
            ? _clientProvidedVoice
            : _configuration["AzureVoiceLive:Voice"] ?? "en-US-AvaNeural";

        var locale = !string.IsNullOrWhiteSpace(_clientProvidedLocale)
            ? _clientProvidedLocale
            : _configuration["AzureVoiceLive:Locale"] ?? "en-US";

        _logger.LogInformation(
            "Creating Avatar session: Endpoint={Endpoint}, Model={Model}, Character={Character}, Style={Style}, Voice={Voice}, Locale={Locale}",
            endpoint, model, avatarCharacter, avatarStyle, voice, locale);

        try
        {
            // Create avatar session configuration
            var sessionConfig = new VoiceSessionConfig
            {
                SessionType = "Avatar",
                Endpoint = endpoint,
                ApiKey = apiKey,
                Model = model,
                Voice = voice,
                WelcomeMessage = _clientProvidedWelcomeMessage,
                ModelInstructions = _clientProvidedModelInstructions,
                Locale = locale,
                AvatarCharacter = avatarCharacter,
                AvatarStyle = avatarStyle,
                UseTokenCredential = !string.IsNullOrWhiteSpace(apiKey) ? false : true,
                ManagedIdentityClientId = _configuration["AzureIdentity:UserAssignedClientId"]
            };

            // Create the avatar session using the factory
            _voiceSession = await _sessionFactory.CreateSessionAsync(sessionConfig).ConfigureAwait(false);

            // Also store as avatar session for WebRTC SDP handling
            _avatarSession = _voiceSession as VoiceAvatarSession;

            // Get ICE servers from the avatar session (populated during StartAsync)
            object? iceServersPayload = null;
            if (_avatarSession != null && _avatarSession.IceServers.Count > 0)
            {
                iceServersPayload = _avatarSession.IceServers.Select(s => new
                {
                    urls = s.Urls,
                    username = s.Username,
                    credential = s.Credential
                }).ToArray();
                _logger.LogInformation("Including {Count} ICE servers in SessionConnected", _avatarSession.IceServers.Count);
            }

            // Send connection confirmation with ICE servers
            var connectionMessage = new
            {
                Kind = "SessionEvent",
                Event = "SessionConnected",
                Payload = new
                {
                    Message = "Connected to Voice Avatar",
                    IceServers = iceServersPayload
                }
            };
            await SendToClientAsync(JsonSerializer.Serialize(connectionMessage, _jsonOptions));

            // Set up callbacks for Avatar session events
            SetupAvatarSessionCallbacks();

            _logger.LogInformation(
                "Avatar session initialized - Character: {Character}, Style: {Style}",
                avatarCharacter, avatarStyle);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize Avatar session");

            // Send error to client
            var errorMessage = new
            {
                Kind = "Error",
                Message = $"Failed to initialize avatar session: {ex.Message}"
            };
            await SendToClientAsync(JsonSerializer.Serialize(errorMessage, _jsonOptions));

            throw;
        }
    }

    /// <summary>
    /// Sets up event callbacks for avatar sessions.
    /// </summary>
    private void SetupAvatarSessionCallbacks()
    {
        if (_voiceSession == null) return;

        _voiceSession.OnAudioDelta += async (audioData) =>
        {
            // For avatar sessions, audio comes via WebRTC, but we still forward for fallback
            if (audioData == null || audioData.Length == 0) return;
            _logger.LogDebug("Avatar audio delta ({Bytes} bytes)", audioData.Length);
            await SendToClientAsync(audioData);
        };

        _voiceSession.OnTranscription += async (transcript) =>
        {
            var message = new
            {
                Kind = "Transcription",
                Text = transcript,
                Role = "agent"
            };
            _logger.LogInformation("Avatar transcription (agent): {Text}", transcript);
            await SendToClientAsync(JsonSerializer.Serialize(message, _jsonOptions));
        };

        _voiceSession.OnUserTranscription += async (transcript) =>
        {
            var message = new
            {
                Kind = "Transcription",
                Text = transcript,
                Role = "user"
            };
            _logger.LogInformation("Avatar transcription (user): {Text}", transcript);
            await SendToClientAsync(JsonSerializer.Serialize(message, _jsonOptions));
        };

        _voiceSession.OnSpeechStarted += async () =>
        {
            var stopMessage = new { Kind = "StopAudio" };
            _logger.LogDebug("Avatar session: user speech started");
            await SendToClientAsync(JsonSerializer.Serialize(stopMessage, _jsonOptions));
        };

        _voiceSession.OnSessionEvent += async (eventType, jsonPayload) =>
        {
            object? payloadObj = null;
            if (!string.IsNullOrEmpty(jsonPayload))
            {
                try
                {
                    payloadObj = JsonSerializer.Deserialize<JsonElement>(jsonPayload);
                }
                catch { payloadObj = jsonPayload; }
            }

            _logger.LogInformation("Avatar session event: {EventType}", eventType);

            var message = new Dictionary<string, object>
            {
                { "Kind", "SessionEvent" },
                { "Event", eventType }
            };

            if (payloadObj != null)
            {
                message["Payload"] = payloadObj;
            }

            await SendToClientAsync(JsonSerializer.Serialize(message, _jsonOptions));
        };
    }

    /// <summary>
    /// Initializes connection to Azure Voice Live API using the factory pattern.
    /// Supports Voice Agent, Voice Assistant, and Voice Avatar sessions.
    /// </summary>
    private async Task InitializeVoiceLiveConnectionAsync()
    {
        // Prefer client-provided settings; fall back to app configuration
        var endpoint = !string.IsNullOrWhiteSpace(_clientProvidedEndpoint)
            ? _clientProvidedEndpoint
            : _configuration["AzureVoiceLive:Endpoint"];

        if (string.IsNullOrWhiteSpace(endpoint))
        {
            throw new InvalidOperationException("Voice Live endpoint not configured (either server config or client Config message required)");
        }

        var apiKey = !string.IsNullOrWhiteSpace(_clientProvidedApiKey)
            ? _clientProvidedApiKey
            : _configuration["AzureVoiceLive:ApiKey"];

        var model = !string.IsNullOrWhiteSpace(_clientProvidedModel)
            ? _clientProvidedModel
            : _configuration["AzureVoiceLive:Model"] ?? "gpt-4o";

        var voice = !string.IsNullOrWhiteSpace(_clientProvidedVoice)
            ? _clientProvidedVoice
            : _configuration["AzureVoiceLive:Voice"] ?? "en-US-AvaNeural";

        var locale = !string.IsNullOrWhiteSpace(_clientProvidedLocale)
            ? _clientProvidedLocale
            : _configuration["AzureVoiceLive:Locale"] ?? "en-US";

        // Determine session type based on whether Foundry Agent parameters are provided
        var sessionType = !string.IsNullOrWhiteSpace(_clientProvidedFoundryAgentId) ? "Agent" : "Assistant";

        _logger.LogInformation(
            "Creating Voice {SessionType} session: Endpoint={Endpoint}, Model={Model}, Voice={Voice}, Locale={Locale}",
            sessionType,
            endpoint,
            model,
            voice,
            locale);

        try
        {
            // Create configuration for the voice session
            var sessionConfig = new VoiceSessionConfig
            {
                SessionType = sessionType,
                Endpoint = endpoint,
                ApiKey = apiKey,
                Model = model,
                Voice = voice,
                WelcomeMessage = _clientProvidedWelcomeMessage,
                ModelInstructions = _clientProvidedModelInstructions,
                Locale = locale,
                FoundryAgentId = _clientProvidedFoundryAgentId,
                FoundryProjectName = _clientProvidedFoundryProjectName,
                UseTokenCredential = !string.IsNullOrWhiteSpace(apiKey) ? false : true,
                ManagedIdentityClientId = _configuration["AzureIdentity:UserAssignedClientId"],
                McpServerUrl = _configuration["McpServer:Url"] ?? "http://localhost:5001"
            };

            // Create the session using the factory
            _voiceSession = await _sessionFactory.CreateSessionAsync(sessionConfig).ConfigureAwait(false);

            // Send connection confirmation as JSON SessionEvent message
            var connectionMessage = new
            {
                Kind = "SessionEvent",
                Event = "SessionConnected",
                Payload = new { Message = $"Connected to Voice {sessionType}" }
            };
            await SendToClientAsync(JsonSerializer.Serialize(connectionMessage, _jsonOptions));

            // Set up callbacks for Voice session events
            _voiceSession.OnAudioDelta += async (audioData) =>
            {
                if (_isRawAudio)
                {
                    // Send raw audio bytes to web client
                    if (audioData == null || audioData.Length == 0)
                    {
                        _logger.LogDebug("Received empty audio delta; skipping send to web client");
                    }
                    else
                    {
                        _logger.LogDebug("Forwarding raw audio delta to web client ({Bytes} bytes)", audioData.Length);
                        await SendToClientAsync(audioData);
                    }
                }
                else
                {
                    // Send Voice-formatted audio message with base64-encoded audio
                    var base64Audio = Convert.ToBase64String(audioData);
                    var voiceMessage = new
                    {
                        Kind = "AudioData",
                        AudioData = new { Data = base64Audio },
                        StopAudio = (object?)null
                    };
                    _logger.LogDebug("Forwarding Voice audio message to Voice client (base64 length: {Len})", (voiceMessage?.ToString()?.Length ?? 0));
                    await SendToClientAsync(JsonSerializer.Serialize(voiceMessage, _jsonOptions));
                }
            };

            _voiceSession.OnTranscription += async (transcript) =>
            {
                var message = new
                {
                    Kind = "Transcription",
                    Text = transcript,
                    Role = "agent"
                };
                _logger.LogInformation("Voice session transcription (agent): {Text}", transcript);
                await SendToClientAsync(JsonSerializer.Serialize(message, _jsonOptions));
            };

            _voiceSession.OnUserTranscription += async (transcript) =>
            {
                var message = new
                {
                    Kind = "Transcription",
                    Text = transcript,
                    Role = "user"
                };
                _logger.LogInformation("Voice session transcription (user): {Text}", transcript);
                await SendToClientAsync(JsonSerializer.Serialize(message, _jsonOptions));
            };

            _voiceSession.OnSpeechStarted += async () =>
            {
                // Send StopAudio signal to client
                if (!_isRawAudio)
                {
                    var stopMessage = new
                    {
                        Kind = "StopAudio",
                        AudioData = (object?)null,
                        StopAudio = new { }
                    };
                    _logger.LogDebug("Voice session signaled speech started (Voice client) - sending StopAudio");
                    await SendToClientAsync(JsonSerializer.Serialize(stopMessage, _jsonOptions));
                }
                else
                {
                    var stopMessage = new { Kind = "StopAudio" };
                    _logger.LogDebug("Voice session signaled speech started (Web client) - sending StopAudio");
                    await SendToClientAsync(JsonSerializer.Serialize(stopMessage, _jsonOptions));
                }
            };

            // Forward lightweight session events to the connected client UI
            _voiceSession.OnSessionEvent += async (eventType, jsonPayload) =>
            {
                object? payloadObj = null;
                if (!string.IsNullOrEmpty(jsonPayload))
                {
                    try
                    {
                        payloadObj = JsonSerializer.Deserialize<JsonElement>(jsonPayload);
                    }
                    catch { payloadObj = jsonPayload; }
                }

                _logger.LogInformation("Voice session event: {EventType}", eventType);

                // Build message with explicit null handling for Payload
                var message = new Dictionary<string, object>
                {
                    { "Kind", "SessionEvent" },
                    { "Event", eventType }
                };

                // Only include Payload if it has a value
                if (payloadObj != null)
                {
                    message["Payload"] = payloadObj;
                }

                await SendToClientAsync(JsonSerializer.Serialize(message, _jsonOptions));
            };

            _logger.LogInformation("Connected to Voice {SessionType} successfully", sessionType);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize Voice session");
            throw;
        }
    }

    /// <summary>
    /// Receives messages from client WebSocket.
    /// </summary>
    private async Task ReceiveMessagesAsync(Func<WebSocketReceiveResult, byte[], Task> messageHandler)
    {
        var buffer = new byte[1024 * 64]; // 64KB buffer

        try
        {
            while (_clientWebSocket?.State == WebSocketState.Open)
            {
                var result = await _clientWebSocket.ReceiveAsync(
                    new ArraySegment<byte>(buffer),
                    CancellationToken.None);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _logger.LogInformation("WebSocket connection closed by client");
                    await _clientWebSocket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "Closed by client",
                        CancellationToken.None);
                    break;
                }

                await messageHandler(result, buffer);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in WebSocket message loop");
        }
        finally
        {
            await CleanupAsync();
        }
    }

    /// <summary>
    /// Wait for an initial Config message from the web client so server can use client-specified
    /// Voice Live endpoint/apiKey before initializing the session. This will time out after 3s
    /// and fall back to server configuration. For incoming calls (ACS), timeout is expected behavior.
    /// </summary>
    private async Task WaitForInitialConfigAsync(int timeoutMs = 3000)
    {
        if (_clientWebSocket == null) return;

        var buffer = new byte[1024 * 8];
        var start = DateTime.UtcNow;

        try
        {
            while (_clientWebSocket.State == WebSocketState.Open && (DateTime.UtcNow - start).TotalMilliseconds < timeoutMs)
            {
                var receiveTask = _clientWebSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                var completed = await Task.WhenAny(receiveTask, Task.Delay(200));
                if (completed != receiveTask)
                {
                    // no message yet, loop
                    continue;
                }

                var result = receiveTask.Result;
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _logger.LogInformation("Client closed connection while waiting for initial config");
                    return;
                }

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    try
                    {
                        var msg = JsonSerializer.Deserialize<Message>(message);
                        if (msg?.Kind == "Config")
                        {
                            var config = JsonSerializer.Deserialize<ConfigMessage>(message);
                            if (config != null)
                            {
                                _logger.LogInformation("Received initial Config from client");
                                _clientProvidedModel = config.VoiceModel;
                                _clientProvidedVoice = config.Voice;
                                _clientProvidedWelcomeMessage = config.WelcomeMessage;
                                _clientProvidedModelInstructions = config.VoiceModelInstructions;
                                _clientProvidedLocale = config.Locale;
                                _clientProvidedFoundryAgentId = config.FoundryAgentId;
                                _clientProvidedFoundryProjectName = config.FoundryProjectName;
                                _clientProvidedAvatarCharacter = config.AvatarCharacter;
                                _clientProvidedAvatarStyle = config.AvatarStyle;
                                if (!string.IsNullOrWhiteSpace(config.VoiceLiveEndpoint))
                                {
                                    _clientProvidedEndpoint = config.VoiceLiveEndpoint;
                                }
                                if (!string.IsNullOrWhiteSpace(config.VoiceLiveApiKey))
                                {
                                    _clientProvidedApiKey = config.VoiceLiveApiKey;
                                }

                                // Config received - exit early
                                _logger.LogDebug("Config message processed successfully");
                                return;
                            }
                        }
                        else if (msg?.Kind == "Message")
                        {
                            // Fire-and-forget initial message if session is available
                            _ = _voiceSession?.SendTextAsync(msg.Text ?? string.Empty);
                            _logger.LogInformation("Sent initial Message from client while waiting for Config: {Text}", msg.Text);
                        }
                    }
                    catch (JsonException)
                    {
                        // ignore non-JSON
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error while waiting for initial client config");
        }

        // Timeout or connection closed - this is expected for incoming calls (ACS)
        if ((DateTime.UtcNow - start).TotalMilliseconds >= timeoutMs)
        {
            _logger.LogInformation("Config message timeout after {Timeout}ms - proceeding with server configuration (expected for incoming calls)", timeoutMs);
        }
    }

    /// <summary>
    /// Reinitialize the Voice session (dispose current session and reconnect) when config changes.
    /// </summary>
    private async Task ReinitializeVoiceLiveConnectionAsync()
    {
        _logger.LogInformation("Reinitializing Voice session with new client-provided settings");
        try
        {
            if (_voiceSession != null)
            {
                await _voiceSession.DisposeAsync();
                _voiceSession = null;
            }

            await InitializeVoiceLiveConnectionAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reinitialize Voice session");
            throw;
        }
    }

    /// <summary>
    /// Processes messages from Voice WebSocket.
    /// </summary>
    private async Task ProcessVoiceMessageAsync(WebSocketReceiveResult result, byte[] buffer)
    {
        if (result.MessageType == WebSocketMessageType.Text)
        {
            var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
            try
            {
                var data = JsonSerializer.Deserialize<VoiceStreamData>(message, _jsonOptions);

                if (data?.Kind == "AudioData" && data.AudioData?.Data != null)
                {
                    // Check if audio is not silent
                    if (data.AudioData.Silent != true)
                    {
                        // Convert base64 audio data to bytes
                        var audioBytes = Convert.FromBase64String(data.AudioData.Data);
                        var session = _voiceSession;
                        if (session != null)
                        {
                            await session.SendAudioAsync(audioBytes).ConfigureAwait(false);
                        }
                    }
                }
                else
                {
                    _logger.LogTrace("Received non-audio message from ACS: {Message}", message);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing Voice message");
            }
        }
    }

    /// <summary>
    /// Processes messages from Web client WebSocket.
    /// </summary>
    private async Task ProcessWebMessageAsync(WebSocketReceiveResult result, byte[] buffer)
    {
        if (result.MessageType == WebSocketMessageType.Binary)
        {
            // Raw PCM16 audio bytes - send directly
            var audioBytes = new byte[result.Count];
            Array.Copy(buffer, audioBytes, result.Count);
            var session = _voiceSession;
            if (session != null)
            {
                await session.SendAudioAsync(audioBytes).ConfigureAwait(false);
            }
        }
        else if (result.MessageType == WebSocketMessageType.Text)
        {
            // Handle JSON messages (e.g., Config)
            var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
            try
            {
                var msg = JsonSerializer.Deserialize<Message>(message, _jsonOptions);
                switch (msg?.Kind)
                {
                    case "Config":
                        var config = JsonSerializer.Deserialize<ConfigMessage>(message, _jsonOptions);
                        // Update stored client-provided config values
                        if (config != null)
                        {
                            _clientProvidedModel = config.VoiceModel;
                            _clientProvidedVoice = config.Voice;
                            _clientProvidedWelcomeMessage = config.WelcomeMessage;
                            _clientProvidedModelInstructions = config.VoiceModelInstructions;
                            _clientProvidedLocale = config.Locale;
                            _clientProvidedFoundryAgentId = config.FoundryAgentId;
                            _clientProvidedFoundryProjectName = config.FoundryProjectName;
                            if (!string.IsNullOrWhiteSpace(config.VoiceLiveEndpoint))
                            {
                                _clientProvidedEndpoint = config.VoiceLiveEndpoint;
                            }
                            if (!string.IsNullOrWhiteSpace(config.VoiceLiveApiKey))
                            {
                                _clientProvidedApiKey = config.VoiceLiveApiKey;
                            }

                            // Reinitialize Voice session with new settings
                            await ReinitializeVoiceLiveConnectionAsync();
                        }
                        break;
                    case "Message":
                        // Send text message to Voice session
                        var session = _voiceSession;
                        if (session != null)
                        {
                            await session.SendTextAsync(msg.Text ?? string.Empty).ConfigureAwait(false);
                        }
                        break;
                    case "AvatarConnect":
                        // Handle avatar SDP offer - for avatar WebRTC connection
                        await HandleAvatarConnectMessageAsync(message);
                        break;
                }
            }
            catch (JsonException)
            {
                _logger.LogWarning("Received non-JSON text message");
            }
        }
    }

    /// <summary>
    /// Handles avatar connect message with SDP offer from client.
    /// Routes the SDP through the avatar session and returns the answer via WebSocket.
    /// </summary>
    private async Task HandleAvatarConnectMessageAsync(string message)
    {
        try
        {
            var avatarConnectMsg = JsonSerializer.Deserialize<AvatarConnectMessage>(message, _jsonOptions);
            if (avatarConnectMsg?.Sdp == null)
            {
                _logger.LogWarning("AvatarConnect message missing SDP");
                await SendToClientAsync(JsonSerializer.Serialize(new
                {
                    Kind = "Error",
                    Message = "AvatarConnect message missing SDP"
                }, _jsonOptions));
                return;
            }

            _logger.LogInformation("Processing avatar SDP offer via WebSocket");

            if (_avatarSession == null)
            {
                _logger.LogWarning("Avatar session not initialized");
                await SendToClientAsync(JsonSerializer.Serialize(new
                {
                    Kind = "Error",
                    Message = "Avatar session not initialized. Please wait for session to be ready."
                }, _jsonOptions));
                return;
            }

            // Connect avatar and get SDP answer
            var sdpAnswer = await _avatarSession.ConnectAvatarAsync(avatarConnectMsg.Sdp);

            if (!string.IsNullOrEmpty(sdpAnswer))
            {
                // Send SDP answer back to client via WebSocket
                var response = new
                {
                    Kind = "SdpAnswer",
                    Sdp = sdpAnswer
                };
                await SendToClientAsync(JsonSerializer.Serialize(response, _jsonOptions));
                _logger.LogInformation("Sent SDP answer to client via WebSocket");
            }
            else
            {
                _logger.LogWarning("Avatar service returned empty SDP answer");
                await SendToClientAsync(JsonSerializer.Serialize(new
                {
                    Kind = "Error",
                    Message = "Avatar service returned empty SDP answer. Avatar feature may not be fully supported."
                }, _jsonOptions));
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling avatar connect message");
            await SendToClientAsync(JsonSerializer.Serialize(new
            {
                Kind = "Error",
                Message = $"Avatar connect error: {ex.Message}"
            }, _jsonOptions));
        }
    }

    /// <summary>
    /// Sends data to client WebSocket.
    /// </summary>
    private async Task SendToClientAsync(byte[] data)
    {
        if (_clientWebSocket?.State == WebSocketState.Open)
        {
            await _clientWebSocket.SendAsync(
                new ArraySegment<byte>(data),
                WebSocketMessageType.Binary,
                true,
                CancellationToken.None);
        }
    }

    /// <summary>
    /// Sends text message to client WebSocket.
    /// </summary>
    private async Task SendToClientAsync(string message)
    {
        if (_clientWebSocket?.State == WebSocketState.Open)
        {
            var bytes = Encoding.UTF8.GetBytes(message);
            await _clientWebSocket.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None);
        }
    }

    /// <summary>
    /// Cleanup resources.
    /// </summary>
    private async Task CleanupAsync()
    {
        if (_voiceSession != null)
        {
            await _voiceSession.DisposeAsync();
            _voiceSession = null;
        }

        if (_clientWebSocket?.State == WebSocketState.Open)
        {
            await _clientWebSocket.CloseAsync(
                WebSocketCloseStatus.NormalClosure,
                "Handler cleanup",
                CancellationToken.None);
        }

        _clientWebSocket?.Dispose();
    }

    #endregion
}

/// <summary>
/// Voice stream data structure.
/// </summary>
public class VoiceStreamData
{
    public string? Kind { get; set; }
    public AudioDataPayload? AudioData { get; set; }
}

/// <summary>
/// Audio data payload from Voice.
/// </summary>
public class AudioDataPayload
{
    public string? Data { get; set; }
    public bool? Silent { get; set; }
}


/// <summary>
/// Generic message envelope received from client.
/// </summary>
public class Message
{
    /// <summary>
    /// Message kind (e.g., "Config", "Message").
    /// </summary>
    public string? Kind { get; set; }

    /// <summary>
    /// Optional text payload for messages of kind "Message".
    /// </summary>
    public string? Text { get; set; }
}

/// <summary>
/// Configuration message from web client.
/// </summary>

/// <summary>
/// Configuration message sent by web client to provide runtime settings.
/// </summary>
public class ConfigMessage : Message
{
    /// <summary>
    /// Session type identifier (e.g., "Assistant", "Agent", "Avatar").
    /// </summary>
    public string? SessionType { get; set; }

    /// <summary>
    /// Welcome message to be spoken by the assistant at session start.
    /// </summary>
    public string? WelcomeMessage { get; set; }

    /// <summary>
    /// Voice model identifier (e.g., "gpt-4o", "gpt-4o-realtime-preview").
    /// </summary>
    public string? VoiceModel { get; set; }

    /// <summary>
    /// Azure TTS voice identifier (e.g., "it-IT-IsabellaNeural").
    /// </summary>
    public string? Voice { get; set; }

    /// <summary>
    /// Azure Voice Live service endpoint URL.
    /// </summary>
    public string? VoiceLiveEndpoint { get; set; }

    /// <summary>
    /// Azure Voice Live API key (optional, falls back to DefaultAzureCredential).
    /// </summary>
    public string? VoiceLiveApiKey { get; set; }

    /// <summary>
    /// Custom instructions/system prompt for the voice model.
    /// </summary>
    public string? VoiceModelInstructions { get; set; }

    /// <summary>
    /// Locale for the voice assistant (e.g., "it-IT", "en-US").
    /// </summary>
    public string? Locale { get; set; }

    /// <summary>
    /// Microsoft Foundry Agent ID for connecting to a Foundry-hosted agent.
    /// When specified, the session uses the agent's built-in instructions and configuration.
    /// </summary>
    public string? FoundryAgentId { get; set; }

    /// <summary>
    /// Microsoft Foundry project name containing the agent.
    /// Required when FoundryAgentId is specified.
    /// </summary>
    public string? FoundryProjectName { get; set; }

    /// <summary>
    /// Avatar character name for Voice Avatar sessions (e.g., "lisa", "harry").
    /// </summary>
    public string? AvatarCharacter { get; set; }

    /// <summary>
    /// Avatar style for Voice Avatar sessions (e.g., "casual-sitting", "business-standing").
    /// </summary>
    public string? AvatarStyle { get; set; }
}

/// <summary>
/// Avatar connect message containing client SDP offer.
/// </summary>
public class AvatarConnectMessage : Message
{
    /// <summary>
    /// The client's SDP offer for WebRTC connection.
    /// </summary>
    public string? Sdp { get; set; }
}
