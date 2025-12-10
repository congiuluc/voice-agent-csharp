using Azure.Core;
using Azure.Identity;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace VoiceAgentCSharp.Features.Shared;

#region DTOs for Avatar WebSocket Protocol

/// <summary>
/// Configuration for avatar appearance and video settings.
/// </summary>
public class AvatarConfig
{
    /// <summary>
    /// Gets or sets the avatar character name (e.g., "lisa", "james", "michelle").
    /// </summary>
    [JsonPropertyName("character")]
    public string Character { get; set; } = "lisa";

    /// <summary>
    /// Gets or sets the avatar style (e.g., "casual-sitting", "business-standing").
    /// </summary>
    [JsonPropertyName("style")]
    public string? Style { get; set; }

    /// <summary>
    /// Gets or sets whether the avatar is customized.
    /// </summary>
    [JsonPropertyName("customized")]
    public bool Customized { get; set; } = false;

    /// <summary>
    /// Gets or sets the video configuration.
    /// </summary>
    [JsonPropertyName("video")]
    public AvatarVideoConfig Video { get; set; } = new();

    /// <summary>
    /// Gets or sets ICE servers for WebRTC NAT traversal.
    /// </summary>
    [JsonPropertyName("ice_servers")]
    public List<IceServerConfig>? IceServers { get; set; }
}

/// <summary>
/// Video configuration for avatar streaming.
/// </summary>
public class AvatarVideoConfig
{
    /// <summary>
    /// Gets or sets the video resolution.
    /// </summary>
    [JsonPropertyName("resolution")]
    public VideoResolution Resolution { get; set; } = new();

    /// <summary>
    /// Gets or sets the video bitrate in bps.
    /// </summary>
    [JsonPropertyName("bitrate")]
    public int Bitrate { get; set; } = 2000000;
}

/// <summary>
/// Video resolution settings.
/// </summary>
public class VideoResolution
{
    /// <summary>
    /// Gets or sets the video width in pixels.
    /// </summary>
    [JsonPropertyName("width")]
    public int Width { get; set; } = 1280;

    /// <summary>
    /// Gets or sets the video height in pixels.
    /// </summary>
    [JsonPropertyName("height")]
    public int Height { get; set; } = 720;
}

/// <summary>
/// ICE server configuration for WebRTC.
/// </summary>
public class IceServerConfig
{
    /// <summary>
    /// Gets or sets the ICE server URLs.
    /// </summary>
    [JsonPropertyName("urls")]
    public List<string> Urls { get; set; } = new();

    /// <summary>
    /// Gets or sets the username for TURN server authentication.
    /// </summary>
    [JsonPropertyName("username")]
    public string? Username { get; set; }

    /// <summary>
    /// Gets or sets the credential for TURN server authentication.
    /// </summary>
    [JsonPropertyName("credential")]
    public string? Credential { get; set; }
}

/// <summary>
/// Animation configuration for avatar sessions.
/// </summary>
public class AnimationConfig
{
    /// <summary>
    /// Gets or sets the animation model name.
    /// </summary>
    [JsonPropertyName("model_name")]
    public string ModelName { get; set; } = "default";

    /// <summary>
    /// Gets or sets the animation outputs.
    /// </summary>
    [JsonPropertyName("outputs")]
    public List<string> Outputs { get; set; } = new() { "blendshapes", "viseme_id" };
}

/// <summary>
/// Session configuration for Voice Live with avatar support.
/// </summary>
public class VoiceLiveSessionConfig
{
    /// <summary>
    /// Gets or sets the modalities for the session.
    /// </summary>
    [JsonPropertyName("modalities")]
    public List<string> Modalities { get; set; } = new() { "text", "audio", "avatar", "animation" };

    /// <summary>
    /// Gets or sets the input audio sampling rate.
    /// </summary>
    [JsonPropertyName("input_audio_sampling_rate")]
    public int InputAudioSamplingRate { get; set; } = 24000;

    /// <summary>
    /// Gets or sets the system instructions.
    /// </summary>
    [JsonPropertyName("instructions")]
    public string? Instructions { get; set; }

    /// <summary>
    /// Gets or sets the turn detection configuration.
    /// </summary>
    [JsonPropertyName("turn_detection")]
    public TurnDetectionConfig TurnDetection { get; set; } = new();

    /// <summary>
    /// Gets or sets the tools for function calling.
    /// </summary>
    [JsonPropertyName("tools")]
    public List<object>? Tools { get; set; }

    /// <summary>
    /// Gets or sets the tool choice strategy.
    /// </summary>
    [JsonPropertyName("tool_choice")]
    public string ToolChoice { get; set; } = "auto";

