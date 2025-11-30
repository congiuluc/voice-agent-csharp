using Azure.AI.VoiceLive;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Common interface for all Voice Live session types (Agent, Assistant, Avatar).
/// Abstracts the underlying session implementation to support multiple conversation modalities.
/// </summary>
public interface IVoiceSession : IAsyncDisposable
{
    /// <summary>
    /// Gets the session type identifier (Agent, Assistant, or Avatar).
    /// </summary>
    string SessionType { get; }

    /// <summary>
    /// Starts the voice session with the configured parameters.
    /// </summary>
    Task StartAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Sends audio data to the Voice Live API.
    /// </summary>
    Task SendAudioAsync(byte[] audioData);

    /// <summary>
    /// Sends text message to the Voice Live API.
    /// </summary>
    Task SendTextAsync(string text);

    /// <summary>
    /// Updates the session configuration dynamically.
    /// </summary>
    Task UpdateSessionAsync(
        string? voiceModel = null,
        string? voice = null,
        string? welcomeMessage = null,
        string? modelInstructions = null,
        List<VoiceLiveToolDefinition>? toolDefinitions = null,
        string? locale = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Raised when audio delta data is received from the assistant.
    /// </summary>
    event Func<byte[], Task>? OnAudioDelta;

    /// <summary>
    /// Raised when the assistant provides a transcription.
    /// </summary>
    event Func<string, Task>? OnTranscription;

    /// <summary>
    /// Raised when the user's audio is transcribed.
    /// </summary>
    event Func<string, Task>? OnUserTranscription;

    /// <summary>
    /// Raised when the assistant starts speaking.
    /// </summary>
    event Func<Task>? OnSpeechStarted;

    /// <summary>
    /// Raised when an error occurs in the session.
    /// </summary>
    event Func<string, Task>? OnError;

    /// <summary>
    /// Raised for lightweight session events (eventType, jsonPayload).
    /// </summary>
    event Func<string, string, Task>? OnSessionEvent;
}
