import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createStoreDto: CreateStoreDto) {
    return this.prisma.store.create({
      data: {
        name: createStoreDto.name.trim(),
      },
    });
  }

  async findAll() {
    return this.prisma.store.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async update(id: number, updateStoreDto: UpdateStoreDto) {
    const store = await this.prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    return this.prisma.store.update({
      where: { id },
      data: {
        name: updateStoreDto.name.trim(),
      },
    });
  }

  async remove(id: number) {
    const store = await this.prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      throw new NotFoundException('Loja não encontrada');
    }

    return this.prisma.store.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }
}
