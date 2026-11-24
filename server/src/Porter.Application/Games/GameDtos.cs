using System.ComponentModel.DataAnnotations;

namespace Porter.Application.Games;

public sealed record PlayerRefDto(Guid Id, string Name, string AvatarColor);

public sealed record GamePlayerStateDto(Guid PlayerId, string Name, string AvatarColor, int Seat, int Total, int Rank, bool IsTied);

public sealed record StandingDto(Guid PlayerId, string Name, string AvatarColor, int Total, int Rank, bool IsTied, int BehindLeader);

public sealed record DealScoreDto(Guid PlayerId, int Score);

public sealed record DealDto(int Number, string WildCard, IReadOnlyList<DealScoreDto> Scores, int Sum,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, bool IsEdited);

/// <summary>
/// Complete game state returned by every game read and write. Totals and rankings are computed
/// server-side; the client renders them as-is.
/// </summary>
public sealed record GameStateDto(
    Guid Id,
    string Name,
    string Status,
    string Version,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? CompletedAt,
    int DealsPerGame,
    int CompletedDeals,
    int? NextDealNumber,
    string? NextWildCard,
    IReadOnlyList<GamePlayerStateDto> Players,
    IReadOnlyList<StandingDto> Standings,
    IReadOnlyList<DealDto> Deals,
    IReadOnlyList<Guid> WinnerIds);

public sealed record GameLeaderDto(IReadOnlyList<string> Names, int Total);

public sealed record GameSummaryDto(
    Guid Id,
    string Name,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    DateTimeOffset? CompletedAt,
    int CompletedDeals,
    int? NextDealNumber,
    IReadOnlyList<PlayerRefDto> Players,
    GameLeaderDto? Leader);

public sealed record GameStatusCounts(int All, int Draft, int Active, int Completed);

public sealed record GameListResult(IReadOnlyList<GameSummaryDto> Items, int Page, int PageSize, int TotalCount, GameStatusCounts Counts);

public sealed class GameListQuery
{
    /// <summary>draft | active | completed; omitted for all.</summary>
    public string? Status { get; init; }
    /// <summary>Matches game name or any participant name, case-insensitive.</summary>
    public string? Q { get; init; }
    /// <summary>activity (default) | newest | oldest | name</summary>
    public string? Sort { get; init; }
    [Range(1, int.MaxValue)] public int Page { get; init; } = 1;
    [Range(1, 100)] public int PageSize { get; init; } = 20;
}

public sealed class CreateGameRequest
{
    /// <summary>Client-generated id. Re-sending the same id returns the existing game (idempotent retry).</summary>
    public Guid? Id { get; init; }
    [StringLength(60)] public string? Name { get; init; }
    [Required] public List<Guid> PlayerIds { get; init; } = [];
    /// <summary>"Create &amp; start": skips the setup screen.</summary>
    public bool Start { get; init; }
}

public sealed class UpdateGameRequest
{
    [StringLength(60)] public string? Name { get; init; }
    public List<Guid>? PlayerIds { get; init; }
    public string? ExpectedVersion { get; init; }
}

public sealed class SaveDealScoreRequest
{
    [Required] public Guid PlayerId { get; init; }
    /// <summary>Nullable so a missing value is reported as a validation error rather than defaulting to 0.</summary>
    [Required] public int? Score { get; init; }
}

public sealed class SaveDealRequest
{
    [Required] public List<SaveDealScoreRequest> Scores { get; init; } = [];
    /// <summary>The game version the client last saw. A mismatch returns 409 instead of overwriting.</summary>
    public string? ExpectedVersion { get; init; }
}

public sealed record SaveDealResult(GameStateDto Game, string Outcome);
