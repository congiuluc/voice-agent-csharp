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

    public int ActiveSessions { get; set; } = 0;
    public int CompletedSessions { get; set; } = 0;
    public int TotalSessions { get; set; } = 0;
    public int QueueSize { get; set; } = 0;
    public int PricingModels { get; set; }
    public List<PricingConfig> Pricing { get; set; } = new();
    
    // New token metrics properties
    public long TotalInputTokens { get; set; }
    public long TotalOutputTokens { get; set; }
    public long TotalCachedTokens { get; set; }
    public int TotalInteractions { get; set; }
    public List<string> UsedModels { get; set; } = new();
    public decimal TotalEstimatedCost { get; set; }

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
            CompletedSessions = _monitoringService.GetCompletedSessionCount();
            TotalSessions = _monitoringService.GetTotalSessionCount();
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

            // Get total estimated cost (active + completed sessions)
            TotalEstimatedCost = _monitoringService.GetTotalCost();

            _logger.LogInformation(
                "Admin dashboard loaded: ActiveSessions={ActiveSessions}, CompletedSessions={CompletedSessions}, TotalSessions={TotalSessions}, Cost=${Cost:F4}",
                ActiveSessions, CompletedSessions, TotalSessions, TotalEstimatedCost);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading dashboard data");
            // Ensure values default to 0 if there's an error
            ActiveSessions = 0;
            CompletedSessions = 0;
            TotalSessions = 0;
            QueueSize = 0;
            PricingModels = 0;
        }
    }
}
