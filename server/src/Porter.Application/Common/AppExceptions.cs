namespace Porter.Application.Common;

/// <summary>The resource doesn't exist or isn't owned by the caller (both map to 404, so ownership isn't revealed).</summary>
public sealed class NotFoundException(string message) : Exception(message);

/// <summary>The request conflicts with current state (stale version, wrong status, uniqueness). Maps to 409.</summary>
public sealed class ConflictException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>Input failed validation. Keys are request paths, e.g. <c>scores[2].score</c>. Maps to 400.</summary>
public sealed class RequestValidationException(IDictionary<string, string[]> errors, string message = "One or more fields are invalid.")
    : Exception(message)
{
    public IDictionary<string, string[]> Errors { get; } = errors;

    public static RequestValidationException For(string field, string error) =>
        new(new Dictionary<string, string[]> { [field] = [error] }, error);
}

public static class ConflictCodes
{
    public const string VersionConflict = "game.version_conflict";
    public const string DuplicatePlayerName = "player.duplicate_name";
    public const string PlayerHasGames = "player.has_games";
    public const string GameIdTaken = "game.id_taken";
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);
