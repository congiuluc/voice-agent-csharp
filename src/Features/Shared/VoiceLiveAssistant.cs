using Azure;
using Azure.AI.VoiceLive;
using Azure.Core;
using Azure.Identity;
using System.Collections.Concurrent;
using System.Reflection.Metadata.Ecma335;
using System.Text.Json;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// WebSocket client for Azure Voice Live API using the official SDK.
/// Supports both direct model usage and Foundry Agent Service integration.
/// </summary>
public class VoiceLiveAssistant : IAsyncDisposable
{
    private readonly ILogger _logger;
    private readonly string _model;
    private readonly string? _voice;
    private readonly string? _welcomeMessage;
    private readonly string? _modelInstructions;
    private readonly string? _locale;
    private readonly string? _foundryAgentId;
    private readonly string? _foundryProjectName;
    private readonly VoiceToolHandler _toolHandler;
    private VoiceLiveClient _client;
    private VoiceLiveSession? _session;
    private bool _disposed;

    private Task? _eventProcessingTask;

    // Events for handling Voice Live messages
    public event Func<byte[], Task>? OnAudioDelta;
    public event Func<string, Task>? OnTranscription;
    public event Func<string, Task>? OnUserTranscription;
    public event Func<Task>? OnSpeechStarted;
    public event Func<string, Task>? OnError;
    // Forward all (lightweight) session events as JSON: (eventType, jsonPayload)
    public event Func<string, string, Task>? OnSessionEvent;

