using Azure;
using Azure.AI.VoiceLive;
using Azure.Communication.CallAutomation;
using System.Text.Json;
using VoiceAgentCSharp.Features.Shared;

namespace VoiceAgentCSharp.Features.IncomingCall;

/// <summary>
/// Voice ACS Session for Azure Communication Services integration.
/// Handles media streaming from ACS call connections to Voice Live API.
/// </summary>
public class VoiceAcsSession : IVoiceSession
{
    private readonly VoiceLiveClient _client;
    private readonly VoiceSessionConfig _config;
    private readonly ILogger _logger;
    private readonly CallConnection _callConnection;
    private readonly VoiceToolHandler _toolHandler;
    private VoiceLiveSession? _session;
    private bool _disposed;
    private Task? _eventProcessingTask;

    /// <summary>
    /// Gets the session type identifier.
    /// </summary>
    public string SessionType => "ACS";

    /// <summary>
    /// Raised when audio delta data is received.
    /// </summary>
    public event Func<byte[], Task>? OnAudioDelta;

    /// <summary>
    /// Raised when the assistant provides a transcription.
    /// </summary>
    public event Func<string, Task>? OnTranscription;

    /// <summary>
    /// Raised when the user's audio is transcribed.
    /// </summary>
    public event Func<string, Task>? OnUserTranscription;

    /// <summary>
    /// Raised when the assistant starts speaking.
    /// </summary>
    public event Func<Task>? OnSpeechStarted;

    /// <summary>
    /// Raised when an error occurs.
    /// </summary>
    public event Func<string, Task>? OnError;

    /// <summary>
    /// Raised for session events (eventType, jsonPayload).
    /// </summary>
    public event Func<string, string, Task>? OnSessionEvent;

