using VoiceAgentCSharp.Features.Shared;
using VoiceAgentCSharp.Features.VoiceAgent;
using VoiceAgentCSharp.Features.IncomingCall;
using VoiceAgentCSharp.Features.Monitoring;
using VoiceAgentCSharp.Features.Monitoring.Repositories;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.Extensibility;
using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;

// Configure Serilog early to capture startup logs
var tempConfig = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables()
    .AddCommandLine(args)
    .Build();

Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(tempConfig)
    .MinimumLevel.Override("Microsoft", LogEventLevel.Information)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/log-.txt", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 14)
    .CreateLogger();

VoiceAgentCSharp.Inspector.Inspect();

var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args });
builder.AddServiceDefaults();
// Replace default logging with Serilog
builder.Host.UseSerilog();

// Add services to the container
builder.Services.AddRazorPages(options =>
{
    options.Conventions.AuthorizeFolder("/");
    options.Conventions.AllowAnonymousToPage("/Login");
    options.Conventions.AllowAnonymousToPage("/Logout");
    options.Conventions.AllowAnonymousToPage("/Error");
    options.Conventions.AuthorizeFolder("/Admin", "Admin");
});

// Add controllers for Admin API
builder.Services.AddControllers();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.LoginPath = "/Login";
        options.LogoutPath = "/Logout";
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", policy =>
    {
        policy.RequireAuthenticatedUser();
        // Add additional requirements here if needed (e.g., role claims)
    });
});

// Application Insights telemetry
// Prefer ConnectionString or the newer configuration keys instead of the deprecated InstrumentationKey property.
var aiConnectionString = builder.Configuration["ApplicationInsights:ConnectionString"];
var aiKey = builder.Configuration["ApplicationInsights:InstrumentationKey"];
if (!string.IsNullOrEmpty(aiConnectionString))
{
    builder.Services.AddApplicationInsightsTelemetry(options =>
    {
        options.ConnectionString = aiConnectionString;
    });
}
else if (!string.IsNullOrEmpty(aiKey))
{
    // Fallback for older configurations: set up telemetry using the connection string format if only key is present
    builder.Services.AddApplicationInsightsTelemetry();
    // Note: we avoid assigning options.InstrumentationKey directly to prevent using the obsolete API.
    // The SDK will pick up the key from configuration when added to the default configuration sources.
}
else
{
    // Register a no-op TelemetryClient when Application Insights is not configured
    Log.Warning("Application Insights not configured - telemetry will be disabled");
    builder.Services.AddSingleton<TelemetryClient>(sp => 
        new TelemetryClient(new TelemetryConfiguration { DisableTelemetry = true }));
}

// Configure CORS - restrict to specific origins in production
var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "https://localhost:5001", "https://localhost:5000" };

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(corsOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

// Register application services
builder.Services.AddHttpClient();
builder.Services.AddTransient<VoiceMediaHandler>();
builder.Services.AddSingleton<VoiceSessionFactory>();
builder.Services.AddSingleton<IncomingCallHandler>();
builder.Services.AddSingleton<VoiceLiveService>();
builder.Services.AddSingleton<FoundryService>();

// Register monitoring services with repository pattern (CosmosDB with InMemory fallback)
builder.Services.AddMonitoringRepositories(builder.Configuration);

builder.Services.AddSingleton<PricingService>();
builder.Services.AddSingleton<BatchWriterService>();
builder.Services.AddHostedService<BatchWriterService>(sp => 
    sp.GetRequiredService<BatchWriterService>());
builder.Services.AddSingleton<CallMonitoringService>();

// Note: Serilog configured via builder.Host.UseSerilog(); default providers cleared by Serilog host

var app = builder.Build();

// Initialize pricing service
try
{
    var pricingService = app.Services.GetRequiredService<PricingService>();
    await pricingService.InitializeAsync();
}
catch (Exception ex)
{
    Log.Warning(ex, "Failed to initialize pricing service - will use defaults");
}

// Configure the HTTP request pipeline
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
    app.UseHttpsRedirection();
    
    // Forward proxy headers for HTTPS behind load balancer
    app.UseForwardedHeaders(new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
    });
}

