<#
.SYNOPSIS
Generates a PBKDF2 hash for the Voice Agent application.

.DESCRIPTION
This script generates a secure password hash using PBKDF2 with HMACSHA256, 
compatible with the VoiceAgentCSharp.Helpers.PasswordHasher class.
It uses the exact same C# logic to ensure compatibility.

.PARAMETER Password
The password to hash. If not provided, you will be prompted to enter it.

.EXAMPLE
.\generate-password-hash.ps1 -Password "MySecretPassword"
#>

param (
    [Parameter(Mandatory=$false)]
    [string]$Password
)

if ([string]::IsNullOrWhiteSpace($Password)) {
    $Password = Read-Host -Prompt "Enter password to hash" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
    $Password = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
}

$csharpCode = @"
using System;
using System.Security.Cryptography;

public class Hasher
{
    public static string GenerateHash(string password)
    {
        // Generate a random salt
        byte[] salt = RandomNumberGenerator.GetBytes(16); // 128-bit salt

        // Hash the password using PBKDF2
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            100000, // Iterations
            HashAlgorithmName.SHA256,
            32 // 256-bit hash
        );

        // Combine salt and hash
        return Convert.ToBase64String(salt) + ":" + Convert.ToBase64String(hash);
    }
}
"@

Add-Type -TypeDefinition $csharpCode -Language CSharp

$hash = [Hasher]::GenerateHash($Password)

Write-Host "Generated Hash for appsettings.json:" -ForegroundColor Green
Write-Host $hash -ForegroundColor Cyan
Write-Host ""
Write-Host "Update your appsettings.json with this value in Security:Authentication:PasswordHash" -ForegroundColor Gray
