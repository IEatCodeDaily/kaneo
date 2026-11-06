type ApiResponse<T extends (...args: never[]) => Promise<{ data: unknown }>> =
  Awaited<ReturnType<T>>["data"];

export default ApiResponse;
