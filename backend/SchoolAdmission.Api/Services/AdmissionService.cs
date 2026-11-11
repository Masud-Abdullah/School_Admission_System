using System.Data;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SchoolAdmission.Api.Data;
using SchoolAdmission.Api.Dtos;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Services;

public class AdmissionService
{
    private static readonly Regex StudentIdRegex = new(@"^\d{17}$", RegexOptions.Compiled);
    private static readonly Regex ClassNameRegex = new(
        @"^class\s+([1-9]|1[0-2])\s*-\s*(morning|day)\s+shift$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly SemaphoreSlim LocalLock = new(1, 1);

    private readonly AdmissionDbContext _db;
    private readonly IConfiguration _config;

    public AdmissionService(AdmissionDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    public int GetHoldDurationSeconds()
    {
        var raw = Environment.GetEnvironmentVariable("HOLD_DURATION_SECONDS")
                  ?? _config["HOLD_DURATION_SECONDS"];
        if (int.TryParse(raw, out var seconds) && seconds > 0)
        {
            return seconds;
        }
        return 600;
    }

    public static (bool IsValid, string? ErrorMessage) ValidateStudentId(string? studentId)
    {
        if (string.IsNullOrWhiteSpace(studentId))
        {
            return (false, "X-Student-Id header is required (17-digit Birth Registration Number).");
        }

        var trimmed = studentId.Trim();
        if (!StudentIdRegex.IsMatch(trimmed))
        {
            return (false, "X-Student-Id must be a 17-digit numeric Birth Registration Number.");
        }

        return (true, null);
    }

    public static (bool IsValid, string NormalizedName, string? ErrorMessage) ValidateAndNormalizeClassName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return (false, string.Empty, "Class name must follow the format 'Class <1-12> - Morning Shift' or 'Class <1-12> - Day Shift'.");
        }

        var match = ClassNameRegex.Match(name.Trim());
        if (!match.Success)
        {
            return (false, string.Empty, "Class name must follow the format 'Class <1-12> - Morning Shift' or 'Class <1-12> - Day Shift'.");
        }

        var classNumber = match.Groups[1].Value;
        var shiftFormatted = match.Groups[2].Value.Equals("morning", StringComparison.OrdinalIgnoreCase)
            ? "Morning"
            : "Day";

        return (true, $"Class {classNumber} - {shiftFormatted} Shift", null);
    }

    public async Task<int> SweepExpiredHoldsAsync(CancellationToken ct = default)
    {
        await LocalLock.WaitAsync(ct);
        try
        {
            return await SweepExpiredHoldsCoreAsync(ct);
        }
        finally
        {
            LocalLock.Release();
        }
    }

    private async Task<int> SweepExpiredHoldsCoreAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var expiredHolds = await _db.Holds
            .Where(h => h.Status == HoldStatuses.Held && h.ExpiresAt <= now)
            .ToListAsync(ct);

        if (expiredHolds.Count == 0)
        {
            return 0;
        }

        foreach (var hold in expiredHolds)
        {
            hold.Status = HoldStatuses.Expired;
        }

