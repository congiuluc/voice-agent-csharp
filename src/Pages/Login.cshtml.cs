using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Security.Claims;
using VoiceAgentCSharp.Helpers;

namespace VoiceAgentCSharp.Pages
{
    public class LoginModel : PageModel
    {
        private readonly IConfiguration _configuration;

        public LoginModel(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public string ErrorMessage { get; set; } = string.Empty;

        public void OnGet()
        {
        }

        public async Task<IActionResult> OnPostAsync(string username, string password)
        {
            var configUsername = _configuration["Security:Authentication:Username"] ?? "admin";
            var configPasswordHash = _configuration["Security:Authentication:PasswordHash"];

            bool isValid = false;

            if (username == configUsername)
            {
                if (!string.IsNullOrEmpty(configPasswordHash))
                {
                    isValid = PasswordHasher.VerifyPassword(password, configPasswordHash);
                }
                else
                {
                    // Fallback for legacy/dev config if hash is missing (not recommended for prod)
                    var configPassword = _configuration["Security:Authentication:Password"];
                    if (!string.IsNullOrEmpty(configPassword) && password == configPassword)
                    {
                        isValid = true;
                    }
                }
            }

            if (isValid)
            {
                var claims = new List<Claim>
                {
                    new Claim(ClaimTypes.Name, username),
                    new Claim(ClaimTypes.Role, "Admin")
                };

                var claimsIdentity = new ClaimsIdentity(
                    claims, CookieAuthenticationDefaults.AuthenticationScheme);

                var authProperties = new AuthenticationProperties
                {
                    IsPersistent = true,
                };

                await HttpContext.SignInAsync(
                    CookieAuthenticationDefaults.AuthenticationScheme,
                    new ClaimsPrincipal(claimsIdentity),
                    authProperties);

                return RedirectToPage("/Index");
            }

            ErrorMessage = "Invalid username or password.";
            return Page();
        }
    }
}
