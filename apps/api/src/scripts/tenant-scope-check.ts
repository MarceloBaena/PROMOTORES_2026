import "dotenv/config";
import { loadConfig } from "../config/env";
import { prisma } from "../lib/prisma";

function pushIssue(issues: string[], label: string, details: string) {
  issues.push(`${label}: ${details}`);
}

async function main() {
  const { config, issues: configIssues } = loadConfig({ requireDatabase: true });

  if (!config || configIssues.length > 0) {
    throw new Error(`Tenant scope check invalid: ${configIssues.join(" ")}`);
  }

  const issues: string[] = [];

  const [supervisors, promoters, clients, clientSuppliers, clientActivities, routes, visits] = await Promise.all([
    prisma.supervisor.findMany({
      select: {
        id: true,
        code: true,
        companyId: true,
        user: {
          select: {
            email: true,
            companyId: true
          }
        }
      }
    }),
    prisma.promoter.findMany({
      select: {
        id: true,
        code: true,
        companyId: true,
        user: {
          select: {
            email: true,
            companyId: true
          }
        },
        supervisor: {
          select: {
            code: true,
            companyId: true
          }
        }
      }
    }),
    prisma.client.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        companyId: true,
        defaultPromoter: {
          select: {
            code: true,
            companyId: true
          }
        }
      }
    }),
    prisma.clientSupplier.findMany({
      select: {
        id: true,
        client: {
          select: {
            name: true,
            companyId: true
          }
        },
        supplier: {
          select: {
            name: true,
            companyId: true
          }
        }
      }
    }),
    prisma.clientActivityAssignment.findMany({
      select: {
        id: true,
        client: {
          select: {
            name: true,
            companyId: true
          }
        },
        activity: {
          select: {
            name: true,
            companyId: true
          }
        }
      }
    }),
    prisma.route.findMany({
      select: {
        id: true,
        name: true,
        companyId: true,
        supervisor: {
          select: {
            code: true,
            companyId: true
          }
        },
        promoter: {
          select: {
            code: true,
            companyId: true
          }
        }
      }
    }),
    prisma.visit.findMany({
      select: {
        id: true,
        clientGeneratedId: true,
        companyId: true,
        client: {
          select: {
            name: true,
            companyId: true
          }
        },
        promoter: {
          select: {
            code: true,
            companyId: true
          }
        },
        route: {
          select: {
            name: true,
            companyId: true
          }
        }
      }
    })
  ]);

  for (const supervisor of supervisors) {
    if (supervisor.companyId && supervisor.user.companyId && supervisor.companyId !== supervisor.user.companyId) {
      pushIssue(
        issues,
        "Supervisor x usuario",
        `SUP-${String(supervisor.code).padStart(4, "0")} (${supervisor.user.email}) possui companyId divergente.`
      );
    }
  }

  for (const promoter of promoters) {
    if (promoter.companyId && promoter.user.companyId && promoter.companyId !== promoter.user.companyId) {
      pushIssue(
        issues,
        "Promotor x usuario",
        `PRO-${String(promoter.code).padStart(4, "0")} (${promoter.user.email}) possui companyId divergente.`
      );
    }

    if (promoter.companyId && promoter.supervisor?.companyId && promoter.companyId !== promoter.supervisor.companyId) {
      pushIssue(
        issues,
        "Promotor x supervisor",
        `PRO-${String(promoter.code).padStart(4, "0")} esta vinculado a supervisor de outra empresa.`
      );
    }
  }

  for (const client of clients) {
    if (client.companyId && client.defaultPromoter?.companyId && client.companyId !== client.defaultPromoter.companyId) {
      pushIssue(
        issues,
        "Cliente x promotor padrao",
        `${client.name} (${client.code ?? "sem-codigo"}) aponta para promotor de outra empresa.`
      );
    }
  }

  for (const relation of clientSuppliers) {
    if (relation.client.companyId && relation.supplier.companyId && relation.client.companyId !== relation.supplier.companyId) {
      pushIssue(
        issues,
        "Cliente x fornecedor",
        `${relation.client.name} esta vinculado ao fornecedor ${relation.supplier.name} de outra empresa.`
      );
    }
  }

  for (const relation of clientActivities) {
    if (relation.client.companyId && relation.activity.companyId && relation.client.companyId !== relation.activity.companyId) {
      pushIssue(
        issues,
        "Cliente x atividade",
        `${relation.client.name} esta vinculado a atividade ${relation.activity.name} de outra empresa.`
      );
    }
  }

  for (const route of routes) {
    if (route.companyId && route.supervisor?.companyId && route.companyId !== route.supervisor.companyId) {
      pushIssue(issues, "Rota x supervisor", `${route.name} possui supervisor de outra empresa.`);
    }

    if (route.companyId && route.promoter?.companyId && route.companyId !== route.promoter.companyId) {
      pushIssue(issues, "Rota x promotor", `${route.name} possui promotor de outra empresa.`);
    }
  }

  for (const visit of visits) {
    if (visit.companyId && visit.client.companyId && visit.companyId !== visit.client.companyId) {
      pushIssue(
        issues,
        "Visita x cliente",
        `${visit.clientGeneratedId ?? visit.id} aponta para cliente ${visit.client.name} de outra empresa.`
      );
    }

    if (visit.companyId && visit.promoter?.companyId && visit.companyId !== visit.promoter.companyId) {
      pushIssue(
        issues,
        "Visita x promotor",
        `${visit.clientGeneratedId ?? visit.id} aponta para promotor de outra empresa.`
      );
    }

    if (visit.companyId && visit.route?.companyId && visit.companyId !== visit.route.companyId) {
      pushIssue(
        issues,
        "Visita x rota",
        `${visit.clientGeneratedId ?? visit.id} aponta para rota ${visit.route.name} de outra empresa.`
      );
    }
  }

  if (issues.length > 0) {
    console.error("Falhas de isolamento multiempresa encontradas:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    [
      "Tenant scope check OK.",
      `Supervisores: ${supervisors.length}`,
      `Promotores: ${promoters.length}`,
      `Clientes: ${clients.length}`,
      `Rotas: ${routes.length}`,
      `Visitas: ${visits.length}`
    ].join(" ")
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
