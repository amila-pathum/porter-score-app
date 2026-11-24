using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.EntityFrameworkCore;
using Porter.Application.Common;
using Porter.Domain.Common;

namespace Porter.Api.Infrastructure;

/// <summary>
/// Maps application and domain exceptions to RFC 7807 Problem Details. Unexpected exceptions become a
/// generic 500 without internals; details are logged server-side only.
/// </summary>
public sealed class ApiExceptionHandler(IProblemDetailsService problems, ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    /// <summary>Domain rule violations that describe the game's state rather than bad input → 409.</summary>
    private static readonly HashSet<string> StateConflicts =
    [
        DomainErrors.NotDraft, DomainErrors.NotStarted, DomainErrors.GameCompleted, DomainErrors.DealOutOfSequence,
    ];

    public async ValueTask<bool> TryHandleAsync(HttpContext http, Exception exception, CancellationToken ct)
    {
        ProblemDetails problem = exception switch
        {
            RequestValidationException v => Validation(v.Errors, v.Message),
            DomainException d when StateConflicts.Contains(d.Code) => Problem(StatusCodes.Status409Conflict, "Conflict", d.Message, d.Code),
            DomainException d => Validation(new Dictionary<string, string[]> { [d.Field ?? string.Empty] = [d.Message] }, d.Message, d.Code),
            NotFoundException n => Problem(StatusCodes.Status404NotFound, "Not found", n.Message),
            ConflictException c => Problem(StatusCodes.Status409Conflict, "Conflict", c.Message, c.Code),
            DbUpdateConcurrencyException => Problem(StatusCodes.Status409Conflict, "Conflict",
                "This was changed on another device. Reload to see the latest.", ConflictCodes.VersionConflict),
            BadHttpRequestException b => Problem(b.StatusCode, "Bad request", "The request could not be read."),
            OperationCanceledException when http.RequestAborted.IsCancellationRequested => Problem(499, "Client closed request", null),
            _ => Problem(StatusCodes.Status500InternalServerError, "Something went wrong",
                "An unexpected error occurred. Your data was not changed."),
        };

        if (problem.Status >= 500)
            logger.LogError(exception, "Unhandled exception for {Method} {Path}", http.Request.Method, http.Request.Path);
        else
            logger.LogInformation("Request rejected ({Status}): {Message}", problem.Status, exception.Message);

        http.Response.StatusCode = problem.Status ?? 500;
        return await problems.TryWriteAsync(new ProblemDetailsContext { HttpContext = http, ProblemDetails = problem, Exception = exception });
    }

    private static ProblemDetails Problem(int status, string title, string? detail, string? code = null)
    {
        var p = new ProblemDetails { Status = status, Title = title, Detail = detail };
        if (code is not null) p.Extensions["code"] = code;
        return p;
    }

    private static ValidationProblemDetails Validation(IDictionary<string, string[]> errors, string detail, string? code = null)
    {
        var p = new ValidationProblemDetails(errors)
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "One or more fields are invalid.",
            Detail = detail,
        };
        if (code is not null) p.Extensions["code"] = code;
        return p;
    }
}

public static partial class ModelStateKeys
{
    /// <summary>
    /// Normalises MVC model-state keys ("Scores[0].Score", "$.scores[0].score") to the camelCase JSON paths
    /// the client form uses ("scores[0].score").
    /// </summary>
    public static Dictionary<string, string[]> ToCamelCaseErrors(ModelStateDictionary state) =>
        state.Where(e => e.Value?.Errors.Count > 0)
            // MVC adds a "request is required" entry whenever the body fails to bind; the field errors say more.
            .Where(e => !string.Equals(Normalize(e.Key), "request", StringComparison.OrdinalIgnoreCase) || state.Count == 1)
            .GroupBy(e => Normalize(e.Key))
            .ToDictionary(
                g => g.Key,
                g => g.SelectMany(e => e.Value!.Errors)
                    .Select(err => string.IsNullOrEmpty(err.ErrorMessage) ? "This value is invalid." : Friendly(err.ErrorMessage))
                    .Distinct().ToArray());

    public static string Normalize(string key)
    {
        var k = key.StartsWith("$.", StringComparison.Ordinal) ? key[2..] : key == "$" ? string.Empty : key;
        // Model binding sometimes prefixes the parameter name ("request.Scores[0]").
        k = Regex.Replace(k, "^request\\.", string.Empty, RegexOptions.IgnoreCase);
        return Segment().Replace(k, m => char.ToLowerInvariant(m.Value[0]) + m.Value[1..]);
    }

    private static string Friendly(string message) =>
        message.Contains("could not be converted", StringComparison.Ordinal) || message.Contains("JSON", StringComparison.Ordinal)
            ? "Enter a whole number."
            : message;

    [GeneratedRegex("(?<=^|\\.)[A-Za-z][A-Za-z0-9]*")]
    private static partial Regex Segment();
}
