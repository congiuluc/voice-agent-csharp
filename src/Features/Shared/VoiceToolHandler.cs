using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;
using Azure.AI.VoiceLive;
using Microsoft.Extensions.Logging;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Handles the definition and execution of common tools (functions) used across different voice sessions.
/// This class encapsulates the logic for tools like "GetCurrentDateTime" and "GetCurrentWeather" to avoid code duplication.
/// </summary>
public class VoiceToolHandler
{
    #region Fields

    private readonly ILogger _logger;
    private readonly HttpClient _httpClient;
    private static readonly ActivitySource _activitySource = new("VoiceAgentCSharp.Features.Shared.VoiceToolHandler");
    private McpClientManager? _mcpClient;
    private List<VoiceLiveFunctionDefinition> _mcpToolDefinitions = new();
    private Dictionary<string, string> _mcpToolNameMap = new(); // Map MCP tool names to VoiceLive tool names

    #endregion

    #region Constructor

    /// <summary>
    /// Initializes a new instance of the <see cref="VoiceToolHandler"/> class.
    /// </summary>
    /// <param name="logger">The logger instance for logging tool execution details.</param>
    /// <param name="httpClient">Optional HttpClient instance for making HTTP requests. If not provided, a default one is created.</param>
    public VoiceToolHandler(ILogger logger, HttpClient? httpClient = null)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _httpClient = httpClient ?? new HttpClient();
    }

    #endregion

    #region MCP Integration

    /// <summary>
    /// Initializes the MCP client connection and discovers available tools from the MCP server.
    /// This is called during session startup to enable dynamic tool discovery.
    /// Connects to a standalone HTTP-based MCP server.
    /// </summary>
    /// <param name="mcpServerUrl">The HTTP URL of the MCP server (e.g., http://localhost:5001).</param>
    /// <returns>A task that represents the asynchronous operation.</returns>
    public async Task InitializeMcpAsync(string mcpServerUrl)
    {
        if (string.IsNullOrWhiteSpace(mcpServerUrl))
        {
            _logger.LogWarning("MCP server URL is null or empty. Continuing with built-in tools only");
            return;
        }

        try
        {
            _logger.LogInformation("Initializing MCP client to {Url}", mcpServerUrl);
            _mcpClient = new McpClientManager(_logger);
            await _mcpClient.InitializeHttpAsync(mcpServerUrl).ConfigureAwait(false);

            // Retrieve and cache available tools and convert to VoiceLive definitions
            var tools = _mcpClient.GetAvailableTools();

            _mcpToolDefinitions.Clear();
            _mcpToolNameMap.Clear();

            foreach (var (toolName, mcpTool) in tools)
            {
                try
                {
                    // Convert MCP tool to VoiceLiveFunctionDefinition
                    var voiceLiveTool = new VoiceLiveFunctionDefinition(toolName)
                    {
                        Description = mcpTool.Description ?? $"MCP Tool: {toolName}",
                        Parameters = BinaryData.FromObjectAsJson(mcpTool.JsonSchema)
                    };

                    _mcpToolNameMap[toolName] = toolName;
                    _mcpToolDefinitions.Add(voiceLiveTool);
                    _logger.LogDebug("Added MCP tool to voice definitions: {ToolName}", toolName);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to add MCP tool {ToolName} to voice definitions", toolName);
                }
            }

            _logger.LogInformation("Discovered {ToolCount} tools from MCP server", _mcpToolDefinitions.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to initialize MCP client - continuing with built-in tools only");
            // Graceful degradation: continue with built-in tools only
        }
    }

    #endregion

    #region Tool Definitions

    public List<VoiceLiveFunctionDefinition> GetTools()
    {
        using var activity = _activitySource.StartActivity("GetTools");
        _logger.LogDebug("Retrieving combined tool definitions (MCP + built-in).");

        var tools = new List<VoiceLiveFunctionDefinition>();
        tools.AddRange(GetMcpTools());
        tools.AddRange(GetCommonTools());

        return tools;
    }
    /// <summary>
    /// Gets the list of common tool definitions supported by the voice agent,
    /// including both built-in tools and dynamically discovered MCP tools.
    /// </summary>
    /// <returns>A list of <see cref="VoiceLiveFunctionDefinition"/> objects representing the available tools.</returns>
    public List<VoiceLiveFunctionDefinition> GetMcpTools()
    {
        using var activity = _activitySource.StartActivity("GetMcpTools");
        _logger.LogDebug("Retrieving MCP tool definitions.");

        var tools = new List<VoiceLiveFunctionDefinition>();

        return tools;
    }

    public List<VoiceLiveFunctionDefinition> GetCommonTools()
    {
        using var activity = _activitySource.StartActivity("GetCommonTools");
        _logger.LogDebug("Retrieving common tool definitions (built-in).");

        return new List<VoiceLiveFunctionDefinition>(){
            new VoiceLiveFunctionDefinition("GetDateTime")
            {
                Description = "Returns the current date and time in the specified timezone. Use this when the user asks what time or date it is.",
                Parameters = BinaryData.FromObjectAsJson(new
                {
                    type = "object",
                    properties = new
                    {
                        timezone = new
                        {
                            type = "string",
                            description = "The IANA timezone identifier (e.g., 'Europe/Rome', 'America/New_York', 'UTC'). Defaults to local time if not specified."
                        }
                    },
                    required = Array.Empty<string>()
                })
            },
            new VoiceLiveFunctionDefinition("GetWeather")
            {
                Description = "Returns the current weather conditions for a given location. Use this when the user asks about the weather.",
                Parameters = BinaryData.FromObjectAsJson(new
                {
                    type = "object",
                    properties = new
                    {
                        location = new
                        {
                            type = "string",
                            description = "The city name, e.g., 'Rome', 'New York', 'London'"
                        },
                        unit = new
                        {
                            type = "string",
                            description = "Temperature unit: 'celsius' or 'fahrenheit'. Defaults to celsius.",
                            @enum = new[] { "celsius", "fahrenheit" }
                        }
                    },
                    required = new[] { "location" }
                })
            }
        };
    }

    /// <summary>
    /// Gets the list of common tool definitions as anonymous objects.
    /// This is useful for scenarios where the configuration expects a generic object structure (e.g., Avatar session config).
    /// </summary>
    /// <returns>A list of anonymous objects representing the available tools.</returns>
    public List<object> GetCommonToolsAsObjects()
    {
        using var activity = _activitySource.StartActivity("GetCommonToolsAsObjects");
        _logger.LogDebug("Retrieving common tool definitions as objects.");

        return new List<object>
        {
            new
            {
                type = "function",
                name = "GetDateTime",
                description = "Returns the current date and time in the specified timezone. Use this when the user asks what time or date it is.",
                parameters = new
                {
                    type = "object",
                    properties = new
                    {
                        timezone = new
                        {
                            type = "string",
                            description = "The IANA timezone identifier (e.g., 'Europe/Rome', 'America/New_York', 'UTC'). Defaults to local time if not specified."
                        }
                    },
                    required = Array.Empty<string>()
                }
            },
            new
            {
                type = "function",
                name = "GetWeather",
                description = "Returns the current weather conditions for a given location. Use this when the user asks about the weather.",
                parameters = new
                {
                    type = "object",
                    properties = new
                    {
                        location = new
                        {
                            type = "string",
                            description = "The city name, e.g., 'Rome', 'New York', 'London'"
                        },
                        unit = new
                        {
                            type = "string",
                            description = "Temperature unit: 'celsius' or 'fahrenheit'. Defaults to celsius.",
                            @enum = new[] { "celsius", "fahrenheit" }
                        }
                    },
                    required = new[] { "location" }
                }
            }
        };
    }

    #endregion

    #region Tool Execution

    /// <summary>
    /// Executes a tool based on its name and arguments.
    /// First checks if the tool is available via MCP server, then falls back to built-in tools.
    /// </summary>
    /// <param name="name">The name of the tool to execute.</param>
    /// <param name="arguments">The JSON arguments string passed to the tool.</param>
    /// <returns>A task that represents the asynchronous operation. The task result contains the output of the tool execution.</returns>
    public async Task<string> ExecuteToolAsync(string name, string arguments)
    {
        using var activity = _activitySource.StartActivity("ExecuteToolAsync");
        activity?.SetTag("tool.name", name);
        activity?.SetTag("tool.arguments", arguments);

        _logger.LogInformation("Executing tool: {ToolName} with arguments: {Arguments}", name, arguments);

        try
        {
            // Try MCP tools first (if available and tool is registered)
            if (_mcpClient != null && _mcpToolNameMap.ContainsKey(name))
            {
                try
                {
                    _logger.LogDebug("Executing MCP tool: {ToolName}", name);
                    var mcpResult = await _mcpClient.ExecuteToolAsync(name, arguments).ConfigureAwait(false);
                    activity?.SetTag("tool.source", "mcp");
                    return mcpResult;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "MCP tool execution failed for {ToolName}, falling back to built-in", name);
                    activity?.SetTag("tool.source", "mcp-fallback-error");
                }
            }

            // Fall back to built-in tools
            string result;

            switch (name)
            {
                case "GetDateTime":
                case "GetCurrentDateTime":
                    result = await ExecuteGetDateTimeAsync(arguments);
                    activity?.SetTag("tool.source", "builtin");
                    break;

                case "GetWeather":
                case "GetCurrentWeather":
                    result = await ExecuteGetWeatherAsync(arguments);
                    activity?.SetTag("tool.source", "builtin");
                    break;

                default:
                    _logger.LogWarning("Unknown tool requested: {ToolName}", name);
                    result = $"Error: Tool '{name}' not found.";
                    activity?.SetTag("tool.source", "unknown");
                    break;
            }

            _logger.LogInformation("Tool execution completed. Result: {Result}", result);
            activity?.SetTag("tool.result", result);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing tool {ToolName}", name);
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            return $"Error executing tool: {ex.Message}";
        }
    }

    #endregion

    #region Private Tool Implementations

    /// <summary>
    /// Executes the GetDateTime tool to return current date and time.
    /// </summary>
    /// <param name="arguments">JSON arguments containing optional timezone.</param>
    /// <returns>The formatted date and time string.</returns>
    private Task<string> ExecuteGetDateTimeAsync(string arguments)
    {
        try
        {
            string? timezone = null;

            if (!string.IsNullOrWhiteSpace(arguments))
            {
                using var doc = JsonDocument.Parse(arguments);
                if (doc.RootElement.TryGetProperty("timezone", out var tzElement))
                {
                    timezone = tzElement.GetString();
                }
            }

            DateTime dateTime;
            string timezoneName;

            if (!string.IsNullOrWhiteSpace(timezone))
            {
                try
                {
                    var tz = TimeZoneInfo.FindSystemTimeZoneById(timezone);
                    dateTime = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
                    timezoneName = tz.DisplayName;
                }
                catch (TimeZoneNotFoundException)
                {
                    // Try IANA timezone conversion for cross-platform support
                    try
                    {
                        var tz = TimeZoneInfo.FindSystemTimeZoneById(ConvertIanaToWindows(timezone));
                        dateTime = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
                        timezoneName = timezone;
                    }
                    catch
                    {
                        dateTime = DateTime.Now;
                        timezoneName = TimeZoneInfo.Local.DisplayName;
                        _logger.LogWarning("Unknown timezone {Timezone}, using local time", timezone);
                    }
                }
            }
            else
            {
                dateTime = DateTime.Now;
                timezoneName = TimeZoneInfo.Local.DisplayName;
            }

            var result = $"The current date and time is {dateTime:dddd, MMMM d, yyyy 'at' h:mm tt} ({timezoneName})";
            return Task.FromResult(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting date/time");
            return Task.FromResult($"The current date and time is {DateTime.Now:F}");
        }
    }

    /// <summary>
    /// Executes the GetWeather tool using the Open-Meteo free API (no API key required).
    /// </summary>
    /// <param name="arguments">JSON arguments containing location and optional unit.</param>
    /// <returns>The weather information string.</returns>
    private async Task<string> ExecuteGetWeatherAsync(string arguments)
    {
        string location = "Rome";
        string unit = "celsius";

        try
        {
            if (!string.IsNullOrWhiteSpace(arguments))
            {
                using var doc = JsonDocument.Parse(arguments);
                if (doc.RootElement.TryGetProperty("location", out var locElement))
                {
                    location = locElement.GetString() ?? "Rome";
                }
                if (doc.RootElement.TryGetProperty("unit", out var unitElement))
                {
                    unit = unitElement.GetString() ?? "celsius";
                }
            }
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse weather arguments, using defaults");
        }

        _logger.LogInformation("Getting weather for location: {Location}, unit: {Unit}", location, unit);

        try
        {
            // Step 1: Geocode the location using Open-Meteo Geocoding API
            var (latitude, longitude, resolvedLocation) = await GeocodeLocationAsync(location);

            if (latitude == 0 && longitude == 0)
            {
                return $"I couldn't find the location '{location}'. Please try a different city name.";
            }

            // Step 2: Get weather data using Open-Meteo Weather API
            var temperatureUnit = unit.ToLowerInvariant() == "fahrenheit" ? "fahrenheit" : "celsius";
            var weatherUrl = $"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}" +
                            $"&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
                            $"&temperature_unit={temperatureUnit}&wind_speed_unit=kmh";

            _logger.LogDebug("Fetching weather from: {Url}", weatherUrl);

            var weatherResponse = await _httpClient.GetStringAsync(weatherUrl);
            using var weatherDoc = JsonDocument.Parse(weatherResponse);

            var current = weatherDoc.RootElement.GetProperty("current");
            var temperature = current.GetProperty("temperature_2m").GetDouble();
            var humidity = current.GetProperty("relative_humidity_2m").GetInt32();
            var weatherCode = current.GetProperty("weather_code").GetInt32();
            var windSpeed = current.GetProperty("wind_speed_10m").GetDouble();

            var weatherDescription = GetWeatherDescription(weatherCode);
            var unitSymbol = temperatureUnit == "fahrenheit" ? "°F" : "°C";

            var result = $"The current weather in {resolvedLocation} is {weatherDescription} " +
                        $"with a temperature of {temperature:F1}{unitSymbol}, " +
                        $"humidity at {humidity}%, and wind speed of {windSpeed:F1} km/h.";

            _logger.LogInformation("Weather result: {Result}", result);
            return result;
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error getting weather for {Location}", location);
            return $"I'm having trouble getting the weather information right now. Please try again later.";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting weather for {Location}", location);
            return $"I couldn't retrieve the weather for {location}. Please try again.";
        }
    }

    /// <summary>
    /// Geocodes a location name to coordinates using Open-Meteo Geocoding API.
    /// </summary>
    /// <param name="location">The location name to geocode.</param>
    /// <returns>A tuple containing latitude, longitude, and resolved location name.</returns>
    private async Task<(double Latitude, double Longitude, string ResolvedLocation)> GeocodeLocationAsync(string location)
    {
        var geocodeUrl = $"https://geocoding-api.open-meteo.com/v1/search?name={Uri.EscapeDataString(location)}&count=1&language=en&format=json";

        _logger.LogDebug("Geocoding location: {Location}", location);

        var geocodeResponse = await _httpClient.GetStringAsync(geocodeUrl);
        using var geocodeDoc = JsonDocument.Parse(geocodeResponse);

        if (!geocodeDoc.RootElement.TryGetProperty("results", out var results) ||
            results.GetArrayLength() == 0)
        {
            _logger.LogWarning("No geocoding results for location: {Location}", location);
            return (0, 0, location);
        }

        var firstResult = results[0];
        var latitude = firstResult.GetProperty("latitude").GetDouble();
        var longitude = firstResult.GetProperty("longitude").GetDouble();
        var name = firstResult.GetProperty("name").GetString() ?? location;

        var country = firstResult.TryGetProperty("country", out var countryElement)
            ? countryElement.GetString()
            : null;

        var resolvedLocation = !string.IsNullOrEmpty(country) ? $"{name}, {country}" : name;

        _logger.LogDebug("Geocoded {Location} to ({Lat}, {Lon}) - {Resolved}",
            location, latitude, longitude, resolvedLocation);

        return (latitude, longitude, resolvedLocation);
    }

    /// <summary>
    /// Converts WMO weather codes to human-readable descriptions.
    /// See: https://open-meteo.com/en/docs#weathervariables
    /// </summary>
    /// <param name="code">The WMO weather code.</param>
    /// <returns>A human-readable weather description.</returns>
    private static string GetWeatherDescription(int code)
    {
        return code switch
        {
            0 => "clear sky",
            1 => "mainly clear",
            2 => "partly cloudy",
            3 => "overcast",
            45 => "foggy",
            48 => "depositing rime fog",
            51 => "light drizzle",
            53 => "moderate drizzle",
            55 => "dense drizzle",
            56 => "light freezing drizzle",
            57 => "dense freezing drizzle",
            61 => "slight rain",
            63 => "moderate rain",
            65 => "heavy rain",
            66 => "light freezing rain",
            67 => "heavy freezing rain",
            71 => "slight snow fall",
            73 => "moderate snow fall",
            75 => "heavy snow fall",
            77 => "snow grains",
            80 => "slight rain showers",
            81 => "moderate rain showers",
            82 => "violent rain showers",
            85 => "slight snow showers",
            86 => "heavy snow showers",
            95 => "thunderstorm",
            96 => "thunderstorm with slight hail",
            99 => "thunderstorm with heavy hail",
            _ => "unknown conditions"
        };
    }

    /// <summary>
    /// Converts IANA timezone identifiers to Windows timezone identifiers.
    /// </summary>
    /// <param name="ianaTimezone">The IANA timezone identifier.</param>
    /// <returns>The Windows timezone identifier.</returns>
    private static string ConvertIanaToWindows(string ianaTimezone)
    {
        // Common IANA to Windows timezone mappings
        var mappings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Europe/Rome"] = "W. Europe Standard Time",
            ["Europe/London"] = "GMT Standard Time",
            ["Europe/Paris"] = "Romance Standard Time",
            ["Europe/Berlin"] = "W. Europe Standard Time",
            ["America/New_York"] = "Eastern Standard Time",
            ["America/Chicago"] = "Central Standard Time",
            ["America/Denver"] = "Mountain Standard Time",
            ["America/Los_Angeles"] = "Pacific Standard Time",
            ["Asia/Tokyo"] = "Tokyo Standard Time",
            ["Asia/Shanghai"] = "China Standard Time",
            ["Australia/Sydney"] = "AUS Eastern Standard Time",
            ["UTC"] = "UTC"
        };

        return mappings.TryGetValue(ianaTimezone, out var windowsTimezone)
            ? windowsTimezone
            : ianaTimezone;
    }

    #endregion

    #region Disposal

    /// <summary>
    /// Disposes of resources used by the tool handler, including the MCP client connection.
    /// </summary>
    public async ValueTask DisposeAsync()
    {
        if (_mcpClient != null)
        {
            await _mcpClient.DisposeAsync().ConfigureAwait(false);
            _logger.LogInformation("MCP client disposed");
        }

        _httpClient?.Dispose();
    }

    #endregion
}
