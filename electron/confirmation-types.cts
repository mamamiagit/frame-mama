export type ConfirmationSpec = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
};
export type ConfirmationRequest = ConfirmationSpec & { id: string };
export type ConfirmationAPI = {
  current: () => Promise<ConfirmationRequest | null>;
  answer: (id: string, accepted: boolean) => Promise<void>;
  onChange: (callback: (request: ConfirmationRequest | null) => void) => () => void;
};
