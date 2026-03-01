import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PlansService } from './plans.service';
import { CreatePlanDto, createPlanSchema } from './dto/create-plan.dto';
import { UpdatePlanDto, updatePlanSchema } from './dto/update-plan.dto';

@Controller('plans')
@UseGuards(AuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('MASTER', 'ADMIN', 'STAFF')
  create(
    @Body(new ZodValidationPipe(createPlanSchema))
    createPlanDto: CreatePlanDto,
  ) {
    return this.plansService.create(createPlanDto);
  }

  @Get()
  @AllowAnonymous()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.plansService.findAll({
      includeInactive: includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Get(':id')
  @AllowAnonymous()
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePlanSchema))
    updatePlanDto: UpdatePlanDto,
  ) {
    return this.plansService.update(id, updatePlanDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}
