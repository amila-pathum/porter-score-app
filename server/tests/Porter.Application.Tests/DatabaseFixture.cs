using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Porter.Application.Abstractions;
using Porter.Application.Games;
using Porter.Application.Players;
using Porter.Application.Statistics;
using Porter.Infrastructure.Identity;
using Porter.Infrastructure.Persistence;
using Testcontainers.PostgreSql;

namespace Porter.Application.Tests;

public sealed class DatabaseFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        await using var db = NewContext();
        await db.Database.MigrateAsync();
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();

    public PorterDbContext NewContext() =>
        new(new DbContextOptionsBuilder<PorterDbContext>().UseNpgsql(_container.GetConnectionString()).Options);

    /// <summary>Creates an account row so foreign keys are satisfied.</summary>
    public async Task<Guid> NewUserAsync()
    {
        var id = Guid.NewGuid();
        await using var db = NewContext();
        db.Users.Add(new AppUser
        {
            Id = id, UserName = $"{id:N}", NormalizedUserName = $"{id:N}".ToUpperInvariant(),
            Email = $"{id:N}@test.local", NormalizedEmail = $"{id:N}@TEST.LOCAL", DisplayName = "Test",
            SecurityStamp = Guid.NewGuid().ToString(),
        });
        await db.SaveChangesAsync();
        return id;
    }
}

[CollectionDefinition(Name)]
public sealed class DbCollection : ICollectionFixture<DatabaseFixture>
{
    public const string Name = "db";
}

internal sealed record FixedUser(Guid UserId) : ICurrentUser;

/// <summary>Builds application services over a dedicated DbContext, as a single request would.</summary>
internal sealed class Services(PorterDbContext db, Guid userId) : IAsyncDisposable
{
    public PorterDbContext Db { get; } = db;
    private readonly ICurrentUser _user = new FixedUser(userId);
    private UserDirectory Users => new(Db);
    public StatisticsService Stats => new(Db, _user, Users);
    public GameService Games => new(Db, _user, TimeProvider.System, NullLogger<GameService>.Instance);
    public PlayerService Players => new(Db, _user, Users, Stats, TimeProvider.System, NullLogger<PlayerService>.Instance);

    public ValueTask DisposeAsync() => Db.DisposeAsync();
}
