using Microsoft.AspNetCore.Mvc.RazorPages;
using VoiceAgentCSharp.Features.Monitoring;

namespace VoiceAgentCSharp.Pages;

public class IncomingCallModel : PageModel
{
    private readonly CallMonitoringService _monitoringService;

    public IncomingCallModel(CallMonitoringService monitoringService)
    {
        _monitoringService = monitoringService;
    }

    public List<CallSession> ActiveSessions { get; set; } = new();

    public void OnGet()
    {
        ActiveSessions = _monitoringService.GetActiveSessions().ToList();
    }
}
