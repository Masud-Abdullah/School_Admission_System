using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Models;

namespace SchoolAdmission.Api.Data;

public class AdmissionDbContext : DbContext
{
    public AdmissionDbContext(DbContextOptions<AdmissionDbContext> options) : base(options)
    {
    }

    public DbSet<SchoolClass> Classes => Set<SchoolClass>();
    public DbSet<SeatHold> Holds => Set<SeatHold>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<SchoolClass>(entity =>
        {
            entity.ToTable("Classes");
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Id).HasMaxLength(64);
            entity.Property(c => c.Name).IsRequired().HasMaxLength(150);
            entity.Property(c => c.TotalSeats).IsRequired();
            entity.HasIndex(c => c.Name).IsUnique();
        });

        modelBuilder.Entity<SeatHold>(entity =>
        {
            entity.ToTable("SeatHolds");
            entity.HasKey(h => h.HoldId);
            entity.Property(h => h.HoldId).HasMaxLength(64);
            entity.Property(h => h.ClassId).IsRequired().HasMaxLength(64);
            entity.Property(h => h.StudentId).IsRequired().HasMaxLength(17);
            entity.Property(h => h.Status).IsRequired().HasMaxLength(20);
            entity.Property(h => h.ExpiresAt).IsRequired();

            entity.HasOne(h => h.SchoolClass)
                .WithMany(c => c.Holds)
                .HasForeignKey(h => h.ClassId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(h => new { h.ClassId, h.Status });
            entity.HasIndex(h => new { h.StudentId, h.ClassId });
        });
    }
}
