using ModelContextProtocol.Server;
using System.ComponentModel;
using System.Net.Http;
using System.Text.Json;
using System;
using Microsoft.Extensions.Http;

namespace mcpServer.Tools
{
    [McpServerToolType]
    public class WeatherTools
    {
        private readonly IHttpClientFactory _httpClientFactory;

        public WeatherTools(IHttpClientFactory httpClientFactory)
        {
            _httpClientFactory = httpClientFactory ?? throw new ArgumentNullException(nameof(httpClientFactory));
        }

        /// <summary>
        /// Gets current weather for a location using the free Open-Meteo API.
        /// </summary>
        /// <param name="location">City name or location (e.g., 'London', 'New York', 'Tokyo')</param>
        /// <returns>Formatted weather information string</returns>
        [McpServerTool]
        [Description("Get current weather for a location using the free Open-Meteo API")]
        [McpMeta("category", "weather")]
        public async Task<string> GetWeather(
            [Description("City name or location to get weather for (e.g., 'London', 'New York', 'Tokyo')")]
        string location)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(location))
                {
                    return "Error: Location parameter is required";
                }
                var httpClient = _httpClientFactory.CreateClient();

                // Step 1: Geocode the location
                string geoUrl = $"https://geocoding-api.open-meteo.com/v1/search?name={Uri.EscapeDataString(location)}&count=1&language=en&format=json";
                var geoResponse = await httpClient.GetAsync(geoUrl);
                geoResponse.EnsureSuccessStatusCode();

                string geoJson = await geoResponse.Content.ReadAsStringAsync();
                using var geoDoc = JsonDocument.Parse(geoJson);
                var geoRoot = geoDoc.RootElement;

                if (!geoRoot.TryGetProperty("results", out var resultsElement) || resultsElement.GetArrayLength() == 0)
                {
                    return $"Location not found: {location}";
                }

                var firstResult = resultsElement[0];
                double latitude = firstResult.GetProperty("latitude").GetDouble();
                double longitude = firstResult.GetProperty("longitude").GetDouble();
                string name = firstResult.GetProperty("name").GetString() ?? location;
                string country = firstResult.TryGetProperty("country", out var countryElement)
                    ? countryElement.GetString() ?? ""
                    : "";

                // Step 2: Get weather
                string weatherUrl = $"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=celsius&timezone=auto";
                var weatherResponse = await httpClient.GetAsync(weatherUrl);
                weatherResponse.EnsureSuccessStatusCode();

                string weatherJson = await weatherResponse.Content.ReadAsStringAsync();
                using var weatherDoc = JsonDocument.Parse(weatherJson);
                var weatherRoot = weatherDoc.RootElement;

                var current = weatherRoot.GetProperty("current");
                double temperature = current.GetProperty("temperature_2m").GetDouble();
                double windSpeed = current.GetProperty("wind_speed_10m").GetDouble();
                int weatherCode = current.GetProperty("weather_code").GetInt32();

                string weatherDescription = GetWeatherDescription(weatherCode);
                return $"Weather in {name}{(string.IsNullOrEmpty(country) ? "" : ", " + country)}: {temperature}°C, {weatherDescription}, Wind: {windSpeed} km/h";
            }
            catch (Exception ex)
            {
                return $"Error getting weather: {ex.Message}";
            }
        }

        /// <summary>
        /// Converts WMO weather codes to human-readable descriptions.
        /// </summary>
        private static string GetWeatherDescription(int code)
        {
            return code switch
            {
                0 => "Clear sky",
                1 or 2 => "Mostly clear",
                3 => "Overcast",
                45 or 48 => "Foggy",
                51 or 53 or 55 => "Light drizzle",
                61 or 63 or 65 => "Rainy",
                71 or 73 or 75 => "Snowy",
                80 or 81 or 82 => "Rain showers",
                85 or 86 => "Snow showers",
                95 or 96 or 99 => "Thunderstorm",
                _ => $"Weather code {code}"
            };
        }

    }
}
