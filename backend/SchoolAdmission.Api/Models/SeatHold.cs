namespace SchoolAdmission.Api.Models;

public static class HoldStatuses
{
    public const string Held = "HELD";
    public const string Confirmed = "CONFIRMED";
    public const string Expired = "EXPIRED";
    public const string Cancelled = "CANCELLED";
}

public class SeatHold
{
    public string HoldId { get; set; } = string.Empty;
    public string ClassId { get; set; } = string.Empty;
    public string StudentId { get; set; } = string.Empty;
    public string Status { get; set; } = HoldStatuses.Held;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public SchoolClass? SchoolClass { get; set; }
}
