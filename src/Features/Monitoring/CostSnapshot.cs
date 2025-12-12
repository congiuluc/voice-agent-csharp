using System.Text.Json.Serialization;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Represents a persistent snapshot of total costs.
/// Stored in CosmosDB with partition key /type and no TTL (permanent).
/// </summary>
public class CostSnapshot
{
    /// <summary>
    /// Unique identifier for the document (CosmosDB id).
    /// Always "cost-snapshot" for single aggregated record.
    /// </summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = "cost-snapshot";

    /// <summary>
    /// Partition key - always "CostSnapshot" to group this metric.
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; set; } = "CostSnapshot";

    /// <summary>
    /// Total accumulated cost from all completed sessions.
    /// </summary>
    [JsonPropertyName("totalCost")]
    public decimal TotalCost { get; set; }

    /// <summary>
    /// Total number of completed sessions.
    /// </summary>
    [JsonPropertyName("totalSessionsCompleted")]
    public int TotalSessionsCompleted { get; set; }

    /// <summary>
    /// Last update timestamp.
    /// </summary>
    [JsonPropertyName("lastUpdated")]
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// When this snapshot was created.
    /// </summary>
    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
