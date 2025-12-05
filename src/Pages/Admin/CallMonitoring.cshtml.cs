using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;
using VoiceAgentCSharp.Features.Monitoring;

namespace VoiceAgentCSharp.Pages.Admin;

[Authorize(Roles = "Admin")]
public class CallMonitoringModel : PageModel
{
    private readonly PricingService _pricingService;
    private readonly BatchWriterService _batchWriter;
    private readonly CallMonitoringService _monitoringService;
    private readonly ILogger<CallMonitoringModel> _logger;

    public int ActiveSessions { get; set; }
    public int QueueSize { get; set; }
    public int PricingModels { get; set; }
    public List<PricingConfig> Pricing { get; set; } = new();
    
    // New token metrics properties
    public long TotalInputTokens { get; set; }
    public long TotalOutputTokens { get; set; }
    public long TotalCachedTokens { get; set; }
    public int TotalInteractions { get; set; }
    public List<string> UsedModels { get; set; } = new();

    public CallMonitoringModel(
        PricingService pricingService,
        BatchWriterService batchWriter,
        CallMonitoringService monitoringService,
        ILogger<CallMonitoringModel> logger)
    {
        _pricingService = pricingService;
        _batchWriter = batchWriter;
        _monitoringService = monitoringService;
        _logger = logger;
    }

    public void OnGet()
    {
        try
        {
            // Get current metrics
            ActiveSessions = _monitoringService.GetActiveSessionCount();
            QueueSize = _batchWriter.GetQueueSize();
            
            // Get pricing info
            var pricingDict = _pricingService.GetAllPricing();
            Pricing = pricingDict.Values.ToList();
            PricingModels = Pricing.Count;

            // Get aggregated token metrics
            var tokenMetrics = _monitoringService.GetAggregatedTokenMetrics();
            TotalInputTokens = tokenMetrics.TotalInputTokens;
            TotalOutputTokens = tokenMetrics.TotalOutputTokens;
            TotalCachedTokens = tokenMetrics.TotalCachedTokens;
            TotalInteractions = tokenMetrics.TotalInteractions;
            UsedModels = tokenMetrics.UsedModels;

            _logger.LogInformation("Admin dashboard accessed by {User}", User.Identity?.Name);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading dashboard data");
        }
    }
}
