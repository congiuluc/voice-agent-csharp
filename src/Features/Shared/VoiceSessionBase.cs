using System.Text.Json;
using Azure.AI.VoiceLive;
using Microsoft.Extensions.Logging;
using VoiceAgentCSharp.Features.Monitoring;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Base class for Voice Live session implementations.
/// Provides common functionality for Agent, Assistant, and Avatar sessions.
/// </summary>
public abstract class VoiceSessionBase : IVoiceSession
{
    #region Fields

    protected readonly VoiceLiveClient _client;
    protected readonly VoiceSessionConfig _config;
    protected readonly ILogger _logger;
    protected readonly VoiceToolHandler _toolHandler;
    protected VoiceLiveSession? _session;
    protected bool _disposed;
    protected Task? _eventProcessingTask;
    protected CancellationTokenSource? _cancellationTokenSource;
    protected CallMonitoringService? _monitoringService;
    protected string? _sessionId;

    #endregion

    #region Events

    public event Func<byte[], Task>? OnAudioDelta;
    public event Func<string, Task>? OnTranscription;
    public event Func<string, Task>? OnUserTranscription;
    public event Func<Task>? OnSpeechStarted;
    public event Func<string, Task>? OnError;
    public event Func<string, string, Task>? OnSessionEvent;

    #endregion

    #region Properties

    public abstract string SessionType { get; }

    #endregion

    #region Constructor

