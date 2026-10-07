import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createStatusDto: CreateStatusDto) {
    const { name } = createStatusDto;

    return this.prisma.status.create({
      data: {
        name: name.trim(),
      },
    });
  }

  async findAll() {
    return this.prisma.status.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async update(id: number, updateStatusDto: UpdateStatusDto) {
    const status = await this.prisma.status.findUnique({
      where: { id },
    });

    if (!status) {
      throw new NotFoundException('Status não encontrado');
    }

    return this.prisma.status.update({
      where: { id },
      data: {
        name: updateStatusDto.name.trim(),
      },
    });
  }

  async remove(id: number) {
    const status = await this.prisma.status.findUnique({
      where: { id },
    });

    if (!status) {
      throw new NotFoundException('Status não encontrado');
    }

    return this.prisma.status.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }
}
