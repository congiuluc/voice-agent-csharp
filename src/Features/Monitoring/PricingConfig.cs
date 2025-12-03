using System.Text.Json.Serialization;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Represents pricing configuration for a model.
/// Stored in CosmosDB with partition key /modelName and no TTL.
/// </summary>
public class PricingConfig
{
    /// <summary>
    /// Document ID (same as modelName).
    /// </summary>
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Model name (e.g., gpt-4o, gpt-4o-mini).
    /// Partition key.
    /// </summary>
    [JsonPropertyName("modelName")]
    public string ModelName { get; set; } = string.Empty;

    /// <summary>
    /// Cost per 1000 input tokens in USD.
    /// </summary>
    [JsonPropertyName("inputTokenCost")]
    public decimal InputTokenCost { get; set; }

    /// <summary>
    /// Cost per 1000 output tokens in USD.
    /// </summary>
    [JsonPropertyName("outputTokenCost")]
    public decimal OutputTokenCost { get; set; }

    /// <summary>
    /// Avatar cost per minute in USD.
    /// </summary>
    [JsonPropertyName("avatarCostPerMin")]
    public decimal AvatarCostPerMin { get; set; }

    /// <summary>
    /// TTS cost per 1 million characters in USD.
    /// </summary>
    [JsonPropertyName("ttsCostPer1MChars")]
    public decimal TtsCostPer1MChars { get; set; }

    /// <summary>
    /// Last update timestamp.
    /// </summary>
    [JsonPropertyName("updatedAt")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
