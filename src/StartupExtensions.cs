using VoiceAgentCSharp.Features.Shared;
using VoiceAgentCSharp.Features.VoiceAgent;
using VoiceAgentCSharp.Features.IncomingCall;
using VoiceAgentCSharp.Features.Monitoring;
using VoiceAgentCSharp.Features.Monitoring.Repositories;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Localization;
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.Extensibility;
using Serilog;
using Serilog.Events;
using System.Globalization;
using Microsoft.Extensions.Options;

namespace VoiceAgentCSharp;

public static class StartupExtensions
{
    public static void ConfigureLogging(this WebApplicationBuilder builder)
    {
        var aiConnectionString = builder.Configuration["ApplicationInsights:ConnectionString"];
        var aiKey = builder.Configuration["ApplicationInsights:InstrumentationKey"];
        
        var loggerConfig = new LoggerConfiguration()
            .ReadFrom.Configuration(builder.Configuration)
            .MinimumLevel.Override("Microsoft", LogEventLevel.Information)
            .Enrich.FromLogContext()
            .WriteTo.Console()
            .WriteTo.File("logs/log-.txt", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 14);

        if (!string.IsNullOrEmpty(aiConnectionString) || !string.IsNullOrEmpty(aiKey))
        {
            var telemetryConfig = TelemetryConfiguration.CreateDefault();
            telemetryConfig.ConnectionString = aiConnectionString ?? $"InstrumentationKey={aiKey}";
            loggerConfig = loggerConfig.WriteTo.ApplicationInsights(telemetryConfig, TelemetryConverter.Traces);
        }

        Log.Logger = loggerConfig.CreateLogger();
        VoiceAgentCSharp.Inspector.Inspect();
    }

