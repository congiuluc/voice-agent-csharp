using Microsoft.AspNetCore.Mvc.RazorPages;

namespace VoiceAgentCSharp.Pages;

public class VoiceAssistantModel : PageModel
{
    private readonly ILogger<VoiceAssistantModel> _logger;

    public VoiceAssistantModel(ILogger<VoiceAssistantModel> logger)
    {
        _logger = logger;
    }

    public void OnGet()
    {
        _logger.LogInformation("Voice Assistant page loaded");
    }
}
