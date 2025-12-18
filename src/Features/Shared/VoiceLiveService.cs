using Azure.AI.VoiceLive;
using Azure.Core;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Service for managing Voice Live API interactions using the official SDK.
/// </summary>
public class VoiceLiveService
{
    private readonly ILogger<VoiceLiveService> _logger;
    private readonly IConfiguration _configuration;

    public VoiceLiveService(ILogger<VoiceLiveService> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
    }

    /// <summary>
    /// Creates session options for Voice Live using the SDK models.
    /// </summary>
    public VoiceLiveSessionOptions CreateSessionOptions(string? voice = null, string? instructions = null)
    {
        var resolvedVoice = !string.IsNullOrWhiteSpace(voice) ? voice : "en-US-Aria:DragonHDLatestNeural";
        
        // Create Azure voice configuration
        var azureVoice = new AzureStandardVoice(resolvedVoice);

        // Create turn detection configuration
        var turnDetectionConfig = new ServerVadTurnDetection
        {
            Threshold = 0.3f,
            PrefixPadding = TimeSpan.FromMilliseconds(200),
            SilenceDuration = TimeSpan.FromMilliseconds(300)
        };

        var sessionOptions = new VoiceLiveSessionOptions
        {
            Instructions = instructions ?? "You are a helpful AI assistant responding in natural, engaging language.",
            Voice = azureVoice,
            TurnDetection = turnDetectionConfig,
            InputAudioTranscription = new AudioInputTranscriptionOptions(AudioInputTranscriptionOptionsModel.Whisper1)
        };

        // Set modalities
        sessionOptions.Modalities.Clear();
        sessionOptions.Modalities.Add(Azure.AI.VoiceLive.InteractionModality.Text);
        sessionOptions.Modalities.Add(Azure.AI.VoiceLive.InteractionModality.Audio);

        return sessionOptions;
    }
}
