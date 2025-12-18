using Azure;
using Azure.AI.VoiceLive;
using System.Text.Json;
using VoiceAgentCSharp.Features.Shared;

namespace VoiceAgentCSharp.Features.VoiceAgent;

/// <summary>
/// Voice Agent Session for Foundry Agent Service integration.
/// Connects to Azure Voice Live API with a Foundry-hosted agent.
/// </summary>
public class VoiceAgentSession : VoiceSessionBase
{
    /// <summary>
    /// Gets the session type identifier.
    /// </summary>
    public override string SessionType => "Agent";

    /// <summary>
    /// Initializes a new instance of the VoiceAgentSession class.
    /// </summary>
    /// <param name="client">The VoiceLive client instance.</param>
    /// <param name="config">The session configuration.</param>
    /// <param name="logger">The logger instance.</param>
    /// <param name="httpClient">Optional HttpClient for tool execution.</param>
    public VoiceAgentSession(VoiceLiveClient client, VoiceSessionConfig config, ILogger logger, HttpClient? httpClient = null)
        : base(client, config, logger, httpClient)
    {
    }

    /// <summary>
    /// Starts the Voice Agent session with Foundry Agent integration.
    /// The agent parameters are passed via URI query parameters at the factory level.
    /// </summary>
    public override async Task StartAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation(
                "Starting Voice Agent session for agent {AgentId} in project {ProjectName}",
                _config.FoundryAgentId,
                _config.FoundryProjectName);

            // Initialize MCP connection if available
            await InitializeMcpAsync();

            // Create session options for Foundry Agent (no model/instructions specified, agent contains them)
            var sessionOptions = CreateAgentSessionOptions();

            // Start the session - agent parameters already in the endpoint URL from factory
            _logger.LogInformation("Starting Voice Live session for Foundry Agent...");
            _session = await _client.StartSessionAsync(sessionOptions, cancellationToken).ConfigureAwait(false);
            _logger.LogInformation("Voice Live session started successfully");

            // Start processing events in the background
            // Use the base class cancellation token source for proper cleanup
            var token = _cancellationTokenSource?.Token ?? cancellationToken;
            _eventProcessingTask = Task.Run(() => ProcessEventsAsync(token), token);

            _logger.LogInformation("Voice Agent ready and listening");
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Voice Agent session start was cancelled");
            await DisposeAsync();
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting Voice Agent session");
            await DisposeAsync();
            throw;
        }
    }

    /// <summary>
    /// Creates session options configured for Foundry Agent sessions.
    /// </summary>
    private VoiceLiveSessionOptions CreateAgentSessionOptions()
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

        // Create session options for agent - no Model or Instructions specified
        // Agent parameters are passed via URI query parameters during WebSocket connection:
        // - agent-id: Agent identifier
        // - agent-project-name: Project containing the agent  
        // - agent-access-token: Generated access token for agent authentication
        var sessionOptions = new VoiceLiveSessionOptions
        {
            InputAudioEchoCancellation = new AudioEchoCancellation(),
            Voice = azureVoice,
            InputAudioFormat = InputAudioFormat.Pcm16,
            OutputAudioFormat = OutputAudioFormat.Pcm16,
            TurnDetection = turnDetectionConfig,
            InputAudioTranscription = new AudioInputTranscriptionOptions(AudioInputTranscriptionOptionsModel.Whisper1)
        };

        // Ensure modalities include audio and text
        sessionOptions.Modalities.Clear();
        sessionOptions.Modalities.Add(InteractionModality.Text);
        sessionOptions.Modalities.Add(InteractionModality.Audio);

        // Note: AI Agent mode only supports MCP tools, not function tools.
        // The Foundry Agent manages its own tools, so we don't add any tools here.
        // If MCP tools need to be added, they must be configured on the agent itself.
        _logger.LogInformation("Session options created for agent connection (no client-side tools - agent manages its own tools)");
        return sessionOptions;
    }

    /// <summary>
    /// Updates the Voice Agent session configuration.
    /// For Foundry Agent sessions, only voice and locale can be updated dynamically.
    /// Agent instructions and model are managed by the Foundry Agent itself.
    /// </summary>
    /// <summary>
    /// Updates the Voice Agent session with new configuration.
    /// Agent sessions use Foundry service for model execution.
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

        _logger.LogInformation("Updating Voice Agent session configuration (voice and locale only)");

        // Note: AI Agent mode uses Foundry Agent's own tools, not client-side tools.
        // MCP initialization is not needed here since tools are managed by the agent.

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
            TurnDetection = turnDetectionConfig,
            InputAudioTranscription = new AudioInputTranscriptionOptions(AudioInputTranscriptionOptionsModel.Whisper1)
        };

        // Note: AI Agent mode only supports MCP tools, not function tools.
        // The Foundry Agent manages its own tools, so we don't add any tools here.

        try
        {
            await _session.ConfigureSessionAsync(sessionOptions, cancellationToken).ConfigureAwait(false);
            _logger.LogInformation("Agent session configuration updated successfully");

            // Trigger welcome message if provided
            if (!string.IsNullOrEmpty(welcomeMessage))
            {
                _logger.LogInformation("Triggering welcome message for agent session");
                await _session.StartResponseAsync(cancellationToken).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating agent session configuration");
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
                    _logger.LogInformation("Agent session created: {SessionId}", sessionCreated.Session?.Id);
                    await base.EmitSessionEventAsync("SessionCreated", new { 
                        SessionId = sessionCreated.Session?.Id,
                        Model = sessionCreated.Session?.Model,
                        Voice = sessionCreated.Session?.Voice?.ToString()
                    });
                    break;

                case SessionUpdateSessionUpdated sessionUpdated:
                    _logger.LogInformation("Agent session updated");
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
                    // Process transcript delta internally
                    break;

                case SessionUpdateResponseAudioTranscriptDone transcriptDone:
                    _logger.LogInformation("Agent transcription: {Transcript}", transcriptDone.Transcript);
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
                        await base.OnAudioDeltaAsync(audioData);
                    }
                    break;

                case SessionUpdateResponseAudioDone audioDone:
                    _logger.LogDebug("Agent response audio done");
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
                    _logger.LogInformation("Agent response complete");
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
                    if (usage != null && _sessionId != null && _monitoringService != null)
                    {
                        var cachedTokens = usage.InputTokenDetails?.CachedTokens ?? 0;
                        var model = _config.FoundryAgentId ?? "unknown";
                        _monitoringService.LogTokensConsumed(
                            _sessionId,
                            usage.InputTokens,
                            usage.OutputTokens,
                            model,
                            cachedTokens);
                    }
                    break;

                case SessionUpdateError errorEvent:
                    _logger.LogError("Agent session error: {ErrorMessage}", errorEvent.Error?.Message);
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
