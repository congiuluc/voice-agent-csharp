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
}
