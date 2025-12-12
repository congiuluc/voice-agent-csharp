namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// Represents an aggregated snapshot of token consumption across all sessions.
/// </summary>
public class TokenSnapshot
{
    /// <summary>
    /// Document ID - always "token-snapshot" for a single aggregated record.
    /// </summary>
    public string Id { get; set; } = "token-snapshot";

    /// <summary>
    /// Partition key - always "TokenSnapshot" for consistent partitioning.
    /// </summary>
    public string Type { get; set; } = "TokenSnapshot";

    /// <summary>
    /// Total input tokens consumed across all completed sessions.
    /// </summary>
    public long TotalInputTokens { get; set; }

    /// <summary>
    /// Total output tokens consumed across all completed sessions.
    /// </summary>
    public long TotalOutputTokens { get; set; }

    /// <summary>
    /// Total cached tokens (cost reduction) across all sessions.
    /// </summary>
    public long TotalCachedTokens { get; set; }

    /// <summary>
    /// Count of sessions that have been completed.
    /// </summary>
    public int TotalSessionsCompleted { get; set; }

    /// <summary>
    /// Timestamp when this snapshot was last updated.
    /// </summary>
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Timestamp when this record was created.
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
