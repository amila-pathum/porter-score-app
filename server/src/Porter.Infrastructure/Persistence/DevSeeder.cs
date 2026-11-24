using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Porter.Domain.Games;
using Porter.Domain.Players;
using Porter.Infrastructure.Identity;

namespace Porter.Infrastructure.Persistence;

/// <summary>
/// Seeds a demo account with the sample data from the design spec. Only runs when
/// <c>Seed:DemoData=true</c> (Development / demo environments). It is never enabled in production config.
/// </summary>
public sealed class DevSeeder(PorterDbContext db, UserManager<AppUser> users, ILogger<DevSeeder> logger)
{
    public const string DemoEmail = "demo@porter.local";
    public const string DemoPassword = "PorterDemo1";

    public async Task SeedAsync(CancellationToken ct = default)
    {
        if (await users.FindByEmailAsync(DemoEmail) is not null) return;

        var user = new AppUser
        {
            Id = Guid.NewGuid(), Email = DemoEmail, UserName = DemoEmail, DisplayName = "Kasun",
            CreatedAt = new DateTimeOffset(2026, 3, 1, 9, 0, 0, TimeSpan.Zero),
        };
        var created = await users.CreateAsync(user, DemoPassword);
        if (!created.Succeeded) throw new InvalidOperationException("Could not create demo user.");

        var t0 = user.CreatedAt;
        Player P(string name, string color) => Player.Create(Guid.NewGuid(), user.Id, name, color, t0);
        var kasun = P("Kasun", "teal");
        var nimal = P("Nimal", "amber");
        var amali = P("Amali", "olive");
        var tharindu = P("Tharindu", "slate");
        var dilini = P("Dilini", "plum");
        var ruwan = P("Ruwan", "clay");
        db.Players.AddRange(kasun, nimal, amali, tharindu, dilini, ruwan);

        var four = new[] { kasun.Id, nimal.Id, amali.Id, tharindu.Id };

        // Avurudu Porter: two players, tied on 101 → both rank 1.
        db.Games.Add(Build("Avurudu Porter", [kasun.Id, nimal.Id], new(2026, 4, 14, 18, 0, 0, TimeSpan.Zero),
        [
            [0, 9], [12, 0], [7, 0], [0, 13], [15, 0], [9, 0], [0, 17], [11, 0], [8, 0], [0, 22], [14, 0], [10, 25], [15, 15],
        ]));

        // Poya Night Porter: completed, Kasun 93, Amali 99, Nimal 116, Tharindu 129.
        db.Games.Add(Build("Poya Night Porter", four, new(2026, 11, 15, 13, 50, 0, TimeSpan.Zero),
        [
            [0, 14, 6, 21], [9, 0, 12, 5], [17, 8, 0, 11], [4, 22, 9, 0], [0, 6, 15, 13], [12, 0, 3, 27], [7, 10, 0, 8],
            [0, 5, 18, 16], [25, 12, 7, 0], [3, 0, 11, 9], [0, 19, 6, 14], [10, 7, 0, 5], [6, 13, 12, 0],
        ]));

        // Office Lunch Porter: three players.
        db.Games.Add(Build("Office Lunch Porter", [kasun.Id, dilini.Id, ruwan.Id], new(2026, 11, 8, 6, 30, 0, TimeSpan.Zero),
        [
            [4, 0, 11], [0, 9, 14], [12, 3, 0], [8, 0, 6], [0, 7, 19], [15, 0, 5], [6, 12, 0], [0, 4, 9],
            [11, 0, 7], [9, 14, 0], [0, 6, 12], [13, 0, 8], [12, 33, 0],
        ]));

        // Friday Night Porter: active, Deal 5 is next. Amali 26, Kasun 35, Nimal 54, Tharindu 55.
        db.Games.Add(Build("Friday Night Porter", four, new(2026, 11, 22, 14, 40, 0, TimeSpan.Zero),
            [[0, 12, 5, 18], [18, 0, 7, 25], [5, 9, 0, 12], [12, 33, 14, 0]]));

        await db.SaveChangesAsync(ct);
        user.MePlayerId = kasun.Id;
        await users.UpdateAsync(user);
        logger.LogInformation("Seeded demo account {Email}", DemoEmail);

        Game Build(string name, Guid[] seats, DateTimeOffset start, int[][] deals)
        {
            var game = Game.Create(Guid.NewGuid(), user.Id, name, seats, start.AddMinutes(-5));
            game.Start(start);
            for (var i = 0; i < deals.Length; i++)
            {
                var scores = seats.Select((id, s) => (id, deals[i][s])).ToDictionary(x => x.id, x => x.Item2);
                game.SaveDeal(i + 1, scores, user.Id, start.AddMinutes(10 * (i + 1)));
            }

            return game;
        }
    }
}

public static class DatabaseStartup
{
    /// <summary>Applies pending migrations. Enabled via <c>Database:MigrateOnStartup</c>.</summary>
    public static Task MigrateAsync(PorterDbContext db, CancellationToken ct = default) => db.Database.MigrateAsync(ct);
}