// Security headers middleware
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
    
    if (!app.Environment.IsDevelopment())
    {
        context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    }
    
    context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; media-src 'self' blob:; img-src 'self' data: blob:;";
    await next();
});

app.UseStaticFiles();
app.UseRouting();
app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

// Map API controllers
app.MapControllers();

// Enable WebSockets with timeout
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromMinutes(2)
});

app.MapRazorPages();

// Map ACS endpoints
app.MapPost("/acs/incomingcall", async (HttpContext context, IncomingCallHandler handler) =>
{
    var hostUrl = $"{context.Request.Scheme}://{context.Request.Host}";
    return await handler.ProcessIncomingCallAsync(context, hostUrl);
}).WithName("IncomingCall");

app.MapPost("/acs/callbacks/{contextId}", async (string contextId, HttpContext context, IncomingCallHandler handler) =>
{
    return await handler.ProcessCallbackEventsAsync(contextId, context);
}).WithName("AcsCallback");

// Health check endpoint for Container Apps
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
    .WithName("HealthCheck")
    .ExcludeFromDescription();

// Map WebSocket endpoints
app.Map("/acs/ws", async (HttpContext context, ILogger<Program> logger) =>
{
    if (context.WebSockets.IsWebSocketRequest)
    {
        logger.LogInformation("Incoming ACS WebSocket connection from {RemoteIp}", context.Connection.RemoteIpAddress);
        var webSocket = await context.WebSockets.AcceptWebSocketAsync();
        // Resolve a transient handler from DI which will receive ILogger<VoiceMediaHandler>
        var handler = context.RequestServices.GetRequiredService<VoiceMediaHandler>();
        await handler.HandleVoiceWebSocketAsync(webSocket);
    }
    else
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
    }
});

app.Map("/web/ws", async (HttpContext context, ILogger<Program> logger) =>
{
    if (context.WebSockets.IsWebSocketRequest)
    {
        logger.LogInformation("Incoming Web WebSocket connection from {RemoteIp}", context.Connection.RemoteIpAddress);
        var webSocket = await context.WebSockets.AcceptWebSocketAsync();
        var handler = context.RequestServices.GetRequiredService<VoiceMediaHandler>();
        await handler.HandleWebWebSocketAsync(webSocket);
    }
    else
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
    }
});

// Avatar WebSocket endpoint for WebRTC-based avatar sessions
app.Map("/avatar/ws", async (HttpContext context, ILogger<Program> logger) =>
{
    if (context.WebSockets.IsWebSocketRequest)
    {
        logger.LogInformation("Incoming Avatar WebSocket connection from {RemoteIp}", context.Connection.RemoteIpAddress);
        var webSocket = await context.WebSockets.AcceptWebSocketAsync();
        var handler = context.RequestServices.GetRequiredService<VoiceMediaHandler>();
        await handler.HandleAvatarWebSocketAsync(webSocket);
    }
    else
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
    }
});

