namespace Porter.Domain.Common;

/// <summary>Confirmed Porter rules. Changing these changes the game; keep them in one place.</summary>
public static class GameRules
{
    public const int MinPlayers = 2;
    public const int MaxPlayers = 4;
    public const int DealsPerGame = 13;
    public const int MaxGameNameLength = 60;
    public const int MaxPlayerNameLength = 40;
}
