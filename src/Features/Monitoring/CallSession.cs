using System.Text.Json.Serialization;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Represents a voice call session for tracking and auditing.
/// Stored in CosmosDB with partition key /userId and 90-day TTL.
/// </summary>
public class CallSession
{
    /// <summary>
    /// Unique identifier for the document (CosmosDB id).
    /// </summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    /// <summary>
    /// Voice Live session ID.
    /// </summary>
    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = string.Empty;

    /// <summary>
    /// User identifier or phone number for PSTN calls.
    /// Partition key.
    /// </summary>
    [JsonPropertyName("userId")]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Type of call: IncomingCall, VoiceAgent, VoiceAssistant, or VoiceAvatar.
    /// </summary>
    [JsonPropertyName("callType")]
    public string CallType { get; set; } = string.Empty;

    /// <summary>
    /// Model used (e.g., gpt-4o, gpt-4o-mini).
    /// </summary>
    [JsonPropertyName("model")]
    public string Model { get; set; } = string.Empty;

    /// <summary>
    /// Session creation timestamp.
    /// </summary>
    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Session start timestamp.
    /// </summary>
    [JsonPropertyName("startTime")]
    public DateTime? StartTime { get; set; }

    /// <summary>
    /// Session end timestamp.
    /// </summary>
    [JsonPropertyName("endTime")]
    public DateTime? EndTime { get; set; }

    /// <summary>
    /// Duration in seconds.
    /// </summary>
    [JsonPropertyName("durationSeconds")]
    public double DurationSeconds { get; set; }

    /// <summary>
    /// Total input tokens consumed.
    /// </summary>
    [JsonPropertyName("inputTokens")]
    public int InputTokens { get; set; }

    /// <summary>
    /// Total output tokens consumed.
    /// </summary>
    [JsonPropertyName("outputTokens")]
    public int OutputTokens { get; set; }

    /// <summary>
    /// Total tokens (input + output).
    /// </summary>
    [JsonPropertyName("totalTokens")]
    public int TotalTokens { get; set; }

    /// <summary>
    /// Estimated cost in USD.
    /// </summary>
    [JsonPropertyName("estimatedCost")]
    public decimal EstimatedCost { get; set; }

    /// <summary>
    /// Session status: completed, error, in_progress.
    /// </summary>
    [JsonPropertyName("status")]
    public string Status { get; set; } = "in_progress";

    /// <summary>
    /// Audio flow milestones for tracking.
    /// </summary>
    [JsonPropertyName("audioMilestones")]
    public Dictionary<string, DateTime> AudioMilestones { get; set; } = new();

    /// <summary>
    /// Error message if status is error.
    /// </summary>
    [JsonPropertyName("errorMessage")]
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// TTL in seconds (90 days = 7776000 seconds).
    /// </summary>
    [JsonPropertyName("ttl")]
    public int Ttl { get; set; } = 7776000;
}
