namespace Porter.Domain.Games;

public sealed record PlayerTotal(Guid PlayerId, int Total);

/// <param name="IsTied">True when another player shares this total (and therefore this rank).</param>
public sealed record Standing(Guid PlayerId, int Total, int Rank, bool IsTied);

/// <summary>
/// Competition ranking ("1224"): lowest total ranks first, equal totals share a rank and the
/// following rank is skipped. 20, 20, 25, 30 → 1, 1, 3, 4. No tie-breakers are applied.
/// </summary>
public static class Ranking
{
    /// <remarks>Output is ordered by rank; ties keep the input order (seat order in practice).</remarks>
    public static IReadOnlyList<Standing> Rank(IReadOnlyCollection<PlayerTotal> totals) =>
        totals
            .Select(t => new Standing(
                t.PlayerId,
                t.Total,
                Rank: 1 + totals.Count(o => o.Total < t.Total),
                IsTied: totals.Count(o => o.Total == t.Total) > 1))
            .OrderBy(s => s.Rank)
            .ToList();
}
