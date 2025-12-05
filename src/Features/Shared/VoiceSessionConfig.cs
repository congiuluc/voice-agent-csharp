using Azure.AI.VoiceLive;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Configuration for creating a Voice Session.
/// Supports Voice Agent, Voice Assistant, and Voice Avatar modalities.
/// </summary>
public class VoiceSessionConfig
{
    /// <summary>
    /// Gets or sets the session type: "Agent", "Assistant", or "Avatar".
    /// </summary>
    public string SessionType { get; set; } = "Assistant";

    /// <summary>
    /// Gets or sets the Voice Live endpoint URL.
    /// </summary>
    public string? Endpoint { get; set; }

    /// <summary>
    /// Gets or sets the API key for Voice Live (optional if using DefaultAzureCredential).
    /// </summary>
    public string? ApiKey { get; set; }

    /// <summary>
    /// Gets or sets the user ID for tracking and monitoring purposes.
    /// </summary>
    public string? UserId { get; set; }

    /// <summary>
    /// Gets or sets the model ID for tracking and monitoring purposes.
    /// </summary>
    public string? ModelId { get; set; }

    /// <summary>
    /// Gets or sets the voice model identifier (e.g., "gpt-4o-mini").
    /// Not used for Agent sessions (agent contains model configuration).
    /// </summary>
    public string? Model { get; set; }

    /// <summary>
    /// Gets or sets the Azure TTS voice identifier (e.g., "en-US-AvaNeural").
    /// </summary>
    public string? Voice { get; set; }

    /// <summary>
    /// Gets or sets the welcome message to be spoken at session start.
    /// </summary>
    public string? WelcomeMessage { get; set; }

    /// <summary>
    /// Gets or sets the custom instructions/system prompt for the voice model.
    /// Not used for Agent sessions (agent contains its own instructions).
    /// </summary>
    public string? ModelInstructions { get; set; }

    /// <summary>
    /// Gets or sets the instructions/system prompt for the voice model (alias for ModelInstructions).
    /// </summary>
    public string? Instructions => ModelInstructions;

    /// <summary>
    /// Gets or sets the locale for the voice assistant (e.g., "en-US", "it-IT").
    /// </summary>
    public string? Locale { get; set; }

    /// <summary>
    /// Gets or sets the Foundry Agent ID (required for Agent sessions).
    /// </summary>
    public string? FoundryAgentId { get; set; }

    /// <summary>
    /// Gets or sets the Foundry project name (required for Agent sessions).
    /// </summary>
    public string? FoundryProjectName { get; set; }

    /// <summary>
    /// Gets or sets the MCP server URL for tool integration.
    /// Defaults to http://localhost:5001 if not specified.
    /// </summary>
    public string? McpServerUrl { get; set; }

    /// <summary>
    /// Gets or sets the User-Assigned Managed Identity client ID.
    /// </summary>
    public string? ManagedIdentityClientId { get; set; }

    /// <summary>
    /// Gets or sets whether to use token credential instead of API key.
    /// </summary>
    public bool UseTokenCredential { get; set; } = true;

    /// <summary>
    /// Gets or sets optional tool definitions for the session.
    /// </summary>
    public List<VoiceLiveToolDefinition>? Tools { get; set; }

    /// <summary>
    /// Gets or sets the avatar character name for Avatar sessions (e.g., "lisa", "harry").
    /// </summary>
    public string? AvatarCharacter { get; set; }

    /// <summary>
    /// Gets or sets the avatar style for Avatar sessions (e.g., "casual-sitting", "business-standing").
    /// </summary>
    public string? AvatarStyle { get; set; }

    #region Avatar WebRTC Configuration

    /// <summary>
    /// Gets or sets the avatar video width in pixels (default: 1920).
    /// </summary>
    public int AvatarVideoWidth { get; set; } = 1920;

    /// <summary>
    /// Gets or sets the avatar video height in pixels (default: 1080).
    /// </summary>
    public int AvatarVideoHeight { get; set; } = 1080;

    /// <summary>
    /// Gets or sets the avatar video bitrate in Kbps (default: 2000).
    /// </summary>
    public int AvatarVideoBitrate { get; set; } = 2000;

    /// <summary>
    /// Gets or sets whether to use the raw WebSocket client for avatar sessions.
    /// When true, bypasses the SDK for full avatar WebRTC support.
    /// </summary>
    public bool UseRawWebSocket { get; set; } = true;

    /// <summary>
    /// Gets or sets custom ICE server URLs for avatar WebRTC (optional).
    /// If not set, ICE servers are obtained from the Voice Live API.
    /// </summary>
    public List<string>? CustomIceServerUrls { get; set; }

    /// <summary>
    /// Gets or sets the avatar codec (default: "H264").
    /// </summary>
    public string AvatarCodec { get; set; } = "H264";

    /// <summary>
    /// Gets or sets the avatar background type (default: "color").
    /// </summary>
    public string AvatarBackgroundType { get; set; } = "color";

    /// <summary>
    /// Gets or sets the avatar background color (default: "#FFFFFFFF" - white with alpha).
    /// </summary>
    public string AvatarBackgroundColor { get; set; } = "#FFFFFFFF";

    #endregion
}
