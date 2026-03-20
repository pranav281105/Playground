import axios from "axios";

type ValidationDetail = {
  msg?: string;
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const detail = error.response?.data?.detail as string | ValidationDetail[] | undefined;

  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first?.msg === "string" && first.msg.trim().length > 0) {
      return first.msg;
    }
  }

  return fallback;
}
