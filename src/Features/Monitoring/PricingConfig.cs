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

    /// <summary>
    /// If true, the numeric token pricing values (InputTokenCost, CachedInputTokenCost, OutputTokenCost)
    /// are expressed per 1,000,000 tokens (per-1M). When true, callers may convert to per-1k by
    /// dividing by 1000. Default is false (values are per-1k).
    /// </summary>
    [JsonPropertyName("isPerMillion")]
    public bool IsPerMillion { get; set; } = false;
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
    /// Cost per 1000 input tokens (per-1k).
    /// NOTE: The numeric value stored here represents the cost for 1,000 tokens.
    /// Historically some default values were converted from published per-1M rates
    /// (e.g. EUR per 1M tokens) into per-1k decimals before being seeded. Ensure
    /// that any values persisted to the repository use the same unit (per-1k) and
    /// currency expected by the dashboard and calculation code.
    /// </summary>
    [JsonPropertyName("inputTokenCost")]
    public decimal InputTokenCost { get; set; }

    /// <summary>
    /// Cost per 1000 cached input tokens (per-1k).
    /// This is optional; if zero, callers may assume a cached discount is applied externally.
    /// Ensure unit/currency consistency with <see cref="InputTokenCost"/>.
    /// </summary>
    [JsonPropertyName("cachedInputTokenCost")]
    public decimal CachedInputTokenCost { get; set; }

    /// <summary>
    /// Cost per 1000 output tokens (per-1k).
    /// Ensure unit/currency consistency with <see cref="InputTokenCost"/>.
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
