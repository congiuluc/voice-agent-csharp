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
            TurnDetection = turnDetectionConfig
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
            TurnDetection = turnDetectionConfig
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
    /// </summary>
    private async Task HandleSessionUpdateAsync(SessionUpdate update, CancellationToken cancellationToken)
    {
        try
        {
            switch (update)
            {
                case SessionUpdateSessionCreated sessionCreated:
                    _logger.LogInformation("Agent session created: {SessionId}", sessionCreated.Session?.Id);
                    await base.EmitSessionEventAsync("SessionCreated", new { SessionId = sessionCreated.Session?.Id });
                    break;

                case SessionUpdateSessionUpdated:
                    _logger.LogInformation("Agent session updated");
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
                    _logger.LogInformation("Agent transcription: {Transcript}", transcriptDone.Transcript);
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
                    _logger.LogInformation("Agent response complete");
                    await base.EmitSessionEventAsync("ResponseDone", null);
                    break;

                case SessionUpdateResponseFunctionCallArgumentsDone functionCallArgs:
                    await base.HandleFunctionCallAsync(functionCallArgs);
                    break;

                case SessionUpdateError errorEvent:
                    _logger.LogError("Agent session error: {ErrorMessage}", errorEvent.Error?.Message);
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
