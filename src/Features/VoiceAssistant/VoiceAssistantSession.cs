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
    /// Emits comprehensive events for UI tracing.
    /// </summary>
    private async Task HandleSessionUpdateAsync(SessionUpdate update, CancellationToken cancellationToken)
    {
        // Always emit raw event type for tracing
        var eventTypeName = update.GetType().Name.Replace("SessionUpdate", "");
        
        try
        {
            switch (update)
            {
                case SessionUpdateSessionCreated sessionCreated:
                    _logger.LogInformation("Session created: {SessionId}", sessionCreated.Session?.Id);
                    await base.EmitSessionEventAsync("SessionCreated", new { 
                        SessionId = sessionCreated.Session?.Id,
                        Model = sessionCreated.Session?.Model,
                        Voice = sessionCreated.Session?.Voice?.ToString()
                    });
                    break;

                case SessionUpdateSessionUpdated sessionUpdated:
                    _logger.LogInformation("Session updated");
                    await base.EmitSessionEventAsync("SessionUpdated", new {
                        Model = sessionUpdated.Session?.Model,
                        Voice = sessionUpdated.Session?.Voice?.ToString(),
                        TurnDetection = sessionUpdated.Session?.TurnDetection?.ToString()
                    });
                    break;

                case SessionUpdateInputAudioBufferSpeechStarted speechStarted:
                    _logger.LogInformation("User started speaking, ItemId: {ItemId}", speechStarted.ItemId);
                    await base.OnSpeechStartedAsync();
                    await base.EmitSessionEventAsync("SpeechStarted", new { 
                        ItemId = speechStarted.ItemId
                    });
                    break;

                case SessionUpdateInputAudioBufferSpeechStopped speechStopped:
                    _logger.LogInformation("User stopped speaking, ItemId: {ItemId}", speechStopped.ItemId);
                    await base.EmitSessionEventAsync("SpeechStopped", new { 
                        ItemId = speechStopped.ItemId
                    });
                    break;

                case SessionUpdateInputAudioBufferCommitted bufferCommitted:
                    _logger.LogDebug("Audio buffer committed, ItemId: {ItemId}", bufferCommitted.ItemId);
                    await base.EmitSessionEventAsync("AudioBufferCommitted", new { 
                        ItemId = bufferCommitted.ItemId,
                        PreviousItemId = bufferCommitted.PreviousItemId
                    });
                    break;

                case SessionUpdateInputAudioBufferCleared bufferCleared:
                    _logger.LogDebug("Audio buffer cleared");
                    await base.EmitSessionEventAsync("AudioBufferCleared", null);
                    break;

                case SessionUpdateConversationItemCreated itemCreated:
                    _logger.LogDebug("Conversation item created: {ItemId}", itemCreated.Item?.Id);
                    await base.EmitSessionEventAsync("ConversationItemCreated", new { 
                        ItemId = itemCreated.Item?.Id,
                        ItemType = itemCreated.Item?.GetType().Name,
                        PreviousItemId = itemCreated.PreviousItemId
                    });
                    break;

                case SessionUpdateConversationItemInputAudioTranscriptionCompleted transcriptionCompleted:
                    _logger.LogInformation("User transcription: {Transcript}", transcriptionCompleted.Transcript);
                    await base.EmitSessionEventAsync("UserTranscription", new { 
                        ItemId = transcriptionCompleted.ItemId,
                        ContentIndex = transcriptionCompleted.ContentIndex,
                        Transcript = transcriptionCompleted.Transcript
                    });
                    await base.OnUserTranscriptionAsync(transcriptionCompleted.Transcript);
                    break;

                case SessionUpdateConversationItemInputAudioTranscriptionFailed transcriptionFailed:
                    _logger.LogWarning("User transcription failed: {Error}", transcriptionFailed.Error?.Message);
                    await base.EmitSessionEventAsync("UserTranscriptionFailed", new { 
                        ItemId = transcriptionFailed.ItemId,
                        Error = transcriptionFailed.Error?.Message
                    });
                    break;

                case SessionUpdateResponseCreated responseCreated:
                    _logger.LogDebug("Response created: {ResponseId}", responseCreated.Response?.Id);
                    await base.EmitSessionEventAsync("ResponseCreated", new { 
                        ResponseId = responseCreated.Response?.Id,
                        Status = responseCreated.Response?.Status?.ToString()
                    });
                    break;

                case SessionUpdateResponseOutputItemAdded outputItemAdded:
                    _logger.LogDebug("Response output item added: {ItemId}", outputItemAdded.Item?.Id);
                    await base.EmitSessionEventAsync("ResponseOutputItemAdded", new { 
                        ResponseId = outputItemAdded.ResponseId,
                        ItemId = outputItemAdded.Item?.Id,
                        ItemType = outputItemAdded.Item?.GetType().Name
                    });
                    break;

                case SessionUpdateResponseOutputItemDone outputItemDone:
                    _logger.LogDebug("Response output item done: {ItemId}", outputItemDone.Item?.Id);
                    await base.EmitSessionEventAsync("ResponseOutputItemDone", new { 
                        ResponseId = outputItemDone.ResponseId,
                        ItemId = outputItemDone.Item?.Id
                    });
                    break;

                case SessionUpdateResponseContentPartAdded contentPartAdded:
                    _logger.LogDebug("Response content part added");
                    await base.EmitSessionEventAsync("ResponseContentPartAdded", new { 
                        ResponseId = contentPartAdded.ResponseId,
                        ItemId = contentPartAdded.ItemId,
                        ContentIndex = contentPartAdded.ContentIndex
                    });
                    break;

                case SessionUpdateResponseContentPartDone contentPartDone:
                    _logger.LogDebug("Response content part done");
                    await base.EmitSessionEventAsync("ResponseContentPartDone", new { 
                        ResponseId = contentPartDone.ResponseId,
                        ItemId = contentPartDone.ItemId,
                        ContentIndex = contentPartDone.ContentIndex
                    });
                    break;

                case SessionUpdateResponseTextDelta textDelta:
                    // Don't log full delta to avoid noise, just emit event
                    await base.EmitSessionEventAsync("ResponseTextDelta", new { 
                        ResponseId = textDelta.ResponseId,
                        ItemId = textDelta.ItemId,
                        DeltaLength = textDelta.Delta?.Length ?? 0
                    });
                    break;

                case SessionUpdateResponseTextDone textDone:
                    _logger.LogDebug("Response text done");
                    await base.EmitSessionEventAsync("ResponseTextDone", new { 
                        ResponseId = textDone.ResponseId,
                        ItemId = textDone.ItemId,
                        TextLength = textDone.Text?.Length ?? 0
                    });
                    break;

                case SessionUpdateResponseAudioTranscriptDelta transcriptDelta:
                    // Emit delta for streaming text to transcript
                    await base.EmitSessionEventAsync("ResponseAudioTranscriptDelta", new { 
                        ResponseId = transcriptDelta.ResponseId,
                        ItemId = transcriptDelta.ItemId,
                        Delta = transcriptDelta.Delta,
                        DeltaLength = transcriptDelta.Delta?.Length ?? 0
                    });
                    break;

                case SessionUpdateResponseAudioTranscriptDone transcriptDone:
                    _logger.LogInformation("Assistant transcription: {Transcript}", transcriptDone.Transcript);
                    await base.EmitSessionEventAsync("ResponseAudioTranscriptDone", new { 
                        ResponseId = transcriptDone.ResponseId,
                        ItemId = transcriptDone.ItemId,
                        Transcript = transcriptDone.Transcript
                    });
                    await base.OnTranscriptionAsync(transcriptDone.Transcript);
                    break;

                case SessionUpdateResponseAudioDelta audioDelta:
                    if (audioDelta.Delta != null)
                    {
                        byte[] audioData = audioDelta.Delta.ToArray();
                        await base.EmitSessionEventAsync("ResponseAudioDelta", new { 
                            ResponseId = audioDelta.ResponseId,
                            AudioLength = audioData.Length
                        });
                        await base.OnAudioDeltaAsync(audioData);
                    }
                    break;

                case SessionUpdateResponseAudioDone audioDone:
                    _logger.LogDebug("Response audio done");
                    await base.EmitSessionEventAsync("ResponseAudioDone", new { 
                        ResponseId = audioDone.ResponseId,
                        ItemId = audioDone.ItemId
                    });
                    break;

                case SessionUpdateResponseFunctionCallArgumentsDelta funcArgsDelta:
                    await base.EmitSessionEventAsync("FunctionCallArgumentsDelta", new { 
                        CallId = funcArgsDelta.CallId,
                        DeltaLength = funcArgsDelta.Delta?.Length ?? 0
                    });
                    break;

                case SessionUpdateResponseFunctionCallArgumentsDone functionCallArgs:
                    _logger.LogInformation("Function call: {Name}", functionCallArgs.Name);
                    await base.EmitSessionEventAsync("FunctionCallArgumentsDone", new { 
                        CallId = functionCallArgs.CallId,
                        Name = functionCallArgs.Name,
                        Arguments = functionCallArgs.Arguments
                    });
                    await base.HandleFunctionCallAsync(functionCallArgs);
                    break;

                case SessionUpdateResponseDone responseDone:
                    _logger.LogInformation("Response complete: {ResponseId}", responseDone.Response?.Id);
                    var usage = responseDone.Response?.Usage;
                    await base.EmitSessionEventAsync("ResponseDone", new { 
                        ResponseId = responseDone.Response?.Id,
                        Status = responseDone.Response?.Status?.ToString(),
                        Usage = usage != null ? new {
                            InputTokens = usage.InputTokens,
                            OutputTokens = usage.OutputTokens,
                            TotalTokens = usage.TotalTokens,
                            InputTokenDetails = usage.InputTokenDetails != null ? new {
                                CachedTokens = usage.InputTokenDetails.CachedTokens,
                                TextTokens = usage.InputTokenDetails.TextTokens,
                                AudioTokens = usage.InputTokenDetails.AudioTokens
                            } : null,
                            OutputTokenDetails = usage.OutputTokenDetails != null ? new {
                                TextTokens = usage.OutputTokenDetails.TextTokens,
                                AudioTokens = usage.OutputTokenDetails.AudioTokens
                            } : null
                        } : null
                    });
                    
                    // Log tokens to monitoring service
                    if (usage != null && _sessionId != null && _monitoringService != null && !string.IsNullOrEmpty(_config.Model))
                    {
                        var cachedTokens = usage.InputTokenDetails?.CachedTokens ?? 0;
                        _monitoringService.LogTokensConsumed(
                            _sessionId,
                            usage.InputTokens,
                            usage.OutputTokens,
                            _config.Model,
                            cachedTokens);
                    }
                    break;

                case SessionUpdateError errorEvent:
                    _logger.LogError("Session error: {ErrorMessage}", errorEvent.Error?.Message);
                    await base.EmitSessionEventAsync("SessionError", new { 
                        ErrorType = errorEvent.Error?.Type,
                        ErrorCode = errorEvent.Error?.Code,
                        Message = errorEvent.Error?.Message
                    });
                    await base.OnErrorAsync(errorEvent.Error?.Message ?? "Unknown error");
                    break;

                default:
                    _logger.LogDebug("Unhandled event: {EventType}", eventTypeName);
                    await base.EmitSessionEventAsync(eventTypeName, new { 
                        RawType = update.GetType().FullName
                    });
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error handling session update: {EventType}", eventTypeName);
            await base.EmitSessionEventAsync("EventProcessingError", new { 
                EventType = eventTypeName,
                Error = ex.Message
            });
        }
    }

}