    /// <summary>
    /// Gets or sets the noise reduction configuration.
    /// </summary>
    [JsonPropertyName("input_audio_noise_reduction")]
    public NoiseReductionConfig InputAudioNoiseReduction { get; set; } = new();

    /// <summary>
    /// Gets or sets the echo cancellation configuration.
    /// </summary>
    [JsonPropertyName("input_audio_echo_cancellation")]
    public EchoCancellationConfig InputAudioEchoCancellation { get; set; } = new();

    /// <summary>
    /// Gets or sets the voice configuration.
    /// </summary>
    [JsonPropertyName("voice")]
    public VoiceConfig Voice { get; set; } = new();

    /// <summary>
    /// Gets or sets the input audio transcription configuration.
    /// </summary>
    [JsonPropertyName("input_audio_transcription")]
    public TranscriptionConfig InputAudioTranscription { get; set; } = new();

    /// <summary>
    /// Gets or sets whether to enable output audio timestamps.
    /// When enabled, the API sends response.audio_timestamp.delta events with word-level timing.
    /// </summary>
    [JsonPropertyName("output_audio_timestamps")]
    public bool OutputAudioTimestamps { get; set; } = true;

    /// <summary>
    /// Gets or sets the avatar configuration.
    /// </summary>
    [JsonPropertyName("avatar")]
    public AvatarConfig? Avatar { get; set; }

    /// <summary>
    /// Gets or sets the animation configuration.
    /// </summary>
    [JsonPropertyName("animation")]
    public AnimationConfig? Animation { get; set; }
}

/// <summary>
/// Turn detection configuration.
/// </summary>
public class TurnDetectionConfig
{
    /// <summary>
    /// Gets or sets the type of turn detection.
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = "server_vad";

    /// <summary>
    /// Gets or sets the VAD threshold.
    /// </summary>
    [JsonPropertyName("threshold")]
    public double Threshold { get; set; } = 0.5;

    /// <summary>
    /// Gets or sets the prefix padding in milliseconds.
    /// </summary>
    [JsonPropertyName("prefix_padding_ms")]
    public int PrefixPaddingMs { get; set; } = 300;

    /// <summary>
    /// Gets or sets the silence duration in milliseconds.
    /// </summary>
    [JsonPropertyName("silence_duration_ms")]
    public int SilenceDurationMs { get; set; } = 500;
}

/// <summary>
/// Noise reduction configuration.
/// </summary>
public class NoiseReductionConfig
{
    /// <summary>
    /// Gets or sets the type of noise reduction.
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = "azure_deep_noise_suppression";
}

/// <summary>
/// Echo cancellation configuration.
/// </summary>
public class EchoCancellationConfig
{
    /// <summary>
    /// Gets or sets the type of echo cancellation.
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = "server_echo_cancellation";
}

/// <summary>
/// Voice configuration.
/// </summary>
public class VoiceConfig
{
    /// <summary>
    /// Gets or sets the voice name.
    /// </summary>
    [JsonPropertyName("name")]
    public string Name { get; set; } = "en-US-AvaNeural";

    /// <summary>
    /// Gets or sets the voice type.
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = "azure-standard";

    /// <summary>
    /// Gets or sets the voice temperature.
    /// </summary>
    [JsonPropertyName("temperature")]
    public double Temperature { get; set; } = 0.8;
}

/// <summary>
/// Transcription configuration.
/// </summary>
public class TranscriptionConfig
{
    /// <summary>
    /// Gets or sets the transcription model.
    /// </summary>
    [JsonPropertyName("model")]
    public string Model { get; set; } = "whisper-1";
}

/// <summary>
/// RTC configuration for WebRTC.
/// </summary>
public class RtcConfiguration
{
    /// <summary>
    /// Gets or sets the bundle policy.
    /// </summary>
    [JsonPropertyName("bundle_policy")]
    public string BundlePolicy { get; set; } = "max-bundle";
}

/// <summary>
/// Payload for response.audio_timestamp.delta events.
/// Contains word-level timing information for streaming text to transcript.
/// </summary>
public class AudioTimestampDeltaPayload
{
    /// <summary>
    /// Gets or sets the response ID this timestamp belongs to.
    /// </summary>
    [JsonPropertyName("response_id")]
    public string? ResponseId { get; set; }

    /// <summary>
    /// Gets or sets the item ID within the response.
    /// </summary>
    [JsonPropertyName("item_id")]
    public string? ItemId { get; set; }

    /// <summary>
    /// Gets or sets the output index.
    /// </summary>
    [JsonPropertyName("output_index")]
    public int OutputIndex { get; set; }

    /// <summary>
    /// Gets or sets the content index.
    /// </summary>
    [JsonPropertyName("content_index")]
    public int ContentIndex { get; set; }

