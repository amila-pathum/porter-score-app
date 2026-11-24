using Microsoft.Extensions.DependencyInjection;
using Porter.Application.Dashboard;
using Porter.Application.Games;
using Porter.Application.Players;
using Porter.Application.Statistics;

namespace Porter.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<GameService>();
        services.AddScoped<PlayerService>();
        services.AddScoped<StatisticsService>();
        services.AddScoped<DashboardService>();
        services.AddSingleton(TimeProvider.System);
        return services;
    }
}
