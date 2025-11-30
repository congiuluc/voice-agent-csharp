using Azure;
using Azure.AI.VoiceLive;
using VoiceAgentCSharp.Features.Shared;

namespace VoiceAgentCSharp.Features.VoiceAssistant;

/// <summary>
/// Voice Assistant Session for direct model-based conversations.
/// Connects to Azure Voice Live API with a specified GPT model.
/// </summary>
public class VoiceAssistantSession : VoiceSessionBase
{
    /// <summary>
    /// Gets the session type identifier.
    /// </summary>
    public override string SessionType => "Assistant";

    /// <summary>
    /// Initializes a new instance of the VoiceAssistantSession class.
    /// </summary>
    /// <param name="client">The VoiceLive client instance.</param>
    /// <param name="config">The session configuration.</param>
    /// <param name="logger">The logger instance.</param>
    /// <param name="httpClient">Optional HttpClient for tool execution.</param>
    public VoiceAssistantSession(VoiceLiveClient client, VoiceSessionConfig config, ILogger logger, HttpClient? httpClient = null)
        : base(client, config, logger, httpClient)
    {
    }

    /// <summary>
    /// Starts the Voice Assistant session with the configured model.
    /// </summary>
    public override async Task StartAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Starting Voice Assistant session with model: {Model}", _config.Model);

            // Initialize MCP connection if available
            await InitializeMcpAsync();

            // Start session with specified model
            _session = await _client.StartSessionAsync(_config.Model, cancellationToken).ConfigureAwait(false);
            
            _logger.LogInformation("Voice Assistant session started successfully");

            // Configure session with voice and instructions
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
            _eventProcessingTask = Task.Run(() => ProcessEventsAsync(token), token);

            _logger.LogInformation("Voice Assistant ready and listening");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting Voice Assistant session");
            await DisposeAsync();
            throw;
        }
    }

    /// <summary>
    /// Sends audio data to the Voice Live API.
    /// </summary>
    public async override Task SendAudioAsync(byte[] audioData)
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
    /// </summary>
    public async override Task SendTextAsync(string text)
    {
        _logger.LogDebug("Sending text message: {Text}", text);
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
    /// Updates the Voice Assistant session configuration.
    /// </summary>
    public async override Task UpdateSessionAsync(
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

        _logger.LogInformation("Updating Voice Assistant session configuration");

        var azureVoice = new AzureStandardVoice(voice ?? "en-US-AvaNeural")
        {
            Temperature = 0.7f,
            Locale = locale ?? "en-US"
        };

        var turnDetectionConfig = new ServerVadTurnDetection
        {
            Threshold = 0.3f,
            PrefixPadding = TimeSpan.FromMilliseconds(200),
            SilenceDuration = TimeSpan.FromMilliseconds(300)
        };

        // Build instructions with optional welcome message
        var baseInstructions = modelInstructions ?? _config.ModelInstructions ?? "You are a helpful AI assistant.";
        var instructions = !string.IsNullOrEmpty(welcomeMessage)
            ? $"{baseInstructions}\n\nIMPORTANT: When the session starts and the user hasn't spoken yet, immediately greet them with: \"{welcomeMessage}\""
            : baseInstructions;

        var sessionOptions = new VoiceLiveSessionOptions
        {
            Model = voiceModel ?? _config.Model,
            Instructions = instructions,
            Voice = azureVoice,
            InputAudioEchoCancellation = new AudioEchoCancellation(),
            InputAudioNoiseReduction = new AudioNoiseReduction(AudioNoiseReductionType.NearField),
            TurnDetection = turnDetectionConfig
        };

        // Add tools if provided
        if (toolDefinitions != null)
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

        try
        {
            await _session.ConfigureSessionAsync(sessionOptions, cancellationToken).ConfigureAwait(false);
            _logger.LogInformation("Session configuration updated successfully");

            // Trigger welcome message if provided
            if (!string.IsNullOrEmpty(welcomeMessage))
            {
                _logger.LogInformation("Triggering welcome message");
                await _session.StartResponseAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating session configuration");
            throw;
        }
    }

    /// <summary>
    /// Processes events from the Voice Live session.
    /// </summary>
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
                await HandleSessionUpdateAsync(update, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogDebug("Event processing cancelled");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in event processing");
        }
    }

    /// <summary>
    /// Handles individual session update events.
    /// </summary>
    private async Task HandleSessionUpdateAsync(SessionUpdate update, CancellationToken cancellationToken)
    {
        try
        {
            switch (update)
            {
                case SessionUpdateSessionCreated sessionCreated:
                    _logger.LogInformation("Session created: {SessionId}", sessionCreated.Session?.Id);
                    await base.EmitSessionEventAsync("SessionCreated", new { SessionId = sessionCreated.Session?.Id });
                    break;

                case SessionUpdateSessionUpdated:
                    _logger.LogInformation("Session updated");
                    await base.EmitSessionEventAsync("SessionUpdated", null);
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
                    _logger.LogInformation("Assistant transcription: {Transcript}", transcriptDone.Transcript);
                    await base.OnTranscriptionAsync(transcriptDone.Transcript);
                    break;

                case SessionUpdateResponseAudioDelta audioDelta:
                    if (audioDelta.Delta != null)
                    {
                        byte[] audioData = audioDelta.Delta.ToArray();
                        await base.OnAudioDeltaAsync(audioData);
                    }
                    break;

                case SessionUpdateResponseDone:
                    _logger.LogInformation("Response complete");
                    await base.EmitSessionEventAsync("ResponseDone", null);
                    break;

                case SessionUpdateResponseFunctionCallArgumentsDone functionCallArgs:
                    await base.HandleFunctionCallAsync(functionCallArgs);
                    break;

                case SessionUpdateError errorEvent:
                    _logger.LogError("Session error: {ErrorMessage}", errorEvent.Error?.Message);
                    await base.OnErrorAsync(errorEvent.Error?.Message ?? "Unknown error");
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

}
