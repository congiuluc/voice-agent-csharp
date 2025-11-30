using Microsoft.AspNetCore.Mvc.RazorPages;
using VoiceAgentCSharp.Features.VoiceAgent;
using Azure.AI.Projects;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace VoiceAgentCSharp.Pages;

public class VoiceAgentModel : PageModel
{
    private readonly ILogger<VoiceAgentModel> _logger;
    private readonly FoundryService _foundryService;

    public List<string> Projects { get; set; } = new();
    public List<FoundryService.FoundryAgent> Agents { get; set; } = new();

    public VoiceAgentModel(ILogger<VoiceAgentModel> logger, FoundryService foundryService)
    {
        _logger = logger;
        _foundryService = foundryService;
    }

    public async Task OnGetAsync()
    {
        _logger.LogInformation("Voice Agent page loaded");
        
        // Fetch projects (simulated for now)
        Projects = await _foundryService.GetProjectsAsync();
        
        // Fetch agents
        Agents = await _foundryService.GetAgentsAsync();
    }
}