    /// <summary>
    /// Gets or sets the audio offset in milliseconds from the start of the audio.
    /// </summary>
    [JsonPropertyName("audio_offset_ms")]
    public int AudioOffsetMs { get; set; }

    /// <summary>
    /// Gets or sets the duration of this audio segment in milliseconds.
    /// </summary>
    [JsonPropertyName("audio_duration_ms")]
    public int AudioDurationMs { get; set; }

    /// <summary>
    /// Gets or sets the text segment (word) for this timestamp.
    /// </summary>
    [JsonPropertyName("text")]
    public string? Text { get; set; }

    /// <summary>
    /// Gets or sets the timestamp type (currently only "word").
    /// </summary>
    [JsonPropertyName("timestamp_type")]
    public string? TimestampType { get; set; }
}

#endregion

/// <summary>
/// Raw WebSocket client for Azure Voice Live API with direct avatar support.
/// This bypasses the SDK to enable avatar WebRTC negotiation via raw WebSocket protocol.
/// Based on the Python implementation pattern from MSFT-Innovation-Hub-India/VoiceAgent-Avatar-Retail.
/// </summary>
public class VoiceLiveRawWebSocketClient : IAsyncDisposable
{
    #region Fields

    private readonly ILogger _logger;
    private readonly string _endpoint;
    private readonly string _model;
    private readonly string? _apiKey;
    private readonly string? _clientId;
    private readonly string _apiVersion;
    private ClientWebSocket? _webSocket;
    private CancellationTokenSource? _cancellationTokenSource;
    private Task? _receiveTask;
    private readonly SemaphoreSlim _connectionLock = new(1, 1);
    private TaskCompletionSource<string>? _avatarSdpFuture;
    private bool _isConnected;
    private readonly ConcurrentDictionary<string, TaskCompletionSource<JsonElement>> _pendingResponses = new();
    private readonly JsonSerializerOptions _jsonOptions;

    #endregion

    #region Events

    /// <summary>
    /// Raised when a session is created.
    /// </summary>
    public event Func<JsonElement, Task>? OnSessionCreated;

    /// <summary>
    /// Raised when a session is updated (contains ICE servers).
    /// </summary>
    public event Func<JsonElement, Task>? OnSessionUpdated;

    /// <summary>
    /// Raised when avatar is connecting (contains SDP answer).
    /// </summary>
    public event Func<string, Task>? OnAvatarConnecting;

    /// <summary>
    /// Raised when audio delta is received.
    /// </summary>
    public event Func<byte[], Task>? OnAudioDelta;

    /// <summary>
    /// Raised when assistant transcription is received.
    /// </summary>
    public event Func<string, Task>? OnTranscription;

    /// <summary>
    /// Raised when user transcription is received.
    /// </summary>
    public event Func<string, Task>? OnUserTranscription;

    /// <summary>
    /// Raised when speech starts.
    /// </summary>
    public event Func<Task>? OnSpeechStarted;

    /// <summary>
    /// Raised when an error occurs.
    /// </summary>
    public event Func<string, Task>? OnError;

    /// <summary>
    /// Raised for raw session events.
    /// </summary>
    public event Func<string, JsonElement, Task>? OnRawEvent;

    /// <summary>
    /// Raised when ICE servers are received from session.updated.
    /// </summary>
    public event Func<List<IceServerConfig>, Task>? OnIceServers;

    /// <summary>
    /// Raised when audio timestamp delta is received (for tracking output audio duration and word-level text streaming).
    /// </summary>
    public event Func<AudioTimestampDeltaPayload, Task>? OnAudioTimestampDelta;

    #endregion

    #region Constructor

