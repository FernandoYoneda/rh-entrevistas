"use client";

import Image from "next/image";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";

type User = {
  id: number;
  name: string;
  email: string;
};

type LoginResponse = {
  accessToken: string;
  user: User;
};

type AuthenticatedUser = {
  sub: number;
  name: string;
  email: string;
};

type Group = { id: number; name: string; total: number };
type DashboardData = {
  filters: { startDate: string | null; endDate: string | null };
  summary: {
    totalCandidates: number;
    withStatus: number;
    withoutStatus: number;
    sentToStore: number;
    testedCandidates: number;
    waitingForTest: number;
    testsToday: number;
    testsNext7Days: number;
    withoutTestDate: number;
    withoutStore: number;
    withoutVacancy: number;
  };
  referenceDates: { today: string; next7DaysEnd: string; timezone: string };
  upcomingTests: {
    id: number;
    name: string;
    testDate: string;
    storeName: string | null;
    vacancyName: string | null;
  }[];
  byStatus: Group[];
  byStore: Group[];
  byVacancy: Group[];
};

function dashboardPeriodQuery(period: "all" | "month", now = new Date()) {
  if (period === "all") return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")!.value;
  const month = parts.find((part) => part.type === "month")!.value;
  const startDate = year + "-" + month + "-01";
  const endDate = new Date(Date.UTC(Number(year), Number(month), 0))
    .toISOString()
    .slice(0, 10);
  return "?" + new URLSearchParams({ startDate, endDate }).toString();
}

function dashboardGroups(groups: Group[], missing: number, label: string) {
  return [
    ...groups,
    ...(missing > 0 ? [{ id: 0, name: label, total: missing }] : []),
  ].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
}

