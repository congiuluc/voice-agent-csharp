using VoiceAgentCSharp;
using Serilog;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args });

// Configure Logging
builder.ConfigureLogging();

builder.AddServiceDefaults();
builder.Host.UseSerilog();

// Add services to the container
builder.ConfigureServices();

var app = builder.Build();

// Configure the HTTP request pipeline
app.ConfigureMiddleware();

// Map endpoints
app.MapEndpoints();

app.Run();

public record AvatarOfferRequest(string Sdp, string? ConnectionId = null);
