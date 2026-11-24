namespace Porter.Domain.Common;

/// <summary>
/// A business rule was violated. <see cref="Code"/> is a stable machine-readable identifier
/// (e.g. <c>deal.out_of_sequence</c>); <see cref="Field"/> optionally names the offending input.
/// </summary>
public sealed class DomainException(string code, string message, string? field = null) : Exception(message)
{
    public string Code { get; } = code;
    public string? Field { get; } = field;
}

public static class DomainErrors
{
    public const string GameNameInvalid = "game.name_invalid";
    public const string PlayerCount = "game.player_count";
    public const string DuplicatePlayer = "game.duplicate_player";
    public const string NotDraft = "game.not_draft";
    public const string NotStarted = "game.not_started";
    public const string GameCompleted = "game.completed";
    public const string DealNumberInvalid = "deal.number_invalid";
    public const string DealOutOfSequence = "deal.out_of_sequence";
    public const string ScoreMissing = "deal.score_missing";
    public const string ScoreNegative = "deal.score_negative";
    public const string UnknownPlayer = "deal.unknown_player";
    public const string PlayerNameInvalid = "player.name_invalid";
}
