namespace Porter.Domain.Games;

/// <summary>One physical deal: exactly one score per game participant.</summary>
public sealed class Deal
{
    private readonly List<DealScore> _scores = [];

    private Deal() { }

    internal Deal(Guid id, Guid gameId, int number, IReadOnlyDictionary<Guid, int> scores, Guid userId, DateTimeOffset now)
    {
        Id = id;
        GameId = gameId;
        Number = number;
        CreatedAt = now;
        UpdatedAt = now;
        UpdatedByUserId = userId;
        _scores.AddRange(scores.Select(s => new DealScore(id, s.Key, s.Value)));
    }

    public Guid Id { get; private set; }
    public Guid GameId { get; private set; }
    public int Number { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public Guid UpdatedByUserId { get; private set; }
    public IReadOnlyList<DealScore> Scores => _scores;

    /// <summary>True when the deal has been corrected after it was first saved.</summary>
    public bool IsEdited => UpdatedAt > CreatedAt;

    public int ScoreFor(Guid playerId) => _scores.First(s => s.PlayerId == playerId).Score;

    /// <returns>True when at least one score changed.</returns>
    internal bool Correct(IReadOnlyDictionary<Guid, int> scores, Guid userId, DateTimeOffset now)
    {
        var changed = false;
        foreach (var score in _scores)
        {
            var next = scores[score.PlayerId];
            if (score.Score == next) continue;
            score.Score = next;
            changed = true;
        }

        if (changed)
        {
            UpdatedAt = now;
            UpdatedByUserId = userId;
        }

        return changed;
    }
}

public sealed class DealScore
{
    private DealScore() { }

    internal DealScore(Guid dealId, Guid playerId, int score)
    {
        DealId = dealId;
        PlayerId = playerId;
        Score = score;
    }

    public Guid DealId { get; private set; }
    public Guid PlayerId { get; private set; }
    public int Score { get; internal set; }
}
