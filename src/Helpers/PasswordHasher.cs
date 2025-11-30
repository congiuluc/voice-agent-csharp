using System.Security.Cryptography;
using System.Text;

namespace VoiceAgentCSharp.Helpers
{
    public static class PasswordHasher
    {
        private const int SaltSize = 16; // 128 bit
        private const int KeySize = 32; // 256 bit
        private const int Iterations = 100000;
        private static readonly HashAlgorithmName _algorithm = HashAlgorithmName.SHA256;

        private const char SegmentDelimiter = ':';

        public static string HashPassword(string input)
        {
            var salt = RandomNumberGenerator.GetBytes(SaltSize);
            var hash = Rfc2898DeriveBytes.Pbkdf2(
                input,
                salt,
                Iterations,
                _algorithm,
                KeySize
            );

            return string.Join(
                SegmentDelimiter,
                Convert.ToBase64String(salt),
                Convert.ToBase64String(hash)
            );
        }

        public static bool VerifyPassword(string input, string hashString)
        {
            var segments = hashString.Split(SegmentDelimiter);
            var salt = Convert.FromBase64String(segments[0]);
            var originalHash = Convert.FromBase64String(segments[1]);

            var inputHash = Rfc2898DeriveBytes.Pbkdf2(
                input,
                salt,
                Iterations,
                _algorithm,
                KeySize
            );

            return CryptographicOperations.FixedTimeEquals(inputHash, originalHash);
        }
    }
}
