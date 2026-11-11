namespace SchoolAdmission.Api.Services;

public class HoldExpirationWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<HoldExpirationWorker> _logger;

    public HoldExpirationWorker(IServiceProvider serviceProvider, ILogger<HoldExpirationWorker> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var admissionService = scope.ServiceProvider.GetRequiredService<AdmissionService>();
                var expiredCount = await admissionService.SweepExpiredHoldsAsync(stoppingToken);
                if (expiredCount > 0)
                {
                    _logger.LogInformation("Expired {Count} seat hold(s).", expiredCount);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Error while sweeping expired holds.");
            }

            await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
        }
    }
}
