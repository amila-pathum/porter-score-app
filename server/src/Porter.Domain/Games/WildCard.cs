using Porter.Domain.Common;

namespace Porter.Domain.Games;

/// <summary>
/// Confirmed wild-card progression: Deal 1 Ace, Deals 2–10 by number, 11 Jack, 12 Queen, 13 King.
/// Shown as context only. Porter never enforces card play.
/// </summary>
public static class WildCard
{
    public static string ForDeal(int dealNumber) => dealNumber switch
    {
        1 => "Ace",
        >= 2 and <= 10 => dealNumber.ToString(),
        11 => "Jack",
        12 => "Queen",
        13 => "King",
        _ => throw new ArgumentOutOfRangeException(nameof(dealNumber), dealNumber,
            $"Deal number must be 1–{GameRules.DealsPerGame}."),
    };
}
