using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Porter.Application.Abstractions;
using Porter.Application.Account;
using Porter.Infrastructure.Email;
using Porter.Infrastructure.Identity;
using Porter.Infrastructure.Persistence;

namespace Porter.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var connectionString = config.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("Connection string 'Postgres' is not configured.");

        services.AddDbContext<PorterDbContext>(o => o.UseNpgsql(connectionString,
            npgsql => npgsql.EnableRetryOnFailure(3)));
        services.AddScoped<IPorterDbContext>(sp => sp.GetRequiredService<PorterDbContext>());

        services.AddIdentityCore<AppUser>(o =>
            {
                o.User.RequireUniqueEmail = true;
                o.Password.RequiredLength = 8;
                o.Password.RequireDigit = true;
                o.Password.RequireLowercase = false;
                o.Password.RequireUppercase = false;
                o.Password.RequireNonAlphanumeric = false;
                o.Lockout.AllowedForNewUsers = true;
                o.Lockout.MaxFailedAccessAttempts = 5;
                o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(5);
            })
            .AddEntityFrameworkStores<PorterDbContext>()
            .AddDefaultTokenProviders()
            .AddPasswordValidator<LetterPasswordValidator>();
        services.Configure<DataProtectionTokenProviderOptions>(o => o.TokenLifespan = TimeSpan.FromMinutes(30));

        services.AddOptions<JwtOptions>()
            .Bind(config.GetSection(JwtOptions.Section))
            .Validate(o => o.SigningKey.Length >= 32, "Jwt:SigningKey must be at least 32 characters.")
            .ValidateOnStart();

        services.Configure<SmtpOptions>(config.GetSection(SmtpOptions.Section));
        if (!string.IsNullOrWhiteSpace(config[$"{SmtpOptions.Section}:Host"]))
            services.AddScoped<IEmailSender, SmtpEmailSender>();
        else
            services.AddScoped<IEmailSender, LoggingEmailSender>();

        services.AddScoped<TokenService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IAccountService, AccountService>();
        services.AddScoped<IUserDirectory, UserDirectory>();
        services.AddScoped<DevSeeder>();
        return services;
    }
}

/// <summary>Used only by <c>dotnet ef</c> at design time.</summary>
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<PorterDbContext>
{
    public PorterDbContext CreateDbContext(string[] args)
    {
        var cs = Environment.GetEnvironmentVariable("PORTER_DESIGN_CONNECTION")
                 ?? "Host=localhost;Port=5433;Database=porter;Username=porter;Password=porter";
        return new PorterDbContext(new DbContextOptionsBuilder<PorterDbContext>().UseNpgsql(cs).Options);
    }
}