    /// <summary>
    /// Initializes a new instance of the VoiceLiveAssistant class.
    /// </summary>
    /// <param name="client">The VoiceLive client instance.</param>
    /// <param name="model">The voice model identifier (e.g., "gpt-4o-mini").</param>
    /// <param name="voice">The Azure TTS voice identifier (e.g., "it-IT-IsabellaNeural").</param>
    /// <param name="welcomeMessage">Optional welcome message to be spoken at session start.</param>
    /// <param name="modelInstructions">Optional custom instructions/system prompt for the model.</param>
    /// <param name="locale">Locale for the voice assistant (e.g., "it-IT", "en-US").</param>
    /// <param name="foundryAgentId">Optional Microsoft Foundry Agent ID for agent-based sessions.</param>
    /// <param name="foundryProjectName">Optional Foundry project name (required when foundryAgentId is specified).</param>
    /// <param name="logger">Logger instance for diagnostic output.</param>
    /// <param name="httpClient">Optional HttpClient for tool execution.</param>
    public VoiceLiveAssistant(
        VoiceLiveClient client,
        string model,
        string? voice,
        string? welcomeMessage,
        string? modelInstructions,
        string? locale,
        string? foundryAgentId,
        string? foundryProjectName,
        ILogger logger,
        HttpClient? httpClient = null)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _model = model ?? throw new ArgumentNullException(nameof(model));
        _voice = string.IsNullOrWhiteSpace(voice) ? "en-US-Ava:DragonHDLatestNeural" : voice;
        _welcomeMessage = string.IsNullOrWhiteSpace(welcomeMessage) ? "Hello from Voice Live!" : welcomeMessage;
        _modelInstructions = string.IsNullOrWhiteSpace(modelInstructions) ? "You are a helpful assistant." : modelInstructions;
        _locale = string.IsNullOrWhiteSpace(locale) ? "en-US" : locale;
        _foundryAgentId = foundryAgentId;
        _foundryProjectName = foundryProjectName;
        _logger = logger;
        _toolHandler = new VoiceToolHandler(logger, httpClient);
    }

    /// <summary>
    /// Gets a value indicating whether this session is using a Foundry Agent.
    /// </summary>
    public bool IsFoundryAgentSession => !string.IsNullOrWhiteSpace(_foundryAgentId) && !string.IsNullOrWhiteSpace(_foundryProjectName);

    /// <summary>
    /// Connects to Azure Voice Live API using the official SDK.
    /// Supports both direct model sessions and Foundry Agent sessions.
    /// Authentication priority: User-Assigned Managed Identity > DefaultAzureCredential > API Key (fallback)
    /// </summary>
    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            if (IsFoundryAgentSession)
            {
                _logger.LogInformation("Starting VoiceLive session with Foundry Agent: {AgentId} from project {ProjectName}", 
                    _foundryAgentId, _foundryProjectName);
                
                // For Foundry Agent sessions, generate access token and start session with agent parameters
                await StartFoundryAgentSessionAsync(cancellationToken).ConfigureAwait(false);
                _logger.LogInformation("Foundry Agent VoiceLive session started successfully");

                

            }
            else
            {
                _logger.LogInformation("Starting VoiceLive session with model: {Model}", _model);
                
                // Standard model-based session
                _session = await _client.StartSessionAsync(_model, cancellationToken).ConfigureAwait(false);
                _logger.LogInformation("VoiceLive session started successfully");
                
                _logger.LogInformation("Sending initial session configuration");
                await UpdateSessionAsync(_model, _voice, _welcomeMessage, _modelInstructions).ConfigureAwait(false);
            }

            // Start processing events in the background
            _eventProcessingTask = Task.Run(() => ProcessEventsAsync(cancellationToken), cancellationToken);

            _logger.LogInformation("Voice Live WebSocket client fully initialized and ready");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting VoiceLive session");
            await DisposeAsync();
            throw;
        }
    }

    /// <summary>
    /// Starts a VoiceLive session connected to a Foundry Agent.
    /// Following the Microsoft documentation pattern for agent-based sessions.
    /// </summary>
    private async Task StartFoundryAgentSessionAsync(CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Starting Foundry Agent session for agent {AgentId} in project {ProjectName}", 
                _foundryAgentId, _foundryProjectName);

            // For Foundry Agents, use session options without specifying a model
            // The agent itself contains the model configuration
            var azureVoice = new AzureStandardVoice(_voice ?? "en-US-Ava:DragonHDLatestNeural")
            {
                Temperature = 0.7f,
                Locale = _locale ?? "en-US"
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
                TurnDetection = turnDetectionConfig,
                InputAudioTranscription = new AudioInputTranscriptionOptions(AudioInputTranscriptionOptionsModel.Whisper1)
            };

            // Ensure modalities include audio
            sessionOptions.Modalities.Clear();
            sessionOptions.Modalities.Add(InteractionModality.Text);
            sessionOptions.Modalities.Add(InteractionModality.Audio);

            _logger.LogInformation("Session options configured. Starting session with options...");

            // Start session with options (SDK should handle Foundry Agent routing internally)
            // The VoiceLiveClient endpoint should already be configured for the Foundry Agent service
            _session = await _client.StartSessionAsync(sessionOptions, cancellationToken).ConfigureAwait(false);
       
            _logger.LogInformation("Foundry Agent VoiceLive session started successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to start Foundry Agent session. Agent: {AgentId}, Project: {ProjectName}", 
                _foundryAgentId, _foundryProjectName);
            throw;
        }
    }

    /// <summary>
    /// Sends audio data to Voice Live API.
    /// </summary>
    public async Task SendAudioAsync(byte[] audioData)
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

    public async Task SendTextAsync(string text)
    {
        _logger.LogDebug("Sending text data: {Text}", text);
        if (_session == null)
        {
            _logger.LogWarning("Cannot send text: session not initialized");
            return;
        }

        try
        {
            // Add a user message to the session
            await _session.AddItemAsync(new UserMessageItem(text)).ConfigureAwait(false);
            // Start the response from the assistant
            await _session.StartResponseAsync().ConfigureAwait(false);

            _logger.LogDebug("Text data sent successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending text data");
            throw;
        }
    }

    /// <summary>
    /// Updates Voice Live session configuration.
    /// </summary>
    public async Task UpdateSessionAsync(string? voiceModel, string? voice, string? welcomeMessage = null, string? modelInstructions = null, List<VoiceLiveToolDefinition>? voiceLiveToolDefinitions = null, string? locale = null, CancellationToken cancellationToken = default)
    {
        if (_session == null)
        {
            _logger.LogWarning("Cannot update session: session not initialized");
            return;
        }

        _logger.LogInformation("Updating Voice Live session: Voice={Voice}, WelcomeMessage={WelcomeMessageLength} chars",
            voice ?? "(default)", welcomeMessage?.Length ?? 0);

        var instructions = !string.IsNullOrEmpty(modelInstructions)
            ? modelInstructions
            : "You are a helpful AI assistant responding in natural, engaging language.";

        var resolvedVoice = !string.IsNullOrWhiteSpace(voice) ? voice : "en-US-Aria:DragonHDLatestNeural";

        // Create Azure voice configuration
        var azureVoice = new AzureStandardVoice(resolvedVoice)
        {
            Temperature = 0.7f,
            Locale = string.IsNullOrWhiteSpace(locale) ? "en-US" : locale
        };


        // Create turn detection configuration
        var turnDetectionConfig = new ServerVadTurnDetection
        {
            Threshold = 0.3f,
            PrefixPadding = TimeSpan.FromMilliseconds(200),
            SilenceDuration = TimeSpan.FromMilliseconds(300)
        };

        // Create session options
        var sessionOptions = new VoiceLiveSessionOptions
        {
            Model = voiceModel,
            InputAudioEchoCancellation = new AudioEchoCancellation(),
            InputAudioNoiseReduction = new AudioNoiseReduction(AudioNoiseReductionType.NearField),
            Instructions = instructions,
            Voice = azureVoice,
            TurnDetection = turnDetectionConfig,
            InputAudioTranscription = new AudioInputTranscriptionOptions(AudioInputTranscriptionOptionsModel.Whisper1)
        };


        // Set modalities
        //sessionOptions.Modalities.Clear();
        //sessionOptions.Modalities.Add(InteractionModality.Text);
        //sessionOptions.Modalities.Add(InteractionModality.Audio);

        sessionOptions.Tools.Clear();
        if (voiceLiveToolDefinitions != null)
        {
            foreach (var toolDefinition in voiceLiveToolDefinitions)
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
            await _session.ConfigureSessionAsync(sessionOptions, cancellationToken);
            _logger.LogInformation("Session configuration updated successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating session configuration");
            throw;
        }
    }

    /// <summary>
    /// Processes events from the VoiceLive session.
    /// </summary>
    private async Task ProcessEventsAsync(CancellationToken cancellationToken)
    {
        if (_session == null)
        {
            _logger.LogError("Cannot process events: session not initialized");
            return;
        }

        _logger.LogDebug("Event processing loop started");
        int eventCount = 0;

        try
        {
            await foreach (var update in _session.GetUpdatesAsync(cancellationToken).ConfigureAwait(false))
            {
                eventCount++;
                await HandleSessionUpdateAsync(update);
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogDebug("Event processing cancelled after {EventCount} events", eventCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in event processing loop after {EventCount} events", eventCount);
        }

        _logger.LogDebug("Event processing loop ended");
    }

    /// <summary>
    /// Handles individual session update events.
    /// </summary>
    private async Task HandleSessionUpdateAsync(SessionUpdate update)
    {
        try
        {
            _logger.LogInformation("Received event: {EventType}", update.GetType().Name);

            switch (update)
            {
                case SessionUpdateSessionCreated sessionCreated:
                    _logger.LogInformation("Session created: {SessionId}", sessionCreated.Session?.Id);
                    await EmitSessionEventAsync("SessionCreated", new { SessionId = sessionCreated.Session?.Id });
                    break;

                case SessionUpdateSessionUpdated sessionUpdated:
                    _logger.LogInformation("Session updated successfully");
                    await EmitSessionEventAsync("SessionUpdated", null);
                    break;

                case SessionUpdateInputAudioBufferSpeechStarted:
                    _logger.LogInformation("Speech started");
                    if (OnSpeechStarted != null)
                    {
                        await OnSpeechStarted();
                    }
                    await EmitSessionEventAsync("InputAudioSpeechStarted", null);
                    break;

                case SessionUpdateInputAudioBufferSpeechStopped:
                    _logger.LogInformation("Speech stopped");
                    await EmitSessionEventAsync("InputAudioSpeechStopped", null);
                    break;

                case SessionUpdateConversationItemInputAudioTranscriptionCompleted transcriptionCompleted:
                    var userTranscript = transcriptionCompleted.Transcript;
                    _logger.LogInformation("User transcription: {Transcript}", userTranscript);
                    if (OnUserTranscription != null && !string.IsNullOrEmpty(userTranscript))
                    {
                        await OnUserTranscription(userTranscript);
                    }
                    await EmitSessionEventAsync("ConversationItemInputAudioTranscriptionCompleted", new { Transcript = userTranscript });
                    break;

                case SessionUpdateResponseAudioTranscriptDone transcriptDone:
                    var aiTranscript = transcriptDone.Transcript;

                    _logger.LogInformation("AI transcription: {Transcript}", aiTranscript);
                    if (OnTranscription != null && !string.IsNullOrEmpty(aiTranscript))
                    {
                        await OnTranscription(aiTranscript);
                    }
                    await EmitSessionEventAsync("ResponseAudioTranscriptDone", new { Transcript = aiTranscript });
                    break;

                case SessionUpdateResponseAudioTranscriptDelta transcriptDelta:
                    // Emit delta for streaming text to transcript
                    await EmitSessionEventAsync("ResponseAudioTranscriptDelta", new { 
                        ResponseId = transcriptDelta.ResponseId,
                        ItemId = transcriptDelta.ItemId,
                        Delta = transcriptDelta.Delta,
                        DeltaLength = transcriptDelta.Delta?.Length ?? 0
                    });
                    break;

                case SessionUpdateResponseAudioDelta audioDelta:
                    var delta = audioDelta.Delta;
                    if (OnAudioDelta != null && delta != null)
                    {
                        byte[] audioData = delta.ToArray();
                        await OnAudioDelta(audioData);
                    }
                    await EmitSessionEventAsync("ResponseAudioDelta", new { 
                        ResponseId = audioDelta.ResponseId,
                        AudioLength = delta?.Length ?? 0 
                    });
                    break;

                case SessionUpdateResponseAudioDone audioDone:
                    _logger.LogDebug("Response audio done");
                    await EmitSessionEventAsync("ResponseAudioDone", new { 
                        ResponseId = audioDone.ResponseId,
                        ItemId = audioDone.ItemId
                    });
                    break;

                // Note: SessionUpdateResponseAudioTimestampDelta may not exist in SDK yet
                // If available, handle word-level audio timestamps for streaming text
                // case SessionUpdateResponseAudioTimestampDelta timestampDelta:
                //     await EmitSessionEventAsync("AudioTimestampDelta", new {
                //         ResponseId = timestampDelta.ResponseId,
                //         ItemId = timestampDelta.ItemId,
                //         AudioOffsetMs = timestampDelta.AudioOffsetMs,
                //         AudioDurationMs = timestampDelta.AudioDurationMs,
                //         Text = timestampDelta.Text,
                //         TimestampType = timestampDelta.TimestampType
                //     });
                //     break;

                case SessionUpdateResponseDone responseDone:
                    _logger.LogInformation("Response complete");
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
                    var errorMessage = errorEvent.Error?.Message ?? "Unknown error";
                    _logger.LogError("Voice Live error: {ErrorMessage}", errorMessage);
                    if (OnError != null)
                    {
                        await OnError(errorMessage);
                    }
                    await EmitSessionEventAsync("SessionError", new { Message = errorMessage });
                    break;

                default:
                    _logger.LogInformation("Unhandled event type: {EventType}", update.GetType().Name);
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
    /// Helper to emit session events to subscribers in JSON form.
    /// </summary>
    private async Task EmitSessionEventAsync(string eventType, object? payload)
    {
        try
        {
            if (OnSessionEvent != null)
            {
                string json = payload == null ? string.Empty : JsonSerializer.Serialize(payload);
                await OnSessionEvent(eventType, json);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to emit session event {EventType}", eventType);
        }
    }


    public async ValueTask DisposeAsync()
    {
        if (_disposed)
            return;

        _session?.Dispose();
        _disposed = true;

    }
}
