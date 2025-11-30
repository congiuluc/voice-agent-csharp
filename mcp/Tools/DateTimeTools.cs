using ModelContextProtocol.Server;
using System.ComponentModel;

namespace mcpServer.Tools
{
    [McpServerToolType]
    public class DateTimeTools
    {

        /// <summary>
        /// Gets the current date and time, optionally in a specific timezone.
        /// </summary>
        /// <param name="timezone">Optional IANA timezone (e.g., 'America/New_York'). Defaults to UTC.</param>
        /// <returns>Formatted date and time string</returns>
        [McpServerTool]
        [Description("Get the current date and time, optionally in a specific timezone")]
        public static string GetDateTime(
            [Description("Optional IANA timezone (e.g., 'America/New_York', 'Europe/London'). Defaults to UTC.")]
        string? timezone = null)
        {
            try
            {
                timezone = timezone ?? "UTC";
                DateTime utcNow = DateTime.UtcNow;
                DateTime targetTime;

                if (timezone == "UTC" || timezone == "GMT")
                {
                    targetTime = utcNow;
                }
                else
                {
                    try
                    {
                        TimeZoneInfo tzInfo = TimeZoneInfo.FindSystemTimeZoneById(timezone);
                        targetTime = TimeZoneInfo.ConvertTime(utcNow, TimeZoneInfo.Utc, tzInfo);
                    }
                    catch (TimeZoneNotFoundException)
                    {
                        targetTime = utcNow;
                        timezone = "UTC (invalid timezone, defaulting)";
                    }
                }

                return $"{targetTime:yyyy-MM-dd HH:mm:ss} {timezone}";
            }
            catch (Exception ex)
            {
                return $"Error getting date/time: {ex.Message}";
            }
        }
    }
}