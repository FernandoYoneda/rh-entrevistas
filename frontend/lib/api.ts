type ApiOptions = RequestInit & {
  token?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error("Configure NEXT_PUBLIC_API_URL no arquivo .env.local.");
  }

  const { token, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);

  headers.set("Accept", "application/json");

  if (typeof requestOptions.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(
      `${apiUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`,
      {
        ...requestOptions,
        headers,
        cache: "no-store",
      },
    );
  } catch {
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique se o backend está rodando.",
    );
  }

  const text = await response.text();
  let data: unknown;

  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(
      "O servidor retornou uma resposta inválida.",
      response.status,
    );
  }

  if (!response.ok) {
    let message = `Erro na requisição (${response.status}).`;

    if (typeof data === "object" && data !== null && "message" in data) {
      const serverMessage = data.message;

      if (typeof serverMessage === "string") {
        message = serverMessage;
      } else if (Array.isArray(serverMessage)) {
        message = serverMessage
          .filter((item): item is string => typeof item === "string")
          .join(" ");
      }
    }

    throw new ApiError(message, response.status);
  }

  return data as T;
}