    /// <summary>
    /// Initializes a new instance of the VoiceLiveRawWebSocketClient class.
    /// </summary>
    /// <param name="endpoint">The Azure Voice Live endpoint URL.</param>
    /// <param name="model">The model identifier (e.g., "gpt-4o-mini").</param>
    /// <param name="apiKey">Optional API key for authentication.</param>
    /// <param name="logger">The logger instance.</param>
    /// <param name="apiVersion">The API version (default: "2025-05-01-preview").</param>
    /// <param name="clientId">Optional user-assigned managed identity client ID.</param>
    public VoiceLiveRawWebSocketClient(
        string endpoint,
        string model,
        string? apiKey,
        ILogger logger,
        string apiVersion = "2025-05-01-preview",
        string? clientId = null)
    {
        _endpoint = endpoint.TrimEnd('/');
        _model = model;
        _apiKey = apiKey;
        _clientId = clientId;
        _logger = logger;
        _apiVersion = apiVersion;
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
            PropertyNameCaseInsensitive = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
        };
    }

    #endregion

    #region Connection Methods

    /// <summary>
    /// Builds the WebSocket URL for Azure Voice Live API.
    /// </summary>
    /// <param name="agentToken">Optional agent access token.</param>
    /// <returns>The WebSocket URL.</returns>
    private string BuildWebSocketUrl(string? agentToken = null)
    {
        var wsEndpoint = _endpoint.Replace("https://", "wss://");
        var baseUrl = $"{wsEndpoint}/voice-live/realtime?api-version={_apiVersion}&model={_model}";
        
        if (!string.IsNullOrEmpty(agentToken))
        {
            baseUrl += $"&agent-access-token={Uri.EscapeDataString(agentToken)}";
        }
        
        return baseUrl;
    }

    /// <summary>
    /// Gets an Azure AD token for authentication.
    /// </summary>
    private async Task<string> GetTokenAsync()
    {
        var credential = string.IsNullOrWhiteSpace(_clientId)
            ? new DefaultAzureCredential()
            : new DefaultAzureCredential(new DefaultAzureCredentialOptions { ManagedIdentityClientId = _clientId });
        
        var scope = "https://ai.azure.com/.default";
        var tokenRequestContext = new TokenRequestContext(new[] { scope });
        var accessToken = await credential.GetTokenAsync(tokenRequestContext, default).ConfigureAwait(false);
        return accessToken.Token;
    }

    /// <summary>
    /// Connects to the Azure Voice Live WebSocket API.
    /// </summary>
    /// <param name="sessionConfig">The session configuration including avatar settings.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task ConnectAsync(VoiceLiveSessionConfig sessionConfig, CancellationToken cancellationToken = default)
    {
        await _connectionLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_isConnected && _webSocket?.State == WebSocketState.Open)
            {
                _logger.LogDebug("Already connected to Voice Live API");
                return;
            }

            _cancellationTokenSource = new CancellationTokenSource();
            _webSocket = new ClientWebSocket();

            // Build WebSocket URL
            string wsUrl;
            if (!string.IsNullOrEmpty(_apiKey))
            {
                wsUrl = BuildWebSocketUrl();
                _webSocket.Options.SetRequestHeader("api-key", _apiKey);
                _logger.LogDebug("Connecting with API Key authentication");
            }
            else
            {
                var token = await GetTokenAsync().ConfigureAwait(false);
                wsUrl = BuildWebSocketUrl();
                _webSocket.Options.SetRequestHeader("Authorization", $"Bearer {token}");
                _logger.LogDebug("Connecting with Azure AD token authentication");
            }

            _webSocket.Options.SetRequestHeader("x-ms-client-request-id", Guid.NewGuid().ToString());

            _logger.LogInformation("Connecting to Voice Live WebSocket: {Url}", wsUrl);
            await _webSocket.ConnectAsync(new Uri(wsUrl), cancellationToken).ConfigureAwait(false);
            
            _isConnected = true;
            _logger.LogInformation("Connected to Azure Voice Live WebSocket");

            // Start receive loop
            _receiveTask = Task.Run(
                () => ReceiveLoopAsync(_cancellationTokenSource.Token),
                _cancellationTokenSource.Token);

            // Send session.update to configure the session with avatar settings
            await SendSessionUpdateAsync(sessionConfig, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _connectionLock.Release();
        }
    }

    /// <summary>
    /// Disconnects from the Voice Live API.
    /// </summary>
    public async Task DisconnectAsync()
    {
        _cancellationTokenSource?.Cancel();

        if (_webSocket != null && _webSocket.State == WebSocketState.Open)
        {
            try
            {
                await _webSocket.CloseAsync(
                    WebSocketCloseStatus.NormalClosure,
                    "Disconnecting",
                    CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Error during WebSocket close");
            }
        }

        if (_receiveTask != null)
        {
            try
            {
                await _receiveTask.ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                // Expected
            }
        }

        _isConnected = false;
        _logger.LogInformation("Disconnected from Voice Live API");
    }

    #endregion

    #region Send Methods

    /// <summary>
    /// Sends a raw JSON message to the WebSocket.
    /// </summary>
    /// <param name="eventType">The event type.</param>
    /// <param name="data">Optional additional data to include.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    private async Task SendAsync(string eventType, Dictionary<string, object>? data = null, CancellationToken cancellationToken = default)
    {
        if (_webSocket?.State != WebSocketState.Open)
        {
            throw new InvalidOperationException("WebSocket is not connected");
        }

        var payload = new Dictionary<string, object>
        {
            ["event_id"] = GenerateEventId(),
            ["type"] = eventType
        };

        if (data != null)
        {
            foreach (var kvp in data)
            {
                payload[kvp.Key] = kvp.Value;
            }
        }

        var json = JsonSerializer.Serialize(payload, _jsonOptions);
        var bytes = Encoding.UTF8.GetBytes(json);

        _logger.LogDebug("Sending WebSocket message: {EventType}", eventType);
        await _webSocket.SendAsync(
            new ArraySegment<byte>(bytes),
            WebSocketMessageType.Text,
            true,
            cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Sends session.update message to configure the session.
    /// </summary>
    /// <param name="config">The session configuration.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task SendSessionUpdateAsync(VoiceLiveSessionConfig config, CancellationToken cancellationToken = default)
    {
        var sessionData = new Dictionary<string, object>
        {
            ["session"] = config
        };

        // Log the session configuration being sent (including InputAudioTranscription)
        var sessionJson = JsonSerializer.Serialize(config, _jsonOptions);
        _logger.LogInformation("Sending session.update - InputAudioTranscription: {HasTranscription}, Full config: {Config}", 
            config.InputAudioTranscription != null ? $"Model={config.InputAudioTranscription.Model}" : "null",
            sessionJson);

        await SendAsync("session.update", sessionData, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Sent session.update with avatar configuration");
    }

    /// <summary>
    /// Sends audio data to the Voice Live API.
    /// </summary>
    /// <param name="audioData">The audio data (PCM 16-bit, 24kHz).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task SendAudioAsync(byte[] audioData, CancellationToken cancellationToken = default)
    {
        var base64Audio = Convert.ToBase64String(audioData);
        var data = new Dictionary<string, object>
        {
            ["audio"] = base64Audio
        };

        await SendAsync("input_audio_buffer.append", data, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Sends a user text message.
    /// </summary>
    /// <param name="text">The text message.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task SendUserMessageAsync(string text, CancellationToken cancellationToken = default)
    {
        var itemData = new Dictionary<string, object>
        {
            ["item"] = new Dictionary<string, object>
            {
                ["type"] = "message",
                ["role"] = "user",
                ["content"] = new[]
                {
                    new Dictionary<string, object>
                    {
                        ["type"] = "input_text",
                        ["text"] = text
                    }
                }
            }
        };

        await SendAsync("conversation.item.create", itemData, cancellationToken).ConfigureAwait(false);

        // Trigger response
        var responseData = new Dictionary<string, object>
        {
            ["response"] = new Dictionary<string, object>
            {
                ["modalities"] = new[] { "text", "audio" }
            }
        };

        await SendAsync("response.create", responseData, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Connects avatar WebRTC by sending session.avatar.connect with SDP offer.
    /// </summary>
    /// <param name="clientSdp">The client's SDP offer.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The server's SDP answer.</returns>
    public async Task<string> ConnectAvatarAsync(string clientSdp, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(clientSdp))
        {
            throw new ArgumentException("Client SDP is required", nameof(clientSdp));
        }

        _logger.LogInformation("Initiating avatar WebRTC connection...");
        _logger.LogDebug("Client SDP length: {Length} characters", clientSdp.Length);

        // Create future to wait for SDP answer
        _avatarSdpFuture = new TaskCompletionSource<string>();

        // Encode SDP as base64 JSON (as per Azure Voice Live API requirements)
        var encodedSdp = EncodeClientSdp(clientSdp);

        var avatarConnectData = new Dictionary<string, object>
        {
            ["client_sdp"] = encodedSdp,
            ["rtc_configuration"] = new RtcConfiguration()
        };

        await SendAsync("session.avatar.connect", avatarConnectData, cancellationToken).ConfigureAwait(false);
        _logger.LogInformation("Sent session.avatar.connect message");

        // Wait for SDP answer with timeout
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(20));

        try
        {
            var serverSdp = await _avatarSdpFuture.Task.WaitAsync(timeoutCts.Token).ConfigureAwait(false);
            _logger.LogInformation("Received avatar SDP answer (length: {Length})", serverSdp?.Length ?? 0);
            return serverSdp ?? string.Empty;
        }
        catch (OperationCanceledException)
        {
            _logger.LogError("Timeout waiting for avatar SDP answer");
            throw new TimeoutException("Timeout waiting for avatar SDP answer from Azure Voice Live");
        }
        finally
        {
            _avatarSdpFuture = null;
        }
    }

    /// <summary>
    /// Commits the audio buffer to trigger processing.
    /// </summary>
    public async Task CommitAudioAsync(CancellationToken cancellationToken = default)
    {
        await SendAsync("input_audio_buffer.commit", cancellationToken: cancellationToken).ConfigureAwait(false);
    }

    /// <summary>
    /// Clears the audio buffer.
    /// </summary>
    public async Task ClearAudioAsync(CancellationToken cancellationToken = default)
    {
        await SendAsync("input_audio_buffer.clear", cancellationToken: cancellationToken).ConfigureAwait(false);
    }

    #endregion

    #region Receive Methods

    /// <summary>
    /// Main receive loop for WebSocket messages.
    /// </summary>
    private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[8192];
        var messageBuffer = new List<byte>();

        try
        {
            while (!cancellationToken.IsCancellationRequested && _webSocket?.State == WebSocketState.Open)
            {
                var result = await _webSocket.ReceiveAsync(
                    new ArraySegment<byte>(buffer),
                    cancellationToken).ConfigureAwait(false);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _logger.LogInformation("WebSocket closed by server");
                    break;
                }

                messageBuffer.AddRange(buffer.Take(result.Count));

                if (result.EndOfMessage)
                {
                    var message = Encoding.UTF8.GetString(messageBuffer.ToArray());
                    messageBuffer.Clear();

                    await HandleMessageAsync(message, cancellationToken).ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogDebug("Receive loop cancelled");
        }
        catch (WebSocketException ex)
        {
            _logger.LogError(ex, "WebSocket error in receive loop");
            if (OnError != null)
            {
                await OnError($"WebSocket error: {ex.Message}").ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in receive loop");
            if (OnError != null)
            {
                await OnError($"Receive error: {ex.Message}").ConfigureAwait(false);
            }
        }
    }

    /// <summary>
    /// Handles a received WebSocket message.
    /// </summary>
    private async Task HandleMessageAsync(string message, CancellationToken cancellationToken)
    {
        try
        {
            var document = JsonDocument.Parse(message);
            var root = document.RootElement;

            if (!root.TryGetProperty("type", out var typeElement))
            {
                _logger.LogWarning("Received message without type: {Message}", message);
                return;
            }

            var eventType = typeElement.GetString() ?? string.Empty;
            _logger.LogDebug("Received event: {EventType}", eventType);

            // Emit raw event
            if (OnRawEvent != null)
            {
                await OnRawEvent(eventType, root).ConfigureAwait(false);
            }

            switch (eventType)
            {
                case "session.created":
                    _logger.LogInformation("Session created");
                    if (OnSessionCreated != null)
                    {
                        await OnSessionCreated(root).ConfigureAwait(false);
                    }
                    break;

                case "session.updated":
                    _logger.LogInformation("Session updated - checking for input_audio_transcription config");
                    
                    // Log if input_audio_transcription is present in the response
                    if (root.TryGetProperty("session", out var sessionProp))
                    {
                        if (sessionProp.TryGetProperty("input_audio_transcription", out var transcriptionProp))
                        {
                            var transcriptionJson = transcriptionProp.ToString();
                            _logger.LogInformation("Session has input_audio_transcription configured: {Config}", transcriptionJson);
                        }
                        else
                        {
                            _logger.LogWarning("Session updated but NO input_audio_transcription property found in session config!");
                        }
                    }
                    
                    await HandleSessionUpdatedAsync(root).ConfigureAwait(false);
                    if (OnSessionUpdated != null)
                    {
                        await OnSessionUpdated(root).ConfigureAwait(false);
                    }
                    break;

                case "session.avatar.connecting":
                    _logger.LogInformation("Avatar connecting - received SDP answer");
                    await HandleAvatarConnectingAsync(root).ConfigureAwait(false);
                    break;

                case "input_audio_buffer.speech_started":
                    _logger.LogDebug("Speech started");
                    if (OnSpeechStarted != null)
                    {
                        await OnSpeechStarted().ConfigureAwait(false);
                    }
                    break;

                case "conversation.item.input_audio_transcription.completed":
                    _logger.LogInformation("Received conversation.item.input_audio_transcription.completed event");
                    if (root.TryGetProperty("transcript", out var userTranscript))
                    {
                        var text = userTranscript.GetString() ?? string.Empty;
                        _logger.LogInformation("User transcription completed: '{Transcript}' (Length: {Length})", text, text.Length);
                        if (OnUserTranscription != null && !string.IsNullOrEmpty(text))
                        {
                            await OnUserTranscription(text).ConfigureAwait(false);
                        }
                    }
                    else
                    {
                        _logger.LogWarning("conversation.item.input_audio_transcription.completed event received but no 'transcript' property found");
                    }
                    break;

                case "response.audio_transcript.done":
                    if (root.TryGetProperty("transcript", out var assistantTranscript))
                    {
                        var text = assistantTranscript.GetString() ?? string.Empty;
                        _logger.LogDebug("Assistant transcription: {Transcript}", text);
                        if (OnTranscription != null && !string.IsNullOrEmpty(text))
                        {
                            await OnTranscription(text).ConfigureAwait(false);
                        }
                    }
                    break;

                case "response.audio.delta":
                    if (root.TryGetProperty("delta", out var audioDelta))
                    {
                        var base64Audio = audioDelta.GetString();
                        if (!string.IsNullOrEmpty(base64Audio))
                        {
                            var audioBytes = Convert.FromBase64String(base64Audio);
                            if (OnAudioDelta != null)
                            {
                                await OnAudioDelta(audioBytes).ConfigureAwait(false);
                            }
                        }
                    }
                    break;

                case "response.audio_timestamp.delta":
                    if (OnAudioTimestampDelta != null)
                    {
                        var payload = new AudioTimestampDeltaPayload
                        {
                            ResponseId = root.TryGetProperty("response_id", out var respId) ? respId.GetString() : null,
                            ItemId = root.TryGetProperty("item_id", out var itemId) ? itemId.GetString() : null,
                            OutputIndex = root.TryGetProperty("output_index", out var outIdx) ? outIdx.GetInt32() : 0,
                            ContentIndex = root.TryGetProperty("content_index", out var contIdx) ? contIdx.GetInt32() : 0,
                            AudioOffsetMs = root.TryGetProperty("audio_offset_ms", out var offsetMs) ? offsetMs.GetInt32() : 0,
                            AudioDurationMs = root.TryGetProperty("audio_duration_ms", out var durationMs) ? durationMs.GetInt32() : 0,
                            Text = root.TryGetProperty("text", out var textProp) ? textProp.GetString() : null,
                            TimestampType = root.TryGetProperty("timestamp_type", out var tsType) ? tsType.GetString() : null
                        };
                        _logger.LogDebug("Audio timestamp delta: offset={OffsetMs}ms, duration={DurationMs}ms, text='{Text}'",
                            payload.AudioOffsetMs, payload.AudioDurationMs, payload.Text);
                        await OnAudioTimestampDelta(payload).ConfigureAwait(false);
                    }
                    break;

                case "error":
                    if (root.TryGetProperty("error", out var errorElement))
                    {
                        var errorMessage = errorElement.TryGetProperty("message", out var msgElement)
                            ? msgElement.GetString() ?? "Unknown error"
                            : "Unknown error";
                        _logger.LogError("Voice Live error: {Error}", errorMessage);
                        if (OnError != null)
                        {
                            await OnError(errorMessage).ConfigureAwait(false);
                        }
                    }
                    break;

                default:
                    _logger.LogDebug("Unhandled event type: {EventType}", eventType);
                    break;
            }
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse message: {Message}", message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling message");
        }
    }

    /// <summary>
    /// Handles session.updated events, extracting ICE servers.
    /// </summary>
    private async Task HandleSessionUpdatedAsync(JsonElement root)
    {
        try
        {
            // Look for ICE servers in multiple locations
            var iceServers = new List<IceServerConfig>();

            if (root.TryGetProperty("session", out var sessionElement))
            {
                // Try session.avatar.ice_servers
                if (sessionElement.TryGetProperty("avatar", out var avatarElement) &&
                    avatarElement.TryGetProperty("ice_servers", out var avatarIceServers))
                {
                    iceServers = ParseIceServers(avatarIceServers);
                }
                // Try session.rtc.ice_servers
                else if (sessionElement.TryGetProperty("rtc", out var rtcElement) &&
                         rtcElement.TryGetProperty("ice_servers", out var rtcIceServers))
                {
                    iceServers = ParseIceServers(rtcIceServers);
                }
                // Try session.ice_servers
                else if (sessionElement.TryGetProperty("ice_servers", out var sessionIceServers))
                {
                    iceServers = ParseIceServers(sessionIceServers);
                }
            }

            if (iceServers.Count > 0)
            {
                _logger.LogInformation("Received {Count} ICE servers from session.updated", iceServers.Count);
                if (OnIceServers != null)
                {
                    await OnIceServers(iceServers).ConfigureAwait(false);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error extracting ICE servers from session.updated");
        }
    }

    /// <summary>
    /// Handles session.avatar.connecting event, extracting SDP answer.
    /// </summary>
    private async Task HandleAvatarConnectingAsync(JsonElement root)
    {
        try
        {
            if (root.TryGetProperty("server_sdp", out var serverSdpElement))
            {
                var serverSdpRaw = serverSdpElement.GetString();
                var decodedSdp = DecodeServerSdp(serverSdpRaw);

                if (!string.IsNullOrEmpty(decodedSdp))
                {
                    _logger.LogInformation("Decoded avatar SDP answer (length: {Length})", decodedSdp.Length);
                    
                    // Complete the future if waiting
                    _avatarSdpFuture?.TrySetResult(decodedSdp);

                    // Emit event
                    if (OnAvatarConnecting != null)
                    {
                        await OnAvatarConnecting(decodedSdp).ConfigureAwait(false);
                    }
                }
                else
                {
                    _logger.LogWarning("Received empty SDP answer");
                    _avatarSdpFuture?.TrySetException(new InvalidOperationException("Empty server SDP"));
                }
            }
            else
            {
                _logger.LogWarning("session.avatar.connecting missing server_sdp");
                _avatarSdpFuture?.TrySetException(new InvalidOperationException("Missing server_sdp in response"));
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling avatar connecting event");
            _avatarSdpFuture?.TrySetException(ex);
        }
    }

    /// <summary>
    /// Parses ICE server configuration from JSON.
    /// </summary>
    private List<IceServerConfig> ParseIceServers(JsonElement iceServersElement)
    {
        var iceServers = new List<IceServerConfig>();

        if (iceServersElement.ValueKind != JsonValueKind.Array)
        {
            return iceServers;
        }

        foreach (var entry in iceServersElement.EnumerateArray())
        {
            var iceServer = new IceServerConfig();

            if (entry.ValueKind == JsonValueKind.String)
            {
                // Simple string format
                iceServer.Urls = new List<string> { entry.GetString()! };
            }
            else if (entry.ValueKind == JsonValueKind.Object)
            {
                // Object format with urls, username, credential
                if (entry.TryGetProperty("urls", out var urlsElement))
                {
                    if (urlsElement.ValueKind == JsonValueKind.Array)
                    {
                        iceServer.Urls = urlsElement.EnumerateArray()
                            .Select(u => u.GetString()!)
                            .Where(u => !string.IsNullOrEmpty(u))
                            .ToList();
                    }
                    else if (urlsElement.ValueKind == JsonValueKind.String)
                    {
                        iceServer.Urls = new List<string> { urlsElement.GetString()! };
                    }
                }

                if (entry.TryGetProperty("username", out var usernameElement))
                {
                    iceServer.Username = usernameElement.GetString();
                }

                if (entry.TryGetProperty("credential", out var credentialElement))
                {
                    iceServer.Credential = credentialElement.GetString();
                }
            }

            if (iceServer.Urls.Count > 0)
            {
                iceServers.Add(iceServer);
            }
        }

        return iceServers;
    }

    #endregion

    #region SDP Encoding/Decoding

    /// <summary>
    /// Encodes client SDP as base64 JSON as required by Azure Voice Live API.
    /// Format: {"type": "offer", "sdp": "..."} -> base64
    /// </summary>
    /// <param name="clientSdp">The raw SDP string.</param>
    /// <returns>Base64-encoded JSON payload.</returns>
    private static string EncodeClientSdp(string clientSdp)
    {
        var payload = new { type = "offer", sdp = clientSdp };
        var json = JsonSerializer.Serialize(payload);
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(json));
    }

    /// <summary>
    /// Decodes server SDP from base64 JSON or plain SDP format.
    /// Handles both raw SDP starting with "v=0" and base64-encoded JSON.
    /// </summary>
    /// <param name="serverSdpRaw">The raw server SDP response.</param>
    /// <returns>The decoded SDP string.</returns>
    private static string? DecodeServerSdp(string? serverSdpRaw)
    {
        if (string.IsNullOrEmpty(serverSdpRaw))
        {
            return null;
        }

        // If already plain SDP (starts with "v=0"), return as-is
        if (serverSdpRaw.StartsWith("v=0"))
        {
            return serverSdpRaw;
        }

        try
        {
            // Try base64 decode
            var decodedBytes = Convert.FromBase64String(serverSdpRaw);
            var decodedText = Encoding.UTF8.GetString(decodedBytes);

            // Try to parse as JSON
            try
            {
                using var doc = JsonDocument.Parse(decodedText);
                if (doc.RootElement.TryGetProperty("sdp", out var sdpElement))
                {
                    return sdpElement.GetString();
                }
            }
            catch (JsonException)
            {
                // Not JSON, return decoded text as raw SDP
                return decodedText;
            }

            return decodedText;
        }
        catch
        {
            // If base64 decode fails, return original
            return serverSdpRaw;
        }
    }

    #endregion

    #region Helpers

    /// <summary>
    /// Generates a unique event ID.
    /// </summary>
    private static string GenerateEventId()
    {
        return $"evt_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
    }

    #endregion

    #region IAsyncDisposable

    /// <summary>
    /// Disposes of the WebSocket client resources.
    /// </summary>
    public async ValueTask DisposeAsync()
    {
        _logger.LogDebug("Disposing VoiceLiveRawWebSocketClient");

        await DisconnectAsync().ConfigureAwait(false);

        _webSocket?.Dispose();
        _cancellationTokenSource?.Dispose();
        _connectionLock.Dispose();

        _logger.LogDebug("VoiceLiveRawWebSocketClient disposed");
    }

    #endregion
}