    public static void ConfigureServices(this WebApplicationBuilder builder)
    {
        var services = builder.Services;
        var configuration = builder.Configuration;

        services.AddLocalization();

        services.AddRazorPages(options =>
        {
            options.Conventions.AuthorizeFolder("/");
            options.Conventions.AllowAnonymousToPage("/Login");
            options.Conventions.AllowAnonymousToPage("/Logout");
            options.Conventions.AllowAnonymousToPage("/Error");
            options.Conventions.AuthorizeFolder("/Admin", "Admin");
        })
        .AddViewLocalization()
        .AddDataAnnotationsLocalization();

        services.AddControllers();

        services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.LoginPath = "/Login";
                options.LogoutPath = "/Logout";
            });

        services.AddAuthorization(options =>
        {
            options.AddPolicy("Admin", policy => policy.RequireAuthenticatedUser());
        });

        ConfigureTelemetry(builder);
        ConfigureCors(builder);

        // Register application services
        services.AddHttpClient();
        services.AddTransient<VoiceMediaHandler>();
        services.AddSingleton<VoiceSessionFactory>();
        services.AddSingleton<IncomingCallHandler>();
        services.AddSingleton<VoiceLiveService>();
        services.AddSingleton<FoundryService>();

        services.AddMonitoringRepositories(configuration);
        services.AddSingleton<PricingMigrationService>();
        services.AddSingleton<PricingService>();
        services.AddSingleton<BatchWriterService>();
        services.AddHostedService<BatchWriterService>(sp => sp.GetRequiredService<BatchWriterService>());
        services.AddSingleton<CallMonitoringService>();
    }

    private static void ConfigureTelemetry(WebApplicationBuilder builder)
    {
        var aiConnectionString = builder.Configuration["ApplicationInsights:ConnectionString"];
        var aiKey = builder.Configuration["ApplicationInsights:InstrumentationKey"];

        if (!string.IsNullOrEmpty(aiConnectionString))
        {
            builder.Services.AddApplicationInsightsTelemetry(options => options.ConnectionString = aiConnectionString);
        }
        else if (!string.IsNullOrEmpty(aiKey))
        {
            builder.Services.AddApplicationInsightsTelemetry();
        }
        else
        {
            Log.Warning("Application Insights not configured - telemetry will be disabled");
            builder.Services.AddSingleton<TelemetryClient>(sp => 
                new TelemetryClient(new TelemetryConfiguration { DisableTelemetry = true }));
        }
    }

    private static void ConfigureCors(WebApplicationBuilder builder)
    {
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
    }

    public static void ConfigureMiddleware(this WebApplication app)
    {
        // Configure localization
        var supportedCultures = new[] { "en-US", "it-IT", "fr-FR", "es-ES", "de-DE" };
        var localizationOptions = new RequestLocalizationOptions()
            .SetDefaultCulture(supportedCultures[0])
            .AddSupportedCultures(supportedCultures)
            .AddSupportedUICultures(supportedCultures);

        app.UseRequestLocalization(localizationOptions);

        // Initialize services
        InitializeAsyncServices(app).GetAwaiter().GetResult();

        if (!app.Environment.IsDevelopment())
        {
            app.UseExceptionHandler("/Error");
            app.UseHsts();
            app.UseHttpsRedirection();
            app.UseForwardedHeaders(new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
            });
        }

        app.Use(async (context, next) =>
        {
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["X-Frame-Options"] = "DENY";
            context.Response.Headers["X-XSS-Protection"] = "1; mode=block";
            
            if (!app.Environment.IsDevelopment())
            {
                context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
            }
            
            context.Response.Headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; media-src 'self' blob:; img-src 'self' data: blob: https://flagcdn.com;";
            await next();
        });

        app.UseStaticFiles();
        app.UseRouting();
        app.UseCors();
        app.UseAuthentication();
        app.UseAuthorization();

        app.MapControllers();
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromMinutes(2) });
        app.MapRazorPages();
    }

    private static async Task InitializeAsyncServices(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var services = scope.ServiceProvider;

        try
        {
            var pricingService = services.GetRequiredService<PricingService>();
            await pricingService.InitializeAsync();

            if (app.Configuration.GetValue<bool>("SeedPricingDefaults", false))
            {
                Log.Information("Seeding default pricing into repository");
                await pricingService.SeedDefaultsAsync();
            }

            var monitoringService = services.GetRequiredService<CallMonitoringService>();
            await monitoringService.InitializeAsync();
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Error during service initialization");
        }
    }

    public static void MapEndpoints(this WebApplication app)
    {
        app.MapPost("/acs/incomingcall", async (HttpContext context, IncomingCallHandler handler) =>
        {
            var hostUrl = $"{context.Request.Scheme}://{context.Request.Host}";
            return await handler.ProcessIncomingCallAsync(context, hostUrl);
        }).WithName("IncomingCall");

        app.MapPost("/acs/callbacks/{contextId}", async (string contextId, HttpContext context, IncomingCallHandler handler) =>
        {
            return await handler.ProcessCallbackEventsAsync(contextId, context);
        }).WithName("AcsCallback");

        app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
            .WithName("HealthCheck")
            .ExcludeFromDescription();

        app.Map("/acs/ws", async (HttpContext context, VoiceMediaHandler handler) =>
        {
            if (context.WebSockets.IsWebSocketRequest)
            {
                var webSocket = await context.WebSockets.AcceptWebSocketAsync();
                await handler.HandleVoiceWebSocketAsync(webSocket);
            }
            else context.Response.StatusCode = StatusCodes.Status400BadRequest;
        });

        app.Map("/web/ws", async (HttpContext context, VoiceMediaHandler handler) =>
        {
            if (context.WebSockets.IsWebSocketRequest)
            {
                var webSocket = await context.WebSockets.AcceptWebSocketAsync();
                await handler.HandleWebWebSocketAsync(webSocket);
            }
            else context.Response.StatusCode = StatusCodes.Status400BadRequest;
        });

        app.Map("/avatar/ws", async (HttpContext context, VoiceMediaHandler handler) =>
        {
            if (context.WebSockets.IsWebSocketRequest)
            {
                var webSocket = await context.WebSockets.AcceptWebSocketAsync();
                await handler.HandleAvatarWebSocketAsync(webSocket);
            }
            else context.Response.StatusCode = StatusCodes.Status400BadRequest;
        });

        app.MapGet("/avatar/ice", async (HttpContext context, ILogger<Program> logger, IConfiguration config) =>
        {
            return Results.Ok(new { iceServers = new[] { new { urls = "stun:stun.l.google.com:19302" } } });
        }).WithName("AvatarIceServers");

        app.MapPost("/avatar/offer", async (HttpContext context, ILogger<Program> logger) =>
        {
            return Results.Ok(new { sdp = "" });
        }).WithName("AvatarOffer");
    }
}