    /// <summary>
    /// Initializes a new instance of the VoiceAcsSession class.
    /// </summary>
    public VoiceAcsSession(VoiceLiveClient client, VoiceSessionConfig config, CallConnection callConnection, ILogger logger, HttpClient? httpClient = null)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _config = config ?? throw new ArgumentNullException(nameof(config));
        _callConnection = callConnection ?? throw new ArgumentNullException(nameof(callConnection));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _toolHandler = new VoiceToolHandler(logger, httpClient);
    }

    /// <summary>
    /// Starts the Voice ACS session.
    /// Creates a Voice Live session configured for ACS media streaming integration.
    /// </summary>
    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Starting Voice ACS session");

            // Create session options for ACS integration
            var sessionOptions = CreateAcsSessionOptions();

            // Start the session
            _session = await _client.StartSessionAsync(sessionOptions, cancellationToken).ConfigureAwait(false);
            _logger.LogInformation("Voice ACS session started successfully");

            // Start processing events in the background
            _eventProcessingTask = Task.Run(() => ProcessEventsAsync(cancellationToken), cancellationToken);

            _logger.LogInformation("Voice ACS ready to receive media from call connection");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting Voice ACS session");
            await DisposeAsync();
            throw;
        }
    }

    /// <summary>
    /// Creates session options configured for ACS media streaming.
    /// </summary>
    private VoiceLiveSessionOptions CreateAcsSessionOptions()
    {
        var azureVoice = new AzureStandardVoice(_config.Voice ?? "en-US-AvaNeural")
        {
            Temperature = 0.7f,
            Locale = _config.Locale ?? "en-US"
        };

        var turnDetectionConfig = new ServerVadTurnDetection
        {
            Threshold = 0.5f,
            PrefixPadding = TimeSpan.FromMilliseconds(300),
            SilenceDuration = TimeSpan.FromMilliseconds(500)
        };

        var sessionOptions = new VoiceLiveSessionOptions
        {
            InputAudioEchoCancellation = new AudioEchoCancellation(),
            Voice = azureVoice,
            InputAudioFormat = InputAudioFormat.Pcm16,
            OutputAudioFormat = OutputAudioFormat.Pcm16,
            TurnDetection = turnDetectionConfig
        };

        // Configure for model-based or agent-based conversation
        if (!string.IsNullOrEmpty(_config.FoundryAgentId))
        {
            // Agent-based: instructions managed by Foundry Agent
            _logger.LogInformation("ACS session configured for Foundry Agent: {AgentId}", _config.FoundryAgentId);
        }
        else
        {
            // Model-based: standard assistant conversation
            if (!string.IsNullOrEmpty(_config.Model))
            {
                sessionOptions.Model = _config.Model;
            }

            if (!string.IsNullOrEmpty(_config.Instructions))
            {
                sessionOptions.Instructions = _config.Instructions;
            }

            _logger.LogInformation("ACS session configured for model-based conversation: {Model}", _config.Model ?? "default");
        }

        // Ensure modalities include audio and text
        sessionOptions.Modalities.Clear();
        sessionOptions.Modalities.Add(InteractionModality.Text);
        sessionOptions.Modalities.Add(InteractionModality.Audio);

        // Add common tools (GetDateTime, GetWeather)
        foreach (var tool in _toolHandler.GetTools())
        {
            sessionOptions.Tools.Add(tool);
        }

        _logger.LogInformation("ACS session options created");
        return sessionOptions;
    }

    /// <summary>
    /// Sends audio data received from ACS media streaming to the Voice Live API.
    /// This method is typically called by the WebSocket handler with audio chunks from the call.
    /// </summary>
    public async Task SendAudioAsync(byte[] audioData)
    {
        _logger.LogDebug("Sending ACS audio data of length {Length} bytes", audioData.Length);
        if (_session == null)
        {
            _logger.LogWarning("Cannot send audio: session not initialized");
            return;
        }

        try
        {
            await _session.SendInputAudioAsync(BinaryData.FromBytes(audioData), default).ConfigureAwait(false);
            _logger.LogDebug("ACS audio data sent successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending ACS audio data");
            throw;
        }
    }

    /// <summary>
    /// Sends text message to the Voice Live API.
    /// For ACS sessions, this would be used for text-based interactions if supported.
    /// </summary>
    public async Task SendTextAsync(string text)
    {
        _logger.LogDebug("Sending text message via ACS session: {Text}", text);
        if (_session == null)
        {
            _logger.LogWarning("Cannot send text: session not initialized");
            return;
        }

        try
        {
            await _session.AddItemAsync(new UserMessageItem(text)).ConfigureAwait(false);
            await _session.StartResponseAsync().ConfigureAwait(false);
            _logger.LogDebug("Text message sent successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending text message");
            throw;
        }
    }

    /// <summary>
    /// Updates the Voice ACS session configuration.
    /// Allows dynamic updates to voice, locale, model, and instructions.
    /// </summary>
    public async Task UpdateSessionAsync(
        string? voiceModel = null,
        string? voice = null,
        string? welcomeMessage = null,
        string? modelInstructions = null,
        List<VoiceLiveToolDefinition>? toolDefinitions = null,
        string? locale = null,
        CancellationToken cancellationToken = default)
    {
        if (_session == null)
        {
            _logger.LogWarning("Cannot update session: session not initialized");
            return;
        }

        _logger.LogInformation("Updating Voice ACS session configuration");

        var azureVoice = new AzureStandardVoice(voice ?? _config.Voice ?? "en-US-AvaNeural")
        {
            Temperature = 0.7f,
            Locale = locale ?? _config.Locale ?? "en-US"
        };

        var turnDetectionConfig = new ServerVadTurnDetection
        {
            Threshold = 0.5f,
            PrefixPadding = TimeSpan.FromMilliseconds(300),
            SilenceDuration = TimeSpan.FromMilliseconds(500)
        };

        var sessionOptions = new VoiceLiveSessionOptions
        {
            Voice = azureVoice,
            InputAudioEchoCancellation = new AudioEchoCancellation(),
            TurnDetection = turnDetectionConfig
        };

        // Update model/instructions if provided and not using Foundry Agent
        if (string.IsNullOrEmpty(_config.FoundryAgentId))
        {
            if (!string.IsNullOrEmpty(voiceModel))
            {
                sessionOptions.Model = voiceModel;
            }

            // Build instructions with optional welcome message
            if (!string.IsNullOrEmpty(modelInstructions) || !string.IsNullOrEmpty(welcomeMessage))
            {
                var baseInstructions = modelInstructions ?? _config.Instructions ?? "You are a helpful AI assistant.";
                sessionOptions.Instructions = !string.IsNullOrEmpty(welcomeMessage)
                    ? $"{baseInstructions}\n\nIMPORTANT: When the session starts and the user hasn't spoken yet, immediately greet them with: \"{welcomeMessage}\""
                    : baseInstructions;
            }

            // Add tools if provided
            if (toolDefinitions != null && toolDefinitions.Count > 0)
            {
                foreach (var tool in toolDefinitions)
                {
                    sessionOptions.Tools.Add(tool);
                }
            }

            // Add common tools (GetDateTime, GetWeather)
            foreach (var tool in _toolHandler.GetTools())
            {
                sessionOptions.Tools.Add(tool);
            }
        }

        try
        {
            await _session.ConfigureSessionAsync(sessionOptions, cancellationToken).ConfigureAwait(false);
            _logger.LogInformation("ACS session configuration updated successfully");

            // Trigger welcome message if provided and not using Foundry Agent
            if (!string.IsNullOrEmpty(welcomeMessage) && string.IsNullOrEmpty(_config.FoundryAgentId))
            {
                _logger.LogInformation("Triggering welcome message for ACS session");
                await _session.StartResponseAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating ACS session configuration");
            throw;
        }
    }

    /// <summary>
    /// Processes events from the Voice Live session.
    /// Audio output is sent back to the ACS call connection via media streaming.
    /// </summary>
    private async Task ProcessEventsAsync(CancellationToken cancellationToken)
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
                await HandleSessionUpdateAsync(update, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogDebug("ACS event processing cancelled");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in ACS event processing");
        }
    }

    /// <summary>
    /// Handles individual session update events from Voice Live.
    /// </summary>
    private async Task HandleSessionUpdateAsync(SessionUpdate update, CancellationToken cancellationToken)
    {
        try
        {
            switch (update)
            {
                case SessionUpdateSessionCreated sessionCreated:
                    _logger.LogInformation("ACS Voice Live session created: {SessionId}", sessionCreated.Session?.Id);
                    await EmitSessionEventAsync("SessionCreated", new { SessionId = sessionCreated.Session?.Id });
                    break;

                case SessionUpdateSessionUpdated:
                    _logger.LogInformation("ACS Voice Live session updated");
                    await EmitSessionEventAsync("SessionUpdated", null);
                    break;

                case SessionUpdateInputAudioBufferSpeechStarted:
                    _logger.LogInformation("Caller started speaking");
                    if (OnSpeechStarted != null)
                    {
                        await OnSpeechStarted().ConfigureAwait(false);
                    }
                    await EmitSessionEventAsync("SpeechStarted", null);
                    break;

                case SessionUpdateInputAudioBufferSpeechStopped:
                    _logger.LogInformation("Caller stopped speaking");
                    await EmitSessionEventAsync("SpeechStopped", null);
                    break;

                case SessionUpdateConversationItemInputAudioTranscriptionCompleted transcriptionCompleted:
                    _logger.LogInformation("Caller transcription: {Transcript}", transcriptionCompleted.Transcript);
                    if (OnUserTranscription != null && !string.IsNullOrEmpty(transcriptionCompleted.Transcript))
                    {
                        await OnUserTranscription(transcriptionCompleted.Transcript).ConfigureAwait(false);
                    }
                    break;

                case SessionUpdateResponseAudioTranscriptDone transcriptDone:
                    _logger.LogInformation("Assistant transcription: {Transcript}", transcriptDone.Transcript);
                    if (OnTranscription != null && !string.IsNullOrEmpty(transcriptDone.Transcript))
                    {
                        await OnTranscription(transcriptDone.Transcript).ConfigureAwait(false);
                    }
                    break;

                case SessionUpdateResponseAudioDelta audioDelta:
                    if (OnAudioDelta != null && audioDelta.Delta != null)
                    {
                        byte[] audioData = audioDelta.Delta.ToArray();
                        _logger.LogDebug("Received audio delta from Voice Live: {AudioLength} bytes", audioData.Length);
                        
                        // Note: Sending media back to ACS would require additional implementation
                        // based on the CallConnection's media streaming capabilities
                        // For now, just emit the event for consumer handling
                        
                        // Emit the audio delta event
                        await OnAudioDelta(audioData).ConfigureAwait(false);
                    }
                    break;

                case SessionUpdateResponseDone responseDone:
                    _logger.LogInformation("Assistant response complete");
                    var usageData = responseDone.Response?.Usage;
                    await EmitSessionEventAsync("ResponseDone", new {
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
                    _logger.LogError("ACS Voice Live session error: {ErrorMessage}", errorEvent.Error?.Message);
                    if (OnError != null)
                    {
                        await OnError(errorEvent.Error?.Message ?? "Unknown error").ConfigureAwait(false);
                    }
                    break;

                default:
                    _logger.LogDebug("Unhandled event: {EventType}", update.GetType().Name);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling session update");
        }
    }

    private async Task HandleFunctionCallAsync(SessionUpdateResponseFunctionCallArgumentsDone args)
    {
        _logger.LogInformation("Handling function call: {Name} with args {Args}", args.Name, args.Arguments);

        // Execute the tool using the shared VoiceToolHandler
        string output = await _toolHandler.ExecuteToolAsync(args.Name, args.Arguments);

        // Send output
        if (_session != null)
        {
            var outputItem = new FunctionCallOutputItem(args.CallId, output);
            await _session.AddItemAsync(outputItem);
            await _session.StartResponseAsync();
        }
    }

    /// <summary>
    /// Emits session events to subscribers.
    /// </summary>
    private async Task EmitSessionEventAsync(string eventType, object? payload)
    {
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
    /// Disposes of the session resources.
    /// </summary>
    public async ValueTask DisposeAsync()
    {
        if (_disposed)
            return;

        _session?.Dispose();
        _disposed = true;

        if (_eventProcessingTask != null)
        {
            try
            {
                await _eventProcessingTask.ConfigureAwait(false);
            }
            catch
            {
                // Ignore cancellation
            }
        }
    }
}
