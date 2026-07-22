import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrudPage } from "./CrudPage";
import { apiJson } from "../lib/api";

vi.mock("../lib/api", () => ({
  apiJson: vi.fn()
}));

const mockedApiJson = vi.mocked(apiJson);

afterEach(() => {
  cleanup();
});

const fields = [
  { name: "code", label: "Codigo", readOnly: true, noSubmit: true },
  { name: "name", label: "Nome", required: true },
  { name: "document", label: "Documento" },
  {
    name: "status",
    label: "Situacao",
    type: "select" as const,
    options: [
      { value: "ACTIVE", label: "Ativo" },
      { value: "INACTIVE", label: "Inativo" }
    ]
  }
];

const columns = [
  {
    label: "Cliente",
    value: (item: Record<string, unknown>) => String(item.name ?? "")
  }
];

function renderCrudPage() {
  return render(
    <CrudPage
      title="Clientes"
      endpoint="/clients"
      fields={fields}
      columns={columns}
      initialValues={{ code: "", name: "", document: "", status: "ACTIVE" }}
      formPlacement="top"
      startFormCollapsed
      createButtonLabel="Incluir cliente"
    />
  );
}

describe("CrudPage com formulario superior", () => {
  beforeEach(() => {
    mockedApiJson.mockReset();
    mockedApiJson.mockResolvedValue({
      data: [
        {
          id: "client-1",
          code: "001",
          name: "Cliente Teste",
          document: "123",
          status: "ACTIVE"
        }
      ]
    });
  });

  it("abre e fecha o formulario pelo botao de novo cliente", async () => {
    const user = userEvent.setup();
    renderCrudPage();

    expect(await screen.findByText("Cliente Teste")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /nome/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /novo cliente/i }));
    expect(screen.getByRole("heading", { name: /incluir cliente/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /nome/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /limpar/i }));
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: /nome/i })).not.toBeInTheDocument();
    });
  });

  it("inclui um cliente e recolhe o formulario apos sucesso", async () => {
    const user = userEvent.setup();
    mockedApiJson
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { id: "client-2" } })
      .mockResolvedValueOnce({
        data: [{ id: "client-2", code: "002", name: "Novo Cliente", status: "ACTIVE" }]
      });

    renderCrudPage();

    await user.click(await screen.findByRole("button", { name: /novo cliente/i }));
    await user.type(screen.getByRole("textbox", { name: /nome/i }), "Novo Cliente");
    await user.click(screen.getByRole("button", { name: /incluir cliente/i }));

    await waitFor(() => {
      expect(mockedApiJson).toHaveBeenCalledWith("/clients", {
        method: "POST",
        body: JSON.stringify({ name: "Novo Cliente", status: "ACTIVE" })
      });
    });
    expect(await screen.findByText("Registro incluido com sucesso.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /nome/i })).not.toBeInTheDocument();
  });

  it("abre o mesmo formulario preenchido durante edicao", async () => {
    const user = userEvent.setup();
    renderCrudPage();

    await user.click(await screen.findByRole("button", { name: /alterar/i }));

    expect(screen.getByRole("heading", { name: /alterar ficha do cliente/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /nome/i })).toHaveValue("Cliente Teste");
    expect(screen.getByRole("textbox", { name: /documento/i })).toHaveValue("123");
  });
});

describe("CrudPage com selecao multipla", () => {
  beforeEach(() => {
    mockedApiJson.mockReset();
    mockedApiJson.mockResolvedValue({ data: [] });
  });

  it("permite selecionar todas as opcoes de uma vez", async () => {
    const user = userEvent.setup();

    mockedApiJson
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: { id: "supplier-1" } })
      .mockResolvedValueOnce({ data: [] });

    render(
      <CrudPage
        title="Fornecedores"
        endpoint="/suppliers"
        fields={[
          { name: "name", label: "Nome", required: true },
          {
            name: "activityIds",
            label: "Atividades executadas neste fornecedor",
            type: "multiselect",
            options: [
              { value: "activity-1", label: "Verificar ruptura" },
              { value: "activity-2", label: "Conferir exposicao" }
            ]
          }
        ]}
        columns={columns}
        initialValues={{ name: "", activityIds: [] }}
        formPlacement="top"
        startFormCollapsed
        createButtonLabel="Salvar fornecedor"
      />
    );

    await user.click(await screen.findByRole("button", { name: /incluir/i }));
    await user.type(screen.getByRole("textbox", { name: /nome/i }), "Fornecedor Teste");
    await user.click(screen.getByRole("button", { name: /selecionar todas/i }));
    await user.click(screen.getByRole("button", { name: /salvar fornecedor/i }));

    await waitFor(() => {
      expect(mockedApiJson).toHaveBeenCalledWith("/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: "Fornecedor Teste",
          activityIds: ["activity-1", "activity-2"]
        })
      });
    });
  });
});
