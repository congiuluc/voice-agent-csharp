using System.Collections.Concurrent;

namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// In-memory implementation of pricing repository.
/// Used as fallback when CosmosDB is not available.
/// </summary>
public class InMemoryPricingRepository : IPricingRepository
{
    private readonly ConcurrentDictionary<string, PricingConfig> _storage = new();
    private readonly ILogger<InMemoryPricingRepository> _logger;

    // Default pricing configurations
    private static readonly Dictionary<string, PricingConfig> DefaultPricing = new()
    {
        ["gpt-4o"] = new PricingConfig
        {
            Id = "gpt-4o",
            ModelName = "gpt-4o",
            InputTokenCost = 0.0025m,
            OutputTokenCost = 0.010m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m,
            UpdatedAt = DateTime.UtcNow,
            IsPerMillion = false
        },
        ["gpt-4o-mini"] = new PricingConfig
        {
            Id = "gpt-4o-mini",
            ModelName = "gpt-4o-mini",
            InputTokenCost = 0.00015m,
            OutputTokenCost = 0.0006m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m,
            UpdatedAt = DateTime.UtcNow,
            IsPerMillion = false
        },
        ["gpt-4o-realtime-preview"] = new PricingConfig
        {
            Id = "gpt-4o-realtime-preview",
            ModelName = "gpt-4o-realtime-preview",
            InputTokenCost = 0.005m,
            OutputTokenCost = 0.020m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m,
            UpdatedAt = DateTime.UtcNow,
            IsPerMillion = false
        }
    };

    public InMemoryPricingRepository(ILogger<InMemoryPricingRepository> logger)
    {
        _logger = logger;

        // Seed with default pricing
        foreach (var kvp in DefaultPricing)
        {
            _storage[kvp.Key] = kvp.Value;
        }

        _logger.LogInformation("InMemoryPricingRepository initialized with {Count} default pricing configs", DefaultPricing.Count);
    }

    public Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(true);
    }

    public Task<PricingConfig?> GetByModelNameAsync(string modelName, CancellationToken cancellationToken = default)
    {
        _storage.TryGetValue(modelName, out var config);
        return Task.FromResult(config);
    }

    public Task<List<PricingConfig>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_storage.Values.ToList());
    }

    public Task UpsertAsync(PricingConfig config, CancellationToken cancellationToken = default)
    {
        // Normalize any per-1M incoming payloads by converting to per-1k and clearing the flag
        if (config.IsPerMillion)
        {
            if (config.InputTokenCost != 0) config.InputTokenCost = Decimal.Divide(config.InputTokenCost, 1000m);
            if (config.OutputTokenCost != 0) config.OutputTokenCost = Decimal.Divide(config.OutputTokenCost, 1000m);
            if (config.CachedInputTokenCost != 0) config.CachedInputTokenCost = Decimal.Divide(config.CachedInputTokenCost, 1000m);
            config.IsPerMillion = false;
        }

        config.UpdatedAt = DateTime.UtcNow;
        _storage[config.ModelName] = config;
        _logger.LogInformation("Upserted pricing config for model: {ModelName} (in-memory)", config.ModelName);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string modelName, CancellationToken cancellationToken = default)
    {
        _storage.TryRemove(modelName, out _);
        _logger.LogInformation("Deleted pricing config for model: {ModelName} (in-memory)", modelName);
        return Task.CompletedTask;
    }
}
