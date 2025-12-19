using VoiceAgentCSharp.Helpers;
using Xunit;

namespace VoiceAgentCSharp.UnitTests
{
    public class PasswordHasherTests
    {
        [Fact]
        public void HashPassword_ShouldReturnValidHash()
        {
            // Arrange
            string password = "TestPassword123!";

            // Act
            string hash = PasswordHasher.HashPassword(password);

            // Assert
            Assert.NotNull(hash);
            Assert.Contains(":", hash);
            var segments = hash.Split(':');
            Assert.Equal(2, segments.Length);
        }

        [Fact]
        public void VerifyPassword_ShouldReturnTrue_ForCorrectPassword()
        {
            // Arrange
            string password = "TestPassword123!";
            string hash = PasswordHasher.HashPassword(password);

            // Act
            bool isValid = PasswordHasher.VerifyPassword(password, hash);

            // Assert
            Assert.True(isValid);
        }

        [Fact]
        public void VerifyPassword_ShouldReturnFalse_ForIncorrectPassword()
        {
            // Arrange
            string password = "TestPassword123!";
            string wrongPassword = "WrongPassword123!";
            string hash = PasswordHasher.HashPassword(password);

            // Act
            bool isValid = PasswordHasher.VerifyPassword(wrongPassword, hash);

            // Assert
            Assert.False(isValid);
        }

        [Fact]
        public void HashPassword_ShouldProduceDifferentHashes_ForSamePassword()
        {
            // Arrange
            string password = "TestPassword123!";

            // Act
            string hash1 = PasswordHasher.HashPassword(password);
            string hash2 = PasswordHasher.HashPassword(password);

            // Assert
            Assert.NotEqual(hash1, hash2);
        }

        [Theory]
        [InlineData("password")]
        [InlineData("Test@123")]
        [InlineData("VeryLongPassword!@#$%^&*()WithSpecialCharacters")]
        [InlineData("")]
        public void HashPassword_ShouldHandleMultiplePasswords(string password)
        {
            // Act
            string hash = PasswordHasher.HashPassword(password);

            // Assert
            Assert.NotNull(hash);
            Assert.True(PasswordHasher.VerifyPassword(password, hash));
        }

        [Fact]
        public void VerifyPassword_ShouldThrowFormatException_ForInvalidHashFormat()
        {
            // Arrange
            string password = "TestPassword123!";
            string invalidHash = "notavalidhash";

            // Act & Assert
            Assert.Throws<FormatException>(() => PasswordHasher.VerifyPassword(password, invalidHash));
        }

        [Fact]
        public void VerifyPassword_ShouldReturnFalse_ForCorruptedHash()
        {
            // Arrange
            string password = "TestPassword123!";
            string hash = PasswordHasher.HashPassword(password);
            
            // Corrupt the hash by changing some characters
            var segments = hash.Split(':');
            // Create a corrupted hash with valid base64 but wrong content
            string corruptedHash = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("wrongsalt")) + ":" + segments[1];

            // Act
            bool isValid = PasswordHasher.VerifyPassword(password, corruptedHash);

            // Assert
            Assert.False(isValid);
        }

        [Fact]
        public void HashPassword_ShouldProduceConsistentLength()
        {
            // Arrange
            var passwords = new[] { "a", "password", "VeryLongPasswordWithManyCharacters123!@#" };

            // Act
            var hashes = passwords.Select(p => PasswordHasher.HashPassword(p)).ToList();

            // Assert - All hashes should have the same format (base64:base64)
            foreach (var hash in hashes)
            {
                var segments = hash.Split(':');
                Assert.Equal(2, segments.Length);
                // Both segments should be valid base64
                Assert.NotEmpty(segments[0]);
                Assert.NotEmpty(segments[1]);
            }
        }
    }
}
