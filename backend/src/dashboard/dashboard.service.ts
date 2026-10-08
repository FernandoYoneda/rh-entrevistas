import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(filters: DashboardFilterDto) {
    const where = {
      ...(filters.statusId !== undefined && {
        statusId: filters.statusId,
      }),

      ...(filters.storeId !== undefined && {
        storeId: filters.storeId,
      }),

      ...(filters.vacancyId !== undefined && {
        vacancyId: filters.vacancyId,
      }),

      ...((filters.startDate || filters.endDate) && {
        interviewDate: {
          ...(filters.startDate && {
            gte: new Date(`${filters.startDate}T00:00:00.000Z`),
          }),

          ...(filters.endDate && {
            lte: new Date(`${filters.endDate}T23:59:59.999Z`),
          }),
        },
      }),
    };

    const candidates = await this.prisma.candidate.findMany({
      where,
      include: {
        status: true,
        store: true,
        vacancy: true,
      },
    });

    const totalCandidates = candidates.length;

    const withStatus = candidates.filter(
      (candidate) => candidate.status?.isActive === true,
    ).length;

    const withoutStatus = candidates.filter(
      (candidate) => candidate.status?.isActive !== true,
    ).length;

    const sentToStore = candidates.filter(
      (candidate) => candidate.sentToStoreDate !== null,
    ).length;

    const testedCandidates = candidates.filter(
      (candidate) => candidate.testDate !== null,
    ).length;

    const waitingForTest = candidates.filter(
      (candidate) =>
        candidate.sentToStoreDate !== null && candidate.testDate === null,
    ).length;

    const statusMap = new Map<
      number,
      {
        id: number;
        name: string;
        total: number;
      }
    >();

    const storeMap = new Map<
      number,
      {
        id: number;
        name: string;
        total: number;
      }
    >();

    const vacancyMap = new Map<
      number,
      {
        id: number;
        name: string;
        total: number;
      }
    >();

    for (const candidate of candidates) {
      if (candidate.status?.isActive) {
        const currentStatus = statusMap.get(candidate.status.id);

        if (currentStatus) {
          currentStatus.total++;
        } else {
          statusMap.set(candidate.status.id, {
            id: candidate.status.id,
            name: candidate.status.name,
            total: 1,
          });
        }
      }

      if (candidate.store?.isActive) {
        const currentStore = storeMap.get(candidate.store.id);

        if (currentStore) {
          currentStore.total++;
        } else {
          storeMap.set(candidate.store.id, {
            id: candidate.store.id,
            name: candidate.store.name,
            total: 1,
          });
        }
      }

      if (candidate.vacancy?.isActive) {
        const currentVacancy = vacancyMap.get(candidate.vacancy.id);

        if (currentVacancy) {
          currentVacancy.total++;
        } else {
          vacancyMap.set(candidate.vacancy.id, {
            id: candidate.vacancy.id,
            name: candidate.vacancy.name,
            total: 1,
          });
        }
      }
    }

    const byStatus = Array.from(statusMap.values()).sort(
      (a, b) => b.total - a.total,
    );

    const byStore = Array.from(storeMap.values()).sort(
      (a, b) => b.total - a.total,
    );

    const byVacancy = Array.from(vacancyMap.values()).sort(
      (a, b) => b.total - a.total,
    );

    return {
      filters: {
        statusId: filters.statusId ?? null,
        storeId: filters.storeId ?? null,
        vacancyId: filters.vacancyId ?? null,
        startDate: filters.startDate ?? null,
        endDate: filters.endDate ?? null,
      },

      summary: {
        totalCandidates,
        withStatus,
        withoutStatus,
        sentToStore,
        testedCandidates,
        waitingForTest,
      },

      byStatus,
      byStore,
      byVacancy,
    };
  }
}
