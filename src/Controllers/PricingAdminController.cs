using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VoiceAgentCSharp.Features.Monitoring;

namespace VoiceAgentCSharp.Controllers;

/// <summary>
/// Admin API for managing pricing configuration.
/// Requires Admin role authorization.
/// </summary>
[ApiController]
[Route("api/admin/pricing")]
[Authorize(Roles = "Admin")]
public class PricingAdminController : ControllerBase
{
    private readonly PricingService _pricingService;
    private readonly ILogger<PricingAdminController> _logger;

    public PricingAdminController(
        PricingService pricingService,
        ILogger<PricingAdminController> logger)
    {
        _pricingService = pricingService;
        _logger = logger;
    }

    /// <summary>
    /// Reloads pricing configuration from CosmosDB without restart.
    /// </summary>
    /// <returns>Success message</returns>
    [HttpPost("reload")]
    public async Task<IActionResult> ReloadPricing(CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Admin user {User} requested pricing reload", User.Identity?.Name);
            await _pricingService.ReloadPricingAsync(cancellationToken);
            
            return Ok(new 
            { 
                message = "Pricing configuration reloaded successfully",
                timestamp = DateTime.UtcNow 
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reload pricing configuration");
            return StatusCode(500, new { error = "Failed to reload pricing configuration" });
        }
    }

    /// <summary>
    /// Seed default pricing configuration into the repository.
    /// </summary>
    [HttpPost("seed-defaults")]
    public async Task<IActionResult> SeedDefaults(CancellationToken cancellationToken)
    {
        try
        {
            _logger.LogInformation("Admin user {User} requested seeding default pricing", User.Identity?.Name);
            await _pricingService.SeedDefaultsAsync(cancellationToken);

            return Ok(new
            {
                message = "Default pricing seeded successfully",
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to seed default pricing");
            return StatusCode(500, new { error = "Failed to seed default pricing" });
        }
    }

    /// <summary>
    /// Upsert a pricing configuration (Admin-only). Accepts modelName, inputTokenCost, outputTokenCost, cachedInputTokenCost, avatarCostPerMin, ttsCostPer1MChars, isPerMillion
    /// </summary>
    [HttpPost("upsert")]
    public async Task<IActionResult> UpsertPricing([FromBody] PricingConfigDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var config = new PricingConfig
            {
                Id = dto.modelName,
                ModelName = dto.modelName,
                InputTokenCost = dto.inputTokenCost,
                OutputTokenCost = dto.outputTokenCost,
                CachedInputTokenCost = dto.cachedInputTokenCost,
                AvatarCostPerMin = dto.avatarCostPerMin,
                TtsCostPer1MChars = dto.ttsCostPer1MChars,
                IsPerMillion = dto.isPerMillion,
                UpdatedAt = DateTime.UtcNow
            };

            await _pricingService.UpsertAsync(config, cancellationToken);
            return Ok(new { message = "Upserted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to upsert pricing");
            return StatusCode(500, new { error = "Failed to upsert pricing" });
        }
    }

    public class PricingConfigDto
    {
        public string modelName { get; set; } = string.Empty;
        public decimal inputTokenCost { get; set; }
        public decimal outputTokenCost { get; set; }
        public decimal cachedInputTokenCost { get; set; }
        public decimal avatarCostPerMin { get; set; }
        public decimal ttsCostPer1MChars { get; set; }
        public bool isPerMillion { get; set; }
    }

    /// <summary>
    /// Lists current pricing configuration.
    /// </summary>
    /// <returns>Pricing configurations</returns>
    [HttpGet("list")]
    public IActionResult ListPricing()
    {
        try
        {
            var pricing = _pricingService.GetAllPricing();
            
            return Ok(new
            {
                pricing = pricing.Values.Select(p => new
                {
                    modelName = p.ModelName,
                    inputTokenCost = p.InputTokenCost,
                    outputTokenCost = p.OutputTokenCost,
                    avatarCostPerMin = p.AvatarCostPerMin,
                    ttsCostPer1MChars = p.TtsCostPer1MChars,
                    cachedInputTokenCost = p.CachedInputTokenCost,
                    updatedAt = p.UpdatedAt
                }),
                count = pricing.Count,
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list pricing configuration");
            return StatusCode(500, new { error = "Failed to list pricing configuration" });
        }
    }

    /// <summary>
    /// Dry-run migration: analyze repository pricing entries and suggest normalizations
    /// (detect likely per-1M values and return a plan). Admin-only.
    /// </summary>
    [HttpGet("migration/plan")]
    public async Task<IActionResult> GetMigrationPlan(CancellationToken cancellationToken)
    {
        try
        {
            var plan = await _pricingService.GetNormalizationPlanAsync(cancellationToken);
            return Ok(plan);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate migration plan");
            return StatusCode(500, new { error = "Failed to generate migration plan" });
        }
    }

    /// <summary>
    /// Apply migration: normalize detected per-1M entries into per-1k and persist changes.
    /// Admin-only.
    /// </summary>
    [HttpPost("migration/apply")]
    public async Task<IActionResult> ApplyMigration(CancellationToken cancellationToken)
    {
        try
        {
            var result = await _pricingService.ApplyNormalizationPlanAsync(cancellationToken);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to apply migration");
            return StatusCode(500, new { error = "Failed to apply migration" });
        }
    }
}