// Avatar ICE server endpoint for WebRTC TURN relay
// Per Microsoft docs: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar
app.MapGet("/avatar/ice", async (HttpContext context, ILogger<Program> logger, IConfiguration config) =>
{
    try
    {
        var endpoint = config["AzureVoiceLive:Endpoint"];
        var apiKey = config["AzureVoiceLive:ApiKey"];
        // Optional: explicit region for Speech service (e.g., "westus2")
        var speechRegion = config["AzureVoiceLive:SpeechRegion"];
        
        if (string.IsNullOrEmpty(apiKey))
        {
            logger.LogWarning("Voice Live API key not configured, returning default STUN server");
            return Results.Ok(new
            {
                iceServers = new[]
                {
                    new { urls = "stun:stun.l.google.com:19302" }
                }
            });
        }

        // Determine the Speech region
        // Priority: 1) Explicit SpeechRegion config, 2) Try to extract from endpoint
        string? region = speechRegion;
        
        if (string.IsNullOrEmpty(region) && !string.IsNullOrEmpty(endpoint))
        {
            try
            {
                var uri = new Uri(endpoint);
                var host = uri.Host;
                // Check if it's a Speech service endpoint (e.g., westus2.api.cognitive.microsoft.com)
                // or a Cognitive Services endpoint (e.g., resource-name.cognitiveservices.azure.com)
                if (host.Contains(".tts.speech.microsoft.com") || host.Contains(".api.cognitive.microsoft.com"))
                {
                    region = host.Split('.')[0];
                }
                else if (host.EndsWith(".cognitiveservices.azure.com"))
                {
                    // For Cognitive Services multi-service endpoints, need explicit region
                    logger.LogWarning(
                        "Cognitive Services endpoint detected. Set AzureVoiceLive:SpeechRegion for ICE servers.");
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to parse endpoint for region extraction");
            }
        }
        
        if (string.IsNullOrEmpty(region))
        {
            logger.LogWarning("Speech region not configured, returning default STUN server");
            return Results.Ok(new
            {
                iceServers = new[]
                {
                    new { urls = "stun:stun.l.google.com:19302" }
                }
            });
        }
        
        // Build ICE token URL per Microsoft docs
        var iceTokenUrl = $"https://{region}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1";
        logger.LogDebug("Fetching ICE servers from: {Url}", iceTokenUrl);
        
        using var httpClient = new HttpClient();
        httpClient.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", apiKey);
        
        var response = await httpClient.GetAsync(iceTokenUrl);
        
        if (response.IsSuccessStatusCode)
        {
            var iceData = await response.Content.ReadAsStringAsync();
            logger.LogInformation("Retrieved ICE servers from Azure Speech service");
            return Results.Content(iceData, "application/json");
        }
        else
        {
            logger.LogWarning("Failed to get ICE servers: {Status}, returning defaults", response.StatusCode);
            return Results.Ok(new
            {
                iceServers = new[]
                {
                    new { urls = "stun:stun.l.google.com:19302" }
                }
            });
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error fetching ICE servers");
        return Results.Ok(new
        {
            iceServers = new[]
            {
                new { urls = "stun:stun.l.google.com:19302" }
            }
        });
    }
}).WithName("AvatarIceServers");

// Avatar SDP offer endpoint for WebRTC negotiation
app.MapPost("/avatar/offer", async (HttpContext context, ILogger<Program> logger) =>
{
    try
    {
        var body = await new StreamReader(context.Request.Body).ReadToEndAsync();
        logger.LogDebug("Received avatar offer request: {Body}", body);
        
        var jsonOptions = new System.Text.Json.JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };
        var request = System.Text.Json.JsonSerializer.Deserialize<AvatarOfferRequest>(body, jsonOptions);
        
        if (string.IsNullOrEmpty(request?.Sdp))
        {
            logger.LogWarning("Missing SDP in request body. Body was: {Body}", body);
            return Results.BadRequest(new { error = "Missing SDP in request body" });
        }

        string? answerSdp = null;

        // Try to use connection ID if provided
        if (!string.IsNullOrEmpty(request.ConnectionId))
        {
            logger.LogDebug("Processing avatar offer for connection: {ConnectionId}", request.ConnectionId);
            answerSdp = await VoiceMediaHandler.ProcessAvatarOfferByConnectionIdAsync(
                request.ConnectionId, request.Sdp);
        }
        
        // Fallback: try using the handler instance (for backward compatibility)
        if (string.IsNullOrEmpty(answerSdp))
        {
            var handler = context.RequestServices.GetRequiredService<VoiceMediaHandler>();
            answerSdp = await handler.ProcessAvatarOfferAsync(request.Sdp);
        }
        
        if (string.IsNullOrEmpty(answerSdp))
        {
            var activeConnections = VoiceMediaHandler.GetActiveAvatarConnections();
            logger.LogWarning(
                "Failed to get SDP answer. Active avatar connections: {Count}",
                activeConnections.Length);
            
            return Results.Problem(
                detail: "Failed to get SDP answer from avatar service. " +
                    "Ensure WebSocket connection is established first.",
                statusCode: 503);
        }

        return Results.Ok(new { sdp = answerSdp });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error processing avatar offer");
        return Results.Problem($"Error processing avatar offer: {ex.Message}");
    }
}).WithName("AvatarOffer");

app.Run();

/// <summary>
/// Request model for avatar SDP offer.
/// </summary>
/// <param name="Sdp">The SDP offer from the client.</param>
/// <param name="ConnectionId">Optional connection ID for routing to specific session.</param>
public record AvatarOfferRequest(string Sdp, string? ConnectionId = null);
