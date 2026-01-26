using Microsoft.AspNetCore.Mvc;
using System.Collections.Concurrent;
using System.Text.Json;
using VoiceAgentCSharp.Features.Monitoring;

namespace VoiceAgentCSharp.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CallMonitoringController : ControllerBase
{
    private readonly CallMonitoringService _monitoringService;
    private readonly ILogger<CallMonitoringController> _logger;

    public CallMonitoringController(CallMonitoringService monitoringService, ILogger<CallMonitoringController> logger)
    {
        _monitoringService = monitoringService;
        _logger = logger;
    }

    [HttpGet("active-sessions")]
    public IActionResult GetActiveSessions()
    {
        return Ok(_monitoringService.GetActiveSessions());
    }

    [HttpGet("stream-transcripts")]
    public async Task StreamTranscripts(CancellationToken cancellationToken)
    {
        Response.ContentType = "text/event-stream";
        var responseStream = Response.Body;

        void OnTranscriptAdded(string sessionId, TranscriptEntry entry)
        {
            var data = JsonSerializer.Serialize(new { sessionId, entry });
            var message = $"data: {data}\n\n";
            var bytes = System.Text.Encoding.UTF8.GetBytes(message);
            
            // We can't easily await here because it's an event handler
            // In a real app, we'd use a Channel or a more robust SSE implementation
            try {
                responseStream.WriteAsync(bytes, cancellationToken).AsTask().Wait(cancellationToken);
                responseStream.FlushAsync(cancellationToken).Wait(cancellationToken);
            } catch {
                // Client disconnected
            }
        }

        _monitoringService.OnTranscriptAdded += OnTranscriptAdded;

        try
        {
            // Keep the connection alive
            while (!cancellationToken.IsCancellationRequested)
            {
                await Task.Delay(1000, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Normal disconnection
        }
        finally
        {
            _monitoringService.OnTranscriptAdded -= OnTranscriptAdded;
        }
    }
}
