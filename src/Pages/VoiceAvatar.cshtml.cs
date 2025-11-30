using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Logging;

namespace VoiceAgentCSharp.Pages;

public class VoiceAvatarModel : PageModel
{
    private readonly ILogger<VoiceAvatarModel> _logger;

    public VoiceAvatarModel(ILogger<VoiceAvatarModel> logger)
    {
        _logger = logger;
        _logger.LogInformation("Voice Avatar page loaded");
    }
}
