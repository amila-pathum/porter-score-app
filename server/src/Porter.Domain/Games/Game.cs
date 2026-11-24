using Porter.Domain.Common;

namespace Porter.Domain.Games;

public enum DealSaveKind
{
    Created,
    Corrected,
    Unchanged,
}

/// <summary>
/// Aggregate root for one Porter game: participants in seat order, up to 13 deals, and status.
/// All scoring rules are enforced here, independent of persistence or transport.
/// </summary>
public sealed class Game
{
    private readonly List<GamePlayer> _players = [];
    private readonly List<Deal> _deals = [];

    private Game() { }

    public Guid Id { get; private set; }
    public Guid OwnerUserId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public GameStatus Status { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? StartedAt { get; private set; }
    public DateTimeOffset? CompletedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; }

    /// <summary>Concurrency token. Mapped to PostgreSQL <c>xmin</c>; changes on every row update.</summary>
    public uint Version { get; private set; }

    /// <summary>Participants ordered by seat. Seat order is the score-entry row order.</summary>
    public IReadOnlyList<GamePlayer> Players => _players.OrderBy(p => p.Seat).ToList();

    public IReadOnlyList<Deal> Deals => _deals.OrderBy(d => d.Number).ToList();

    public int CompletedDealCount => _deals.Count;

    /// <summary>The next deal to enter, or null when the game is not active.</summary>
    public int? NextDealNumber =>
        Status == GameStatus.Active && _deals.Count < GameRules.DealsPerGame ? _deals.Count + 1 : null;

    public static Game Create(Guid id, Guid ownerUserId, string name, IReadOnlyList<Guid> playerIdsInSeatOrder, DateTimeOffset now)
    {
        var game = new Game
        {
            Id = id,
            OwnerUserId = ownerUserId,
            Status = GameStatus.Draft,
            CreatedAt = now,
            UpdatedAt = now,
        };
        game.Rename(name, now);
        game.AssignPlayers(playerIdsInSeatOrder);
        return game;
    }

    public void Rename(string name, DateTimeOffset now)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length is 0 or > GameRules.MaxGameNameLength)
            throw new DomainException(DomainErrors.GameNameInvalid,
                $"Game name must be 1–{GameRules.MaxGameNameLength} characters.", "name");
        Name = trimmed;
        UpdatedAt = now;
    }

    /// <summary>Replaces participants. Only allowed before the game starts.</summary>
    public void SetPlayers(IReadOnlyList<Guid> playerIdsInSeatOrder, DateTimeOffset now)
    {
        if (Status != GameStatus.Draft)
            throw new DomainException(DomainErrors.NotDraft, "Players can't change after the game has started.", "playerIds");
        AssignPlayers(playerIdsInSeatOrder);
        UpdatedAt = now;
    }

    public void Start(DateTimeOffset now)
    {
        if (Status != GameStatus.Draft)
            throw new DomainException(DomainErrors.NotDraft, "This game has already started.");
        Status = GameStatus.Active;
        StartedAt = now;
        UpdatedAt = now;
    }

    /// <summary>
    /// Saves deal <paramref name="number"/>. If it doesn't exist yet it must be the next deal in sequence
    /// and the game must be active; saving Deal 13 completes the game. If it exists, its scores are corrected.
    /// </summary>
    public DealSaveKind SaveDeal(int number, IReadOnlyDictionary<Guid, int> scores, Guid userId, DateTimeOffset now)
    {
        if (number is < 1 or > GameRules.DealsPerGame)
            throw new DomainException(DomainErrors.DealNumberInvalid,
                $"Deal number must be between 1 and {GameRules.DealsPerGame}.", "dealNumber");
        if (Status == GameStatus.Draft)
            throw new DomainException(DomainErrors.NotStarted, "Start the game before entering scores.");

        ValidateScores(scores);

        var existing = _deals.FirstOrDefault(d => d.Number == number);
        if (existing is not null)
        {
            var changed = existing.Correct(scores, userId, now);
            if (!changed) return DealSaveKind.Unchanged;
            UpdatedAt = now;
            return DealSaveKind.Corrected;
        }

        if (Status == GameStatus.Completed)
            throw new DomainException(DomainErrors.GameCompleted, "This game is already complete.");
        if (number != _deals.Count + 1)
            throw new DomainException(DomainErrors.DealOutOfSequence,
                $"Deal {_deals.Count + 1} is next. Deals are entered in order.", "dealNumber");

        _deals.Add(new Deal(Guid.NewGuid(), Id, number, scores, userId, now));
        UpdatedAt = now;

        if (number == GameRules.DealsPerGame)
        {
            Status = GameStatus.Completed;
            CompletedAt = now;
        }

        return DealSaveKind.Created;
    }

    /// <summary>Cumulative totals in seat order. Players with no deals yet have 0.</summary>
    public IReadOnlyList<PlayerTotal> Totals() =>
        Players.Select(p => new PlayerTotal(p.PlayerId, _deals.Sum(d => d.ScoreFor(p.PlayerId)))).ToList();

    public IReadOnlyList<Standing> Standings() => Ranking.Rank(Totals());

    public void MarkDeleted(DateTimeOffset now)
    {
        DeletedAt = now;
        UpdatedAt = now;
    }

    private void AssignPlayers(IReadOnlyList<Guid> playerIds)
    {
        if (playerIds.Count is < GameRules.MinPlayers or > GameRules.MaxPlayers)
            throw new DomainException(DomainErrors.PlayerCount,
                $"A game needs {GameRules.MinPlayers}–{GameRules.MaxPlayers} players.", "playerIds");
        if (playerIds.Distinct().Count() != playerIds.Count)
            throw new DomainException(DomainErrors.DuplicatePlayer, "Each player can only take one seat.", "playerIds");

        // Re-use existing participant rows so a player's (GameId, PlayerId) key is never tracked twice.
        _players.RemoveAll(p => !playerIds.Contains(p.PlayerId));
        for (var i = 0; i < playerIds.Count; i++)
        {
            var existing = _players.FirstOrDefault(p => p.PlayerId == playerIds[i]);
            if (existing is null) _players.Add(new GamePlayer(Id, playerIds[i], seat: i + 1));
            else existing.Seat = i + 1;
        }
    }

    private void ValidateScores(IReadOnlyDictionary<Guid, int> scores)
    {
        var participantIds = _players.Select(p => p.PlayerId).ToHashSet();

        if (scores.Keys.Any(id => !participantIds.Contains(id)))
            throw new DomainException(DomainErrors.UnknownPlayer, "A score was sent for a player who isn't in this game.", "scores");

        foreach (var player in Players)
        {
            var field = $"scores[{player.Seat - 1}].score";
            if (!scores.TryGetValue(player.PlayerId, out var score))
                throw new DomainException(DomainErrors.ScoreMissing, "Every player needs a score for this deal.", field);
            if (score < 0)
                throw new DomainException(DomainErrors.ScoreNegative, "Scores can't be negative.", field);
        }
    }
}

public sealed class GamePlayer
{
    private GamePlayer() { }

    internal GamePlayer(Guid gameId, Guid playerId, int seat)
    {
        GameId = gameId;
        PlayerId = playerId;
        Seat = seat;
    }

    public Guid GameId { get; private set; }
    public Guid PlayerId { get; private set; }
    /// <summary>1-based seat; also the score-entry row order.</summary>
    public int Seat { get; internal set; }
}
