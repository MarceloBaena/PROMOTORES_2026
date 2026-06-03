import { BadRequestException } from '@nestjs/common';
import { RouteStopStatus, VisitCompletionStatus } from '@prisma/client';

export enum OperationalVisitStatus {
  PENDENTE = 'PENDENTE',
  EM_ATENDIMENTO = 'EM_ATENDIMENTO',
  CONCLUIDA = 'CONCLUIDA',
  PARCIAL = 'PARCIAL',
  NAO_REALIZADA = 'NAO_REALIZADA',
}

export const mapCompletionToRouteStopStatus = (
  status: VisitCompletionStatus,
) => {
  switch (status) {
    case VisitCompletionStatus.COMPLETED:
      return RouteStopStatus.COMPLETED;
    case VisitCompletionStatus.PARTIAL:
      return RouteStopStatus.PARTIAL;
    case VisitCompletionStatus.NOT_DONE:
      return RouteStopStatus.NOT_DONE;
  }
};

export const mapOperationalVisitStatusToRouteStopStatuses = (
  status: OperationalVisitStatus,
): RouteStopStatus[] => {
  switch (status) {
    case OperationalVisitStatus.PENDENTE:
      return [RouteStopStatus.PLANNED];
    case OperationalVisitStatus.EM_ATENDIMENTO:
      return [RouteStopStatus.IN_PROGRESS, RouteStopStatus.SYNC_PENDING];
    case OperationalVisitStatus.CONCLUIDA:
      return [RouteStopStatus.CHECKED_OUT, RouteStopStatus.COMPLETED];
    case OperationalVisitStatus.PARCIAL:
      return [RouteStopStatus.PARTIAL];
    case OperationalVisitStatus.NAO_REALIZADA:
      return [RouteStopStatus.NOT_DONE];
  }
};

export const mapOperationalVisitStatusToPrimaryRouteStopStatus = (
  status: OperationalVisitStatus,
): RouteStopStatus => {
  const [primaryStatus] = mapOperationalVisitStatusToRouteStopStatuses(status);
  return primaryStatus;
};

export const mapRouteStopStatusToOperationalVisitStatus = (
  status: RouteStopStatus,
): OperationalVisitStatus => {
  switch (status) {
    case RouteStopStatus.PLANNED:
      return OperationalVisitStatus.PENDENTE;
    case RouteStopStatus.IN_PROGRESS:
    case RouteStopStatus.SYNC_PENDING:
      return OperationalVisitStatus.EM_ATENDIMENTO;
    case RouteStopStatus.CHECKED_OUT:
    case RouteStopStatus.COMPLETED:
      return OperationalVisitStatus.CONCLUIDA;
    case RouteStopStatus.PARTIAL:
      return OperationalVisitStatus.PARCIAL;
    case RouteStopStatus.NOT_DONE:
      return OperationalVisitStatus.NAO_REALIZADA;
  }
};

export const assertMutableOperationalVisitStatus = (
  status: OperationalVisitStatus,
) => {
  switch (status) {
    case OperationalVisitStatus.EM_ATENDIMENTO:
    case OperationalVisitStatus.PARCIAL:
    case OperationalVisitStatus.NAO_REALIZADA:
      return status;
    case OperationalVisitStatus.PENDENTE:
      throw new BadRequestException(
        'Nao e possivel retornar uma visita aberta para pendente',
      );
    case OperationalVisitStatus.CONCLUIDA:
      throw new BadRequestException('Use o check-out para concluir a visita');
  }
};
