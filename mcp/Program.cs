
using ModelContextProtocol.Server;
using System.ComponentModel;
using mcpServer.Tools;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.AddServiceDefaults();
builder.Services.AddHttpClient();
builder.Services.AddScoped<WeatherTools>();
builder.Services.AddScoped<DateTimeTools>();

// Add OpenAPI services
builder.Services.AddOpenApi();

builder.Services.AddMcpServer()
    .WithHttpTransport()
    .WithToolsFromAssembly();
var app = builder.Build();

// Map OpenAPI endpoints
app.MapOpenApi();
app.MapScalarApiReference();

// Map health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }))
    .WithName("HealthCheck")
    .WithTags("Health")
    .WithSummary("Check if the service is healthy");

// Map tool endpoints as REST API
var toolsGroup = app.MapGroup("/api/tools").WithTags("Tools");

toolsGroup.MapGet("/datetime", (string? timezone) =>
{
    var result = DateTimeTools.GetDateTime(timezone);
    return Results.Ok(new { result });
})
.WithName("GetDateTime")
.WithSummary("Get current date and time")
.WithDescription("Get the current date and time, optionally in a specific timezone. Use IANA timezone format like 'America/New_York' or 'Europe/London'.");

toolsGroup.MapGet("/weather", async (string location, WeatherTools weatherTools) =>
{
    if (string.IsNullOrWhiteSpace(location))
    {
        return Results.BadRequest(new { error = "Location parameter is required" });
    }
    var result = await weatherTools.GetWeather(location);
    return Results.Ok(new { result });
})
.WithName("GetWeather")
.WithSummary("Get weather for a location")
.WithDescription("Get current weather for a location using the free Open-Meteo API. Provide a city name like 'London', 'New York', or 'Tokyo'.");

app.MapMcp();

app.Run();
/*
[McpServerToolType]
public static class EchoTool
{
    [McpServerTool, Description("Echoes the message back to the client.")]
    public static string Echo(string message) => $"hello {message}";
}
*/