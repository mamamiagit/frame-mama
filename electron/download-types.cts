export type DownloadState = "queued" | "downloading" | "importing" | "completed" | "failed" | "canceled";
export type DownloadItem = {
  id: string;
  name: string;
  host: string;
  state: DownloadState;
  received: number;
  total: number | null;
  error: string | null;
  createdAt: number;
};
export type DownloadAPI = {
  list: () => Promise<DownloadItem[]>;
  add: (value: { url: string; authorized: boolean }) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};
