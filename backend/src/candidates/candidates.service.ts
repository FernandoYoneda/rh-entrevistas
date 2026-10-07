import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { FilterCandidatesDto } from './dto/filter-candidates.dto';

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCpf(cpf: string) {
    return cpf.replace(/\D/g, '');
  }

  private isValidCpf(cpf: string) {
    const normalizedCpf = this.normalizeCpf(cpf);

    if (normalizedCpf.length !== 11) {
      return false;
    }

    if (/^(\d)\1{10}$/.test(normalizedCpf)) {
      return false;
    }

    const calculateDigit = (base: string, factor: number) => {
      let total = 0;

      for (const digit of base) {
        total += Number(digit) * factor;
        factor--;
      }

      const remainder = (total * 10) % 11;

      return remainder === 10 ? 0 : remainder;
    };

    const firstDigit = calculateDigit(normalizedCpf.slice(0, 9), 10);

    if (firstDigit !== Number(normalizedCpf[9])) {
      return false;
    }

    const secondDigit = calculateDigit(normalizedCpf.slice(0, 10), 11);

    return secondDigit === Number(normalizedCpf[10]);
  }

  async create(createCandidateDto: CreateCandidateDto) {
    const cpf = this.normalizeCpf(createCandidateDto.cpf);

    if (!this.isValidCpf(cpf)) {
      throw new BadRequestException('CPF inválido');
    }

    const existingCandidate = await this.prisma.candidate.findUnique({
      where: { cpf },
    });

    if (existingCandidate) {
      throw new ConflictException('Já existe um candidato com este CPF');
    }

    if (createCandidateDto.statusId) {
      const status = await this.prisma.status.findFirst({
        where: {
          id: createCandidateDto.statusId,
          isActive: true,
        },
      });

      if (!status) {
        throw new NotFoundException('Status não encontrado');
      }
    }

    if (createCandidateDto.storeId) {
      const store = await this.prisma.store.findFirst({
        where: {
          id: createCandidateDto.storeId,
          isActive: true,
        },
      });

      if (!store) {
        throw new NotFoundException('Loja não encontrada');
      }
    }

    if (createCandidateDto.vacancyId) {
      const vacancy = await this.prisma.vacancy.findFirst({
        where: {
          id: createCandidateDto.vacancyId,
          isActive: true,
        },
      });

      if (!vacancy) {
        throw new NotFoundException('Vaga não encontrada');
      }
    }

    const candidate = await this.prisma.candidate.create({
      data: {
        name: createCandidateDto.name.trim(),
        cpf,
        phone: createCandidateDto.phone?.trim() || null,
        interviewDate: new Date(createCandidateDto.interviewDate),
        statusId: createCandidateDto.statusId ?? null,
        storeId: createCandidateDto.storeId ?? null,
        vacancyId: createCandidateDto.vacancyId ?? null,
        sentToStoreDate: createCandidateDto.sentToStoreDate
          ? new Date(createCandidateDto.sentToStoreDate)
          : null,
        testDate: createCandidateDto.testDate
          ? new Date(createCandidateDto.testDate)
          : null,
        notes: createCandidateDto.notes?.trim() || null,
      },
      include: {
        status: true,
        store: true,
        vacancy: true,
      },
    });

    await this.prisma.candidateHistory.create({
      data: {
        candidateId: candidate.id,
        action: 'CANDIDATE_CREATED',
        description: 'Candidato cadastrado no sistema',
      },
    });

    return candidate;
  }

  async findAll(filters: FilterCandidatesDto) {
    const cpf = filters.cpf ? this.normalizeCpf(filters.cpf) : undefined;

    return this.prisma.candidate.findMany({
      where: {
        ...(filters.statusId !== undefined && {
          statusId: filters.statusId,
        }),

        ...(filters.storeId !== undefined && {
          storeId: filters.storeId,
        }),

        ...(filters.vacancyId !== undefined && {
          vacancyId: filters.vacancyId,
        }),

        ...(filters.name && {
          name: {
            contains: filters.name.trim(),
            mode: 'insensitive',
          },
        }),

        ...(cpf && {
          cpf: {
            contains: cpf,
          },
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
      },

      include: {
        status: true,
        store: true,
        vacancy: true,
      },

      orderBy: {
        interviewDate: 'desc',
      },
    });
  }

  async findOne(id: number) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        status: true,
        store: true,
        vacancy: true,
        history: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundException('Candidato não encontrado');
    }

    return candidate;
  }

  async findHistory(id: number) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
    });

    if (!candidate) {
      throw new NotFoundException('Candidato não encontrado');
    }

    return this.prisma.candidateHistory.findMany({
      where: {
        candidateId: id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async update(id: number, updateCandidateDto: UpdateCandidateDto) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: {
        status: true,
        store: true,
        vacancy: true,
      },
    });

    if (!candidate) {
      throw new NotFoundException('Candidato não encontrado');
    }

    let cpf: string | undefined;

    if (updateCandidateDto.cpf !== undefined) {
      cpf = this.normalizeCpf(updateCandidateDto.cpf);

      if (!this.isValidCpf(cpf)) {
        throw new BadRequestException('CPF inválido');
      }

      const existingCandidate = await this.prisma.candidate.findFirst({
        where: {
          cpf,
          NOT: { id },
        },
      });

      if (existingCandidate) {
        throw new ConflictException('Já existe um candidato com este CPF');
      }
    }

    let newStatusName: string | null = null;

    if (updateCandidateDto.statusId !== undefined) {
      const status = await this.prisma.status.findFirst({
        where: {
          id: updateCandidateDto.statusId,
          isActive: true,
        },
      });

      if (!status) {
        throw new NotFoundException('Status não encontrado');
      }

      newStatusName = status.name;
    }

    let newStoreName: string | null = null;

    if (updateCandidateDto.storeId !== undefined) {
      const store = await this.prisma.store.findFirst({
        where: {
          id: updateCandidateDto.storeId,
          isActive: true,
        },
      });

      if (!store) {
        throw new NotFoundException('Loja não encontrada');
      }

      newStoreName = store.name;
    }

    let newVacancyName: string | null = null;

    if (updateCandidateDto.vacancyId !== undefined) {
      const vacancy = await this.prisma.vacancy.findFirst({
        where: {
          id: updateCandidateDto.vacancyId,
          isActive: true,
        },
      });

      if (!vacancy) {
        throw new NotFoundException('Vaga não encontrada');
      }

      newVacancyName = vacancy.name;
    }

    const updatedCandidate = await this.prisma.candidate.update({
      where: { id },

      data: {
        ...(updateCandidateDto.name !== undefined && {
          name: updateCandidateDto.name.trim(),
        }),

        ...(cpf !== undefined && {
          cpf,
        }),

        ...(updateCandidateDto.phone !== undefined && {
          phone: updateCandidateDto.phone.trim() || null,
        }),

        ...(updateCandidateDto.interviewDate !== undefined && {
          interviewDate: new Date(updateCandidateDto.interviewDate),
        }),

        ...(updateCandidateDto.statusId !== undefined && {
          statusId: updateCandidateDto.statusId,
        }),

        ...(updateCandidateDto.storeId !== undefined && {
          storeId: updateCandidateDto.storeId,
        }),

        ...(updateCandidateDto.vacancyId !== undefined && {
          vacancyId: updateCandidateDto.vacancyId,
        }),

        ...(updateCandidateDto.sentToStoreDate !== undefined && {
          sentToStoreDate: new Date(updateCandidateDto.sentToStoreDate),
        }),

        ...(updateCandidateDto.testDate !== undefined && {
          testDate: new Date(updateCandidateDto.testDate),
        }),

        ...(updateCandidateDto.notes !== undefined && {
          notes: updateCandidateDto.notes.trim() || null,
        }),
      },

      include: {
        status: true,
        store: true,
        vacancy: true,
      },
    });

    const historyEntries: {
      candidateId: number;
      action: string;
      description: string;
    }[] = [];

    if (
      updateCandidateDto.statusId !== undefined &&
      updateCandidateDto.statusId !== candidate.statusId
    ) {
      historyEntries.push({
        candidateId: id,
        action: 'STATUS_CHANGED',
        description: `Status alterado de "${candidate.status?.name ?? 'Sem status'}" para "${newStatusName}"`,
      });
    }

    if (
      updateCandidateDto.storeId !== undefined &&
      updateCandidateDto.storeId !== candidate.storeId
    ) {
      historyEntries.push({
        candidateId: id,
        action: 'STORE_CHANGED',
        description: `Loja alterada de "${candidate.store?.name ?? 'Sem loja'}" para "${newStoreName}"`,
      });
    }

    if (
      updateCandidateDto.vacancyId !== undefined &&
      updateCandidateDto.vacancyId !== candidate.vacancyId
    ) {
      historyEntries.push({
        candidateId: id,
        action: 'VACANCY_CHANGED',
        description: `Vaga alterada de "${candidate.vacancy?.name ?? 'Sem vaga'}" para "${newVacancyName}"`,
      });
    }

    if (
      updateCandidateDto.sentToStoreDate !== undefined &&
      updateCandidateDto.sentToStoreDate !==
        candidate.sentToStoreDate?.toISOString().slice(0, 10)
    ) {
      historyEntries.push({
        candidateId: id,
        action: 'SENT_TO_STORE_DATE_CHANGED',
        description: `Data de envio para loja alterada para ${updateCandidateDto.sentToStoreDate}`,
      });
    }

    if (
      updateCandidateDto.testDate !== undefined &&
      updateCandidateDto.testDate !==
        candidate.testDate?.toISOString().slice(0, 10)
    ) {
      historyEntries.push({
        candidateId: id,
        action: 'TEST_DATE_CHANGED',
        description: `Data do teste alterada para ${updateCandidateDto.testDate}`,
      });
    }

    if (
      updateCandidateDto.notes !== undefined &&
      updateCandidateDto.notes.trim() !== (candidate.notes ?? '')
    ) {
      historyEntries.push({
        candidateId: id,
        action: 'NOTES_CHANGED',
        description: 'Observações do candidato foram alteradas',
      });
    }

    if (historyEntries.length > 0) {
      await this.prisma.candidateHistory.createMany({
        data: historyEntries,
      });
    }

    return updatedCandidate;
  }
}
