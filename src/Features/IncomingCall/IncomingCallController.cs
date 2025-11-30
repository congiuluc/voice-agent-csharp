using Microsoft.AspNetCore.Mvc;

namespace VoiceAgentCSharp.Features.IncomingCall;

/// <summary>
/// API endpoints for incoming call settings and test operations.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class IncomingCallController : ControllerBase
{
    private readonly ILogger<IncomingCallController> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="IncomingCallController"/> class.
    /// </summary>
    public IncomingCallController(ILogger<IncomingCallController> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Test incoming call configuration from the UI.
    /// Validates required fields and returns a simple JSON result.
    /// </summary>
    /// <param name="request">The test payload containing ACS resource and phone number.</param>
    [HttpPost("test")]
    public IActionResult TestConfiguration([FromBody] IncomingCallTestRequest? request)
    {
        if (request == null)
        {
            _logger.LogWarning("Incoming call test request was null");
            return BadRequest(new { success = false, message = "Payload required" });
        }

        if (string.IsNullOrWhiteSpace(request.PhoneNumber))
        {
            return BadRequest(new { success = false, message = "Phone number is required" });
        }

        if (string.IsNullOrWhiteSpace(request.AcsResource))
        {
            _logger.LogInformation("ACS resource not provided; frontend may supply connection string for local testing");
        }

        // Minimal validation passed - in a real implementation, attempt to validate ACS resource/phone number with ACS SDK.
        _logger.LogInformation("Incoming call test passed for phone: {Phone}", request.PhoneNumber);

        return Ok(new { success = true, message = "Configuration valid" });
    }

    /// <summary>
    /// Minimal DTO for incoming call test request.
    /// </summary>
    public class IncomingCallTestRequest
    {
        /// <summary>
        /// ACS resource (optional for test)
        /// </summary>
        public string? AcsResource { get; set; }

        /// <summary>
        /// Phone number to test (required)
        /// </summary>
        public string? PhoneNumber { get; set; }

        /// <summary>
        /// Webhook URL (optional)
        /// </summary>
        public string? WebhookUrl { get; set; }

        /// <summary>
        /// WebSocket URL (optional)
        /// </summary>
        public string? WebsocketUrl { get; set; }
    }
}
