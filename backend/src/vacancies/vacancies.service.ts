import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVacancyDto } from './dto/create-vacancy.dto';
import { UpdateVacancyDto } from './dto/update-vacancy.dto';

@Injectable()
export class VacanciesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createVacancyDto: CreateVacancyDto) {
    if (createVacancyDto.storeId) {
      const store = await this.prisma.store.findFirst({
        where: {
          id: createVacancyDto.storeId,
          isActive: true,
        },
      });

      if (!store) {
        throw new NotFoundException('Loja não encontrada');
      }
    }

    return this.prisma.vacancy.create({
      data: {
        name: createVacancyDto.name.trim(),
        quantity: createVacancyDto.quantity ?? 1,
        openingDate: createVacancyDto.openingDate
          ? new Date(createVacancyDto.openingDate)
          : null,
        storeId: createVacancyDto.storeId ?? null,
        notes: createVacancyDto.notes?.trim() || null,
      },
      include: {
        store: true,
      },
    });
  }

  async findAll() {
    return this.prisma.vacancy.findMany({
      where: {
        isActive: true,
      },
      include: {
        store: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async update(id: number, updateVacancyDto: UpdateVacancyDto) {
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { id },
    });

    if (!vacancy) {
      throw new NotFoundException('Vaga não encontrada');
    }

    if (updateVacancyDto.storeId) {
      const store = await this.prisma.store.findFirst({
        where: {
          id: updateVacancyDto.storeId,
          isActive: true,
        },
      });

      if (!store) {
        throw new NotFoundException('Loja não encontrada');
      }
    }

    return this.prisma.vacancy.update({
      where: { id },
      data: {
        ...(updateVacancyDto.name !== undefined && {
          name: updateVacancyDto.name.trim(),
        }),
        ...(updateVacancyDto.quantity !== undefined && {
          quantity: updateVacancyDto.quantity,
        }),
        ...(updateVacancyDto.openingDate !== undefined && {
          openingDate: new Date(updateVacancyDto.openingDate),
        }),
        ...(updateVacancyDto.storeId !== undefined && {
          storeId: updateVacancyDto.storeId,
        }),
        ...(updateVacancyDto.notes !== undefined && {
          notes: updateVacancyDto.notes.trim() || null,
        }),
      },
      include: {
        store: true,
      },
    });
  }

  async remove(id: number) {
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { id },
    });

    if (!vacancy) {
      throw new NotFoundException('Vaga não encontrada');
    }

    return this.prisma.vacancy.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }
}
