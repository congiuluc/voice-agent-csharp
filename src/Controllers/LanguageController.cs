using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Mvc;

namespace VoiceAgentCSharp.Controllers;

[ApiController]
[Route("[controller]")]
public class LanguageController : Controller
{
    /// <summary>
    /// Sets the user's language preference and redirects to the return URL.
    /// </summary>
    /// <param name="culture">The culture code (e.g., 'en-US', 'it-IT')</param>
    /// <param name="returnUrl">The URL to redirect to after setting the language</param>
    /// <returns>A redirect to the specified return URL</returns>
    [HttpPost("SetLanguage")]
    public IActionResult SetLanguage([FromForm] string culture, [FromForm] string? returnUrl = null)
    {
        if (!string.IsNullOrEmpty(culture))
        {
            // Set the culture cookie
            Response.Cookies.Append(
                CookieRequestCultureProvider.DefaultCookieName,
                CookieRequestCultureProvider.MakeCookieValue(new RequestCulture(culture)),
                new CookieOptions 
                { 
                    Expires = DateTimeOffset.UtcNow.AddYears(1)
                }
            );
        }

        // Redirect to the return URL or default to home
        return LocalRedirect(!string.IsNullOrEmpty(returnUrl) ? returnUrl : "/");
    }
}
