using Porter.Domain.Common;

namespace Porter.Domain.Players;

/// <summary>A saved player identity. Players are names a user keeps score for, not accounts.</summary>
public sealed class Player
{
    public static readonly IReadOnlyList<string> AvatarColors = ["teal", "amber", "olive", "slate", "plum", "clay"];

    private Player() { }

    public Guid Id { get; private set; }
    public Guid OwnerUserId { get; private set; }
    public string Name { get; private set; } = string.Empty;
    /// <summary>Upper-invariant copy of <see cref="Name"/>, used for per-owner case-insensitive uniqueness.</summary>
    public string NormalizedName { get; private set; } = string.Empty;
    public string AvatarColor { get; private set; } = "teal";
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    public static Player Create(Guid id, Guid ownerUserId, string name, string? avatarColor, DateTimeOffset now)
    {
        var player = new Player { Id = id, OwnerUserId = ownerUserId, CreatedAt = now };
        player.Rename(name, now);
        player.SetAvatarColor(avatarColor ?? DefaultColorFor(id));
        return player;
    }

    public void Rename(string name, DateTimeOffset now)
    {
        var trimmed = (name ?? string.Empty).Trim();
        if (trimmed.Length is 0 or > GameRules.MaxPlayerNameLength)
            throw new DomainException(DomainErrors.PlayerNameInvalid,
                $"Player name must be 1–{GameRules.MaxPlayerNameLength} characters.", "name");
        Name = trimmed;
        NormalizedName = Normalize(trimmed);
        UpdatedAt = now;
    }

    public void SetAvatarColor(string color)
    {
        AvatarColor = AvatarColors.Contains(color) ? color : AvatarColors[0];
    }

    public static string Normalize(string name) => name.Trim().ToUpperInvariant();

    private static string DefaultColorFor(Guid id) =>
        AvatarColors[(int)((uint)id.GetHashCode() % (uint)AvatarColors.Count)];
}
