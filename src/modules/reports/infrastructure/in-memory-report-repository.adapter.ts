import type { Report, ReportStatus } from '../domain/report';
import type {
  ReportRepository,
  CollectionTaskRow,
  UpdateReportStatusOptions,
} from '../application/ports/report-repository.port';

export class InMemoryReportRepository implements ReportRepository {
  private readonly reports = new Map<number, Report>();
  private nextId = 1;

  seed(report: Report): void {
    this.reports.set(report.id, report);
    if (report.id >= this.nextId) this.nextId = report.id + 1;
  }

  async findByUserId(userId: number): Promise<Report[]> {
    return [...this.reports.values()].filter((r) => r.userId === userId);
  }

  async findPending(): Promise<Report[]> {
    return [...this.reports.values()].filter((r) => r.status === 'pending');
  }

  async findRecent(limit: number): Promise<Report[]> {
    return [...this.reports.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async findCollectionTasks(limit: number): Promise<CollectionTaskRow[]> {
    return [...this.reports.values()].slice(0, limit).map((r) => ({
      id: r.id,
      location: r.location,
      wasteType: r.wasteType,
      amount: r.amount,
      status: r.status,
      date: r.createdAt,
      collectorId: r.collectorId,
    }));
  }

  async updateStatus(
    reportId: number,
    status: ReportStatus,
    opts?: UpdateReportStatusOptions
  ): Promise<Report | null> {
    const report = this.reports.get(reportId);
    if (!report) return null;
    const updated: Report = {
      ...report,
      status,
      collectorId: opts?.collectorId ?? report.collectorId,
    };
    this.reports.set(reportId, updated);
    return updated;
  }
}
