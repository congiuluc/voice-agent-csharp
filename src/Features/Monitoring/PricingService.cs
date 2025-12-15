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
    private readonly PricingMigrationService _migrationService;
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
            // Provided rates are per 1M tokens in EUR. Convert to per-1000 tokens for the existing schema
            // Input: €14.7028 per 1M -> 0.0147028 per 1k
            // Output: €32.8649 per 1M -> 0.0328649 per 1k
            InputTokenCost = 0.0147028m,
            OutputTokenCost = 0.0328649m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m
        },
        ["gpt-realtime-mini"] = new PricingConfig
        {
            Id = "gpt-realtime-mini",
            ModelName = "gpt-realtime-mini",
            // Provided per-1M EUR rates converted to per-1k tokens
            // Input: €9.5136 per 1M -> 0.0095136 per 1k
            // Cached Input: €0.2855 per 1M -> 0.0002855 per 1k
            // Output: €19.0271 per 1M -> 0.0190271 per 1k
            InputTokenCost = 0.0095136m,
            CachedInputTokenCost = 0.0002855m,
            OutputTokenCost = 0.0190271m,
            AvatarCostPerMin = 0.25m,
            TtsCostPer1MChars = 10.00m
        },
        ["gpt-4o-mini"] = new PricingConfig
        {
            Id = "gpt-4o-mini",
            ModelName = "gpt-4o-mini",
            InputTokenCost = 0.0129730m,
            CachedInputTokenCost = 0.0002855m,
            OutputTokenCost = 0.0285406m,
            AvatarCostPerMin = 0.25m,
            TtsCostPer1MChars = 10.00m
        },
        ["gpt-4.1-mini"] = new PricingConfig
        {
            Id = "gpt-4.1-mini",
            ModelName = "gpt-4.1-mini",
            InputTokenCost = 0.0129730m,
            CachedInputTokenCost = 0.0002855m,
            OutputTokenCost = 0.0285406m,
            AvatarCostPerMin = 0.25m,
            TtsCostPer1MChars = 10.00m
        },
        ["gpt-5-mini"] = new PricingConfig
        {
            Id = "gpt-5-mini",
            ModelName = "gpt-5-mini",
            InputTokenCost = 0.0129730m,
            CachedInputTokenCost = 0.0002855m,
            OutputTokenCost = 0.0285406m,
            AvatarCostPerMin = 0.25m,
            TtsCostPer1MChars = 10.00m
        },
        ["gpt-realtime"] = new PricingConfig
        {
            Id = "gpt-realtime",
            ModelName = "gpt-realtime",
            // Updated per-1M EUR rates converted to per-1k tokens
            // Input: €38.0541 per 1M -> 0.0380541 per 1k
            // Cached Input: €2.3784 per 1M -> 0.0023784 per 1k
            // Output: €76.1082 per 1M -> 0.0761082 per 1k
            InputTokenCost = 0.0380541m,
            CachedInputTokenCost = 0.0023784m,
            OutputTokenCost = 0.0761082m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m
        },
        ["gpt-4.1"] = new PricingConfig
        {
            Id = "gpt-4.1",
            ModelName = "gpt-4.1",
            InputTokenCost = 0.0147028m,
            OutputTokenCost = 0.0328649m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m
        },
        ["gpt-5"] = new PricingConfig
        {
            Id = "gpt-5",
            ModelName = "gpt-5",
            InputTokenCost = 0.0147028m,
            OutputTokenCost = 0.0328649m,
            AvatarCostPerMin = 0.50m,
            TtsCostPer1MChars = 15.00m
        },
        ["gpt-5-chat"] = new PricingConfig
        {
            Id = "gpt-5-chat",
            ModelName = "gpt-5-chat",
            InputTokenCost = 0.0147028m,
            OutputTokenCost = 0.0328649m,
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
        ,
        ["gpt-5-nano"] = new PricingConfig
        {
            Id = "gpt-5-nano",
            ModelName = "gpt-5-nano",
            // Provided per-1M EUR rates converted to per-1k tokens
            // Input: €12.9730 per 1M -> 0.0129730 per 1k
            // Cached Input: €0.0346 per 1M -> 0.0000346 per 1k
            // Output: €28.5406 per 1M -> 0.0285406 per 1k
            InputTokenCost = 0.0129730m,
            CachedInputTokenCost = 0.0000346m,
            OutputTokenCost = 0.0285406m,
            AvatarCostPerMin = 0.25m,
            TtsCostPer1MChars = 10.00m
        },
        ["phi4-mm-realtime"] = new PricingConfig
        {
            Id = "phi4-mm-realtime",
            ModelName = "phi4-mm-realtime",
            // Updated per-1M EUR rates converted to per-1k tokens
            // Input: €3.4595 per 1M -> 0.0034595 per 1k
            // Cached Input: €0.0346 per 1M -> 0.0000346 per 1k
            InputTokenCost = 0.0034595m,
            CachedInputTokenCost = 0.0000346m,
            OutputTokenCost = 0.0285406m,
            AvatarCostPerMin = 0.30m,
            TtsCostPer1MChars = 12.00m
        },
        ["phi4-mini"] = new PricingConfig
        {
            Id = "phi4-mini",
            ModelName = "phi4-mini",
            InputTokenCost = 0.0129730m,
            CachedInputTokenCost = 0.0000346m,
            OutputTokenCost = 0.0285406m,
            AvatarCostPerMin = 0.20m,
            TtsCostPer1MChars = 8.00m
        }
    };

    public PricingService(IPricingRepository pricingRepository, ILogger<PricingService> logger, PricingMigrationService migrationService)
    {
        _pricingRepository = pricingRepository;
        _logger = logger;
        _migrationService = migrationService;
    }

    /// <summary>
    /// Initializes pricing cache from repository.
    /// </summary>
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await LoadPricingFromRepositoryAsync(cancellationToken);
    }

    /// <summary>
    /// Returns a normalization plan (dry-run) from PricingMigrationService
    /// </summary>
    public Task<object> GetNormalizationPlanAsync(CancellationToken cancellationToken = default)
    {
        return _migrationService.GetPlanAsync(cancellationToken);
    }

    /// <summary>
    /// Applies normalization plan (converts per-1M to per-1k) via PricingMigrationService
    /// </summary>
    public Task<object> ApplyNormalizationPlanAsync(CancellationToken cancellationToken = default)
    {
        return _migrationService.ApplyPlanAsync(cancellationToken);
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
    /// Persist default pricing into the repository (upsert each default entry).
    /// This is intended for seeding the DB with the in-memory defaults.
    /// </summary>
    public async Task SeedDefaultsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            // Check repository availability if supported
            try
            {
                if (!await _pricingRepository.IsAvailableAsync(cancellationToken))
                {
                    _logger.LogWarning("Pricing repository not available - skipping seeding");
                    return;
                }
            }
            catch (Exception ex)
            {
                // If IsAvailableAsync is not implemented or fails, log and continue to attempt upserts
                _logger.LogWarning(ex, "Failed to determine repository availability - attempting upserts anyway");
            }

            foreach (var kvp in DefaultPricing)
            {
                var config = kvp.Value;
                // Ensure UpdatedAt is set
                config.UpdatedAt = DateTime.UtcNow;
                await _pricingRepository.UpsertAsync(config, cancellationToken);
            }

            _logger.LogInformation("Seeded {Count} default pricing configs into repository", DefaultPricing.Count);
            // Refresh cache from repository after seeding
            await LoadPricingFromRepositoryAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to seed default pricing into repository");
            throw;
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
    /// Upsert a pricing configuration into the repository and update cache.
    /// Normalizes per-1M values into per-1k before persisting.
    /// </summary>
    public async Task UpsertAsync(PricingConfig config, CancellationToken cancellationToken = default)
    {
        if (config == null) throw new ArgumentNullException(nameof(config));

        // Normalize if admin submitted values as per-1M
        if (config.IsPerMillion)
        {
            try
            {
                config.InputTokenCost = Decimal.Divide(config.InputTokenCost, 1000m);
                config.OutputTokenCost = Decimal.Divide(config.OutputTokenCost, 1000m);
                if (config.CachedInputTokenCost != 0)
                {
                    config.CachedInputTokenCost = Decimal.Divide(config.CachedInputTokenCost, 1000m);
                }
                config.IsPerMillion = false;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to normalize upserted pricing for model {ModelName}", config.ModelName);
            }
        }

        config.UpdatedAt = DateTime.UtcNow;

        // Persist to repository
        await _pricingRepository.UpsertAsync(config, cancellationToken);

        // Update cache
        _pricingCache[config.ModelName] = config;
        _logger.LogInformation("Upserted pricing for model {ModelName}", config.ModelName);
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
            var toPersist = new List<PricingConfig>();
            foreach (var config in configs)
            {
                // Normalize: if stored as per-1M, convert to per-1k for runtime consistency
                if (config.IsPerMillion)
                {
                    try
                    {
                        config.InputTokenCost = Decimal.Divide(config.InputTokenCost, 1000m);
                        config.OutputTokenCost = Decimal.Divide(config.OutputTokenCost, 1000m);
                        if (config.CachedInputTokenCost != 0)
                        {
                            config.CachedInputTokenCost = Decimal.Divide(config.CachedInputTokenCost, 1000m);
                        }
                        config.IsPerMillion = false; // mark normalized
                        toPersist.Add(config);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to normalize pricing for model {ModelName}", config.ModelName);
                    }
                }

                _pricingCache[config.ModelName] = config;
            }

            // Best-effort persist normalized configs back to repository so future loads are per-1k
            if (toPersist.Count > 0)
            {
                _logger.LogInformation("Persisting {Count} normalized pricing configs back to repository", toPersist.Count);
                foreach (var p in toPersist)
                {
                    try
                    {
                        // Fire-and-forget but await to avoid overwhelming repository during startup
                        await _pricingRepository.UpsertAsync(p, cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to persist normalized pricing for model {ModelName}", p.ModelName);
                    }
                }
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