function DistributionBars({
  title,
  groups,
  total,
}: {
  title: string;
  groups: Group[];
  total: number;
}) {
  return (
    <section aria-label={title}>
      <h3 className="text-base font-semibold">{title}</h3>
      {groups.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">
          Nenhum candidato no período.
        </p>
      ) : (
        <ul className="mt-5 space-y-5">
          {groups.map((group) => (
            <li key={group.id}>
              <div className="mb-2 flex items-start justify-between gap-4 text-sm">
                <span className="break-words text-slate-600">{group.name}</span>
                <span className="shrink-0 font-semibold tabular-nums text-[#005260]">
                  {group.total}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-2.5 overflow-hidden rounded-full bg-[#eaf1f1]"
              >
                <div
                  className={
                    group.id === 0
                      ? "h-full rounded-full bg-[#e66b4e]"
                      : "h-full rounded-full bg-[#005260]"
                  }
                  style={{
                    width:
                      (total > 0
                        ? Math.min(100, (group.total / total) * 100)
                        : 0) + "%",
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Dashboard({
  user,
  token,
  onLogout,
}: {
  user: AuthenticatedUser;
  token: string;
  onLogout: () => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [period, setPeriod] = useState<"all" | "month" | "custom">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [appliedPeriod, setAppliedPeriod] = useState<
    | { kind: "all" | "month" }
    | { kind: "custom"; startDate: string; endDate: string }
  >({ kind: "all" });
  const [agendaCandidateId, setAgendaCandidateId] = useState<number | null>(
    null,
  );
  const [view, setView] = useState<
    "dashboard" | "candidates" | "status" | "stores" | "vacancies"
  >("dashboard");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      try {
        const result = await apiFetch<DashboardData>(
          "/dashboard" +
            (appliedPeriod.kind === "custom"
              ? "?" +
                new URLSearchParams({
                  startDate: appliedPeriod.startDate,
                  endDate: appliedPeriod.endDate,
                }).toString()
              : dashboardPeriodQuery(appliedPeriod.kind)),
          {
            token,
            signal: controller.signal,
          },
        );
        if (
          !Array.isArray(result.upcomingTests) ||
          typeof result.summary.testsToday !== "number" ||
          typeof result.summary.testsNext7Days !== "number" ||
          typeof result.summary.withoutTestDate !== "number"
        ) {
          throw new Error(
            "Atualize o arquivo do dashboard no backend e reinicie o servidor para carregar os novos indicadores.",
          );
        }
        if (!cancelled) setData(result);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o painel.",
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, revision, onLogout, appliedPeriod]);

  function applyCustomPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startDate || !endDate) {
      setPeriodError("Informe a data inicial e a data final.");
      return;
    }
    if (startDate > endDate) {
      setPeriodError(
        "A data final deve ser igual ou posterior à data inicial.",
      );
      return;
    }
    setPeriodError("");
    setError("");
    setData(null);
    setBusy(true);
    setAppliedPeriod({ kind: "custom", startDate, endDate });
  }

  function refresh() {
    setError("");
    setBusy(true);
    setRevision((value) => value + 1);
  }

  const metrics = data
    ? ([
        ["Candidatos", data.summary.totalCandidates, "No período selecionado"],
        ["Testes hoje", data.summary.testsToday, "Data marcada para hoje"],
        ["Próximos 7 dias", data.summary.testsNext7Days, "A partir de amanhã"],
        [
          "Sem data de teste",
          data.summary.withoutTestDate,
          "Data ainda não informada",
        ],
      ] as const)
    : [];

  return (
    <div className="min-h-screen bg-[#f4f7f6] text-[#263c40] lg:flex">
      <aside className="flex shrink-0 flex-col bg-[#005260] px-6 py-6 text-white lg:min-h-screen lg:w-64 lg:py-8">
        <div className="w-full max-w-52 overflow-hidden rounded-xl bg-white">
          <Image
            src="/logo-casabella-escrita.png"
            alt="Grupo Casa Bella fragrâncias"
            width={4000}
            height={2250}
            className="h-auto w-full"
            priority
          />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
          Recursos Humanos
        </p>
        <nav aria-label="Menu principal" className="mt-5 space-y-2">
          {(
            [
              ["dashboard", "Visão geral"],
              ["candidates", "Candidatos"],
              ["status", "Status"],
              ["stores", "Lojas"],
              ["vacancies", "Vagas"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setAgendaCandidateId(null);
                setView(key);
              }}
              aria-current={view === key ? "page" : undefined}
              className={
                "block w-full rounded-xl border-l-4 px-4 py-3 text-left font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white " +
                (view === key
                  ? "border-[#e66b4e] bg-white/10"
                  : "border-transparent text-white/80 hover:bg-white/5")
              }
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-8 border-t border-white/15 pt-5 lg:mt-auto">
          <p className="break-words font-medium">{user.name}</p>
          <p className="mt-1 break-all text-xs text-white/70">{user.email}</p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-4 rounded-lg border border-white/30 px-4 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Sair
          </button>
        </div>
      </aside>
      {view === "candidates" ? (
        <Candidates
          token={token}
          onLogout={onLogout}
          onCreated={refresh}
          initialEditingId={agendaCandidateId}
        />
      ) : view === "status" ? (
        <StatusManager token={token} onLogout={onLogout} onChanged={refresh} />
      ) : view === "stores" ? (
        <StoresManager token={token} onLogout={onLogout} onChanged={refresh} />
      ) : view === "vacancies" ? (
        <VacanciesManager
          token={token}
          onLogout={onLogout}
          onChanged={refresh}
        />
      ) : (
        <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
          <header className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#005260]">
                Portal Casa Bella
              </p>
              <h1 className="mt-2 text-3xl font-semibold">
                Panorama da seleção
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Distribuição dos candidatos e agenda de testes.
              </p>
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={busy}
              className="rounded-xl bg-[#005260] px-5 py-3 text-sm font-semibold text-white hover:bg-[#003e49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60"
            >
              {busy ? "Carregando..." : "Atualizar dados"}
            </button>
          </header>
          <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <label htmlFor="dashboard-period" className="text-sm font-medium">
                Período das entrevistas
              </label>
              <select
                id="dashboard-period"
                value={period}
                onChange={(event) => {
                  const selected = event.target.value as
                    | "all"
                    | "month"
                    | "custom";
                  setPeriod(selected);
                  setPeriodError("");
                  if (selected !== "custom") {
                    setAppliedPeriod({ kind: selected });
                    setData(null);
                    setError("");
                    setBusy(true);
                  }
                }}
                disabled={busy}
                className="mt-2 block rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#005260] focus:ring-2 focus:ring-[#005260]/15 disabled:opacity-60"
              >
                <option value="all">Todos os períodos</option>
                <option value="month">Este mês</option>
                <option value="custom">Período personalizado</option>
              </select>
            </div>
            {data && (
              <p className="text-xs text-slate-500">
                Hoje: {formatInterviewDate(data.referenceDates.today)} · Horário
                de Brasília
              </p>
            )}
          </div>
          {period === "custom" && (
            <form
              onSubmit={applyCustomPeriod}
              className="mt-4 rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-0 flex-1 sm:flex-none">
                  <label
                    htmlFor="dashboard-start-date"
                    className="block text-sm font-medium"
                  >
                    Data inicial
                  </label>
                  <input
                    id="dashboard-start-date"
                    type="date"
                    required
                    value={startDate}
                    onChange={(event) => {
                      setStartDate(event.target.value);
                      setPeriodError("");
                    }}
                    disabled={busy}
                    aria-describedby="dashboard-custom-hint"
                    aria-invalid={periodError ? true : undefined}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#005260] focus:ring-2 focus:ring-[#005260]/15 disabled:opacity-60"
                  />
                </div>
                <div className="min-w-0 flex-1 sm:flex-none">
                  <label
                    htmlFor="dashboard-end-date"
                    className="block text-sm font-medium"
                  >
                    Data final
                  </label>
                  <input
                    id="dashboard-end-date"
                    type="date"
                    required
                    value={endDate}
                    onChange={(event) => {
                      setEndDate(event.target.value);
                      setPeriodError("");
                    }}
                    disabled={busy}
                    aria-describedby="dashboard-custom-hint"
                    aria-invalid={periodError ? true : undefined}
                    className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#005260] focus:ring-2 focus:ring-[#005260]/15 disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-[#005260] px-5 py-3 text-sm font-semibold text-white hover:bg-[#003e49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60"
                >
                  Aplicar período
                </button>
              </div>
              <p
                id="dashboard-custom-hint"
                className="mt-3 text-xs text-slate-500"
              >
                Selecione as datas das entrevistas e clique em Aplicar período.
                As duas datas estão incluídas na consulta.
              </p>
              {periodError && (
                <p role="alert" className="mt-3 text-sm text-red-700">
                  {periodError}
                </p>
              )}
            </form>
          )}
          {data && (
            <p className="mt-4 text-sm font-medium text-[#005260]">
              Período aplicado:{" "}
              {data.filters.startDate && data.filters.endDate
                ? formatInterviewDate(data.filters.startDate) +
                  " a " +
                  formatInterviewDate(data.filters.endDate)
                : "Todos os períodos"}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Todos os indicadores e gráficos consideram os candidatos
            entrevistados no período selecionado. As datas de teste representam
            agendamentos.
          </p>
          <div role="status" className="mt-4 text-sm text-slate-600">
            {busy ? "Buscando indicadores..." : ""}
          </div>
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
              {data
                ? " Os números abaixo são da última consulta concluída."
                : ""}
            </p>
          )}
          {data && (
            <>
              <section
                aria-label="Indicadores"
                className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"
              >
                {metrics.map(([label, value, context], index) => (
                  <article
                    key={label}
                    className={
                      "rounded-2xl border border-[#005260]/10 bg-white p-6 shadow-sm " +
                      (index === 1 ? "border-t-[3px] border-t-[#e66b4e]" : "")
                    }
                  >
                    <p className="text-sm font-medium text-slate-600">
                      {label}
                    </p>
                    <p className="mt-4 text-4xl font-semibold tabular-nums text-[#005260]">
                      {value}
                    </p>
                    <p className="mt-3 text-xs text-slate-500">{context}</p>
                  </article>
                ))}
              </section>
              <section
                aria-label="Distribuição dos candidatos"
                className="mt-7 rounded-2xl border border-[#005260]/10 bg-white p-6 shadow-sm sm:p-8"
              >
                <h2 className="text-lg font-semibold">
                  Candidatos no processo seletivo
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Os números das barras indicam candidatos.
                </p>
                <div className="mt-7 grid gap-8 xl:grid-cols-3">
                  <DistributionBars
                    title="Por status"
                    groups={dashboardGroups(
                      data.byStatus,
                      data.summary.withoutStatus,
                      "Sem status ativo",
                    )}
                    total={data.summary.totalCandidates}
                  />
                  <DistributionBars
                    title="Por loja"
                    groups={dashboardGroups(
                      data.byStore,
                      data.summary.withoutStore,
                      "Sem loja ativa",
                    )}
                    total={data.summary.totalCandidates}
                  />
                  <DistributionBars
                    title="Por vaga"
                    groups={dashboardGroups(
                      data.byVacancy,
                      data.summary.withoutVacancy,
                      "Sem vaga ativa",
                    )}
                    total={data.summary.totalCandidates}
                  />
                </div>
              </section>
              <section
                aria-label="Agenda de testes"
                className="mt-7 rounded-2xl border border-[#005260]/10 bg-white p-6 shadow-sm sm:p-8"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Agenda de testes</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      De hoje até{" "}
                      {formatInterviewDate(data.referenceDates.next7DaysEnd)}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setView("candidates")}
                    className="rounded-xl border border-[#005260]/25 px-4 py-2.5 text-sm font-semibold text-[#005260] hover:bg-[#eaf4f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260]"
                  >
                    Ver candidatos
                  </button>
                </div>
                {data.upcomingTests.length === 0 ? (
                  <p className="mt-6 text-sm text-slate-500">
                    Nenhum teste agendado nesse intervalo para os candidatos
                    selecionados.
                  </p>
                ) : (
                  <div
                    role="region"
                    aria-label="Testes agendados"
                    tabIndex={0}
                    className="mt-6 overflow-x-auto focus-visible:outline-2 focus-visible:outline-[#005260]"
                  >
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <caption className="sr-only">
                        Testes de hoje e dos próximos sete dias
                      </caption>
                      <thead className="text-slate-500">
                        <tr>
                          {["Data", "Candidato", "Loja", "Vaga"].map(
                            (label) => (
                              <th
                                key={label}
                                scope="col"
                                className="px-3 py-3 font-medium"
                              >
                                {label}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.upcomingTests.map((test) => (
                          <tr key={test.id} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap px-3 py-4">
                              <span className="font-semibold tabular-nums text-[#005260]">
                                {formatInterviewDate(test.testDate)}
                              </span>
                              {test.testDate === data.referenceDates.today && (
                                <span className="ml-2 rounded-full bg-[#fff0e9] px-2 py-1 text-xs font-medium text-[#a34027]">
                                  Hoje
                                </span>
                              )}
                            </td>
                            <th scope="row" className="px-3 py-4 font-medium">
                              <button
                                type="button"
                                onClick={() => {
                                  setAgendaCandidateId(test.id);
                                  setView("candidates");
                                }}
                                aria-label={"Editar candidato " + test.name}
                                className="rounded-sm text-left font-semibold text-[#005260] underline decoration-[#005260]/40 underline-offset-4 transition hover:text-[#003e49] hover:decoration-[#005260] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#005260]"
                              >
                                {test.name}
                              </button>
                            </th>
                            <td className="px-3 py-4 text-slate-600">
                              {test.storeName ?? "Sem loja ativa"}
                            </td>
                            <td className="px-3 py-4 text-slate-600">
                              {test.vacancyName ?? "Sem vaga ativa"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="mt-10 text-xs text-slate-500">
            Grupo Casa Bella · Recursos Humanos
          </footer>
        </main>
      )}
    </div>
  );
}

type StatusItem = { id: number; name: string; isActive: boolean };

function StatusManager({
  token,
  onLogout,
  onChanged,
}: {
  token: string;
  onLogout: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<StatusItem[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<StatusItem | null>(null);
  const [pendingInactive, setPendingInactive] = useState<StatusItem | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function load() {
      try {
        const result = await apiFetch<StatusItem[]>("/status", {
          token,
          signal: controller.signal,
        });
        if (!Array.isArray(result))
          throw new Error("O servidor retornou uma lista de status inválida.");
        if (!cancelled) setItems(result);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os status.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, revision, onLogout]);

  function reload() {
    setLoading(true);
    setError("");
    setItems([]);
    setRevision((value) => value + 1);
  }

  function cancelEdit() {
    setEditing(null);
    setName("");
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    const trimmed = name.trim();
    setError("");
    setSuccess("");
    if (!trimmed) {
      setError("Informe o nome do status.");
      return;
    }
    if (editing && trimmed === editing.name) {
      setError("Altere o nome do status ou clique em Cancelar edição.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<StatusItem>(
        editing ? "/status/" + editing.id : "/status",
        {
          method: editing ? "PATCH" : "POST",
          token,
          body: JSON.stringify({ name: trimmed }),
        },
      );
      setSuccess(
        "Status " +
          result.name +
          (editing ? " atualizado com sucesso." : " cadastrado com sucesso."),
      );
      setEditing(null);
      setName("");
      reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar o status.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function inactivate() {
    if (!pendingInactive || saving || loading) return;
    const selected = pendingInactive;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch<StatusItem>("/status/" + selected.id, {
        method: "DELETE",
        token,
      });
      setPendingInactive(null);
      if (editing?.id === selected.id) {
        setEditing(null);
        setName("");
      }
      setSuccess("Status " + selected.name + " inativado com sucesso.");
      reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível inativar o status.",
      );
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || loading;
  const buttonClass =
    "rounded-xl bg-[#005260] px-5 py-3 text-sm font-semibold text-white hover:bg-[#003e49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60";
  const secondaryClass =
    "rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60";

  return (
    <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#005260]">
            Portal Casa Bella
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Status</h1>
          <p className="mt-2 text-sm text-slate-500">
            Organize as opções usadas para acompanhar os candidatos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPendingInactive(null);
            reload();
          }}
          disabled={disabled}
          className={secondaryClass}
        >
          Atualizar lista
        </button>
      </header>

      {success && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-[#005260]/15 bg-[#eaf4f1] p-4 text-sm text-[#005260]"
        >
          {success}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={save}
        className="mt-7 rounded-2xl border border-[#005260]/10 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">
          {editing ? "Editar status" : "Novo status"}
        </h2>
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="status-name" className="text-sm font-medium">
              Nome do status *
            </label>
            <input
              id="status-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              disabled={disabled || !!pendingInactive}
              placeholder="Ex.: Aguardando entrevista"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#005260] focus:ring-2 focus:ring-[#005260]/15 disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={disabled || !!pendingInactive}
            className={buttonClass}
          >
            {saving
              ? "Salvando..."
              : editing
                ? "Salvar alterações"
                : "Cadastrar status"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={cancelEdit}
              disabled={disabled || !!pendingInactive}
              className={secondaryClass}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {pendingInactive && (
        <section
          aria-labelledby="inactive-title"
          className="mt-6 rounded-2xl border border-[#e66b4e]/40 bg-[#fff7f3] p-6"
        >
          <h2 id="inactive-title" className="font-semibold">
            Inativar o status {pendingInactive.name}?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ele deixará de aparecer nas opções de seleção e nos dados atuais dos
            candidatos. Os vínculos anteriores serão preservados.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void inactivate()}
              disabled={disabled}
              className="rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
            >
              {saving ? "Inativando..." : "Confirmar inativação"}
            </button>
            <button
              type="button"
              onClick={() => setPendingInactive(null)}
              disabled={disabled}
              className={secondaryClass}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      <div role="status" className="mt-6 text-sm text-slate-600">
        {loading
          ? "Carregando status..."
          : items.length +
            (items.length === 1 ? " status ativo" : " status ativos")}
      </div>
      {!loading && items.length === 0 && !error && (
        <p className="mt-4 rounded-2xl border border-[#005260]/10 bg-white p-8 text-sm text-slate-500">
          Nenhum status ativo cadastrado.
        </p>
      )}
      {!loading && items.length > 0 && (
        <div
          role="region"
          aria-label="Status ativos"
          tabIndex={0}
          className="mt-4 overflow-x-auto rounded-2xl border border-[#005260]/10 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-[#005260]"
        >
          <table className="w-full min-w-[440px] text-left text-sm">
            <caption className="sr-only">
              Status disponíveis para os candidatos
            </caption>
            <thead className="bg-[#eaf4f1] text-[#005260]">
              <tr>
                <th scope="col" className="px-5 py-4">
                  Nome
                </th>
                <th scope="col" className="px-5 py-4">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <th scope="row" className="px-5 py-4 font-medium">
                    {item.name}
                  </th>
                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={disabled || !!pendingInactive}
                        onClick={() => {
                          setEditing(item);
                          setName(item.name);
                          setSuccess("");
                          setError("");
                        }}
                        aria-label={"Editar status " + item.name}
                        className="rounded-lg border border-[#005260]/25 px-3 py-2 font-semibold text-[#005260] hover:bg-[#eaf4f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={disabled || !!pendingInactive}
                        onClick={() => {
                          setPendingInactive(item);
                          setSuccess("");
                          setError("");
                        }}
                        aria-label={"Inativar status " + item.name}
                        className="rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
                      >
                        Inativar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="mt-10 text-xs text-slate-500">
        Grupo Casa Bella · Recursos Humanos
      </footer>
    </main>
  );
}

type StoreItem = { id: number; name: string; isActive: boolean };

function StoresManager({
  token,
  onLogout,
  onChanged,
}: {
  token: string;
  onLogout: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [pendingInactive, setPendingInactive] = useState<StoreItem | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function load() {
      try {
        const result = await apiFetch<StoreItem[]>("/stores", {
          token,
          signal: controller.signal,
        });
        if (!Array.isArray(result))
          throw new Error("O servidor retornou uma lista de lojas inválida.");
        if (!cancelled) setItems(result);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as lojas.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, revision, onLogout]);

  function reload() {
    setLoading(true);
    setError("");
    setItems([]);
    setRevision((value) => value + 1);
  }

  function cancelEdit() {
    setEditing(null);
    setName("");
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    const trimmed = name.trim();
    setError("");
    setSuccess("");
    if (!trimmed) {
      setError("Informe o nome da loja.");
      return;
    }
    if (editing && trimmed === editing.name) {
      setError("Altere o nome da loja ou clique em Cancelar edição.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<StoreItem>(
        editing ? "/stores/" + editing.id : "/stores",
        {
          method: editing ? "PATCH" : "POST",
          token,
          body: JSON.stringify({ name: trimmed }),
        },
      );
      setSuccess(
        "Loja " +
          result.name +
          (editing ? " atualizada com sucesso." : " cadastrada com sucesso."),
      );
      setEditing(null);
      setName("");
      reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(
        err instanceof Error ? err.message : "Não foi possível salvar a loja.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function inactivate() {
    if (!pendingInactive || saving || loading) return;
    const selected = pendingInactive;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch<StoreItem>("/stores/" + selected.id, {
        method: "DELETE",
        token,
      });
      setPendingInactive(null);
      if (editing?.id === selected.id) {
        setEditing(null);
        setName("");
      }
      setSuccess("Loja " + selected.name + " inativada com sucesso.");
      reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível inativar a loja.",
      );
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || loading;
  const buttonClass =
    "rounded-xl bg-[#005260] px-5 py-3 text-sm font-semibold text-white hover:bg-[#003e49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60";
  const secondaryClass =
    "rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60";

  return (
    <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#005260]">
            Portal Casa Bella
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Lojas</h1>
          <p className="mt-2 text-sm text-slate-500">
            Gerencie as lojas que participam do processo seletivo.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPendingInactive(null);
            reload();
          }}
          disabled={disabled}
          className={secondaryClass}
        >
          Atualizar lista
        </button>
      </header>

      {success && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-[#005260]/15 bg-[#eaf4f1] p-4 text-sm text-[#005260]"
        >
          {success}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={save}
        className="mt-7 rounded-2xl border border-[#005260]/10 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">
          {editing ? "Editar loja" : "Nova loja"}
        </h2>
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="store-name" className="text-sm font-medium">
              Nome da loja *
            </label>
            <input
              id="store-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={150}
              required
              disabled={disabled || !!pendingInactive}
              placeholder="Ex.: Shopping Cidade"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#005260] focus:ring-2 focus:ring-[#005260]/15 disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={disabled || !!pendingInactive}
            className={buttonClass}
          >
            {saving
              ? "Salvando..."
              : editing
                ? "Salvar alterações"
                : "Cadastrar loja"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={cancelEdit}
              disabled={disabled || !!pendingInactive}
              className={secondaryClass}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {pendingInactive && (
        <section
          aria-labelledby="inactive-title"
          className="mt-6 rounded-2xl border border-[#e66b4e]/40 bg-[#fff7f3] p-6"
        >
          <h2 id="inactive-title" className="font-semibold">
            Inativar a loja {pendingInactive.name}?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ela deixará de aparecer nas opções de seleção e nos dados atuais dos
            candidatos. Os vínculos anteriores serão preservados.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void inactivate()}
              disabled={disabled}
              className="rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
            >
              {saving ? "Inativando..." : "Confirmar inativação"}
            </button>
            <button
              type="button"
              onClick={() => setPendingInactive(null)}
              disabled={disabled}
              className={secondaryClass}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      <div role="status" className="mt-6 text-sm text-slate-600">
        {loading
          ? "Carregando lojas..."
          : items.length +
            (items.length === 1 ? " loja ativa" : " lojas ativas")}
      </div>
      {!loading && items.length === 0 && !error && (
        <p className="mt-4 rounded-2xl border border-[#005260]/10 bg-white p-8 text-sm text-slate-500">
          Nenhuma loja ativa cadastrada.
        </p>
      )}
      {!loading && items.length > 0 && (
        <div
          role="region"
          aria-label="Lojas ativas"
          tabIndex={0}
          className="mt-4 overflow-x-auto rounded-2xl border border-[#005260]/10 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-[#005260]"
        >
          <table className="w-full min-w-[440px] text-left text-sm">
            <caption className="sr-only">
              Lojas disponíveis para os candidatos
            </caption>
            <thead className="bg-[#eaf4f1] text-[#005260]">
              <tr>
                <th scope="col" className="px-5 py-4">
                  Nome
                </th>
                <th scope="col" className="px-5 py-4">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <th scope="row" className="px-5 py-4 font-medium">
                    {item.name}
                  </th>
                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={disabled || !!pendingInactive}
                        onClick={() => {
                          setEditing(item);
                          setName(item.name);
                          setSuccess("");
                          setError("");
                        }}
                        aria-label={"Editar loja " + item.name}
                        className="rounded-lg border border-[#005260]/25 px-3 py-2 font-semibold text-[#005260] hover:bg-[#eaf4f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={disabled || !!pendingInactive}
                        onClick={() => {
                          setPendingInactive(item);
                          setSuccess("");
                          setError("");
                        }}
                        aria-label={"Inativar loja " + item.name}
                        className="rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
                      >
                        Inativar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="mt-10 text-xs text-slate-500">
        Grupo Casa Bella · Recursos Humanos
      </footer>
    </main>
  );
}

type VacancyItem = { id: number; name: string; isActive: boolean };

function VacanciesManager({
  token,
  onLogout,
  onChanged,
}: {
  token: string;
  onLogout: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<VacancyItem[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<VacancyItem | null>(null);
  const [pendingInactive, setPendingInactive] = useState<VacancyItem | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function load() {
      try {
        const result = await apiFetch<VacancyItem[]>("/vacancies", {
          token,
          signal: controller.signal,
        });
        if (!Array.isArray(result))
          throw new Error("O servidor retornou uma lista de vagas inválida.");
        if (!cancelled) setItems(result);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as vagas.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, revision, onLogout]);

  function reload() {
    setLoading(true);
    setError("");
    setItems([]);
    setRevision((value) => value + 1);
  }

  function cancelEdit() {
    setEditing(null);
    setName("");
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loading) return;
    const trimmed = name.trim();
    setError("");
    setSuccess("");
    if (!trimmed) {
      setError("Informe o nome da vaga.");
      return;
    }
    if (editing && trimmed === editing.name) {
      setError("Altere o nome da vaga ou clique em Cancelar edição.");
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<VacancyItem>(
        editing ? "/vacancies/" + editing.id : "/vacancies",
        {
          method: editing ? "PATCH" : "POST",
          token,
          body: JSON.stringify({ name: trimmed }),
        },
      );
      setSuccess(
        "Vaga " +
          result.name +
          (editing ? " atualizada com sucesso." : " cadastrada com sucesso."),
      );
      setEditing(null);
      setName("");
      reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(
        err instanceof Error ? err.message : "Não foi possível salvar a vaga.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function inactivate() {
    if (!pendingInactive || saving || loading) return;
    const selected = pendingInactive;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await apiFetch<VacancyItem>("/vacancies/" + selected.id, {
        method: "DELETE",
        token,
      });
      setPendingInactive(null);
      if (editing?.id === selected.id) {
        setEditing(null);
        setName("");
      }
      setSuccess("Vaga " + selected.name + " inativada com sucesso.");
      reload();
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível inativar a vaga.",
      );
    } finally {
      setSaving(false);
    }
  }

  const disabled = saving || loading;
  const buttonClass =
    "rounded-xl bg-[#005260] px-5 py-3 text-sm font-semibold text-white hover:bg-[#003e49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60";
  const secondaryClass =
    "rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60";

  return (
    <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#005260]">
            Portal Casa Bella
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Vagas</h1>
          <p className="mt-2 text-sm text-slate-500">
            Cadastre as funções que serão vinculadas aos candidatos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPendingInactive(null);
            reload();
          }}
          disabled={disabled}
          className={secondaryClass}
        >
          Atualizar lista
        </button>
      </header>

      {success && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-[#005260]/15 bg-[#eaf4f1] p-4 text-sm text-[#005260]"
        >
          {success}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <form
        onSubmit={save}
        className="mt-7 rounded-2xl border border-[#005260]/10 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">
          {editing ? "Editar vaga" : "Nova vaga"}
        </h2>
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 basis-64">
            <label htmlFor="vacancy-name" className="text-sm font-medium">
              Nome da vaga *
            </label>
            <input
              id="vacancy-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={150}
              required
              disabled={disabled || !!pendingInactive}
              placeholder="Ex.: Vendedor"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#005260] focus:ring-2 focus:ring-[#005260]/15 disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={disabled || !!pendingInactive}
            className={buttonClass}
          >
            {saving
              ? "Salvando..."
              : editing
                ? "Salvar alterações"
                : "Cadastrar vaga"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={cancelEdit}
              disabled={disabled || !!pendingInactive}
              className={secondaryClass}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      {pendingInactive && (
        <section
          aria-labelledby="inactive-title"
          className="mt-6 rounded-2xl border border-[#e66b4e]/40 bg-[#fff7f3] p-6"
        >
          <h2 id="inactive-title" className="font-semibold">
            Inativar a vaga {pendingInactive.name}?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Ela deixará de aparecer nas opções de seleção e nos dados atuais dos
            candidatos. Os vínculos anteriores e o histórico serão preservados.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void inactivate()}
              disabled={disabled}
              className="rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
            >
              {saving ? "Inativando..." : "Confirmar inativação"}
            </button>
            <button
              type="button"
              onClick={() => setPendingInactive(null)}
              disabled={disabled}
              className={secondaryClass}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      <div role="status" className="mt-6 text-sm text-slate-600">
        {loading
          ? "Carregando vagas..."
          : items.length +
            (items.length === 1 ? " vaga ativa" : " vagas ativas")}
      </div>
      {!loading && items.length === 0 && !error && (
        <p className="mt-4 rounded-2xl border border-[#005260]/10 bg-white p-8 text-sm text-slate-500">
          Nenhuma vaga ativa cadastrada.
        </p>
      )}
      {!loading && items.length > 0 && (
        <div
          role="region"
          aria-label="Vagas ativas"
          tabIndex={0}
          className="mt-4 overflow-x-auto rounded-2xl border border-[#005260]/10 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-[#005260]"
        >
          <table className="w-full min-w-[440px] text-left text-sm">
            <caption className="sr-only">
              Vagas disponíveis para os candidatos
            </caption>
            <thead className="bg-[#eaf4f1] text-[#005260]">
              <tr>
                <th scope="col" className="px-5 py-4">
                  Nome
                </th>
                <th scope="col" className="px-5 py-4">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <th scope="row" className="px-5 py-4 font-medium">
                    {item.name}
                  </th>
                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={disabled || !!pendingInactive}
                        onClick={() => {
                          setEditing(item);
                          setName(item.name);
                          setSuccess("");
                          setError("");
                        }}
                        aria-label={"Editar vaga " + item.name}
                        className="rounded-lg border border-[#005260]/25 px-3 py-2 font-semibold text-[#005260] hover:bg-[#eaf4f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={disabled || !!pendingInactive}
                        onClick={() => {
                          setPendingInactive(item);
                          setSuccess("");
                          setError("");
                        }}
                        aria-label={"Inativar vaga " + item.name}
                        className="rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60"
                      >
                        Inativar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer className="mt-10 text-xs text-slate-500">
        Grupo Casa Bella · Recursos Humanos
      </footer>
    </main>
  );
}

type Candidate = {
  id: number;
  name: string;
  cpf: string;
  phone: string | null;
  interviewDate: string;
  sentToStoreDate: string | null;
  testDate: string | null;
  notes: string | null;
  status: { id: number; name: string; isActive: boolean } | null;
  store: { id: number; name: string; isActive: boolean } | null;
  vacancy: { id: number; name: string; isActive: boolean } | null;
};

function activeRelationName(
  relation: { name: string; isActive: boolean } | null,
  fallback: string,
) {
  return relation?.isActive ? relation.name : fallback;
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11
    ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : value;
}

function formatInterviewDate(value: string) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [year, month, day] = date.split("-");
  return day + "/" + month + "/" + year;
}

function buildCandidateQuery(filters: {
  name: string;
  statusId: string;
  storeId: string;
  vacancyId: string;
}) {
  const params = new URLSearchParams();
  const name = filters.name.trim();
  if (name) params.set("name", name);
  for (const key of ["statusId", "storeId", "vacancyId"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  return params.toString();
}

function Candidates({
  token,
  onLogout,
  onCreated,
  initialEditingId = null,
}: {
  token: string;
  onLogout: () => void;
  onCreated: () => void;
  initialEditingId?: number | null;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(initialEditingId);
  const [historyCandidate, setHistoryCandidate] = useState<Candidate | null>(
    null,
  );
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [filters, setFilters] = useState({
    statusId: "",
    storeId: "",
    vacancyId: "",
  });
  const [search, setSearch] = useState({
    name: "",
    statusId: "",
    storeId: "",
    vacancyId: "",
    revision: 0,
  });
  const [filterOptions, setFilterOptions] = useState<{
    statuses: Lookup[];
    stores: Lookup[];
    vacancies: Lookup[];
  } | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [filterError, setFilterError] = useState("");
  const [filterRevision, setFilterRevision] = useState(0);
  const [items, setItems] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function loadFilters() {
      try {
        const options = { token, signal: controller.signal };
        const [statuses, stores, vacancies] = await Promise.all([
          apiFetch<Lookup[]>("/status", options),
          apiFetch<Lookup[]>("/stores", options),
          apiFetch<Lookup[]>("/vacancies", options),
        ]);
        if (![statuses, stores, vacancies].every(Array.isArray)) {
          throw new Error("Não foi possível carregar as opções de busca.");
        }
        if (!cancelled) setFilterOptions({ statuses, stores, vacancies });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setFilterError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os filtros.",
        );
      } finally {
        if (!cancelled) setLoadingFilters(false);
      }
    }
    void loadFilters();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, filterRevision, onLogout]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      try {
        const query = buildCandidateQuery(search);
        const result = await apiFetch<Candidate[]>(
          "/candidates" + (query ? "?" + query : ""),
          {
            token,
            signal: controller.signal,
          },
        );
        if (!Array.isArray(result)) {
          throw new Error(
            "O servidor retornou uma lista de candidatos inválida.",
          );
        }
        if (!cancelled) setItems(result);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os candidatos.",
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, search, onLogout]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSearch((previous) => ({
      name: name.trim(),
      ...filters,
      revision: previous.revision + 1,
    }));
  }

  function clearSearch() {
    setName("");
    setFilters({ statusId: "", storeId: "", vacancyId: "" });
    setError("");
    setBusy(true);
    setSearch((previous) => ({
      name: "",
      statusId: "",
      storeId: "",
      vacancyId: "",
      revision: previous.revision + 1,
    }));
  }

  function refresh() {
    setBusy(true);
    setError("");
    setSearch((previous) => ({ ...previous, revision: previous.revision + 1 }));
  }

  function handleSaved(candidate: Candidate) {
    setCreating(false);
    setEditingId(null);
    setSuccess(
      "Candidato " +
        candidate.name +
        (editingId !== null
          ? " atualizado com sucesso."
          : " cadastrado com sucesso."),
    );
    clearSearch();
    onCreated();
  }

  if (historyCandidate) {
    return (
      <CandidateHistory
        key={historyCandidate.id}
        candidate={historyCandidate}
        token={token}
        onLogout={onLogout}
        onBack={() => setHistoryCandidate(null)}
      />
    );
  }

  if (creating || editingId !== null) {
    return (
      <CandidateForm
        key={editingId ?? "new"}
        candidateId={editingId ?? undefined}
        token={token}
        onLogout={onLogout}
        onCancel={() => {
          setCreating(false);
          setEditingId(null);
        }}
        onSaved={handleSaved}
      />
    );
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#005260] focus:ring-2 focus:ring-[#005260]/15 disabled:opacity-60";
  const buttonClass =
    "rounded-xl bg-[#005260] px-5 py-3 text-sm font-semibold text-white hover:bg-[#003e49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60";

  return (
    <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#005260]">
            Portal Casa Bella
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Candidatos</h1>
          <p className="mt-2 text-sm text-slate-500">
            Consulte as pessoas cadastradas no processo seletivo.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={refresh}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60"
          >
            Atualizar lista
          </button>
          <button
            type="button"
            onClick={() => {
              setSuccess("");
              setCreating(true);
            }}
            className={buttonClass}
          >
            Novo candidato
          </button>
        </div>
      </header>

      {success && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-[#005260]/15 bg-[#eaf4f1] p-4 text-sm text-[#005260]"
        >
          {success}
        </p>
      )}

      {loadingFilters && (
        <p role="status" className="mt-5 text-sm text-slate-500">
          Carregando opções de busca...
        </p>
      )}
      {filterError && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>{filterError}</p>
          <button
            type="button"
            onClick={() => {
              setFilterError("");
              setLoadingFilters(true);
              setFilterRevision((value) => value + 1);
            }}
            className="mt-2 rounded-lg border border-red-300 px-3 py-2 font-semibold"
          >
            Tentar novamente
          </button>
        </div>
      )}
      <form
        onSubmit={applySearch}
        className="mt-6 rounded-2xl border border-[#005260]/10 bg-white p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label htmlFor="candidate-name" className="text-sm font-medium">
              Nome
            </label>
            <input
              id="candidate-name"
              type="search"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome ou parte do nome"
              disabled={busy}
              className={inputClass}
            />
          </div>
          {(
            [
              [
                "statusId",
                "Status",
                filterOptions?.statuses ?? [],
                "Todos os status",
              ],
              [
                "storeId",
                "Loja",
                filterOptions?.stores ?? [],
                "Todas as lojas",
              ],
              [
                "vacancyId",
                "Vaga",
                filterOptions?.vacancies ?? [],
                "Todas as vagas",
              ],
            ] as const
          ).map(([key, label, options, placeholder]) => (
            <div key={key}>
              <label htmlFor={"filter-" + key} className="text-sm font-medium">
                {label}
              </label>
              <select
                id={"filter-" + key}
                value={filters[key]}
                onChange={(event) =>
                  setFilters((previous) => ({
                    ...previous,
                    [key]: event.target.value,
                  }))
                }
                disabled={
                  busy || loadingFilters || !filterOptions || !!filterError
                }
                className={inputClass}
              >
                <option value="">{placeholder}</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-3">
          <button
            type="submit"
            disabled={busy || loadingFilters}
            className={buttonClass}
          >
            Buscar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={clearSearch}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60"
          >
            Limpar filtros
          </button>
        </div>
      </form>

      <div
        role="status"
        aria-live="polite"
        className="mt-6 text-sm text-slate-600"
      >
        {busy
          ? "Buscando candidatos..."
          : error
            ? "Consulta não concluída."
            : items.length +
              (items.length === 1
                ? " candidato encontrado"
                : " candidatos encontrados")}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {!busy &&
        !error &&
        (items.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[#005260]/10 bg-white p-10 text-center">
            <h2 className="text-lg font-semibold">
              Nenhum candidato encontrado
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Confira os dados da busca ou limpe os filtros.
            </p>
          </div>
        ) : (
          <div
            role="region"
            aria-label="Lista de candidatos"
            tabIndex={0}
            className="mt-4 overflow-x-auto rounded-2xl border border-[#005260]/10 bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-[#005260]"
          >
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">
                Candidatos encontrados na consulta
              </caption>
              <thead className="bg-[#eaf4f1] text-[#005260]">
                <tr>
                  {[
                    "Nome",
                    "CPF",
                    "Data do teste",
                    "Entrevista",
                    "Status",
                    "Loja",
                    "Vaga",
                    "Ações",
                  ].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-5 py-4 font-semibold"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((candidate) => (
                  <tr key={candidate.id} className="hover:bg-slate-50">
                    <th scope="row" className="px-5 py-4 font-medium">
                      {candidate.name}
                    </th>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums">
                      {formatCpf(candidate.cpf)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums">
                      {candidate.testDate
                        ? formatInterviewDate(candidate.testDate)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 tabular-nums">
                      {formatInterviewDate(candidate.interviewDate)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block rounded-lg bg-[#eaf4f1] px-3 py-1 text-xs font-medium text-[#005260]">
                        {activeRelationName(
                          candidate.status,
                          "Sem status ativo",
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {activeRelationName(candidate.store, "Sem loja ativa")}
                    </td>
                    <td className="px-5 py-4">
                      {activeRelationName(candidate.vacancy, "Sem vaga ativa")}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSuccess("");
                            setEditingId(candidate.id);
                          }}
                          aria-label={"Editar " + candidate.name}
                          className="rounded-lg border border-[#005260]/25 px-3 py-2 font-semibold text-[#005260] hover:bg-[#eaf4f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryCandidate(candidate)}
                          aria-label={"Ver histórico de " + candidate.name}
                          className="rounded-lg border border-[#005260]/25 px-3 py-2 font-semibold text-[#005260] hover:bg-[#eaf4f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260]"
                        >
                          Histórico
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      <footer className="mt-10 text-xs text-slate-500">
        Grupo Casa Bella · Recursos Humanos
      </footer>
    </main>
  );
}

type HistoryEntry = {
  id: number;
  action: string;
  description: string | null;
  candidateId: number;
  createdAt: string;
};
type CandidateWithHistory = Candidate & { history: HistoryEntry[] };

function historyLabel(action: string) {
  const labels: Record<string, string> = {
    CANDIDATE_CREATED: "Candidato cadastrado",
    STATUS_CHANGED: "Status alterado",
    STORE_CHANGED: "Loja alterada",
    VACANCY_CHANGED: "Vaga alterada",
    SENT_TO_STORE_DATE_CHANGED: "Data de envio para loja alterada",
    TEST_DATE_CHANGED: "Data do teste alterada",
    NOTES_CHANGED: "Observações alteradas",
  };
  return labels[action] ?? "Registro do candidato";
}

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function CandidateHistory({
  candidate,
  token,
  onLogout,
  onBack,
}: {
  candidate: Candidate;
  token: string;
  onLogout: () => void;
  onBack: () => void;
}) {
  const [details, setDetails] = useState<CandidateWithHistory | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function loadHistory() {
      try {
        const result = await apiFetch<CandidateWithHistory>(
          "/candidates/" + candidate.id,
          {
            token,
            signal: controller.signal,
          },
        );
        if (!result || !Array.isArray(result.history)) {
          throw new Error("O servidor retornou um histórico inválido.");
        }
        if (!cancelled) {
          const sortedHistory = [...result.history].sort((a, b) => {
            const difference =
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            return difference || b.id - a.id;
          });
          setDetails({ ...result, history: sortedHistory });
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o histórico.",
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [candidate.id, token, onLogout, revision]);

  function refresh() {
    setBusy(true);
    setError("");
    setRevision((value) => value + 1);
  }

  const current = details ?? candidate;
  const buttonClass =
    "rounded-xl border border-[#005260]/25 px-5 py-3 text-sm font-semibold text-[#005260] hover:bg-[#eaf4f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60";

  return (
    <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#005260]">
            Portal Casa Bella
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            Histórico do candidato
          </h1>
          <p className="mt-2 break-words text-sm text-slate-500">
            {current.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onBack} className={buttonClass}>
            Voltar para candidatos
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className={buttonClass}
          >
            {busy ? "Carregando..." : "Atualizar histórico"}
          </button>
        </div>
      </header>

      <section
        aria-label="Dados atuais do candidato"
        className="mt-7 rounded-2xl border border-[#005260]/10 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">Dados atuais</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {(
            [
              ["CPF", formatCpf(current.cpf)],
              [
                "Status",
                activeRelationName(current.status, "Sem status ativo"),
              ],
              ["Loja", activeRelationName(current.store, "Sem loja ativa")],
              ["Vaga", activeRelationName(current.vacancy, "Sem vaga ativa")],
              ["Entrevista", formatInterviewDate(current.interviewDate)],
              [
                "Data do teste",
                current.testDate
                  ? formatInterviewDate(current.testDate)
                  : "Não informada",
              ],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
              <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div role="status" className="mt-6 text-sm text-slate-600">
        {busy ? "Buscando registros do candidato..." : ""}
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
          {details
            ? " Os registros abaixo são da última consulta concluída."
            : ""}
        </p>
      )}

      {details && (
        <section
          aria-label="Registros do candidato"
          className="mt-4 rounded-2xl border border-[#005260]/10 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 className="text-lg font-semibold">
            Registros do processo seletivo
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Do mais recente para o mais antigo. Horários de Brasília.
          </p>
          {details.history.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              Nenhum registro disponível para este candidato.
            </p>
          ) : (
            <ol className="mt-7 space-y-6">
              {details.history.map((entry) => (
                <li
                  key={entry.id}
                  className="relative border-l-2 border-[#005260]/15 pl-6"
                >
                  <span
                    aria-hidden="true"
                    className="absolute -left-[7px] top-1 size-3 rounded-full bg-[#e66b4e] ring-4 ring-white"
                  />
                  <h3 className="font-semibold text-[#005260]">
                    {historyLabel(entry.action)}
                  </h3>
                  <time
                    dateTime={entry.createdAt}
                    className="mt-1 block text-xs text-slate-500"
                  >
                    {formatHistoryTime(entry.createdAt)}
                  </time>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
                    {entry.description?.trim() || "Registro sem descrição."}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      <footer className="mt-10 text-xs text-slate-500">
        Grupo Casa Bella · Recursos Humanos
      </footer>
    </main>
  );
}

type Lookup = { id: number; name: string };
type CandidateDraft = {
  name: string;
  cpf: string;
  phone: string;
  interviewDate: string;
  statusId: string;
  storeId: string;
  vacancyId: string;
  sentToStoreDate: string;
  testDate: string;
  notes: string;
};

function buildCandidateUpdate(draft: CandidateDraft, initial: CandidateDraft) {
  const payload: Record<string, string | number> = {};
  for (const key of [
    "name",
    "cpf",
    "phone",
    "interviewDate",
    "notes",
    "testDate",
  ] as const) {
    const normalize = (value: string) =>
      key === "cpf" ? value.replace(/\D/g, "") : value.trim();
    const value = normalize(draft[key]);
    if (value === normalize(initial[key])) continue;
    if (key === "testDate" && !value) {
      throw new Error(
        "Uma data já registrada deve ser mantida ou substituída.",
      );
    }
    payload[key] = value;
  }
  for (const key of ["statusId", "storeId", "vacancyId"] as const) {
    if (draft[key] === initial[key]) continue;
    if (!draft[key]) {
      throw new Error(
        "Um vínculo já registrado deve ser mantido ou substituído.",
      );
    }
    payload[key] = Number(draft[key]);
  }
  if (draft.testDate && draft.testDate !== initial.sentToStoreDate) {
    payload.sentToStoreDate = draft.testDate;
  }
  return payload;
}

function CandidateForm({
  token,
  onLogout,
  onCancel,
  onSaved,
  candidateId,
}: {
  candidateId?: number;
  token: string;
  onLogout: () => void;
  onCancel: () => void;
  onSaved: (candidate: Candidate) => void;
}) {
  const [draft, setDraft] = useState<CandidateDraft>({
    name: "",
    cpf: "",
    phone: "",
    interviewDate: "",
    statusId: "",
    storeId: "",
    vacancyId: "",
    sentToStoreDate: "",
    testDate: "",
    notes: "",
  });
  const [initialDraft, setInitialDraft] = useState<CandidateDraft | null>(null);
  const [lookups, setLookups] = useState<{
    statuses: Lookup[];
    stores: Lookup[];
    vacancies: Lookup[];
  } | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    async function loadOptions() {
      try {
        const options = { token, signal: controller.signal };
        const [statuses, stores, vacancies, existing] = await Promise.all([
          apiFetch<Lookup[]>("/status", options),
          apiFetch<Lookup[]>("/stores", options),
          apiFetch<Lookup[]>("/vacancies", options),
          candidateId !== undefined
            ? apiFetch<Candidate>("/candidates/" + candidateId, options)
            : Promise.resolve(null),
        ]);
        if (![statuses, stores, vacancies].every(Array.isArray)) {
          throw new Error(
            "Não foi possível interpretar as opções do cadastro.",
          );
        }
        if (!cancelled) {
          if (existing) {
            const currentDraft: CandidateDraft = {
              name: existing.name,
              cpf: formatCpf(existing.cpf),
              phone: existing.phone ?? "",
              interviewDate: existing.interviewDate.slice(0, 10),
              statusId: existing.status?.isActive
                ? String(existing.status.id)
                : "",
              storeId: existing.store?.isActive
                ? String(existing.store.id)
                : "",
              vacancyId: existing.vacancy?.isActive
                ? String(existing.vacancy.id)
                : "",
              sentToStoreDate: existing.sentToStoreDate?.slice(0, 10) ?? "",
              testDate: existing.testDate?.slice(0, 10) ?? "",
              notes: existing.notes ?? "",
            };
            setDraft(currentDraft);
            setInitialDraft(currentDraft);
          }
          setLookups({ statuses, stores, vacancies });
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onLogout();
          return;
        }
        setOptionsError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as opções.",
        );
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }
    void loadOptions();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, revision, onLogout, candidateId]);

  function update<K extends keyof CandidateDraft>(
    key: K,
    value: CandidateDraft[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || loadingOptions || !lookups || optionsError) return;
    setError("");
    const name = draft.name.trim();
    const cpf = draft.cpf.replace(/\D/g, "");
    if (!name) {
      setError("Informe o nome do candidato.");
      return;
    }
    if (cpf.length !== 11) {
      setError("Informe um CPF com 11 dígitos.");
      return;
    }
    setSaving(true);
    try {
      if (candidateId !== undefined && !initialDraft) {
        throw new Error("Aguarde o carregamento dos dados do candidato.");
      }
      const payload =
        candidateId !== undefined && initialDraft
          ? buildCandidateUpdate(draft, initialDraft)
          : {
              name,
              cpf,
              interviewDate: draft.interviewDate,
              ...(draft.phone.trim() && { phone: draft.phone.trim() }),
              ...(draft.statusId && { statusId: Number(draft.statusId) }),
              ...(draft.storeId && { storeId: Number(draft.storeId) }),
              ...(draft.vacancyId && { vacancyId: Number(draft.vacancyId) }),
              ...(draft.testDate && { sentToStoreDate: draft.testDate }),
              ...(draft.testDate && { testDate: draft.testDate }),
              ...(draft.notes.trim() && { notes: draft.notes.trim() }),
            };
      if (candidateId !== undefined && Object.keys(payload).length === 0) {
        setError(
          "Nenhuma alteração foi feita. Altere os dados ou clique em Cancelar.",
        );
        return;
      }
      const candidate = await apiFetch<Candidate>(
        candidateId !== undefined
          ? "/candidates/" + candidateId
          : "/candidates",
        {
          method: candidateId !== undefined ? "PATCH" : "POST",
          token,
          body: JSON.stringify(payload),
        },
      );
      onSaved(candidate);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar o candidato.",
      );
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#005260] focus:ring-2 focus:ring-[#005260]/15 disabled:opacity-60";
  const buttonClass =
    "rounded-xl bg-[#005260] px-5 py-3 text-sm font-semibold text-white hover:bg-[#003e49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60";

  return (
    <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#005260]">
          Portal Casa Bella
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {candidateId !== undefined ? "Editar candidato" : "Novo candidato"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Preencha os dados do candidato. Os campos com * são obrigatórios.
        </p>
      </header>

      {loadingOptions && (
        <p role="status" className="mt-6 text-sm text-slate-600">
          Carregando dados do formulário...
        </p>
      )}
      {optionsError && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>{optionsError}</p>
          <button
            type="button"
            onClick={() => {
              setOptionsError("");
              setLoadingOptions(true);
              setRevision((value) => value + 1);
            }}
            className="mt-3 rounded-lg border border-red-300 px-3 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-red-800"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <form
        onSubmit={save}
        className="mt-6 space-y-7 rounded-2xl border border-[#005260]/10 bg-white p-6 shadow-sm sm:p-8"
      >
        <fieldset
          disabled={saving || loadingOptions || !!optionsError}
          className="grid gap-5 sm:grid-cols-2"
        >
          <legend className="mb-5 text-lg font-semibold">Dados pessoais</legend>
          <div className="sm:col-span-2">
            <label htmlFor="new-name" className="text-sm font-medium">
              Nome completo *
            </label>
            <input
              id="new-name"
              autoComplete="off"
              value={draft.name}
              onChange={(event) => update("name", event.target.value)}
              maxLength={150}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="new-cpf" className="text-sm font-medium">
              CPF *
            </label>
            <input
              id="new-cpf"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={draft.cpf}
              onChange={(event) => update("cpf", event.target.value)}
              maxLength={14}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="new-phone" className="text-sm font-medium">
              Telefone
            </label>
            <input
              id="new-phone"
              type="tel"
              autoComplete="off"
              placeholder="(00) 00000-0000"
              value={draft.phone}
              onChange={(event) => update("phone", event.target.value)}
              maxLength={30}
              className={inputClass}
            />
          </div>
        </fieldset>

        <fieldset
          disabled={saving || loadingOptions || !!optionsError}
          className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          <legend className="mb-5 text-lg font-semibold">
            Processo seletivo
          </legend>
          <div>
            <label htmlFor="new-interview" className="text-sm font-medium">
              Data da entrevista *
            </label>
            <input
              id="new-interview"
              type="date"
              value={draft.interviewDate}
              onChange={(event) => update("interviewDate", event.target.value)}
              required
              className={inputClass}
            />
          </div>
          {(
            [
              ["statusId", "Status", lookups?.statuses ?? [], "Sem status"],
              ["storeId", "Loja", lookups?.stores ?? [], "Sem loja"],
              ["vacancyId", "Vaga", lookups?.vacancies ?? [], "Sem vaga"],
            ] as const
          ).map(([key, label, options, placeholder]) => (
            <div key={key}>
              <label htmlFor={"new-" + key} className="text-sm font-medium">
                {label}
              </label>
              <select
                id={"new-" + key}
                value={draft[key]}
                onChange={(event) => update(key, event.target.value)}
                disabled={loadingOptions || !!optionsError}
                className={inputClass}
              >
                <option value="" disabled={!!initialDraft?.[key]}>
                  {placeholder}
                </option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div>
            <label htmlFor="new-test" className="text-sm font-medium">
              Data do teste
            </label>
            <input
              id="new-test"
              type="date"
              value={draft.testDate}
              onChange={(event) => update("testDate", event.target.value)}
              required={!!initialDraft?.testDate}
              className={inputClass}
            />
          </div>
        </fieldset>

        <div>
          <label htmlFor="new-notes" className="text-sm font-medium">
            Observações
          </label>
          <textarea
            id="new-notes"
            rows={4}
            value={draft.notes}
            onChange={(event) => update("notes", event.target.value)}
            maxLength={2000}
            disabled={saving || loadingOptions || !!optionsError}
            className={inputClass}
          />
          <p className="mt-2 text-xs text-slate-500">Até 2.000 caracteres.</p>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <p role="status" className="sr-only">
          {saving ? "Salvando candidato..." : ""}
        </p>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#005260] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || loadingOptions || !lookups || !!optionsError}
            className={buttonClass}
          >
            {saving
              ? "Salvando..."
              : candidateId !== undefined
                ? "Salvar alterações"
                : "Salvar candidato"}
          </button>
        </div>
      </form>
      <footer className="mt-10 text-xs text-slate-500">
        Grupo Casa Bella · Recursos Humanos
      </footer>
    </main>
  );
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  const [token, setToken] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const savedToken = sessionStorage.getItem("casabella.accessToken");
        if (!savedToken) return;
        const currentUser = await apiFetch<AuthenticatedUser>("/auth/me", {
          token: savedToken,
        });
        if (!cancelled) {
          setToken(savedToken);
          setUser(currentUser);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 401) {
            sessionStorage.removeItem("casabella.accessToken");
            setError("Sua sessão expirou. Entre novamente.");
          } else {
            setError(
              err instanceof Error
                ? err.message
                : "Não foi possível recuperar sua sessão.",
            );
          }
        }
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }
    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

    try {
      sessionStorage.removeItem("casabella.accessToken");

      const result = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      if (!result?.accessToken) {
        throw new Error("O servidor não retornou um token de acesso.");
      }

      const authenticatedUser = await apiFetch<AuthenticatedUser>("/auth/me", {
        token: result.accessToken,
      });

      sessionStorage.setItem("casabella.accessToken", result.accessToken);
      setPassword("");
      setToken(result.accessToken);
      setUser(authenticatedUser);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem("casabella.accessToken");
    setToken("");
    setUser(null);
    setPassword("");
    setError("");
    setShowPassword(false);
  }, []);

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f7f6] text-[#005260]">
        <p role="status">Verificando sua sessão...</p>
      </main>
    );
  }

  if (user && token) {
    return <Dashboard user={user} token={token} onLogout={handleLogout} />;
  }

  const inputClass =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[#263c40] outline-none transition placeholder:text-slate-400 focus:border-[#005260] focus:ring-2 focus:ring-[#005260]/15 disabled:opacity-60";

  const buttonClass =
    "w-full rounded-xl bg-[#005260] px-4 py-3.5 font-semibold text-white transition hover:bg-[#003e49] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#005260] disabled:cursor-wait disabled:opacity-60";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f6] px-5 py-10 text-[#263c40] sm:px-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-[#005260]/10 bg-white shadow-xl lg:grid-cols-2">
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#005260] p-12 text-white lg:flex">
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 size-80 rounded-full border-[40px] border-white/5"
          />

          <div className="relative">
            <div className="w-64 max-w-full overflow-hidden rounded-2xl bg-white">
              <Image
                src="/logo-casabella-escrita.png"
                alt="Grupo Casa Bella fragrâncias"
                width={4000}
                height={2250}
                className="h-auto w-full"
                priority
              />
            </div>

            <p className="mt-10 text-xs font-semibold uppercase tracking-[0.25em] text-white/70">
              Gestão de pessoas
            </p>

            <h1 className="mt-4 text-4xl font-semibold leading-tight">
              Novos talentos.
              <br />
              Novas possibilidades.
            </h1>

            <div className="mt-6 h-1 w-16 rounded-full bg-[#e66b4e]" />

            <p className="mt-6 max-w-sm text-base leading-7 text-white/80">
              Um espaço para acompanhar candidatos, organizar entrevistas e
              cuidar de cada etapa da seleção.
            </p>
          </div>

          <p className="relative mt-16 text-sm text-white/60">
            Grupo Casa Bella · Recursos Humanos
          </p>
        </aside>

        <section className="px-6 py-10 sm:px-12 sm:py-12">
          <Image
            src="/logo-casabella-escrita.png"
            alt="Grupo Casa Bella fragrâncias"
            width={4000}
            height={2250}
            className="mx-auto h-auto w-full max-w-80"
            priority
          />

          {user ? (
            <div className="mt-6">
              <span className="inline-block rounded-full bg-[#eaf4f1] px-3 py-1 text-sm font-medium text-[#005260]">
                Acesso confirmado
              </span>

              <h2 className="mt-5 text-2xl font-semibold">
                Bem-vindo, {user.name}.
              </h2>

              <p className="mt-3 leading-6 text-slate-600">
                Login realizado com sucesso. Sua sessão foi validada pelo
                servidor.
              </p>

              <p className="mt-4 break-all text-sm text-slate-500">
                {user.email}
              </p>

              <button
                type="button"
                onClick={handleLogout}
                className={`${buttonClass} mt-8`}
              >
                Sair
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#005260]">
                  Portal de Recursos Humanos
                </p>

                <h2 className="mt-3 text-3xl font-semibold">
                  Acesse sua conta
                </h2>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Entre com seu e-mail e senha cadastrados.
                </p>
              </div>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="email" className="text-sm font-medium">
                    E-mail
                  </label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    placeholder="Seu e-mail"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={loading}
                    required
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="text-sm font-medium">
                    Senha
                  </label>

                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Sua senha"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={loading}
                    required
                    className={inputClass}
                  />

                  <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(event) =>
                        setShowPassword(event.target.checked)
                      }
                      className="size-4 accent-[#005260]"
                    />
                    Mostrar senha
                  </label>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className={buttonClass}
                >
                  {loading ? "Entrando..." : "Entrar"}
                </button>

                <p role="status" className="sr-only">
                  {loading ? "Validando seu acesso." : ""}
                </p>
              </form>
            </>
          )}

          <div className="mt-10 border-t border-slate-100 pt-5">
            <p className="text-center text-xs text-slate-400">
              Acesso exclusivo para usuários autorizados.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
