using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Porter.Domain.Common;
using Porter.Domain.Games;
using Porter.Domain.Players;
using Porter.Infrastructure.Identity;

namespace Porter.Infrastructure.Persistence.Configurations;

internal sealed class GameConfiguration : IEntityTypeConfiguration<Game>
{
    public void Configure(EntityTypeBuilder<Game> b)
    {
        b.ToTable("Games", t =>
            t.HasCheckConstraint("CK_Games_Status", "\"Status\" IN (0, 1, 2)"));
        b.HasKey(g => g.Id);
        b.Property(g => g.Id).ValueGeneratedNever();
        b.Property(g => g.Name).HasMaxLength(GameRules.MaxGameNameLength).IsRequired();

        // PostgreSQL system column xmin as optimistic concurrency token.
        b.Property(g => g.Version).IsRowVersion();

        b.HasOne<AppUser>().WithMany().HasForeignKey(g => g.OwnerUserId).OnDelete(DeleteBehavior.Cascade);

        b.HasMany(g => g.Players).WithOne().HasForeignKey(gp => gp.GameId).OnDelete(DeleteBehavior.Cascade);
        b.Navigation(g => g.Players).HasField("_players").UsePropertyAccessMode(PropertyAccessMode.Field);

        b.HasMany(g => g.Deals).WithOne().HasForeignKey(d => d.GameId).OnDelete(DeleteBehavior.Cascade);
        b.Navigation(g => g.Deals).HasField("_deals").UsePropertyAccessMode(PropertyAccessMode.Field);

        b.Ignore(g => g.CompletedDealCount);
        b.Ignore(g => g.NextDealNumber);

        b.HasIndex(g => new { g.OwnerUserId, g.Status, g.UpdatedAt });
        b.HasQueryFilter(g => g.DeletedAt == null);
    }
}

internal sealed class GamePlayerConfiguration : IEntityTypeConfiguration<GamePlayer>
{
    public void Configure(EntityTypeBuilder<GamePlayer> b)
    {
        b.ToTable("GamePlayers", t =>
            t.HasCheckConstraint("CK_GamePlayers_Seat", $"\"Seat\" BETWEEN 1 AND {GameRules.MaxPlayers}"));
        // (GameId, PlayerId) is the key → a player can occupy only one seat per game.
        // UNIQUE (GameId, Seat) is created DEFERRABLE in the migration so seats can be swapped in one save.
        b.HasKey(gp => new { gp.GameId, gp.PlayerId });
        b.HasOne<Player>().WithMany().HasForeignKey(gp => gp.PlayerId).OnDelete(DeleteBehavior.NoAction);
    }
}

internal sealed class DealConfiguration : IEntityTypeConfiguration<Deal>
{
    public void Configure(EntityTypeBuilder<Deal> b)
    {
        b.ToTable("Deals", t =>
            t.HasCheckConstraint("CK_Deals_Number", $"\"Number\" BETWEEN 1 AND {GameRules.DealsPerGame}"));
        b.HasKey(d => d.Id);
        b.Property(d => d.Id).ValueGeneratedNever();
        b.HasIndex(d => new { d.GameId, d.Number }).IsUnique();
        b.HasIndex(d => d.UpdatedAt);

        b.HasMany(d => d.Scores).WithOne().HasForeignKey(s => s.DealId).OnDelete(DeleteBehavior.Cascade);
        b.Navigation(d => d.Scores).HasField("_scores").UsePropertyAccessMode(PropertyAccessMode.Field);
        b.Ignore(d => d.IsEdited);
    }
}

internal sealed class DealScoreConfiguration : IEntityTypeConfiguration<DealScore>
{
    public void Configure(EntityTypeBuilder<DealScore> b)
    {
        b.ToTable("DealScores", t => t.HasCheckConstraint("CK_DealScores_Score", "\"Score\" >= 0"));
        b.HasKey(s => new { s.DealId, s.PlayerId });
        b.HasOne<Player>().WithMany().HasForeignKey(s => s.PlayerId).OnDelete(DeleteBehavior.NoAction);
    }
}

internal sealed class PlayerConfiguration : IEntityTypeConfiguration<Player>
{
    public void Configure(EntityTypeBuilder<Player> b)
    {
        b.ToTable("Players");
        b.HasKey(p => p.Id);
        b.Property(p => p.Id).ValueGeneratedNever();
        b.Property(p => p.Name).HasMaxLength(GameRules.MaxPlayerNameLength).IsRequired();
        b.Property(p => p.NormalizedName).HasMaxLength(GameRules.MaxPlayerNameLength).IsRequired();
        b.Property(p => p.AvatarColor).HasMaxLength(16).IsRequired();
        b.HasIndex(p => new { p.OwnerUserId, p.NormalizedName }).IsUnique();
        b.HasOne<AppUser>().WithMany().HasForeignKey(p => p.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AppUserConfiguration : IEntityTypeConfiguration<AppUser>
{
    public void Configure(EntityTypeBuilder<AppUser> b)
    {
        b.Property(u => u.DisplayName).HasMaxLength(60).IsRequired();
        b.HasOne<Player>().WithMany().HasForeignKey(u => u.MePlayerId).OnDelete(DeleteBehavior.SetNull);
    }
}

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> b)
    {
        b.ToTable("RefreshTokens");
        b.HasKey(t => t.Id);
        b.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();
        b.Property(t => t.ReplacedByHash).HasMaxLength(64);
        b.HasIndex(t => t.TokenHash).IsUnique();
        b.HasIndex(t => t.UserId);
        b.HasOne<AppUser>().WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
