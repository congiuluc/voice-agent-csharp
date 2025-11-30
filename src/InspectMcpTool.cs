using System;
using System.Reflection;
using ModelContextProtocol.Client;

namespace VoiceAgentCSharp
{
    public class Inspector
    {
        public static void Inspect()
        {
            var type = typeof(McpClientTool);
            Console.WriteLine($"Type: {type.FullName}");
            foreach (var prop in type.GetProperties())
            {
                Console.WriteLine($"Property: {prop.Name} ({prop.PropertyType.Name})");
            }
        }
    }
}