    /// <summary>
    /// Initializes a new instance of the VoiceSessionBase class.
    /// </summary>
    protected VoiceSessionBase(VoiceLiveClient client, VoiceSessionConfig config, ILogger logger, HttpClient? httpClient = null)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _config = config ?? throw new ArgumentNullException(nameof(config));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _toolHandler = new VoiceToolHandler(logger, httpClient);
        _cancellationTokenSource = new CancellationTokenSource();
    }

    /// <summary>
    /// Sets the monitoring service and session ID for tracking metrics.
    /// Should be called after session construction.
    /// </summary>
    public void SetMonitoring(CallMonitoringService monitoringService, string sessionId)
    {
        _monitoringService = monitoringService;
        _sessionId = sessionId;
    }

    #endregion

    #region Abstract Methods

    /// <summary>
    /// Starts the voice session. Derived classes implement session-specific logic.
    /// </summary>
    public abstract Task StartAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Processes events from the Voice Live session. Derived classes implement event-specific logic.
    /// </summary>
    protected abstract Task ProcessEventsAsync(CancellationToken cancellationToken);

    #endregion

    #region Common Methods

    /// <summary>
    /// Initializes the MCP client connection to enable tool discovery.
    /// Extracted common pattern used by all session types.
    /// </summary>
    protected async Task InitializeMcpAsync()
    {
        try
        {
            var mcpServerUrl = _config.McpServerUrl ?? "http://localhost:5001";
            
            if (!string.IsNullOrWhiteSpace(mcpServerUrl))
            {
                _logger.LogInformation("Initializing MCP connection to {Url}", mcpServerUrl);
                await _toolHandler.InitializeMcpAsync(mcpServerUrl).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to initialize MCP connection, will use built-in tools only");
        }
    }

    /// <summary>
    /// Sends audio data to the Voice Live API.
    /// Common implementation for all session types.
    /// </summary>
    public virtual async Task SendAudioAsync(byte[] audioData)
    {
        _logger.LogDebug("Sending audio data of length {Length} bytes", audioData.Length);
        if (_session == null)
        {
            _logger.LogWarning("Cannot send audio: session not initialized");
            return;
        }

        try
        {
            await _session.SendInputAudioAsync(BinaryData.FromBytes(audioData), default).ConfigureAwait(false);
            _logger.LogDebug("Audio data sent successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending audio data");
            throw;
        }
    }

    /// <summary>
    /// Sends text message to the Voice Live API.
    /// Common implementation for all session types.
    /// </summary>
    public virtual async Task SendTextAsync(string text)
    {
        _logger.LogDebug("Sending text: {Text}", text);
        if (_session == null)
        {
            _logger.LogWarning("Cannot send text: session not initialized");
            return;
        }

        try
        {
            await _session.AddItemAsync(new UserMessageItem(text)).ConfigureAwait(false);
            await _session.StartResponseAsync().ConfigureAwait(false);
            _logger.LogDebug("Text sent successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending text");
            throw;
        }
    }

    /// <summary>
    /// Handles function/tool call requests from the Voice Live API.
    /// Common implementation for executing tools and sending results back.
    /// </summary>
    protected virtual async Task HandleFunctionCallAsync(SessionUpdateResponseFunctionCallArgumentsDone args)
    {
        _logger.LogInformation("Handling function call: {Name} with args {Args}", args.Name, args.Arguments);

        if (_session == null)
        {
            _logger.LogWarning("Cannot handle function call: session not initialized");
            return;
        }

        try
        {
            // Execute the tool using the shared VoiceToolHandler
            string output = await _toolHandler.ExecuteToolAsync(args.Name, args.Arguments);

            // Send output back to the session
            var outputItem = new FunctionCallOutputItem(args.CallId, output);
            await _session.AddItemAsync(outputItem).ConfigureAwait(false);
            await _session.StartResponseAsync().ConfigureAwait(false);

            _logger.LogInformation("Function call {Name} completed with result: {Result}", args.Name, output);
            await EmitSessionEventAsync("FunctionCallCompleted", new { Name = args.Name, Result = output });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling function call {Name}", args.Name);
        }
    }

    /// <summary>
    /// Emits session events to subscribers.
    /// Filters out events that should not be sent to the UI client.
    /// Common implementation for all session types.
    /// </summary>
    protected async Task EmitSessionEventAsync(string eventType, object? payload)
    {
        // Filter out events that should not be sent to the UI client
        var eventsToFilter = new[] 
        { 
            "ResponseAudioDelta",           // Audio delta events are too frequent and not useful for tracing
            "ResponseAudioTranscriptDelta"  // Transcript delta events are too frequent, final transcript is sent in ResponseAudioTranscriptDone
        };

        if (eventsToFilter.Contains(eventType))
        {
            _logger.LogDebug("Filtering event {EventType} from UI client", eventType);
            return;
        }

        try
        {
            if (OnSessionEvent != null)
            {
                string json = payload == null ? string.Empty : JsonSerializer.Serialize(payload);
                await OnSessionEvent(eventType, json).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to emit session event {EventType}", eventType);
        }
    }

    /// <summary>
    /// Emits audio delta event to subscribers.
    /// </summary>
    protected async Task OnAudioDeltaAsync(byte[] audioData)
    {
        try
        {
            if (OnAudioDelta != null)
            {
                await OnAudioDelta(audioData).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to process OnAudioDelta event");
        }
    }

    /// <summary>
    /// Emits transcription event to subscribers.
    /// </summary>
    protected async Task OnTranscriptionAsync(string text)
    {
        try
        {
            if (OnTranscription != null)
            {
                await OnTranscription(text).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to process OnTranscription event");
        }
    }

    /// <summary>
    /// Emits user transcription event to subscribers.
    /// </summary>
    protected async Task OnUserTranscriptionAsync(string text)
    {
        try
        {
            if (OnUserTranscription != null)
            {
                await OnUserTranscription(text).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to process OnUserTranscription event");
        }
    }

    /// <summary>
    /// Emits speech started event to subscribers.
    /// </summary>
    protected async Task OnSpeechStartedAsync()
    {
        try
        {
            if (OnSpeechStarted != null)
            {
                await OnSpeechStarted().ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to process OnSpeechStarted event");
        }
    }

    /// <summary>
    /// Emits error event to subscribers.
    /// </summary>
    protected async Task OnErrorAsync(string errorMessage)
    {
        try
        {
            if (OnError != null)
            {
                await OnError(errorMessage).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to process OnError event");
        }
    }

    /// <summary>
    /// Updates the session configuration dynamically.
    /// Must be implemented by derived classes for session-specific behavior.
    /// </summary>
    public abstract Task UpdateSessionAsync(
        string? voiceModel = null,
        string? voice = null,
        string? welcomeMessage = null,
        string? modelInstructions = null,
        List<VoiceLiveToolDefinition>? toolDefinitions = null,
        string? locale = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Disposes the session resources.
    /// </summary>
    public virtual async ValueTask DisposeAsync()
    {
        if (_disposed)
            return;

        _logger.LogInformation("Disposing {SessionType} session", SessionType);

        // Cancel event processing task BEFORE disposing the session
        // This prevents WebSocket errors when trying to read from a closed connection
        if (_cancellationTokenSource != null && !_cancellationTokenSource.IsCancellationRequested)
        {
            _logger.LogDebug("Cancelling event processing task");
            _cancellationTokenSource.Cancel();
        }

        // Wait for event processing task to complete
        if (_eventProcessingTask != null)
        {
            try
            {
                // Give it a short timeout to complete gracefully
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(_cancellationTokenSource?.Token ?? CancellationToken.None);
                timeoutCts.CancelAfter(TimeSpan.FromSeconds(2));
                await _eventProcessingTask.WaitAsync(timeoutCts.Token).ConfigureAwait(false);
                _logger.LogDebug("Event processing task completed");
            }
            catch (OperationCanceledException)
            {
                _logger.LogDebug("Event processing task cancelled");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error waiting for event processing task");
            }
        }

        // Dispose Voice Live session
        if (_session != null)
        {
            try
            {
                await _session.DisposeAsync().ConfigureAwait(false);
                _logger.LogDebug("Voice Live session disposed");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error disposing Voice Live session");
            }
        }

        // Dispose tool handler (if it manages resources)
        if (_toolHandler is IAsyncDisposable disposable)
        {
            try
            {
                await disposable.DisposeAsync().ConfigureAwait(false);
                _logger.LogDebug("Tool handler disposed");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error disposing tool handler");
            }
        }

        // Dispose cancellation token source
        _cancellationTokenSource?.Dispose();

        _disposed = true;
        _logger.LogInformation("{SessionType} session disposed", SessionType);
    }

    #endregion
}
