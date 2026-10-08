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

    const todayParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const datePart = (type: string) =>
      todayParts.find((part) => part.type === type)!.value;
    const today =
      datePart('year') + '-' + datePart('month') + '-' + datePart('day');
    const limitDate = new Date(today + 'T00:00:00.000Z');
    limitDate.setUTCDate(limitDate.getUTCDate() + 7);
    const next7DaysEnd = limitDate.toISOString().slice(0, 10);

    const testsToday = candidates.filter(
      (candidate) => candidate.testDate?.toISOString().slice(0, 10) === today,
    ).length;
    const testsNext7Days = candidates.filter((candidate) => {
      const testDay = candidate.testDate?.toISOString().slice(0, 10);
      return (
        testDay !== undefined && testDay > today && testDay <= next7DaysEnd
      );
    }).length;
    const withoutTestDate = candidates.filter(
      (candidate) => candidate.testDate === null,
    ).length;
    const withoutStore = candidates.filter(
      (candidate) => candidate.store?.isActive !== true,
    ).length;
    const withoutVacancy = candidates.filter(
      (candidate) => candidate.vacancy?.isActive !== true,
    ).length;

    const upcomingTests = candidates
      .filter((candidate) => {
        const testDay = candidate.testDate?.toISOString().slice(0, 10);
        return (
          testDay !== undefined && testDay >= today && testDay <= next7DaysEnd
        );
      })
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        testDate: candidate.testDate!.toISOString().slice(0, 10),
        storeName: candidate.store?.isActive ? candidate.store.name : null,
        vacancyName: candidate.vacancy?.isActive
          ? candidate.vacancy.name
          : null,
      }))
      .sort(
        (a, b) =>
          a.testDate.localeCompare(b.testDate) ||
          a.name.localeCompare(b.name, 'pt-BR') ||
          a.id - b.id,
      );

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
        testsToday,
        testsNext7Days,
        withoutTestDate,
        withoutStore,
        withoutVacancy,
      },

      referenceDates: { today, next7DaysEnd, timezone: 'America/Sao_Paulo' },
      upcomingTests,
      byStatus,
      byStore,
      byVacancy,
    };
  }
}
