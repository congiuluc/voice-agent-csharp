using VoiceAgentCSharp.Features.Monitoring.Repositories;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Service to analyze and apply normalization of pricing configs (per-1M -> per-1k).
/// Provides a dry-run (plan) and apply operation.
/// </summary>
public class PricingMigrationService
{
    private readonly IPricingRepository _pricingRepository;
    private readonly ILogger<PricingMigrationService> _logger;

    public PricingMigrationService(IPricingRepository pricingRepository, ILogger<PricingMigrationService> logger)
    {
        _pricingRepository = pricingRepository;
        _logger = logger;
    }

    /// <summary>
    /// Analyze repository entries and return a migration plan (dry-run).
    /// Heuristic: values that look "large" (e.g., InputTokenCost > 1.0 or OutputTokenCost > 2.0)
    /// are likely per-1M and will be suggested for conversion.
    /// </summary>
    public async Task<object> GetPlanAsync(CancellationToken cancellationToken = default)
    {
        var configs = await _pricingRepository.GetAllAsync(cancellationToken);
        var plan = new List<object>();

        foreach (var c in configs)
        {
            var suggestion = new Dictionary<string, object>();
            suggestion["modelName"] = c.ModelName;
            suggestion["inputTokenCost"] = c.InputTokenCost;
            suggestion["outputTokenCost"] = c.OutputTokenCost;
            suggestion["cachedInputTokenCost"] = c.CachedInputTokenCost;
            suggestion["isPerMillion"] = c.IsPerMillion;

            // Heuristic detection
            bool looksPerMillion = c.IsPerMillion || c.InputTokenCost > 1.0m || c.OutputTokenCost > 2.0m;
            suggestion["looksPerMillion"] = looksPerMillion;
            if (looksPerMillion)
            {
                suggestion["suggestedInputPer1k"] = Decimal.Divide(c.InputTokenCost, 1000m);
                suggestion["suggestedOutputPer1k"] = Decimal.Divide(c.OutputTokenCost, 1000m);
                suggestion["suggestedCachedPer1k"] = c.CachedInputTokenCost != 0 ? Decimal.Divide(c.CachedInputTokenCost, 1000m) : 0m;
            }

            plan.Add(suggestion);
        }

        return new { count = plan.Count, plan };
    }

    /// <summary>
    /// Apply normalization for entries that look like per-1M. Returns apply result with changed models.
    /// </summary>
    public async Task<object> ApplyPlanAsync(CancellationToken cancellationToken = default)
    {
        var configs = await _pricingRepository.GetAllAsync(cancellationToken);
        var changed = new List<object>();

        foreach (var c in configs)
        {
            bool looksPerMillion = c.IsPerMillion || c.InputTokenCost > 1.0m || c.OutputTokenCost > 2.0m;
            if (!looksPerMillion) continue;

            var before = new { model = c.ModelName, input = c.InputTokenCost, output = c.OutputTokenCost, cached = c.CachedInputTokenCost };

            // Normalize
            c.InputTokenCost = Decimal.Divide(c.InputTokenCost, 1000m);
            c.OutputTokenCost = Decimal.Divide(c.OutputTokenCost, 1000m);
            if (c.CachedInputTokenCost != 0) c.CachedInputTokenCost = Decimal.Divide(c.CachedInputTokenCost, 1000m);
            c.IsPerMillion = false;
            c.UpdatedAt = DateTime.UtcNow;

            try
            {
                await _pricingRepository.UpsertAsync(c, cancellationToken);
                var after = new { model = c.ModelName, input = c.InputTokenCost, output = c.OutputTokenCost, cached = c.CachedInputTokenCost };
                changed.Add(new { before, after });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to persist normalized pricing for model {ModelName}", c.ModelName);
            }
        }

        return new { changedCount = changed.Count, changed };
    }
}
