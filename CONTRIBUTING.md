# Contributing to Voice Agent C#

Thank you for your interest in contributing to this project! We welcome contributions from the community.

## Getting Started

1. **Fork the repository** - Create your own fork of the project
2. **Clone your fork** - `git clone https://github.com/your-username/voice-agent-csharp.git`
3. **Create a branch** - `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- [.NET 10.0 SDK](https://dotnet.microsoft.com/download) or later
- [Visual Studio 2022](https://visualstudio.microsoft.com/) or [VS Code](https://code.visualstudio.com/)
- [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli)
- [Docker](https://www.docker.com/get-started) (optional, for containerized development)

### Building the Project

```bash
dotnet restore
dotnet build
```

### Running Tests

```bash
dotnet test
```

## How to Contribute

### Reporting Bugs

- Check if the issue already exists in the [Issues](../../issues) section
- If not, create a new issue with a clear title and description
- Include steps to reproduce the bug
- Include the expected and actual behavior
- Add relevant logs, screenshots, or code snippets

### Suggesting Features

- Open a new issue with the `enhancement` label
- Clearly describe the feature and its use case
- Explain why this feature would be beneficial

### Submitting Pull Requests

1. Ensure your code follows the project's coding standards
2. Update documentation if necessary
3. Add or update tests as appropriate
4. Ensure all tests pass locally
5. Write clear, descriptive commit messages
6. Submit a pull request with a clear description of the changes

## Code Style Guidelines

- Follow C# coding conventions and .NET naming guidelines
- Use meaningful variable and method names
- Add XML documentation comments for public APIs
- Keep methods focused and concise
- Use async/await patterns where appropriate

## Commit Message Guidelines

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests when relevant

## Code Review Process

1. All submissions require review before merging
2. Reviewers may request changes or improvements
3. Once approved, maintainers will merge your contribution

## License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project (see [LICENSE](LICENSE)).

## Questions?

If you have questions, feel free to open an issue or reach out to the maintainers.

Thank you for contributing! 🎉
