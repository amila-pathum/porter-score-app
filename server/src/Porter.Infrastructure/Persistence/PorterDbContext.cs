using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Porter.Application.Abstractions;
using Porter.Domain.Games;
using Porter.Domain.Players;
using Porter.Infrastructure.Identity;

namespace Porter.Infrastructure.Persistence;

public sealed class PorterDbContext(DbContextOptions<PorterDbContext> options)
    : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options), IPorterDbContext
{
    public DbSet<Game> Games => Set<Game>();
    public DbSet<Player> Players => Set<Player>();
    public DbSet<Deal> Deals => Set<Deal>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(PorterDbContext).Assembly);
    }
}
