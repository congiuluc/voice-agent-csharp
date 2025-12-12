using System.Collections.Concurrent;
using VoiceAgentCSharp.Features.Monitoring.Repositories;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Service for calculating costs based on pricing configuration.
/// Uses repository pattern with automatic fallback.
/// </summary>
public class PricingService
{
    private readonly IPricingRepository _pricingRepository;
    private readonly ILogger<PricingService> _logger;
    private readonly ConcurrentDictionary<string, PricingConfig> _pricingCache = new();
    private DateTime _lastCacheUpdate = DateTime.MinValue;
    private readonly SemaphoreSlim _cacheLock = new(1, 1);

    // Default pricing for fallback
    private static readonly Dictionary<string, PricingConfig> DefaultPricing = new()
    {
        ["gpt-4o"] = new PricingConfig
        {
            Id = "gpt-4o",
            ModelName = "gpt-4o",
            InputTokenCost = 0.0025m,
            OutputTokenCost = 0.010m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m
        },
        ["gpt-4o-mini"] = new PricingConfig
        {
            Id = "gpt-4o-mini",
            ModelName = "gpt-4o-mini",
            InputTokenCost = 0.00015m,
            OutputTokenCost = 0.0006m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m
        },
        ["gpt-4o-realtime-preview"] = new PricingConfig
        {
            Id = "gpt-4o-realtime-preview",
            ModelName = "gpt-4o-realtime-preview",
            InputTokenCost = 0.005m,
            OutputTokenCost = 0.020m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m
        }
    };

    public PricingService(IPricingRepository pricingRepository, ILogger<PricingService> logger)
    {
        _pricingRepository = pricingRepository;
        _logger = logger;
    }

    /// <summary>
    /// Initializes pricing cache from repository.
    /// </summary>
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await LoadPricingFromRepositoryAsync(cancellationToken);
    }

    /// <summary>
    /// Reloads pricing cache from repository.
    /// </summary>
    public async Task ReloadPricingAsync(CancellationToken cancellationToken = default)
    {
        await _cacheLock.WaitAsync(cancellationToken);
        try
        {
            await LoadPricingFromRepositoryAsync(cancellationToken);
            _logger.LogInformation("Pricing cache reloaded successfully");
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    /// <summary>
    /// Gets all cached pricing configurations.
    /// </summary>
    public Dictionary<string, PricingConfig> GetAllPricing()
    {
        return new Dictionary<string, PricingConfig>(_pricingCache);
    }

    /// <summary>
    /// Calculates cost for token consumption.
    /// </summary>
    public decimal CalculateTokenCost(string modelName, int inputTokens, int outputTokens)
    {
        var pricing = GetPricingForModel(modelName);

        // Costs are per 1000 tokens
        var inputCost = (inputTokens / 1000.0m) * pricing.InputTokenCost;
        var outputCost = (outputTokens / 1000.0m) * pricing.OutputTokenCost;

        return inputCost + outputCost;
    }

    /// <summary>
    /// Calculates avatar cost based on duration.
    /// </summary>
    public decimal CalculateAvatarCost(string modelName, double durationSeconds)
    {
        var pricing = GetPricingForModel(modelName);
        var durationMinutes = (decimal)durationSeconds / 60.0m;
        return durationMinutes * pricing.AvatarCostPerMin;
    }

    /// <summary>
    /// Gets pricing for a specific model, falls back to defaults if not found.
    /// </summary>
    private PricingConfig GetPricingForModel(string modelName)
    {
        if (_pricingCache.TryGetValue(modelName, out var config))
        {
            return config;
        }

        // Try default pricing
        if (DefaultPricing.TryGetValue(modelName, out var defaultConfig))
        {
            _logger.LogWarning("Using default pricing for model: {ModelName}", modelName);
            return defaultConfig;
        }

        // Ultimate fallback - use gpt-4o pricing
        _logger.LogWarning("No pricing found for model: {ModelName}, using gpt-4o defaults", modelName);
        return DefaultPricing["gpt-4o"];
    }

    /// <summary>
    /// Loads pricing from repository into cache.
    /// </summary>
    private async Task LoadPricingFromRepositoryAsync(CancellationToken cancellationToken)
    {
        try
        {
            var configs = await _pricingRepository.GetAllAsync(cancellationToken);
            
            _pricingCache.Clear();
            foreach (var config in configs)
            {
                _pricingCache[config.ModelName] = config;
            }

            _lastCacheUpdate = DateTime.UtcNow;
            _logger.LogInformation("Loaded {Count} pricing configs from repository", configs.Count);

            // If no configs in repository, seed with defaults
            if (configs.Count == 0)
            {
                _logger.LogInformation("No pricing configs in repository, using defaults");
                foreach (var kvp in DefaultPricing)
                {
                    _pricingCache[kvp.Key] = kvp.Value;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load pricing from repository, using defaults");
            foreach (var kvp in DefaultPricing)
            {
                _pricingCache[kvp.Key] = kvp.Value;
            }
        }
    }
}