        await _db.SaveChangesAsync(ct);
        return expiredHolds.Count;
    }

    public async Task<(int StatusCode, CreateClassResponse? Data, string? Error)> CreateClassAsync(
        CreateClassRequest? request,
        CancellationToken ct = default)
    {
        if (request == null)
        {
            return (400, null, "Class name must follow the format 'Class <1-12> - Morning Shift' or 'Class <1-12> - Day Shift'.");
        }

        var (nameValid, normalizedName, nameError) = ValidateAndNormalizeClassName(request.Name);
        if (!nameValid)
        {
            return (400, null, nameError);
        }

        if (request.TotalSeats == null || request.TotalSeats <= 0 || request.TotalSeats > 100000)
        {
            return (400, null, "totalSeats must be a positive integer.");
        }

        await LocalLock.WaitAsync(ct);
        try
        {
            var exists = await _db.Classes
                .AnyAsync(c => c.Name.ToLower() == normalizedName.ToLower(), ct);

            if (exists)
            {
                return (409, null, $"Class '{normalizedName}' already exists.");
            }

            var entity = new SchoolClass
            {
                Id = $"c_{Guid.NewGuid():N}"[..10],
                Name = normalizedName,
                TotalSeats = request.TotalSeats.Value,
                CreatedAt = DateTime.UtcNow
            };

            _db.Classes.Add(entity);
            await _db.SaveChangesAsync(ct);

            return (201, new CreateClassResponse(entity.Id, entity.Name, entity.TotalSeats), null);
        }
        finally
        {
            LocalLock.Release();
        }
    }

    public async Task<List<ClassSeatSummaryResponse>> GetAllClassesAsync(CancellationToken ct = default)
    {
        await LocalLock.WaitAsync(ct);
        try
        {
            await SweepExpiredHoldsCoreAsync(ct);
            var now = DateTime.UtcNow;

            var classes = await _db.Classes
                .AsNoTracking()
                .OrderBy(c => c.CreatedAt)
                .Include(c => c.Holds)
                .ToListAsync(ct);

            return classes.Select(c => MapClassSummary(c, now)).ToList();
        }
        finally
        {
            LocalLock.Release();
        }
    }

    public async Task<ClassSeatSummaryResponse?> GetClassByIdAsync(string classId, CancellationToken ct = default)
    {
        await LocalLock.WaitAsync(ct);
        try
        {
            await SweepExpiredHoldsCoreAsync(ct);
            var now = DateTime.UtcNow;

            var schoolClass = await _db.Classes
                .AsNoTracking()
                .Include(c => c.Holds)
                .FirstOrDefaultAsync(c => c.Id == classId, ct);

            return schoolClass == null ? null : MapClassSummary(schoolClass, now);
        }
        finally
        {
            LocalLock.Release();
        }
    }

    public async Task<(int StatusCode, CreateHoldResponse? Data, string? Error)> CreateHoldAsync(
        string classId,
        string? studentIdHeader,
        CancellationToken ct = default)
    {
        var (isValid, validationError) = ValidateStudentId(studentIdHeader);
        if (!isValid)
        {
            return (400, null, validationError);
        }

        var studentId = studentIdHeader!.Trim();

        await LocalLock.WaitAsync(ct);
        try
        {
            var isPostgres = _db.Database.ProviderName?.Contains("Npgsql", StringComparison.OrdinalIgnoreCase) == true;

            await using IDbContextTransaction? tx = _db.Database.IsRelational()
                ? await _db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct)
                : null;

            SchoolClass? targetClass;
            if (isPostgres)
            {
                targetClass = await _db.Classes
                    .FromSqlInterpolated($"SELECT * FROM \"Classes\" WHERE \"Id\" = {classId} FOR UPDATE")
                    .FirstOrDefaultAsync(ct);
            }
            else
            {
                targetClass = await _db.Classes
                    .FirstOrDefaultAsync(c => c.Id == classId, ct);
            }

            if (targetClass == null)
            {
                return (404, null, "Class not found.");
            }

            var now = DateTime.UtcNow;

            var staleHolds = await _db.Holds
                .Where(h => (h.ClassId == classId || h.StudentId == studentId) && h.Status == HoldStatuses.Held && h.ExpiresAt <= now)
                .ToListAsync(ct);

            foreach (var stale in staleHolds)
            {
                stale.Status = HoldStatuses.Expired;
            }
            if (staleHolds.Count > 0)
            {
                await _db.SaveChangesAsync(ct);
            }

            var existingActiveHold = await _db.Holds
                .FirstOrDefaultAsync(
                    h => h.StudentId == studentId &&
                         (h.Status == HoldStatuses.Held || h.Status == HoldStatuses.Confirmed),
                    ct);

            if (existingActiveHold != null)
            {
                var existingClass = await _db.Classes
                    .AsNoTracking()
                    .FirstOrDefaultAsync(c => c.Id == existingActiveHold.ClassId, ct);
                var existingClassName = existingClass?.Name ?? existingActiveHold.ClassId;

                return existingActiveHold.Status == HoldStatuses.Confirmed
                    ? (409, null, $"Student already has a confirmed admission in {existingClassName}.")
                    : (409, null, $"Student already has an active hold in {existingClassName}. Please cancel it before applying to another class.");
            }

            var occupiedSeats = await _db.Holds.CountAsync(
                h => h.ClassId == classId &&
                     (h.Status == HoldStatuses.Held || h.Status == HoldStatuses.Confirmed),
                ct);

            if (occupiedSeats >= targetClass.TotalSeats)
            {
                return (409, null, "No available seats remaining in this class.");
            }

            var durationSeconds = GetHoldDurationSeconds();
            var expiresAt = now.AddSeconds(durationSeconds);

            var newHold = new SeatHold
            {
                HoldId = $"h_{Guid.NewGuid():N}"[..10],
                ClassId = classId,
                StudentId = studentId,
                Status = HoldStatuses.Held,
                ExpiresAt = expiresAt,
                CreatedAt = now
            };

            _db.Holds.Add(newHold);
            await _db.SaveChangesAsync(ct);

            if (tx != null)
            {
                await tx.CommitAsync(ct);
            }

            var response = new CreateHoldResponse(
                newHold.HoldId,
                newHold.ClassId,
                newHold.StudentId,
                newHold.Status,
                FormatIsoUtc(newHold.ExpiresAt)
            );

            return (201, response, null);
        }
        finally
        {
            LocalLock.Release();
        }
    }

    public async Task<GetHoldResponse?> GetHoldByIdAsync(string holdId, CancellationToken ct = default)
    {
        await LocalLock.WaitAsync(ct);
        try
        {
            await SweepExpiredHoldsCoreAsync(ct);

            var hold = await _db.Holds
                .AsNoTracking()
                .FirstOrDefaultAsync(h => h.HoldId == holdId, ct);

            if (hold == null)
            {
                return null;
            }

            return new GetHoldResponse(
                hold.HoldId,
                hold.ClassId,
                hold.Status,
                FormatIsoUtc(hold.ExpiresAt)
            );
        }
        finally
        {
            LocalLock.Release();
        }
    }

    public async Task<(int StatusCode, ConfirmHoldResponse? Data, string? Error)> ConfirmHoldAsync(
        string holdId,
        string? studentIdHeader,
        CancellationToken ct = default)
    {
        var (isValid, validationError) = ValidateStudentId(studentIdHeader);
        if (!isValid)
        {
            return (400, null, validationError);
        }

        var studentId = studentIdHeader!.Trim();

        await LocalLock.WaitAsync(ct);
        try
        {
            await SweepExpiredHoldsCoreAsync(ct);

            var hold = await _db.Holds.FirstOrDefaultAsync(h => h.HoldId == holdId, ct);
            if (hold == null)
            {
                return (404, null, "Hold not found.");
            }

            if (hold.StudentId != studentId)
            {
                return (403, null, "You can only confirm your own hold.");
            }

            if (hold.Status == HoldStatuses.Confirmed)
            {
                return (200, new ConfirmHoldResponse(hold.HoldId, HoldStatuses.Confirmed), null);
            }

            if (hold.Status == HoldStatuses.Expired || DateTime.UtcNow >= hold.ExpiresAt)
            {
                hold.Status = HoldStatuses.Expired;
                await _db.SaveChangesAsync(ct);
                return (409, null, "Hold has expired.");
            }

            if (hold.Status == HoldStatuses.Cancelled)
            {
                return (409, null, "Cancelled hold cannot be confirmed.");
            }

            hold.Status = HoldStatuses.Confirmed;
            await _db.SaveChangesAsync(ct);

            return (200, new ConfirmHoldResponse(hold.HoldId, HoldStatuses.Confirmed), null);
        }
        finally
        {
            LocalLock.Release();
        }
    }

    public async Task<(int StatusCode, string? Error)> CancelHoldAsync(
        string holdId,
        string? studentIdHeader,
        CancellationToken ct = default)
    {
        var (isValid, validationError) = ValidateStudentId(studentIdHeader);
        if (!isValid)
        {
            return (400, validationError);
        }

        var studentId = studentIdHeader!.Trim();

        await LocalLock.WaitAsync(ct);
        try
        {
            await SweepExpiredHoldsCoreAsync(ct);

            var hold = await _db.Holds.FirstOrDefaultAsync(h => h.HoldId == holdId, ct);
            if (hold == null)
            {
                return (404, "Hold not found.");
            }

            if (hold.StudentId != studentId)
            {
                return (403, "You can only cancel your own hold.");
            }

            if (hold.Status == HoldStatuses.Confirmed)
            {
                return (409, "Confirmed admission cannot be cancelled.");
            }

            if (hold.Status == HoldStatuses.Expired)
            {
                return (409, "Hold has already expired.");
            }

            if (hold.Status == HoldStatuses.Cancelled)
            {
                return (204, null);
            }

            hold.Status = HoldStatuses.Cancelled;
            await _db.SaveChangesAsync(ct);

            return (204, null);
        }
        finally
        {
            LocalLock.Release();
        }
    }

    public async Task<(int StatusCode, List<StudentHoldItemResponse>? Data, string? Error)> GetStudentHoldsAsync(
        string? studentIdHeader,
        CancellationToken ct = default)
    {
        var (isValid, validationError) = ValidateStudentId(studentIdHeader);
        if (!isValid)
        {
            return (400, null, validationError);
        }

        var studentId = studentIdHeader!.Trim();

        await LocalLock.WaitAsync(ct);
        try
        {
            await SweepExpiredHoldsCoreAsync(ct);

            var holds = await _db.Holds
                .AsNoTracking()
                .Include(h => h.SchoolClass)
                .Where(h => h.StudentId == studentId)
                .OrderByDescending(h => h.CreatedAt)
                .ToListAsync(ct);

            var items = holds.Select(h => new StudentHoldItemResponse(
                h.HoldId,
                h.ClassId,
                h.SchoolClass?.Name ?? "Unknown Class",
                h.Status,
                FormatIsoUtc(h.ExpiresAt)
            )).ToList();

            return (200, items, null);
        }
        finally
        {
            LocalLock.Release();
        }
    }

    private static ClassSeatSummaryResponse MapClassSummary(SchoolClass c, DateTime now)
    {
        var heldSeats = c.Holds.Count(h => h.Status == HoldStatuses.Held && h.ExpiresAt > now);
        var confirmedSeats = c.Holds.Count(h => h.Status == HoldStatuses.Confirmed);
        var availableSeats = Math.Max(0, c.TotalSeats - heldSeats - confirmedSeats);

        return new ClassSeatSummaryResponse(
            c.Id,
            c.Name,
            c.TotalSeats,
            heldSeats,
            confirmedSeats,
            availableSeats
        );
    }

    private static string FormatIsoUtc(DateTime dt)
    {
        return dt.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ");
    }
}
